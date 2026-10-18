export const MAX_TEXT = 4000;        // characters of typed list
export const MAX_IMAGE = 5 * 1024 * 1024;
export const MAX_ITEMS = 50;
export const MAX_ITEM_TEXT = 200;
export const MAX_TITLE = 80;

// Trust the bytes, not the Content-Type header.
export function imageType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

// Fixed window per key, in memory. Good enough for one small container.
export function rateLimiter(max, windowMs) {
  const hits = new Map();
  return (key, now = Date.now()) => {
    const h = hits.get(key);
    if (!h || now - h.start >= windowMs) {
      if (hits.size > 10000) hits.clear();
      hits.set(key, { start: now, count: 1 });
      return true;
    }
    return ++h.count <= max;
  };
}
