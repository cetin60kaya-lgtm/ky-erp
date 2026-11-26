"""Offline GIB package preflight. Does not authorize sending or write ERP data.
Full Schematron requires reviewed ISO XSLT2 compiler and SaxonC; never infer a pass.
"""
import argparse
import hashlib
import json
import sys
import tempfile
from pathlib import Path, PurePosixPath
from zipfile import ZipFile
from lxml import etree

UBL_HASH = 'cb583941b8a8a239c59902c6bc455c0f75d48f2bb81d7d3fbe1ae827f981f7db'
GIB_HASH = 'e0fd9136cadbb79bd29f286c7ff80c6f2202ce1a0354338d0bf0739dd88dc29e'
NS = 'urn:oasis:names:specification:ubl:schema:xsd:'
SVRL = 'http://purl.oclc.org/dsdl/svrl'
# ISO Schematron source revision 77dcd36c53d12ed786c144ece3b2af7694abdc56.
COMPILER_HASHES = {
    'iso_abstract_expand.xsl': 'c5267f124abf23eeb6669884e40a98607c055bfaa1f39e73b7d578feceeb6e46',
    'iso_dsdl_include.xsl': '43ff20a1afd89d8a744d1c0b8df94ac5559ffa6a820d1ffbf508d6431ee4fdd9',
    'iso_schematron_skeleton_for_saxon.xsl': '95f3195d9f437ea8ff5f75d1a27f4e68ae20b236fe0d4a217bb4209f498a10a3',
    'iso_svrl_for_xslt2.xsl': '0588d617924a0686255f6d182633d434c7986d561be8fcc3b363907d3f671b26',
}

def sha(b):
    return hashlib.sha256(b).hexdigest()

def parser():
    return etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False, huge_tree=False)

def extract_package(source, expected, prefix, root, suffixes):
    if sha(source.read_bytes()) != expected:
        raise ValueError('PACKAGE_HASH_MISMATCH')
    with ZipFile(source) as z:
        for entry in z.infolist():
            if not entry.filename.startswith(prefix) or entry.is_dir():
                continue
            rel = PurePosixPath(entry.filename[len(prefix):])
            if rel.is_absolute() or '..' in rel.parts or '\\' in str(rel):
                raise ValueError('PACKAGE_PATH_INVALID')
            if rel.suffix not in suffixes:
                continue
            target = root / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(z.read(entry))

