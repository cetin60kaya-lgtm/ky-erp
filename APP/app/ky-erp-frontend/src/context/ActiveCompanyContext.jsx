import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiGet, setApiActiveMainCompany } from "../utils/api";
import { canonicalCompanySlug } from "../utils/companyIdentity";
import { useAuth } from "./AuthContext";

const STORAGE_KEY = "kyerp.activeCompany";
const DEFAULT_MAIN_COMPANY = {
  id: "main-mecit-hakan",
  name: "Hakan Emprime",
  slug: "mecit-hakan",
  isActive: true,
};
const LEGACY_COMPANY_SLUG_MAP = {
  "main-mecit-hakan": "mecit-hakan",
  "mecit-hakan-gursu": "mecit-hakan",
  "hakan-baski": "mecit-hakan",
  "main-hakan": "mecit-hakan",
  "main-hakan-baski": "mecit-hakan",
  "hkn-baski": "mecit-hakan",
};
const DEFAULT_COMPANIES = [DEFAULT_MAIN_COMPANY];

const LEGACY_STORAGE_KEYS = [
  "activeCompany",
  "selectedCompany",
  "mainCompany",
  "companySlug",
  "kyerp.activeCompany",
  "kyerp.selectedCompany",
  "kyerp.mainCompany",
  "kyerp.companySlug",
];

function hasLegacyHakan(value) {
  const text = String(value || "").toLocaleLowerCase("tr-TR");
  return (
    text.includes("hakan-baski") ||
    text.includes("hakan baski") ||
    text.includes("hkn-baski") ||
    text.includes("main-hakan") ||
    text.includes("main-hakan-baski")
  );
}

function sanitizeLegacyCompanyStorage() {
  if (typeof window === "undefined") return null;
  const snapshot = {
    id: DEFAULT_MAIN_COMPANY.id,
    slug: DEFAULT_MAIN_COMPANY.slug,
    name: DEFAULT_MAIN_COMPANY.name,
    isActive: true,
  };
  let forceDefault = false;

  for (const key of LEGACY_STORAGE_KEYS) {
    let raw = "";
    try {
      raw = String(window.localStorage.getItem(key) || "").trim();
    } catch {
      raw = "";
    }
    if (!raw) continue;

    if (hasLegacyHakan(raw)) {
      forceDefault = true;
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Depolama kullanılamıyorsa varsayılan şirketle devam edilir.
      }
      continue;
    }

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (
          hasLegacyHakan(parsed.slug || "") ||
          hasLegacyHakan(parsed.id || "")
        ) {
          forceDefault = true;
          window.localStorage.removeItem(key);
          continue;
        }
      }
    } catch {
      // Bozuk eski kayıt yok sayılır.
    }
  }

  if (forceDefault) {
    try {
      window.localStorage.setItem(STORAGE_KEY, snapshot.slug);
      window.localStorage.setItem("mainCompany", JSON.stringify(snapshot));
      window.localStorage.setItem("selectedCompany", JSON.stringify(snapshot));
      window.localStorage.setItem("activeCompany", snapshot.slug);
      window.localStorage.setItem("companySlug", snapshot.slug);
    } catch {
      // Depolama kullanılamıyorsa bellek içindeki seçim korunur.
    }
    return snapshot.slug;
  }

  return null;
}

function normalizeCompanySlug(value) {
  const slug = String(value || "").trim();
  return canonicalCompanySlug(LEGACY_COMPANY_SLUG_MAP[slug] || slug);
}

const ActiveCompanyContext = createContext(null);

function mapBackendCompany(row) {
  const slug = String(row?.slug || "").trim();
  return {
    id: String(row?.id || slug || ""),
    name: String(row?.name || slug || "").trim(),
    slug,
    isActive: row?.isActive !== false,
  };
}

export function ActiveCompanyProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [companies, setCompanies] = useState(DEFAULT_COMPANIES);
  const [activeCompanySlug, setActiveCompanySlug] = useState(() => {
    try {
      const sanitizedSlug = sanitizeLegacyCompanyStorage();
      return normalizeCompanySlug(
        sanitizedSlug ||
          localStorage.getItem(STORAGE_KEY) ||
          DEFAULT_MAIN_COMPANY.slug,
      );
    } catch {
      return DEFAULT_MAIN_COMPANY.slug;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        normalizeCompanySlug(activeCompanySlug),
      );
    } catch {
      // Depolama kullanılamıyorsa context state'i kaynak olarak kalır.
    }
  }, [activeCompanySlug]);

  useEffect(() => {
    if (!isAuthenticated) {
      setCompanies(DEFAULT_COMPANIES);
      setActiveCompanySlug(DEFAULT_MAIN_COMPANY.slug);
      return;
    }

    let alive = true;
    apiGet("/admin/main-companies")
      .then((rows) => {
        if (!alive) return;
        const mapped = Array.isArray(rows)
          ? rows
              .map(mapBackendCompany)
              .filter(
                (x) =>
                  x.isActive &&
                  x.slug !== "hakan-baski" &&
                  x.id !== "main-hakan-baski",
              )
          : [];
        if (mapped.length > 0) {
          setCompanies(mapped);
          const normalizedCurrent = normalizeCompanySlug(activeCompanySlug);
          const hasCurrent = mapped.some((x) => x.slug === normalizedCurrent);
          if (!hasCurrent) setActiveCompanySlug(mapped[0].slug);
        } else {
          setCompanies(DEFAULT_COMPANIES);
          setActiveCompanySlug(DEFAULT_MAIN_COMPANY.slug);
        }
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [activeCompanySlug, isAuthenticated]);

  const activeCompany = useMemo(() => {
    return (
      companies.find(
        (x) => x.slug === normalizeCompanySlug(activeCompanySlug),
      ) ||
      companies[0] ||
      null
    );
  }, [companies, activeCompanySlug]);

  useEffect(() => {
    setApiActiveMainCompany(activeCompany);
  }, [activeCompany]);

  const value = useMemo(
    () => ({
      companies,
      activeCompany,
      activeCompanySlug,
      setActiveCompanySlug,
    }),
    [companies, activeCompany, activeCompanySlug],
  );

  return (
    <ActiveCompanyContext.Provider value={value}>
      {children}
    </ActiveCompanyContext.Provider>
  );
}

export function useActiveCompany() {
  const ctx = useContext(ActiveCompanyContext);
  if (!ctx) {
    throw new Error(
      "useActiveCompany must be used inside ActiveCompanyProvider",
    );
  }
  return ctx;
}

export function getRecordCompanyCode(record) {
  if (!record || typeof record !== "object") return "";
  return (
    record.mainCompanySlug ||
    record.main_company_slug ||
    record.mainCompanyId ||
    record.main_company_id ||
    ""
  );
}

export function filterByActiveCompany(list, activeCompanyCode) {
  if (!Array.isArray(list)) return [];
  return list.filter((item) => {
    const code = getRecordCompanyCode(item);
    if (!code) return false;
    return (
      String(code).toLocaleUpperCase("tr-TR") ===
      String(activeCompanyCode || "").toLocaleUpperCase("tr-TR")
    );
  });
}

export function injectCompanyCode(payload, activeCompanyCode) {
  if (!payload || typeof payload !== "object") return payload;
  return {
    ...payload,
    mainCompanySlug: activeCompanyCode.slug || activeCompanyCode || "",
    mainCompanyId: activeCompanyCode.id || "",
    mainCompanyName: activeCompanyCode.name || "",
  };
}
