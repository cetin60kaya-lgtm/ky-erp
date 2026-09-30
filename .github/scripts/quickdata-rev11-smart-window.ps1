$ErrorActionPreference = 'Stop'
& "$PSScriptRoot/quickdata-rev10-clean-person.ps1"

$tool = 'APP/desktop/kyerp-pdks-current/tools/QuickDataTool'
$syncPath = Join-Path $tool 'DbTnfSyncInjector.cs'
$s = Get-Content $syncPath -Raw
$s = $s.Replace('Personeli DB+TNF Temizle', 'Geçersiz DB+TNF Temizle')

# Show DURUM in person selector and resolve ACTIVE/PASSIVE together with hire/exit dates.
$s = $s.Replace('select k.PKNO,k.AD,k.SOYAD,k.IGTARIH,k.ICTARIH,', 'select k.PKNO,k.AD,k.SOYAD,k.IGTARIH,k.ICTARIH,k.DURUM,')
$s = $s.Replace('var hire = r["IGTARIH"] == DBNull.Value ? (DateTime?)null : Convert.ToDateTime(r["IGTARIH"]).Date;`n                var exit = r["ICTARIH"] == DBNull.Value ? (DateTime?)null : Convert.ToDateTime(r["ICTARIH"]).Date;', 'var hire = r["IGTARIH"] == DBNull.Value ? (DateTime?)null : Convert.ToDateTime(r["IGTARIH"]).Date;`n                var exit = r["ICTARIH"] == DBNull.Value ? (DateTime?)null : Convert.ToDateTime(r["ICTARIH"]).Date;`n                var rawStatus = Convert.ToString(r["DURUM"])?.Trim() ?? "";`n                var activeState = ResolveActiveStatus(rawStatus, hire, exit);')
$s = $s.Replace('person.Items.Add($"{card}  {name}{suffix}");', 'person.Items.Add($"{card}  {name}  [{(activeState == true ? "AKTİF" : activeState == false ? "PASİF" : "DURUM?")} | Giriş {(hire.HasValue ? hire.Value.ToString("dd.MM.yyyy") : "-")} | Çıkış {(exit.HasValue ? exit.Value.ToString("dd.MM.yyyy") : "-")}]" + suffix);')

