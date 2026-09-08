/**
 * dist/ -> one encrypted file the app serves itself from.
 *
 *     node macos/pack/packassets.mjs dist build/app.zsp <key-hex>
 *
 * The web UI inside the macOS app is not served over HTTP by anything. There is
 * no local server on a port, so there is no port for another process, another
 * browser or the network to ask; the web view resolves `zigsolver://app/...`
 * through a scheme handler that reads out of the blob this writes
 * (macos/app/Sources/AssetPack.swift). What is left to protect is the copy ON
 * DISK inside the bundle, and that is what the encryption is for: Resources
 * holds one opaque file rather than a directory anyone can open, copy out and
 * run as a web app somewhere else.
 *
 * Be clear about how far that goes. The key is generated per build and compiled
 * into the binary, so it ships with the lock it opens: this raises the cost of
 * lifting the UI from "drag the folder" to "read the Mach-O", and it is not a
 * secret kept from someone holding the app. Nothing here is load-bearing for
 * the API — that is the token in api/auth.py, which is minted per launch and
 * never written down.
 *
 * Layout, all little-endian:
 *
 *     magic       8   "ZSPACK1\0"
 *     nonce      12   AES-256-GCM
 *     tag        16
 *     ciphertext  …   the plaintext below
 *
 *     plaintext:  u32 headerLen | headerJSON | blob
 *     headerJSON: { "files": { "<path>": { "o": offset, "n": length,
 *                                          "t": "<content-type>" } } }
 *
 * One AEAD over the whole thing rather than per-file: the index is as worth
 * protecting as the files, and a single tag means a truncated or edited pack
 * fails to open at all instead of opening with one file quietly swapped.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const MAGIC = Buffer.from('ZSPACK1\0', 'ascii')

/** Extension -> Content-Type. The web view believes this and nothing else. */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
}

function walk(root, prefix = '') {
  const out = []
  for (const entry of fs.readdirSync(path.join(root, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...walk(root, rel))
    // Symlinks are not followed: a bundle resource that points outside itself
    // is the one thing this file exists to make impossible.
    else if (entry.isFile()) out.push(rel)
  }
  return out
}

function main(argv) {
  const [dist, outPath, keyHex] = argv
  if (!dist || !outPath || !keyHex) {
    console.error('usage: packassets.mjs <dist-dir> <out.zsp> <key-hex-64>')
    process.exit(2)
  }
  const key = Buffer.from(keyHex.trim(), 'hex')
  if (key.length !== 32) {
    console.error(`packassets: the key must be 32 bytes as 64 hex characters (got ${key.length})`)
    process.exit(2)
  }
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    console.error(`packassets: ${dist} has no index.html — run \`npm run build\` first`)
    process.exit(2)
  }

  const files = walk(dist).sort()
  const index = {}
  const parts = []
  let offset = 0
  for (const rel of files) {
    const bytes = fs.readFileSync(path.join(dist, rel))
    index[rel] = {
      o: offset,
      n: bytes.length,
      t: TYPES[path.extname(rel).toLowerCase()] || 'application/octet-stream',
    }
    parts.push(bytes)
    offset += bytes.length
  }

  const header = Buffer.from(JSON.stringify({ files: index }), 'utf8')
  const headerLen = Buffer.alloc(4)
  headerLen.writeUInt32LE(header.length, 0)
  const plain = Buffer.concat([headerLen, header, ...parts])

  const nonce = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce)
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, Buffer.concat([MAGIC, nonce, tag, ciphertext]))

  const kb = (n) => `${(n / 1024).toFixed(1)} KB`
  console.log(`packassets: ${files.length} files, ${kb(offset)} of content -> ` +
              `${outPath} (${kb(fs.statSync(outPath).size)})`)
}

main(process.argv.slice(2))
