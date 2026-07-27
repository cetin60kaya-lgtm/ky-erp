import { useState } from "react";
import { Search } from "lucide-react";
import { normalizeList } from "../../utils/normalizeList";
import { getModelImageSource } from "../../utils/modelImage";

function statusClass(value) {
  const raw = String(value || "").toLocaleLowerCase("tr-TR");
  if (raw.includes("tamam")) return "ok";
  if (raw.includes("kontrol")) return "warn";
  return "missing";
}

export default function SharedModelList({ models, selectedId, onSelect }) {
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState("");
  const [zemin, setZemin] = useState("");
  const [filter, setFilter] = useState("");
  const modelList = normalizeList(models);
  const customers = [
    ...new Set(
      modelList.map((m) => m.musteri || m.musteriFirma).filter(Boolean),
    ),
  ];
  const zemins = [
    ...new Set(modelList.map((m) => m.zemin || m.zeminRenk).filter(Boolean)),
  ];
  const visible = modelList.filter((model) => {
    const haystack =
      `${model?.modelAdi} ${model?.musteri || model?.musteriFirma} ${model?.zemin || model?.zeminRenk}`.toLocaleLowerCase(
        "tr-TR",
      );
    const matchesSearch =
      !search || haystack.includes(search.toLocaleLowerCase("tr-TR"));
    const matchesCustomer =
      !customer || (model.musteri || model.musteriFirma) === customer;
    const matchesZemin = !zemin || (model?.zemin || model?.zeminRenk) === zemin;
    const missing =
      model?.desenDurumu !== "tamam" ||
      model?.yerlesimDurumu !== "tamam" ||
      model?.kalipDurumu !== "tamam";
    const kalip = model?.kalipDurumu !== "tamam";
    return (
      matchesSearch &&
      matchesCustomer &&
      matchesZemin &&
      (!filter || (filter === "missing" ? missing : kalip))
    );
  });
  return (
    <aside className="shared-model-list">
      <div className="shared-model-title">Merkezi Model Listesi</div>
      <label className="desen-search">
        <Search size={16} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Model, müşteri, zemin ara"
        />
      </label>
      <div className="desen-filter-grid">
        <select value={customer} onChange={(e) => setCustomer(e.target.value)}>
          <option value="">Müşteri</option>
          {customers.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select value={zemin} onChange={(e) => setZemin(e.target.value)}>
          <option value="">Zemin</option>
          {zemins.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Durum</option>
          <option value="missing">Dosya eksik</option>
          <option value="kalip">Kalıp bekleyen</option>
        </select>
      </div>
      <div className="shared-model-scroll">
        {!visible.length ? (
          <div className="empty-model-list">Model bulunamadı</div>
        ) : null}
        {visible.map((model) => {
          const initials = (model?.modelAdi || "M")
            .slice(0, 2)
            .toLocaleUpperCase("tr-TR");
          const imageSrc = getModelImageSource(model);
          return (
            <button
              key={model?.id}
              type="button"
              className={`shared-model-card ${selectedId === model?.id ? "active" : ""}`}
              onClick={() => onSelect(model)}
            >
              <div className="desen-model-thumb">
                {imageSrc ? (
                  <img src={imageSrc} alt="" />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
              <div className="shared-model-body">
                <strong>{model?.modelAdi}</strong>
                <i
                  className={`model-status-dot ${statusClass(model?.desenDurumu)}`}
                />
                <span>
                  Müşteri: {model?.musteri || model?.musteriFirma || "-"}
                </span>
                <span>Zemin: {model?.zemin || model?.zeminRenk || "-"}</span>
                <span>Durum: {model?.durum || "Aktif"}</span>
                <div className="mini-status-row">
                  <em className={statusClass(model?.desenDurumu)}>
                    Desen: {model?.desenDurumu}
                  </em>
                  <em className={statusClass(model?.yerlesimDurumu)}>
                    Yerleşim: {model?.yerlesimDurumu}
                  </em>
                  <em className={statusClass(model?.kalipDurumu)}>
                    Kalıp: {model?.kalipDurumu}
                  </em>
                </div>
                <small>
                  {(model?.sonIslemTarihi || "").slice(0, 10) || "İşlem yok"}
                </small>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
