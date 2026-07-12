import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../../utils/api";
import { normalizeList } from "../../utils/normalizeList";

function companyParams(activeMainCompany) {
  const mainCompanySlug =
    activeMainCompany?.slug || activeMainCompany?.mainCompanySlug || "";
  const mainCompanyId =
    activeMainCompany?.id || activeMainCompany?.mainCompanyId || "";
  if (!mainCompanySlug) return null;
  return mainCompanyId
     ? { mainCompanySlug, mainCompanyId }
    : { mainCompanySlug };
}

function unwrap(payload) {
  return payload &&
    typeof payload === "object" &&
    payload.ok === true &&
    Object.prototype.hasOwnProperty.call(payload, "data")
     ? payload?.data
    : payload;
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function modelSortTime(model = {}) {
  const raw =
    model?.createdAt ||
    model?.created_at ||
    model?.updatedAt ||
    model?.updated_at ||
    model?.sonIslemTarihi ||
    "";
  const time = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function sortModelsNewestFirst(rows = []) {
  return [...rows].sort((a, b) => {
    const diff = modelSortTime(b) - modelSortTime(a);
    if (diff) return diff;
    return String(a.modelAdi || a.modelName || "").localeCompare(
      String(b.modelAdi || b.modelName || ""),
      "tr",
      { sensitivity: "base" },
    );
  });
}

export default function ModelSelect({
  activeMainCompany,
  value = "",
  onChange,
  firmaId = "",
  models: providedModels,
  disabled = false,
  placeholder = "Model ara veya seç...",
}) {
  const [models, setModels] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (providedModels != null) {
      setModels(normalizeList(providedModels));
      return;
    }
    const params = companyParams(activeMainCompany);
    if (!params) {
      setModels([]);
      return;
    }
    let alive = true;
    setLoading(true);
    setError("");
    apiGet("/desen/modeller", { ...params, pageSize: 5000, limit: 5000 })
      .then((payload) => {
        if (!alive) return;
        const rows = unwrap(payload);
        setModels(sortModelsNewestFirst(normalizeList(rows)));
      })
      .catch((err) => {
        if (!alive) return;
        setModels([]);
        setError(err.message || "Model listesi yüklenemedi.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [activeMainCompany, providedModels]);

  const modelList = useMemo(
    () => sortModelsNewestFirst(normalizeList(models)),
    [models],
  );
  const filtered = useMemo(() => {
    const q = normalizeSearchText(query);
    return modelList
      .filter((model) => {
        if (firmaId && String(model?.firmaId || "") !== String(firmaId)) {
          return false;
        }
        if (!q) return true;
        return normalizeSearchText(`${model?.modelAdi || model?.modelName || ""} ${model?.firmaAdi || model?.firmName || model?.musteriFirma || ""} ${
          model?.sezon || ""
        } ${model?.zeminRenk || model?.zemin || ""}`).includes(q);
      })
      .slice(0, 120);
  }, [firmaId, modelList, query]);

  function emit(modelId) {
    const selected =
      modelList.find((model) => String(model?.id) === String(modelId)) || null;
    onChange?.(selected.id || "", selected);
  }

  return (
    <div className="model-select">
      <input
        value={query}
        disabled={disabled}
        onChange={(event) => setQuery(event?.target.value)}
        placeholder={loading ? "Modeller yükleniyor..." : placeholder}
      />
      <select
        value={value || ""}
        disabled={disabled || loading}
        onChange={(event) => emit(event?.target.value)}
      >
        <option value="">Model seçilmedi</option>
        {filtered.map((model) => (
          <option key={model?.id} value={model?.id}>
            {[model?.modelAdi, model?.firmaAdi || model?.musteriFirma, model?.sezon]
              .filter(Boolean)
              .join(" | ")}
          </option>
        ))}
      </select>
      {error ? <small className="form-error">{error}</small> : null}
    </div>
  );
}
