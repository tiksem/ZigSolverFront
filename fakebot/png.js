/**
 * A PNG encoder, in the smallest form that produces a real one.
 *
 * `GET /image/{tableIndex}` on the real host is a screenshot of the poker
 * client. There is no poker client here, so this draws a stand-in: a felt with
 * the table index on it, big enough to read at a glance. What it is FOR is the
 * pipe, not the picture — a failed solve should end with a PNG in the API's
 * `screenerrors/`, and that only proves anything if the bytes are a PNG that
 * opens and shows which table it came from.
 *
 * Signature, IHDR, one IDAT, IEND: zlib is node's, and CRC-32 is the only thing
 * the format needs that node does not already have. Like everything else in
 * this directory it takes no dependency.
 */

import zlib from 'node:zlib'

/* ---------- CRC-32, the one piece PNG needs and node has not got ---------- */

const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c >>> 0
}

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** length · type · data · CRC(type+data) — every chunk in the file. */
function chunk(type, data) {
  const head = Buffer.alloc(4)
  head.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([head, body, crc])
}

/* ---------- a 3x5 bitmap font, digits only ---------- */

const GLYPHS = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '001', '001', '001'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
  '-': ['000', '000', '111', '000', '000'],
  ':': ['000', '010', '000', '010', '000'],
}

/* ---------- a canvas, just wide enough for what this draws ---------- */

function canvas(width, height, rgb) {
  const px = Buffer.alloc(width * height * 3)
  for (let i = 0; i < px.length; i += 3) {
    px[i] = rgb[0]
    px[i + 1] = rgb[1]
    px[i + 2] = rgb[2]
  }
  return { width, height, px }
}

function rect(c, x, y, w, h, rgb) {
  for (let row = Math.max(0, y); row < Math.min(c.height, y + h); row++) {
    for (let col = Math.max(0, x); col < Math.min(c.width, x + w); col++) {
      const o = (row * c.width + col) * 3
      c.px[o] = rgb[0]
      c.px[o + 1] = rgb[1]
      c.px[o + 2] = rgb[2]
    }
  }
}

/** `text` at (x, y), each font pixel a `scale`-square block. */
function write(c, text, x, y, scale, rgb) {
  let cursor = x
  for (const ch of String(text)) {
    const glyph = GLYPHS[ch]
    if (!glyph) {
      cursor += 4 * scale
      continue
    }
    glyph.forEach((row, ry) => {
      ;[...row].forEach((bit, rx) => {
        if (bit === '1') rect(c, cursor + rx * scale, y + ry * scale, scale, scale, rgb)
      })
    })
    cursor += 4 * scale
  }
  return cursor - x
}

function encode(c) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(c.width, 0)
  ihdr.writeUInt32BE(c.height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type 2: truecolour RGB
  // 10/11/12: deflate, the only filter method, no interlace — all zero already.

  // Every scanline carries its filter byte; 0 is "none", which costs a byte a
  // row and saves implementing the other four.
  const stride = c.width * 3
  const raw = Buffer.alloc(c.height * (stride + 1))
  for (let row = 0; row < c.height; row++) {
    raw[row * (stride + 1)] = 0
    c.px.copy(raw, row * (stride + 1) + 1, row * stride, (row + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const FELT = [22, 82, 58]
const RAIL = [58, 42, 32]
const CHALK = [232, 238, 232]
const DIM = [120, 160, 132]

/**
 * The stand-in screenshot for one table: a felt, the table index in large
 * digits, and the wall clock underneath so two captures of the same table are
 * visibly different files rather than a picture you have to take on trust.
 */
export function tableImage(tableIndex, { width = 1920, height = 1080 } = {}) {
  const c = canvas(width, height, RAIL)
  const inset = Math.round(width / 26)
  rect(c, inset, inset, width - 2 * inset, height - 2 * inset, FELT)

  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const clock = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

  // Digits only, with no `#` in front: at 3x5 a hash reads as an A, and "A7" on
  // a felt is a hand, not a table number.
  const unit = Math.max(1, Math.round(height / 96))
  write(c, String(tableIndex), inset * 2, Math.round(height * 0.18), unit * 8, CHALK)
  write(c, clock, inset * 2, Math.round(height * 0.72), unit * 3, DIM)
  return encode(c)
}
