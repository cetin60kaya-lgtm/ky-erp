import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CirclePlus,
  Copy,
  Eye,
  Mail,
  Pencil,
  RefreshCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { apiGet, apiPost } from "../../../utils/api";
import "./mailTemplatesWorkspace.css";

const DEFAULTS = [
  {
    id: "ekstre-talebi",
    name: "Ekstre Talebi",
    type: "STATEMENT_REQUEST",
    subject: "Cari ekstre talebi - {{firmaAdi}}",
    body: "Merhaba,\n\nCari hesap mutabakatımız için güncel ekstrenizi paylaşmanızı rica ederiz.\n\nFirma: {{firmaAdi}}\nBakiye: {{bakiye}}\nTarih: {{tarih}}\n\nTeşekkür ederiz.",
  },
  {
    id: "odeme-hatirlatma",
    name: "Ödeme Hatırlatma",
    type: "PAYMENT_REMINDER",
    subject: "Ödeme hatırlatma - {{firmaAdi}}",
    body: "Merhaba,\n\nCari hesabınızda {{bakiye}} bakiye görünmektedir. Ödeme planı hakkında bilgi paylaşmanızı rica ederiz.\n\nTarih: {{tarih}}",
  },
  {
    id: "eksik-belge",
    name: "Eksik Belge Talebi",
    type: "MISSING_DOCUMENT",
    subject: "Eksik belge talebi - {{firmaAdi}}",
    body: "Merhaba,\n\nMuhasebe kontrolümüzde eksik belge tespit edilmiştir. İlgili belgeyi paylaşmanızı rica ederiz.\n\nTarih: {{tarih}}",
  },
  {
    id: "cari-mutabakat",
    name: "Cari Mutabakat",
    type: "RECONCILIATION",
    subject: "Cari mutabakat - {{firmaAdi}}",
    body: "Merhaba,\n\nKayıtlarımızda {{tarih}} tarihi itibarıyla {{bakiye}} bakiye görünmektedir. Mutabakat durumunu bildirmenizi rica ederiz.",
  },
];

const unwrap = (payload) => payload?.data?.data ?? payload?.data ?? payload ?? {};
const listOf = (payload) => {
  const value = unwrap(payload);
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.rows)) return value.rows;
  return [];
};
const dateText = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value).slice(0, 10) : parsed.toLocaleDateString("tr-TR");
};

function emptyTemplate() {
  return {
    id: "",
    name: "",
    type: "STATEMENT_REQUEST",
    subject: "",
    body: "",
    active: true,
  };
}

function renderTemplate(template, sample) {
  const values = {
    firmaAdi: sample.companyName || "Örnek Firma",
    bakiye: sample.balance || "₺0,00",
    tarih: sample.date || new Date().toLocaleDateString("tr-TR"),
  };
  const replace = (text) =>
    String(text || "").replace(/{{\s*(firmaAdi|bakiye|tarih)\s*}}/g, (_, key) => values[key]);
  return { subject: replace(template.subject), body: replace(template.body) };
}

