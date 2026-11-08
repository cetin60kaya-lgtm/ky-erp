/**
 * Model detayı sol kenarı sürüklendiğinde sağ kenar sabit kalır.
 * Sol-alt köşe hem genişlik hem yükseklik değiştirir.
 * Boyut sınırları ekran dışına taşmayı engeller.
 */
export function resizeModelDetailBox({ width, height, startX, startY, x, y, edge, maxWidth, maxHeight }) {
  const clamp = (value, minimum, maximum) => Math.min(Math.max(value, Math.min(minimum, maximum)), maximum);
  const safeMaxWidth = Math.max(1, Number(maxWidth) || 1);
  const safeMaxHeight = Math.max(1, Number(maxHeight) || 1);
  return {
    width: clamp(width + startX - x, 460, safeMaxWidth),
    height: edge === "corner"
      ? clamp(height + y - startY, 320, safeMaxHeight)
      : clamp(height, 320, safeMaxHeight),
  };
}
