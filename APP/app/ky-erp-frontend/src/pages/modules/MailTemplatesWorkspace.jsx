import { useCallback, useEffect, useState } from "react";
import { createMailTemplate, listMailTemplates, updateMailTemplate } from "../../services/mailApi";
import "./MailTemplatesWorkspace.css";

const blank = { id: "", name: "", subject: "", bodyText: "", category: "", isActive: true };
function asForm(row) {
  return {
    id: row.id, name: row.name || "", subject: row.subject_template || "",
    bodyText: row.body_template || "", category: row.category || "", isActive: Number(row.is_active) === 1,
  };
}
export default function MailTemplatesWorkspace({ onUse }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listMailTemplates();
      setRows(Array.isArray(result) ? result : []);
      setMessage("");
    } catch (error) { setMessage("Hata: " + (error?.message || "Şablonlar yüklenemedi.")); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(event) {
    event.preventDefault();
    if (!form?.name.trim() || !form?.bodyText.trim()) return setMessage("Hata: Şablon adı ve metni zorunludur.");
    setLoading(true);
    try {
      const payload = { name: form.name, subject: form.subject, bodyText: form.bodyText, category: form.category, isActive: form.isActive };
      if (form.id) await updateMailTemplate(form.id, payload);
      else await createMailTemplate(payload);
      setForm(null);
      await load();
      setMessage("Şablon kaydedildi.");
    } catch (error) { setMessage("Hata: " + (error?.message || "Şablon kaydedilemedi.")); setLoading(false); }
  }
  async function changeActive(row) {
    setLoading(true);
    try {
      await updateMailTemplate(row.id, { name: row.name, subject: row.subject_template || "", bodyText: row.body_template || "", category: row.category || "", isActive: Number(row.is_active) !== 1 });
      await load();
      setMessage("Şablon durumu güncellendi.");
    } catch (error) { setMessage("Hata: " + (error?.message || "Şablon durumu güncellenemedi.")); setLoading(false); }
  }
  const visible = rows.filter((row) => [row.name,row.category,row.subject_template].some((value) => String(value || "").toLocaleLowerCase("tr-TR").includes(filter.toLocaleLowerCase("tr-TR"))));
  return (
    <section className="commt-workspace" aria-label="Mail şablonları">
      <header>
        <div><small>KY ERP / MAIL ŞABLONLARI</small><h2>Kurumsal Mail Şablonları</h2><p>Gerçek taslaklarda kullanılan metinler. Gönderim yalnız kullanıcı komutuyla yapılır.</p></div>
        <div className="commt-actions"><button type="button" className="secondary" disabled={loading} onClick={load}>Yenile</button><button type="button" onClick={() => setForm({ ...blank })}>+ Şablon Oluştur</button></div>
      </header>
      {message ? <p role="alert" className="commt-notice">{message}</p> : null}
      <div className="commt-filter"><input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Ad, konu veya kategori ara" /><span>{visible.length} şablon</span></div>
      <div className="commt-list">
        {visible.map((row) => <article key={row.id}>
          <div><small>{row.category || "GENEL"} · {Number(row.is_active) === 1 ? "Aktif" : "Pasif"}</small><h3>{row.name}</h3><p>{row.subject_template || "Konu belirtilmedi"}</p><div className="commt-excerpt">{row.body_template}</div></div>
          <div className="commt-actions"><button type="button" disabled={loading || Number(row.is_active) !== 1} onClick={() => onUse?.(row)}>Mailde Kullan</button><button type="button" className="secondary" onClick={() => setForm(asForm(row))}>Düzenle</button><button type="button" className="secondary" disabled={loading} onClick={() => changeActive(row)}>{Number(row.is_active) === 1 ? "Pasifleştir" : "Aktifleştir"}</button></div>
        </article>)}
        {!loading && visible.length === 0 ? <div className="commt-empty">Henüz şablon bulunmuyor. Yeni şablon oluşturabilirsiniz.</div> : null}
      </div>
      {form ? <div className="commt-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setForm(null); }}>
        <section className="commt-editor" role="dialog" aria-modal="true" aria-label="Mail şablonunu düzenle">
          <header><h3>{form.id ? "Şablonu Düzenle" : "Yeni Şablon"}</h3><button type="button" className="secondary" onClick={() => setForm(null)}>Kapat</button></header>
          <form onSubmit={save}>
            <label>Ad<input required maxLength={120} value={form.name} onChange={(event) => setForm((v) => ({...v,name:event.target.value}))}/></label>
            <label>Kategori<input maxLength={60} value={form.category} onChange={(event) => setForm((v) => ({...v,category:event.target.value}))}/></label>
            <label className="wide">Konu<input maxLength={250} value={form.subject} onChange={(event) => setForm((v) => ({...v,subject:event.target.value}))}/></label>
            <label className="wide">Mail Metni<textarea rows={12} required maxLength={20000} value={form.bodyText} onChange={(event) => setForm((v) => ({...v,bodyText:event.target.value}))}/></label>
            <label className="commt-check"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((v) => ({...v,isActive:event.target.checked}))}/> Aktif</label>
            <button type="submit" disabled={loading}>Kaydet</button>
          </form>
          {message.startsWith("Hata:") ? <p role="alert" className="commt-notice">{message}</p> : null}
        </section>
      </div> : null}
    </section>
  );
}