export default function MailTemplatesWorkspace({ activeMainCompany, refreshKey = 0 }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(emptyTemplate);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const params = useMemo(
    () => ({
      mainCompanySlug: activeMainCompany?.slug,
      mainCompanyId: activeMainCompany?.id,
    }),
    [activeMainCompany?.id, activeMainCompany?.slug],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await apiGet("/muhasebe/mail/templates", {
        ...params,
        _ts: Date.now(),
      });
      setTemplates(listOf(payload).filter((item) => !item.deletedAt));
    } catch (requestError) {
      setTemplates([]);
      setError(requestError?.message || "Mail şablonları alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("tr-TR");
    if (!term) return templates;
    return templates.filter((item) =>
      `${item.name || ""} ${item.subject || ""} ${item.type || ""}`
        .toLocaleLowerCase("tr-TR")
        .includes(term),
    );
  }, [query, templates]);

  const save = async () => {
    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) {
      setNotice("Şablon adı, konu ve mesaj zorunludur.");
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      const id = form.id || crypto.randomUUID();
      await apiPost("/muhasebe/mail/templates", {
        ...params,
        ...form,
        id,
        active: form.active !== false,
        updatedAt: new Date().toISOString(),
      });
      setDrawerOpen(false);
      setPreviewOpen(false);
      setForm(emptyTemplate());
      setNotice("Mail şablonu kaydedildi.");
      await load();
    } catch (requestError) {
      setNotice(requestError?.message || "Mail şablonu kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (template) => {
    if (!window.confirm(`“${template.name}” şablonu arşivlensin mi?`)) return;
    setSaving(true);
    setNotice("");
    try {
      await apiPost("/muhasebe/mail/templates", {
        ...params,
        ...template,
        active: false,
        deletedAt: new Date().toISOString(),
      });
      setNotice("Şablon arşivlendi.");
      await load();
    } catch (requestError) {
      setNotice(requestError?.message || "Şablon arşivlenemedi.");
    } finally {
      setSaving(false);
    }
  };

  const seedDefaults = async () => {
    setSaving(true);
    setNotice("");
    try {
      const existingIds = new Set(templates.map((item) => String(item.id)));
      for (const template of DEFAULTS) {
        if (existingIds.has(template.id)) continue;
        await apiPost("/muhasebe/mail/templates", {
          ...params,
          ...template,
          active: true,
          createdAt: new Date().toISOString(),
        });
      }
      setNotice("Eksik varsayılan muhasebe şablonları oluşturuldu.");
      await load();
    } catch (requestError) {
      setNotice(requestError?.message || "Varsayılan şablonlar oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (template = emptyTemplate()) => {
    setForm({ ...emptyTemplate(), ...template });
    setPreviewOpen(false);
    setDrawerOpen(true);
    setNotice("");
  };

  const preview = renderTemplate(form, {
    companyName: "Örnek Firma",
    balance: "₺125.000,00",
    date: new Date().toLocaleDateString("tr-TR"),
  });

  const copyPreview = async () => {
    try {
      await navigator.clipboard.writeText(`${preview.subject}\n\n${preview.body}`);
      setNotice("Şablon önizlemesi panoya kopyalandı.");
    } catch {
      setNotice("Önizleme kopyalanamadı.");
    }
  };

  return (
    <section className="mtpl-root">
      <header className="mtpl-toolbar">
        <label className="mtpl-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Şablon adı, konu veya tür ara" /></label>
        <button type="button" onClick={load}><RefreshCcw size={16} /> Yenile</button>
        <button type="button" onClick={seedDefaults} disabled={saving}>Varsayılanları tamamla</button>
        <button type="button" className="primary" onClick={() => openEdit()}><CirclePlus size={16} /> Yeni şablon</button>
      </header>

      {notice ? <div className="mtpl-notice" role="status">{notice}</div> : null}
      {error ? <div className="mtpl-error">{error}</div> : null}

      <section className="mtpl-table-card">
        {loading ? (
          <div className="mtpl-empty">Şablonlar yükleniyor…</div>
        ) : visible.length ? (
          <div className="mtpl-table-wrap"><table><thead><tr><th>Şablon</th><th>Tür</th><th>Konu</th><th>Durum</th><th>Güncelleme</th><th>İşlem</th></tr></thead><tbody>{visible.map((template) => <tr key={template.id || template.fileName}><td><strong>{template.name || "Adsız şablon"}</strong></td><td>{template.type || "GENEL"}</td><td>{template.subject || "-"}</td><td>{template.active === false ? "Pasif" : "Aktif"}</td><td>{dateText(template.updatedAt || template.createdAt)}</td><td><div className="mtpl-actions"><button type="button" onClick={() => openEdit(template)}><Pencil size={15} /> Düzenle</button><button type="button" disabled={saving} onClick={() => remove(template)}><Trash2 size={15} /> Arşivle</button></div></td></tr>)}</tbody></table></div>
        ) : (
          <div className="mtpl-empty"><Mail size={28} /><strong>Mail şablonu bulunamadı.</strong><span>Varsayılan şablonları oluşturabilir veya yeni şablon ekleyebilirsiniz.</span></div>
        )}
      </section>

      {drawerOpen ? (
        <div className="mtpl-drawer-layer" role="presentation" onMouseDown={() => setDrawerOpen(false)}>
          <aside className="mtpl-drawer" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><h2>{form.id ? "Mail şablonunu düzenle" : "Yeni mail şablonu"}</h2><p>Değişkenler: <code>{"{{firmaAdi}}"}</code>, <code>{"{{bakiye}}"}</code>, <code>{"{{tarih}}"}</code></p></div><button type="button" onClick={() => setDrawerOpen(false)} aria-label="Kapat"><X size={20} /></button></header>
            <div className="mtpl-drawer-body">
              <div className="mtpl-form">
                <label>Şablon adı<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
                <label>Tür<select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}><option value="STATEMENT_REQUEST">Ekstre talebi</option><option value="PAYMENT_REMINDER">Ödeme hatırlatma</option><option value="INVOICE_DELIVERY">Fatura gönderimi</option><option value="MISSING_DOCUMENT">Eksik belge</option><option value="RECONCILIATION">Cari mutabakat</option><option value="GENERAL">Genel</option></select></label>
                <label className="wide">Konu<input value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} /></label>
                <label className="wide">Mesaj<textarea rows="16" value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} /></label>
                <label className="mtpl-checkbox wide"><input type="checkbox" checked={form.active !== false} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /> Şablon aktif</label>
              </div>
              {previewOpen ? <section className="mtpl-preview"><header><div><span>Konu</span><strong>{preview.subject}</strong></div><button type="button" onClick={copyPreview}><Copy size={15} /> Kopyala</button></header><pre>{preview.body}</pre></section> : null}
            </div>
            <footer><button type="button" onClick={() => setPreviewOpen((value) => !value)}><Eye size={16} /> {previewOpen ? "Önizlemeyi kapat" : "Önizle"}</button><button type="button" className="primary" disabled={saving} onClick={save}>Kaydet</button></footer>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