def validate(xml, ubl, gib, compiler=None, mode='efatura'):
    result = dict(schemaVerified=False, schematronVerified=False, localValidationPassed=False,
                  contentSha256=sha(xml), ublPackageSha256=UBL_HASH, gibPackageSha256=GIB_HASH)
    if len(xml) > 10_000_000 or b'<!DOCTYPE' in xml.upper() or b'<!ENTITY' in xml.upper():
        return dict(result, error='XML_UNSAFE_OR_TOO_LARGE')
    try:
        doc = etree.fromstring(xml, parser())
        if doc.getroottree().docinfo.doctype:
            return dict(result, error='XML_UNSAFE_OR_TOO_LARGE')
        kind = etree.QName(doc).localname
        if kind not in ('Invoice', 'DespatchAdvice') or doc.tag != '{'+NS+kind+'-2}'+kind:
            return dict(result, error='DOCUMENT_KIND_INVALID')
        result['kind'] = kind
        if mode == 'earchive' and kind != 'Invoice':
            return dict(result, error='MODE_KIND_MISMATCH')
        with tempfile.TemporaryDirectory(prefix='ky-gib-') as tmp:
            root = Path(tmp)
            extract_package(ubl, UBL_HASH, 'UBLTR_1.2.1_Paketi/xsdrt/', root/'xsd', {'.xsd'})
            extract_package(gib, GIB_HASH, 'e-FaturaPaketi/schematron/', root/'sch', {'.xml'})
            schema = etree.XMLSchema(etree.parse(str(root/'xsd/maindoc'/f'UBL-{kind}-2.1.xsd'), parser()))
            if not schema.validate(doc):
                return dict(result, error='XSD_INVALID', errorCount=len(schema.error_log))
            result['schemaVerified'] = True
            if compiler is None:
                return dict(result, error='SCHEMATRON_ENGINE_REQUIRED')
            try:
                from saxonche import PySaxonProcessor
                # Trusted local ISO Schematron XSLT2 distribution; never taken from document input.
                stages = ('iso_dsdl_include.xsl', 'iso_abstract_expand.xsl', 'iso_svrl_for_xslt2.xsl')
                if not all((compiler / n).is_file() for n in COMPILER_HASHES):
                    return dict(result, error='SCHEMATRON_COMPILER_REQUIRED')
                if any(sha((compiler / n).read_bytes()) != expected for n, expected in COMPILER_HASHES.items()):
                    return dict(result, error='SCHEMATRON_COMPILER_HASH_MISMATCH')
                source = root/'sch/UBL-TR_Main_Schematron.xml'
                main = etree.parse(str(source), parser())
                main.getroot().set('queryBinding', 'xslt2')
                # GIB's unquoted mode token must be an XPath string literal.
                for let in main.xpath('/*/*[local-name()="let" and @name="type"]'):
                    let.set('value', "'"+mode+"'")
                main.write(str(source), encoding='UTF-8', xml_declaration=True)
                xml_path = root/'document.xml'
                xml_path.write_bytes(xml)
                with PySaxonProcessor(license=False) as proc:
                    proc.set_configuration_property('http://saxon.sf.net/feature/allowedProtocols', 'file')
                    xp = proc.new_xslt30_processor()
                    for i, name in enumerate(stages):
                        out = root/'sch'/f'compiled-{i}.xml'
                        exe = xp.compile_stylesheet(stylesheet_file=str(compiler/name))
                        exe.transform_to_file(source_file=str(source), output_file=str(out))
                        source = out
                    exe = xp.compile_stylesheet(stylesheet_file=str(source))
                    exe.set_parameter('type', proc.make_string_value(mode))
                    svrl = exe.transform_to_string(source_file=str(xml_path))
                report = etree.fromstring(svrl.encode('utf-8'), parser())
                if report.tag != '{'+SVRL+'}schematron-output':
                    return dict(result, error='SVRL_INVALID')
                fired = report.findall('.//{'+SVRL+'}fired-rule')
                fails = report.findall('.//{'+SVRL+'}failed-assert')
                expected = 'invoice' if kind == 'Invoice' else 'despatchadvice'
                active = report.findall('.//{'+SVRL+'}active-pattern')
                context = 'inv:Invoice' if kind == 'Invoice' else 'desp:DespatchAdvice'
                if not any(f.get('context') == context for f in fired) or not any(p.get('id') == expected for p in active):
                    return dict(result, error='SCHEMATRON_NO_DOCUMENT_RULES')
                result.update(schematronRuleFirings=len(fired), schematronFailureCount=len(fails))
                if fails:
                    # Do not log assert text, values or private source XML.
                    return dict(result, error='SCHEMATRON_INVALID', failureRuleIds=[sha((f.get('test') or '').encode('utf-8'))[:16] for f in fails])
                # Local validation is not provider authorization or acceptance.
                return dict(result, schematronVerified=True, localValidationPassed=True)
            except (ImportError, ModuleNotFoundError):
                return dict(result, error='SAXONC_REQUIRED')
            except Exception:
                return dict(result, error='SCHEMATRON_EXECUTION_FAILED')
    except Exception:
        return dict(result, error='PACKAGE_OR_XML_INVALID')

if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('xml', type=Path)
    ap.add_argument('--ubl', type=Path, required=True)
    ap.add_argument('--gib', type=Path, required=True)
    ap.add_argument('--iso-compiler', type=Path)
    ap.add_argument('--mode', choices=['efatura', 'earchive'], default='efatura')
    a = ap.parse_args()
    try:
        r = validate(a.xml.read_bytes(), a.ubl, a.gib, a.iso_compiler, a.mode)
    except OSError:
        r = dict(schemaVerified=False, schematronVerified=False, localValidationPassed=False, error='INPUT_UNAVAILABLE')
    print(json.dumps(r, ensure_ascii=False))
    sys.exit(0 if r.get('localValidationPassed') else 2)
