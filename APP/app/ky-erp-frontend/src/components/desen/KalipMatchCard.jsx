import { Check, RefreshCcw, Trash2 } from "lucide-react";
import { normalizeList } from "../../utils/normalizeList";

export default function KalipMatchCard({
  item,
  index,
  models,
  onChange,
  onApprove,
  onRemove,
}) {
  const modelList = normalizeList(models);
  const initials = (item?.matchedModelName || item?.parsedModelName || "M")
    .slice(0, 2)
    .toLocaleUpperCase("tr-TR");
  return (
    <div className={`kalip-match-card ${item?.approved ? "approved" : ""}`}>
      <div className="kalip-card-index">{index + 1}</div>
      <div className="desen-model-thumb">
        <span>{initials}</span>
      </div>
      <div className="kalip-card-body">
        <strong>{item?.parsedModelName || "-"}</strong>
        <span>Beden / Boy: {item?.bedenBoy || "-"}</span>
        <select
          value={item?.matchedModelId || ""}
          onChange={(event) => {
            const model = modelList.find(
              (row) => row.id === event?.target.value,
            );
            onChange({
              ...item,
              matchedModelId: model?.id || "",
              matchedModelName: model?.modelAdi || "",
              musteri: model?.musteri || model?.musteriFirma || "",
              zemin: model?.zemin || "",
              matchStatus: model ? "Kontrol" : "Eşleşmedi",
              approved: false,
            });
          }}
        >
          <option value="">Model seç</option>
          {modelList.map((model) => (
            <option key={model?.id} value={model?.id}>
              {model?.modelAdi} - {model?.musteri || model?.musteriFirma || ""}
            </option>
          ))}
        </select>
        <div className="kalip-meta">
          <span>{item?.musteri || "Müşteri yok"}</span>
          <span>{item?.zemin || "Zemin yok"}</span>
        </div>
        <div className="kalip-meta">
          <span>
            Dağılım %
            <input
              value={item?.dagilimYuzde ?? ""}
              onChange={(event) =>
                onChange({
                  ...item,
                  dagilimYuzde: Number(event?.target.value || 0),
                })
              }
            />
          </span>
          <span>
            Kalıp Bölgesi
            <input
              value={item?.kalipBolgesi || ""}
              onChange={(event) =>
                onChange({ ...item, kalipBolgesi: event?.target.value })
              }
            />
          </span>
        </div>
      </div>
      <span
        className={`match-badge ${item?.approved ? "ok" : item.matchStatus === "Eşleşti" ? "ok" : item.matchStatus === "Kontrol" ? "warn" : "missing"}`}
      >
        {item?.approved ? "Onaylandı" : item?.matchStatus}
      </span>
      <div className="kalip-card-actions">
        <button type="button" onClick={onApprove} title="Onayla">
          <Check size={16} />
        </button>
        <button
          type="button"
          onClick={() =>
            onChange({ ...item, approved: false, matchStatus: "Kontrol" })
          }
          title="Değiştir"
        >
          <RefreshCcw size={16} />
        </button>
        <button type="button" onClick={onRemove} title="Kaldır">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
