// Identity for rows the user creates — BUILD-SPEC §5 [v4].
//
// One generator for the whole app. Attendees need it now; every other row type
// the form creates (schedule, F&B, staff, sections) will need the same one, and
// two generators would be two conventions.
//
// IDs are opaque. They are assigned once, at creation, never displayed, and
// never edited. Nothing may parse them, sort by them, or infer creation order
// from them — that is why nothing here encodes a timestamp or a counter.

/**
 * A fresh opaque ID.
 *
 * `crypto.randomUUID()` where it exists. It requires a secure context: Railway
 * serves HTTPS, but `file://` and plain-HTTP local serving do not qualify, and
 * there the app must still work. `crypto.getRandomValues()` has no such
 * requirement, so it is the first fallback; `Math.random()` is the last resort
 * for anything older. These identify rows in a local document — uniqueness
 * within one event file is the whole requirement, not unguessability.
 *
 * @returns {string}
 */
export function newId() {
  const webCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;

  if (webCrypto && typeof webCrypto.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }

  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    const bytes = webCrypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  return `${randomChunk()}${randomChunk()}${randomChunk()}`;
}

/** Eight random base-36 characters. */
function randomChunk() {
  return Math.random().toString(36).slice(2, 10).padStart(8, '0');
}
