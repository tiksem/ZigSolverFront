/**
 * The app icon: the web app's favicon, drawn at icon resolutions.
 *
 *     node macos/pack/makeicon.mjs build/AppIcon.iconset
 *
 * Writes the ten PNGs an `.iconset` needs; buildinstaller.sh runs `iconutil`
 * over the directory to make the `.icns`.
 *
 * It is the same picture as `public/favicon.svg` — the felt gradient, the hair
 * line inside the edge, the blocked Z — and the geometry below is that file's
 * path data transcribed into the same 32-unit space it is authored in. Not
 * rasterized FROM the SVG, because nothing on a stock Mac renders SVG from a
 * script; transcribed, so the two are read side by side when either changes.
 *
 * "Better quality" is the whole point of doing it this way. A 32x32 favicon
 * blown up to 1024 is a blurry favicon. Every size here is rendered at its own
 * resolution from the shapes, with 4x4 supersampling, so the 16px one is
 * genuinely drawn at 16px and the 1024 one has real edges.
 *
 * PNG here is RGBA — colour type 6 — because the corners must be transparent;
 * fakebot/png.js next door writes RGB and is the other half of this idea.
 */

import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'

/* ---------- PNG ---------- */

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

function chunk(type, data) {
  const head = Buffer.alloc(4)
  head.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([head, body, crc])
}

function encodeRGBA(width, height, px) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type 6: truecolour with alpha
  const stride = width * 4
  const raw = Buffer.alloc(height * (stride + 1))
  for (let row = 0; row < height; row++) {
    raw[row * (stride + 1)] = 0 // filter: none
    px.copy(raw, row * (stride + 1) + 1, row * stride, (row + 1) * stride)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ---------- the favicon, in its own 32-unit space ---------- */

// public/favicon.svg, element by element.
//
//   <rect x="1"   y="1"   width="30" height="30" rx="7.5" fill="url(#felt)"/>
//   <rect x="1.5" y="1.5" width="29" height="29" rx="7"
//         fill="none" stroke="#fff" stroke-opacity="0.18"/>
//   <path d="M9 8.2h14v4.3l-7.6 7h7.6v4.3H9v-4.3l7.6-7H9z" fill="#fff"/>
const VIEW = 32
const PLATE = { x: 1, y: 1, w: 30, h: 30, r: 7.5 }
// The hairline is a stroke of width 1 centred on that second rect, which is the
// band between rect(1,1,30,30,r7.5) and rect(2,2,28,28,r6.5).
const HAIR_OUT = { x: 1, y: 1, w: 30, h: 30, r: 7.5 }
const HAIR_IN = { x: 2, y: 2, w: 28, h: 28, r: 6.5 }
const HAIR_ALPHA = 0.18

// The Z, as the closed polygon its path data describes.
const ZED = [
  [9, 8.2], [23, 8.2], [23, 12.5], [15.4, 19.5],
  [23, 19.5], [23, 23.8], [9, 23.8], [9, 19.5],
  [16.6, 12.5], [9, 12.5],
]

const FELT_TOP = [0x26, 0x93, 0x62]      // #269362
const FELT_BOTTOM = [0x0f, 0x4f, 0x36]   // #0f4f36
const CHALK = [0xff, 0xff, 0xff]

/**
 * The transparent margin around the artwork. macOS draws app icons inside a
 * grid rather than edge to edge, and one that fills its canvas stands a head
 * taller than everything beside it in the Dock. The favicon has no such
 * problem — a browser tab is a lone 16px box — so this is the one thing here
 * that is not in the SVG.
 */
const MARGIN = 0.0975

/** Inside a rounded rectangle: clamp to the corner-centre box, then measure. */
function inRoundRect(x, y, rect) {
  const { x: x0, y: y0, w, h, r } = rect
  const x1 = x0 + w
  const y1 = y0 + h
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  const cx = Math.min(Math.max(x, x0 + r), x1 - r)
  const cy = Math.min(Math.max(y, y0 + r), y1 - r)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= r * r
}

/** Ray casting, which is all a ten-vertex polygon needs. */
function inPolygon(x, y, points) {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** The colour and coverage at one point in SVG space, or null for nothing. */
function sample(x, y) {
  if (!inRoundRect(x, y, PLATE)) return null
  // The gradient is objectBoundingBox on the plate: top edge to bottom edge.
  let colour = lerp(FELT_TOP, FELT_BOTTOM, (y - PLATE.y) / PLATE.h)
  if (inRoundRect(x, y, HAIR_OUT) && !inRoundRect(x, y, HAIR_IN)) {
    colour = lerp(colour, CHALK, HAIR_ALPHA)
  }
  if (inPolygon(x, y, ZED)) colour = CHALK
  return colour
}

/** One icon at `size` px, 4x4 supersampled, drawn — never resampled. */
function render(size) {
  const SS = 4
  const px = Buffer.alloc(size * size * 4)
  const inset = size * MARGIN
  const scale = VIEW / (size - 2 * inset)   // pixels -> SVG units

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      let r = 0, g = 0, b = 0, hits = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const colour = sample((col + (sx + 0.5) / SS - inset) * scale,
                                (row + (sy + 0.5) / SS - inset) * scale)
          if (!colour) continue
          r += colour[0]; g += colour[1]; b += colour[2]; hits++
        }
      }
      const o = (row * size + col) * 4
      // Straight (unpremultiplied) alpha: the colour is the average of the
      // samples that HIT, and the alpha is how many did. Dividing colour by the
      // sample count instead would darken every edge towards black.
      px[o] = hits ? Math.round(r / hits) : 0
      px[o + 1] = hits ? Math.round(g / hits) : 0
      px[o + 2] = hits ? Math.round(b / hits) : 0
      px[o + 3] = Math.round((hits / (SS * SS)) * 255)
    }
  }
  return encodeRGBA(size, size, px)
}

/* ---------- the iconset ---------- */

// The names `iconutil` insists on. 16 through 512, each at 1x and 2x.
const SIZES = [
  [16, 'icon_16x16.png'], [32, 'icon_16x16@2x.png'],
  [32, 'icon_32x32.png'], [64, 'icon_32x32@2x.png'],
  [128, 'icon_128x128.png'], [256, 'icon_128x128@2x.png'],
  [256, 'icon_256x256.png'], [512, 'icon_256x256@2x.png'],
  [512, 'icon_512x512.png'], [1024, 'icon_512x512@2x.png'],
]

const out = process.argv[2]
if (!out) {
  console.error('usage: makeicon.mjs <out.iconset>')
  process.exit(2)
}
fs.mkdirSync(out, { recursive: true })
// Rendered once per distinct size; the duplicates (32, 256, 512) are the same
// picture under two names.
const cache = new Map()
for (const [size, name] of SIZES) {
  if (!cache.has(size)) cache.set(size, render(size))
  fs.writeFileSync(path.join(out, name), cache.get(size))
}
console.log(`makeicon: ${SIZES.length} PNGs -> ${out}`)