# Replace employment warning logic. Rehire gap is protected after the new hire date.
$warnPattern = '(?ms)^    static void MarkEmploymentPeriodWarnings\(DataTable table, FirebirdDatabase db\)\s*\{.*?^    \}\s*\r?\n\s*    static void AddDbEvent'
$warnReplacement = @'
    static bool? ResolveActiveStatus(string raw, DateTime? hire, DateTime? exit)
    {
        var s = (raw ?? "").Trim().ToUpperInvariant()
            .Replace('İ','I').Replace('Ş','S').Replace('Ğ','G').Replace('Ü','U').Replace('Ö','O').Replace('Ç','C');
        var textActive = s is "AKTIF" or "ACTIVE" or "A" or "TRUE" or "EVET";
        var textPassive = s is "PASIF" or "PASSIVE" or "P" or "FALSE" or "HAYIR";
        if (hire.HasValue && exit.HasValue && hire.Value.Date > exit.Value.Date)
        {
            if (textPassive) return null;
            return true;
        }
        if (textActive) return true;
        if (textPassive) return false;
        if (!exit.HasValue) return true;
        if (exit.Value.Date < DateTime.Today) return false;
        return true;
    }

    static string? InvalidEmploymentReason(string raw, DateTime? hire, DateTime? exit, DateTime day)
    {
        var active = ResolveActiveStatus(raw, hire, exit);
        if (!active.HasValue) return "DURUM/TARİH ÇELİŞKİSİ";
        day = day.Date;
        if (active == false && exit.HasValue && day > exit.Value.Date)
            return $"PASİF - ÇIKIŞ SONRASI ({exit:dd.MM.yyyy})";
        if (active == true && hire.HasValue && exit.HasValue && hire.Value.Date > exit.Value.Date && day > exit.Value.Date && day < hire.Value.Date)
            return $"AKTİF - ESKİ ÇIKIŞ / YENİ GİRİŞ ARASI ({exit:dd.MM.yyyy} - {hire:dd.MM.yyyy})";
        return null;
    }

    static void MarkEmploymentPeriodWarnings(DataTable table, FirebirdDatabase db)
    {
        var people = db.Query("select PKNO,IGTARIH,ICTARIH,DURUM from KIMLIK");
        var rules = new Dictionary<string, (DateTime? Hire, DateTime? Exit, string Status)>(StringComparer.OrdinalIgnoreCase);
        foreach (DataRow r in people.Rows)
        {
            var card = Convert.ToString(r["PKNO"])?.Trim() ?? "";
            if (card.Length == 0) continue;
            var hire = r["IGTARIH"] == DBNull.Value ? (DateTime?)null : Convert.ToDateTime(r["IGTARIH"]).Date;
            var exit = r["ICTARIH"] == DBNull.Value ? (DateTime?)null : Convert.ToDateTime(r["ICTARIH"]).Date;
            rules[card] = (hire, exit, Convert.ToString(r["DURUM"])?.Trim() ?? "");
        }
        foreach (DataRow r in table.Rows)
        {
            var card = Convert.ToString(r["Kart No"])?.Trim() ?? "";
            if (!rules.TryGetValue(card, out var rule)) continue;
            if (!DateTime.TryParseExact(Convert.ToString(r["Tarih"]), "dd.MM.yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)) continue;
            var reason = InvalidEmploymentReason(rule.Status, rule.Hire, rule.Exit, d);
            if (reason is null) continue;
            r["Durum"] = "UYARI - " + reason;
            r["İşlem"] = "İNCELE";
        }
    }

    static void AddDbEvent'
@
$s2 = [regex]::Replace($s, $warnPattern, $warnReplacement)
if ($s2 -eq $s) { throw 'REV11 warning replacement failed.' }
$s = $s2

# Narrow the existing REV10 cleanup window instead of wiping the whole selected month.
$start = $s.IndexOf('    void CleanSelectedPersonPeriod()')
$finish = $s.IndexOf('    void ListTnf()', $start)
if ($start -lt 0 -or $finish -le $start) { throw 'REV11 cleanup block not found.' }
$clean = $s.Substring($start, $finish - $start)
$clean = $clean.Replace('select AD,SOYAD,IGTARIH,ICTARIH from KIMLIK where PKNO=@P', 'select AD,SOYAD,IGTARIH,ICTARIH,DURUM from KIMLIK where PKNO=@P')
$anchor = '            var displayName = nameTable.Rows.Count == 0 ? "(KIMLIK kaydı yok)" : $"{nameTable.Rows[0]["AD"]} {nameTable.Rows[0]["SOYAD"]}".Trim();'
$insert = @'
            var displayName = nameTable.Rows.Count == 0 ? "(KIMLIK kaydı yok)" : $"{nameTable.Rows[0]["AD"]} {nameTable.Rows[0]["SOYAD"]}".Trim();
            if (nameTable.Rows.Count == 0) throw new InvalidOperationException("KIMLIK kaydı bulunamadı.");
            var pr = nameTable.Rows[0];
            var hire = pr["IGTARIH"] == DBNull.Value ? (DateTime?)null : Convert.ToDateTime(pr["IGTARIH"]).Date;
            var exit = pr["ICTARIH"] == DBNull.Value ? (DateTime?)null : Convert.ToDateTime(pr["ICTARIH"]).Date;
            var rawStatus = Convert.ToString(pr["DURUM"])?.Trim() ?? "";
            var active = ResolveActiveStatus(rawStatus, hire, exit);
            if (!active.HasValue) throw new InvalidOperationException("Aktif/Pasif ile giriş-çıkış tarihleri çelişiyor. Otomatik silme yapılmadı.");

            DateTime cleanA, cleanB;
            string cleanRule;
            if (active == false && exit.HasValue)
            {
                cleanA = exit.Value.AddDays(1) > a ? exit.Value.AddDays(1) : a;
                cleanB = b;
                cleanRule = $"PASİF: yalnız {exit:dd.MM.yyyy} çıkış tarihinden SONRASI";
            }
            else if (active == true && hire.HasValue && exit.HasValue && hire.Value > exit.Value)
            {
                cleanA = exit.Value.AddDays(1) > a ? exit.Value.AddDays(1) : a;
                cleanB = hire.Value < b ? hire.Value : b;
                cleanRule = $"AKTİF yeniden giriş: yalnız {exit:dd.MM.yyyy} çıkış ile {hire:dd.MM.yyyy} yeni giriş ARASI";
            }
            else
            {
                throw new InvalidOperationException("Bu personel için güvenli temizlenecek geçersiz tarih aralığı yok. Aktif personelin geçerli kayıtlarına dokunulmadı.");
            }
            if (cleanA >= cleanB) throw new InvalidOperationException("Seçili ay/yıl içinde temizlenecek geçersiz tarih aralığı yok.");
'@
if (-not $clean.Contains($anchor)) { throw 'REV11 cleanup anchor missing.' }
$clean = $clean.Replace($anchor, $insert)
$clean = $clean.Replace('new FbParameter("@P", card), new FbParameter("@A", a), new FbParameter("@B", b));', 'new FbParameter("@P", card), new FbParameter("@A", cleanA), new FbParameter("@B", cleanB));')
$clean = $clean.Replace('ev.Card == card && ev.Date >= a && ev.Date < b', 'ev.Card == card && ev.Date >= cleanA && ev.Date < cleanB')
$clean = $clean.Replace('Bu dönemdeki kart hareketleri HEM DB''DEN HEM TNF''DEN silinecek.', '{cleanRule} içindeki kart hareketleri HEM DB''DEN HEM TNF''DEN silinecek. Yeni işe girişten sonraki aktif kayıtlar korunacak.')
$s = $s.Substring(0, $start) + $clean + $s.Substring($finish)

Set-Content $syncPath $s -Encoding UTF8 -NoNewline
$check = Get-Content $syncPath -Raw
foreach ($token in @('Geçersiz DB+TNF Temizle','ResolveActiveStatus','PASİF - ÇIKIŞ SONRASI','AKTİF - ESKİ ÇIKIŞ / YENİ GİRİŞ ARASI','cleanA','cleanB','Yeni işe girişten sonraki aktif kayıtlar korunacak'))
{
    if (-not $check.Contains($token)) { throw "REV11 audit token missing: $token" }
}
Write-Host 'REV11 audit OK: status + hire/exit + same-card rehire protected cleanup.'
