/**
 * Model detayı yalnız sağ-alt köşeden boyutlandırılır.
 * Sol-üst konum sabit kalır; sağ/alt kenarlar fareyle genişler veya daralır.
 * Ekranın kullanılabilir alanından dışarı çıkılmasına izin verilmez.
 */
export function resizeModelDetailBox({ width, height, startX, startY, x, y, maxWidth, maxHeight }) {
  const clamp = (value, minimum, maximum) => Math.min(Math.max(value, Math.min(minimum, maximum)), maximum);
  const safeMaxWidth = Math.max(1, Number(maxWidth) || 1);
  const safeMaxHeight = Math.max(1, Number(maxHeight) || 1);
  return {
    width: clamp(width + x - startX, 460, safeMaxWidth),
    height: clamp(height + y - startY, 320, safeMaxHeight),
  };
}
