/**
 * AES-256-CBC for the frames the bot host puts on the socket.
 *
 * The Kotlin side wraps a frame with
 *
 *     SecretKeySpec(hashSecret.toByteArray(), "AES")
 *     Cipher.getInstance("AES/CBC/PKCS5PADDING")
 *
 * and sends the ciphertext base64'd. Nothing in the frame marks it as
 * encrypted, and plaintext frames still arrive — `Indexes: 0,3,7` from the
 * index socket, the snapshot bodies, the log lines in between — so
 * `decryptMessage` sniffs instead of being told: a frame that isn't base64,
 * isn't a whole number of 16-byte blocks, doesn't unpad as PKCS#5 or doesn't
 * decode as UTF-8 is handed straight back untouched. Every one of those checks
 * is on the CIPHERTEXT's own structure, so a plaintext line only reaches the
 * decoder by looking exactly like a ciphertext, and even then it has to survive
 * the padding and the UTF-8 pass to be believed.
 *
 * Written out by hand rather than through SubtleCrypto because that API is
 * async, and the socket handlers run in arrival order on purpose — TableView
 * compares each snapshot against the one before it to spot a partial re-read,
 * which a promise between the wire and the handler would reorder.
 *
 * `decryptImage` is the same key over the host's `GET /image/{tableIndex}`,
 * which is optionally wrapped the same way and equally silent about it. It
 * sniffs too, on a firmer oracle: text can only be checked for "does this
 * decode", an image for PNG's signature.
 */

const KEY_TEXT = 'u3sZ7Kp1mQ8vT4xN6cR2aW9jF5yH0bLd'
const IV_TEXT = 'G7mQ2vX9pL4sK8dN'

const BLOCK = 16

/* ---------- AES tables ---------- */

const SBOX = new Uint8Array(256)
const INV_SBOX = new Uint8Array(256)

;(function buildTables() {
  const rotl8 = (x, n) => ((x << n) | (x >>> (8 - n))) & 0xff
  let p = 1
  let q = 1
  do {
    // p *= 3 in GF(2^8)
    p = (p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0)) & 0xff
    // q /= 3 in GF(2^8)
    q ^= (q << 1) & 0xff
    q ^= (q << 2) & 0xff
    q ^= (q << 4) & 0xff
    q &= 0xff
    if (q & 0x80) q ^= 0x09
    SBOX[p] = (q ^ rotl8(q, 1) ^ rotl8(q, 2) ^ rotl8(q, 3) ^ rotl8(q, 4) ^ 0x63) & 0xff
  } while (p !== 1)
  SBOX[0] = 0x63
  for (let i = 0; i < 256; i++) INV_SBOX[SBOX[i]] = i
})()

/** Multiply in GF(2^8) — only the inverse MixColumns needs the general case. */
function gmul(a, b) {
  let out = 0
  for (let i = 0; i < 8; i++) {
    if (b & 1) out ^= a
    const hi = a & 0x80
    a = (a << 1) & 0xff
    if (hi) a ^= 0x1b
    b >>= 1
  }
  return out & 0xff
}

/** FIPS-197 key expansion. Returns the round keys as one flat byte array. */
function expandKey(key) {
  const nk = key.length / 4
  const nr = nk + 6
  const w = new Uint8Array(16 * (nr + 1))
  w.set(key)
  let rcon = 1
  for (let i = nk; i < 4 * (nr + 1); i++) {
    const p = (i - 1) * 4
    let t0 = w[p]
    let t1 = w[p + 1]
    let t2 = w[p + 2]
    let t3 = w[p + 3]
    if (i % nk === 0) {
      const r = t0
      t0 = SBOX[t1] ^ rcon
      t1 = SBOX[t2]
      t2 = SBOX[t3]
      t3 = SBOX[r]
      rcon = gmul(rcon, 2)
    } else if (nk > 6 && i % nk === 4) {
      t0 = SBOX[t0]
      t1 = SBOX[t1]
      t2 = SBOX[t2]
      t3 = SBOX[t3]
    }
    const q = i * 4
    const b = (i - nk) * 4
    w[q] = w[b] ^ t0
    w[q + 1] = w[b + 1] ^ t1
    w[q + 2] = w[b + 2] ^ t2
    w[q + 3] = w[b + 3] ^ t3
  }
  return { w, nr }
}

/** The inverse cipher, in place on one 16-byte block. */
function decryptBlock(s, w, nr) {
  const t = new Uint8Array(BLOCK)

  for (let i = 0; i < BLOCK; i++) s[i] ^= w[nr * BLOCK + i]

  for (let round = nr - 1; round >= 0; round--) {
    // InvShiftRows: row r rotates right by r.
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) t[((c + r) % 4) * 4 + r] = s[c * 4 + r]
    }
    // InvSubBytes + AddRoundKey
    for (let i = 0; i < BLOCK; i++) s[i] = INV_SBOX[t[i]] ^ w[round * BLOCK + i]
    if (round === 0) break
    // InvMixColumns
    for (let c = 0; c < 4; c++) {
      const o = c * 4
      const a0 = s[o]
      const a1 = s[o + 1]
      const a2 = s[o + 2]
      const a3 = s[o + 3]
      s[o] = gmul(a0, 14) ^ gmul(a1, 11) ^ gmul(a2, 13) ^ gmul(a3, 9)
      s[o + 1] = gmul(a0, 9) ^ gmul(a1, 14) ^ gmul(a2, 11) ^ gmul(a3, 13)
      s[o + 2] = gmul(a0, 13) ^ gmul(a1, 9) ^ gmul(a2, 14) ^ gmul(a3, 11)
      s[o + 3] = gmul(a0, 11) ^ gmul(a1, 13) ^ gmul(a2, 9) ^ gmul(a3, 14)
    }
  }
}

