export const RECORD_START_SIZE = { width: 840, height: 600 };

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

export function dialogSizeBounds(size, screen = { width: 1440, height: 900 }) {
  return {
    width: clamp(Number(size?.width) || RECORD_START_SIZE.width, Math.min(460, screen.width - 16), screen.width - 16),
    height: clamp(Number(size?.height) || RECORD_START_SIZE.height, Math.min(320, screen.height - 16), screen.height - 16),
  };
}
