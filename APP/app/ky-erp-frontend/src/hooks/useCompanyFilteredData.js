import { useMemo } from "react";
import {
  filterByActiveCompany,
  injectCompanyCode,
  useActiveCompany,
} from "../context/ActiveCompanyContext";

export function useCompanyFilteredData(rows) {
  const { activeCompany, activeCompanyCode } = useActiveCompany();

  const filteredRows = useMemo(() => {
    return filterByActiveCompany(
      Array.isArray(rows) ? rows : [],
      activeCompanyCode,
    );
  }, [rows, activeCompanyCode]);

  return {
    activeCompany,
    activeCompanyCode,
    filteredRows,
    withCompany: (payload) => injectCompanyCode(payload, activeCompanyCode),
  };
}
