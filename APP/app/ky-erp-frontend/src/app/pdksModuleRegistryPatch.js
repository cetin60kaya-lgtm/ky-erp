// PDKS artık canonical moduleRegistry.js içinde doğrudan tanımlanır.
// Bu dosya eski import yollarını bozmamak için uyumluluk katmanı olarak tutulur;
// modül listesine side-effect ile ekleme yapmaz.
export { MODULES, MODULE_ROUTE_ALIASES } from "./moduleRegistry";