/**
 * CBC-decrypt and strip the PKCS#5 padding.
 * Returns null when the input isn't a whole number of blocks or the padding
 * doesn't check out — i.e. "this was never our ciphertext".
 */
export function aesCbcDecrypt(bytes, key, iv) {
  if (!bytes.length || bytes.length % BLOCK !== 0) return null
  const { w, nr } = expandKey(key)
  const out = new Uint8Array(bytes.length)
  let prev = iv
  for (let off = 0; off < bytes.length; off += BLOCK) {
    const block = bytes.slice(off, off + BLOCK)
    const cipher = block.slice()
    decryptBlock(block, w, nr)
    for (let i = 0; i < BLOCK; i++) out[off + i] = block[i] ^ prev[i]
    prev = cipher
  }
  const pad = out[out.length - 1]
  if (pad < 1 || pad > BLOCK || pad > out.length) return null
  for (let i = out.length - pad; i < out.length; i++) {
    if (out[i] !== pad) return null
  }
  return out.subarray(0, out.length - pad)
}

/* ---------- encodings ---------- */

const textBytes = (s) => {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff
  return out
}

const KEY = textBytes(KEY_TEXT)
const IV = textBytes(IV_TEXT)

/** Strict UTF-8 decode, or null if the bytes aren't UTF-8 at all. */
function utf8(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

/** Base64 text -> bytes, or null if it isn't base64 of whole 16-byte blocks. */
function fromBase64(text) {
  // One AES block is 24 base64 chars; anything shorter can't be a frame of ours.
  if (text.length < 24 || text.length % 4 !== 0 || !BASE64.test(text)) return null
  let binary
  try {
    binary = atob(text)
  } catch {
    return null
  }
  return binary.length % BLOCK === 0 ? textBytes(binary) : null
}

/* ---------- the one thing the socket calls ---------- */

/**
 * A frame as it came off the wire -> the text to hand the app.
 *
 * Encrypted (base64 AES-256-CBC under the shared key) -> the plaintext.
 * Anything else -> itself, unchanged.
 */
export function decryptMessage(data) {
  // Binary frames: the ciphertext raw, with no base64 around it.
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    const bytes = asBytes(data)
    const plain = aesCbcDecrypt(bytes, KEY, IV)
    return (plain && utf8(plain)) ?? utf8(bytes) ?? ''
  }

  const text = String(data)
  const bytes = fromBase64(text.trim())
  if (!bytes) return text
  const plain = aesCbcDecrypt(bytes, KEY, IV)
  if (!plain) return text
  return utf8(plain) ?? text
}

/* ---------- the same key, over an image ---------- */

function asBytes(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
}

/** PNG's 8-byte signature. */
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Is this a PNG? The only oracle an image response gives us. */
export function looksLikePng(bytes) {
  if (!bytes || bytes.length < PNG_MAGIC.length) return false
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (bytes[i] !== PNG_MAGIC[i]) return false
  }
  return true
}

/**
 * `GET /image/{tableIndex}` as it came off the wire -> the PNG bytes.
 *
 * The host wraps the screenshot with the same key it wraps the socket frames
 * with, and — like the frames — says nothing about whether it did. The sniffing
 * is the same idea as `decryptMessage`'s, with a better oracle: a frame can only
 * be checked for "does this decode as text", but an image either starts with
 * PNG's signature or it does not.
 *
 * Three shapes, tried in the order they cost:
 *
 *   1. a plain PNG — a host with no hashSecret configured;
 *   2. raw AES-256-CBC ciphertext;
 *   3. that ciphertext base64'd, which is what the socket does.
 *
 * Anything else comes back untouched rather than being dropped. The bytes are
 * still the evidence we went to fetch, and the API records that they were not a
 * PNG — a decrypt that missed is worth seeing, not worth losing.
 */
export function decryptImage(data) {
  const bytes = asBytes(data)
  if (looksLikePng(bytes)) return bytes

  const raw = aesCbcDecrypt(bytes, KEY, IV)
  if (looksLikePng(raw)) return raw

  // Base64 is ASCII, so a strict UTF-8 pass over a body that is actually binary
  // fails fast rather than building a megabyte-long string for nothing.
  const text = utf8(bytes)
  const decoded = text ? fromBase64(text.trim()) : null
  const unwrapped = decoded && aesCbcDecrypt(decoded, KEY, IV)
  if (looksLikePng(unwrapped)) return unwrapped

  return bytes
}
