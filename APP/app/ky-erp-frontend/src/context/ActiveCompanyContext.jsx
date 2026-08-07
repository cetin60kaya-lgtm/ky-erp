import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiGet, setApiActiveMainCompany } from "../utils/api";
import { useAuth } from "./AuthContext";

const STORAGE_KEY = "kyerp.activeCompany";
const CANONICAL_HAKAN_SLUG = "mecit-hakan";
const LEGACY_SLUGS = new Set(["hakan-baski", "main-hakan", "main-hakan-baski", "hkn-baski", "mecit-hakan-gursu"]);
const ActiveCompanyContext = createContext(null);

function canonicalSlug(value) {
  const slug = String(value || "").trim().toLowerCase();
  return LEGACY_SLUGS.has(slug) ? CANONICAL_HAKAN_SLUG : slug;
}

function mapCompany(row) {
  const slug = canonicalSlug(row?.slug || row?.mainCompanySlug);
  return {
    id: String(row?.id || ""),
    slug,
    code: String(row?.code || ""),
    name: String(row?.name || row?.legalName || slug),
    legalName: String(row?.legalName || ""),
    isActive: row?.isActive !== false,
  };
}

export function ActiveCompanyProvider({ children }) {
  const { isAuthenticated, isPlatformAdmin, memberships, activeCompany: authenticatedCompany, switchCompany } = useAuth();
  const [adminCompanies, setAdminCompanies] = useState([]);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");

  useEffect(() => {
    if (!isAuthenticated || !isPlatformAdmin) {
      setAdminCompanies([]);
      return;
    }
    let alive = true;
    apiGet("/admin/companies")
      .then((payload) => {
        if (!alive) return;
        const rows = Array.isArray(payload) ? payload : payload?.items || payload?.data || [];
        setAdminCompanies(rows.map(mapCompany));
      })
      .catch(() => { if (alive) setAdminCompanies([]); });
    return () => { alive = false; };
  }, [isAuthenticated, isPlatformAdmin]);

  const companies = useMemo(() => {
    if (isPlatformAdmin) return adminCompanies;
    return memberships.map((membership) => mapCompany(membership?.company)).filter((company) => company.id && company.slug);
  }, [adminCompanies, isPlatformAdmin, memberships]);

  const activeCompany = useMemo(() => {
    if (!authenticatedCompany) return null;
    const mapped = mapCompany(authenticatedCompany);
    return companies.find((company) => company.id === mapped.id || company.slug === mapped.slug) || mapped;
  }, [authenticatedCompany, companies]);

  useEffect(() => {
    setApiActiveMainCompany(activeCompany);
    try {
      if (activeCompany?.slug) window.localStorage.setItem(STORAGE_KEY, activeCompany.slug);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Local storage is only a display convenience, never the tenant authority.
    }
  }, [activeCompany]);

  const setActiveCompanySlug = useCallback(async (companyIdOrSlug) => {
    const requested = String(companyIdOrSlug || "").trim();
    if (!requested || switching) return null;
    const company = companies.find((item) => item.id === requested || item.slug === canonicalSlug(requested));
    if (!company) throw new Error("Bu firmaya erişim yetkiniz yok.");
    setSwitching(true);
    setSwitchError("");
    try {
      return await switchCompany(company.id);
    } catch (error) {
      setSwitchError(error?.message || "Firma değiştirilemedi.");
      throw error;
    } finally {
      setSwitching(false);
    }
  }, [companies, switchCompany, switching]);

  const value = useMemo(() => ({
    companies,
    activeCompany,
    activeCompanySlug: activeCompany?.slug || "",
    setActiveCompanySlug,
    switching,
    switchError,
  }), [companies, activeCompany, setActiveCompanySlug, switching, switchError]);

  return <ActiveCompanyContext.Provider value={value}>{children}</ActiveCompanyContext.Provider>;
}

export function useActiveCompany() {
  const context = useContext(ActiveCompanyContext);
  if (!context) throw new Error("useActiveCompany must be used inside ActiveCompanyProvider");
  return context;
}

export function getRecordCompanyCode(record) {
  if (!record || typeof record !== "object") return "";
  return record.mainCompanySlug || record.main_company_slug || record.mainCompanyId || record.main_company_id || "";
}

export function filterByActiveCompany(list, activeCompanyCode) {
  if (!Array.isArray(list)) return [];
  const expected = canonicalSlug(activeCompanyCode?.slug || activeCompanyCode);
  return list.filter((item) => canonicalSlug(getRecordCompanyCode(item)) === expected);
}

export function injectCompanyCode(payload, activeCompanyCode) {
  if (!payload || typeof payload !== "object") return payload;
  return {
    ...payload,
    mainCompanySlug: activeCompanyCode?.slug || activeCompanyCode || "",
    mainCompanyId: activeCompanyCode?.id || "",
    mainCompanyName: activeCompanyCode?.name || "",
  };
}
