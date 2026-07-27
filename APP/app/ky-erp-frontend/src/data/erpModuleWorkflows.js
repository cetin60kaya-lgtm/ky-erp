const createBaseConfig = (overrides = {}) => ({
  title: "ERP",
  dashboardTitle: "Yönetim Özeti",
  quickTitle: "Hızlı Kayıt",
  reportTitle: "Kontrol Raporu",
  requiredFields: [],
  actionRules: [],
  dashboardCards: [
    { key: "total", label: "Toplam" },
    { key: "open", label: "Açık" },
    { key: "missing", label: "Eksik" },
    { key: "closed", label: "Kapalı" },
  ],
  quickFields: [],
  rows: [],
  ...overrides,
});

export const ERP_MODULE_WORKFLOWS = {
  model: createBaseConfig({
    title: "Genel",
    dashboardTitle: "Genel Yönetim Özeti",
    quickTitle: "Hızlı Kayıt",
    reportTitle: "Genel Kontrol Raporu",
  }),
  admin: createBaseConfig({
    title: "Yönetim",
    dashboardTitle: "Sistem Yönetim Özeti",
    quickTitle: "Hızlı Yönetim Kaydı",
    reportTitle: "Sistem Kontrol Raporu",
    requiredFields: [
      { key: "owner", label: "Sorumlu eksik" },
      { key: "category", label: "Kategori eksik" },
      { key: "updatedAt", label: "Güncelleme tarihi yok" },
    ],
    quickFields: [
      { key: "title", label: "Başlık", type: "text" },
      { key: "owner", label: "Sorumlu", type: "text" },
      { key: "category", label: "Kategori", type: "text" },
    ],
    rows: [
      {
        id: "admin-system-check",
        title: "Sistem kontrolü",
        owner: "Yönetici",
        category: "Sistem",
        updatedAt: new Date().toISOString(),
        completed: false,
        nextAction: "Kontrol et",
      },
    ],
  }),
};
