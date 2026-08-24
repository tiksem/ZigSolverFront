/**
 * The bare minimum of RFC 6455 needed to talk to a browser: the handshake and
 * unfragmented text frames. Kept by hand so this directory has no dependencies.
 */

import crypto from 'node:crypto'

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

const accept = (key) =>
  crypto
    .createHash('sha1')
    .update(key + GUID)
    .digest('base64')

export function frame(text) {
  const payload = Buffer.from(text, 'utf8')
  const len = payload.length
  let header
  if (len < 126) {
    header = Buffer.from([0x81, len])
  } else if (len < 65536) {
    header = Buffer.alloc(4)
    header[0] = 0x81
    header[1] = 126
    header.writeUInt16BE(len, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = 0x81
    header[1] = 127
    header.writeBigUInt64BE(BigInt(len), 2)
  }
  return Buffer.concat([header, payload])
}

/** Pull complete frames out of a client buffer; `null` marks a close frame. */
export function readFrames(buf) {
  const out = []
  let off = 0
  while (buf.length - off >= 2) {
    const opcode = buf[off] & 0x0f
    const masked = (buf[off + 1] & 0x80) !== 0
    let len = buf[off + 1] & 0x7f
    let pos = off + 2
    if (len === 126) {
      if (buf.length < pos + 2) break
      len = buf.readUInt16BE(pos)
      pos += 2
    } else if (len === 127) {
      if (buf.length < pos + 8) break
      len = Number(buf.readBigUInt64BE(pos))
      pos += 8
    }
    const maskKey = masked ? buf.subarray(pos, pos + 4) : null
    if (masked) pos += 4
    if (buf.length < pos + len) break
    const payload = Buffer.from(buf.subarray(pos, pos + len))
    if (maskKey) for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i % 4]
    if (opcode === 0x1) out.push(payload.toString('utf8'))
    if (opcode === 0x8) out.push(null)
    off = pos + len
  }
  return { messages: out, rest: buf.subarray(off) }
}

/**
 * What a host with `--encrypt` puts on the wire: AES-256-CBC under the shared
 * key, base64'd — the Kotlin side's `AES/CBC/PKCS5PADDING` with a fixed IV.
 * The app sniffs each frame rather than being told, so this is here to prove
 * the sniffing works against real ciphertext.
 */
const HASH_SECRET = 'u3sZ7Kp1mQ8vT4xN6cR2aW9jF5yH0bLd'
const HASH_IV = 'G7mQ2vX9pL4sK8dN'

function cipher() {
  return crypto.createCipheriv('aes-256-cbc', Buffer.from(HASH_SECRET), Buffer.from(HASH_IV))
}

function seal(text) {
  const c = cipher()
  return Buffer.concat([c.update(text, 'utf8'), c.final()]).toString('base64')
}

/**
 * The same wrapper over bytes, for `GET /image/{tableIndex}`.
 *
 * Base64, like the socket, because that is the shape the app was written
 * against — though `decryptImage` accepts raw ciphertext too, since a host
 * answering with an image body has no reason to text-encode it.
 */
export function sealBytes(buf) {
  const c = cipher()
  return Buffer.from(
    Buffer.concat([c.update(buf), c.final()]).toString('base64'),
    'ascii',
  )
}

/**
 * Complete the upgrade and wire the callbacks up. Returns `send(text)`, which
 * is a no-op once the socket is gone.
 */
export function serveSocket(req, socket, { onMessage, onClose, encrypt = false }) {
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept(req.headers['sec-websocket-key'])}\r\n\r\n`,
  )
  socket.setNoDelay(true)

  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    onClose?.()
  }

  let buf = Buffer.alloc(0)
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk])
    const { messages, rest } = readFrames(buf)
    buf = rest
    for (const m of messages) {
      if (m === null) {
        close()
        return socket.end()
      }
      onMessage?.(m)
    }
  })
  socket.on('close', close)
  socket.on('error', close)

  return (text) => {
    if (closed || !socket.writable) return
    socket.write(frame(encrypt ? seal(text) : text))
  }
}
