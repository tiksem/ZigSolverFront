import CryptoKit
import Foundation

/// The web UI, as one encrypted file read into memory once.
///
/// Written by macos/pack/packassets.mjs at build time — see that file for the
/// layout and for an honest account of what the encryption is and is not worth.
/// The short version: the UI is never served over HTTP by anything, so there is
/// no port to ask for it; this is about the copy sitting inside the bundle,
/// which is one opaque file instead of a directory that can be dragged out and
/// opened somewhere else.
///
/// Loaded whole because it is a few hundred kilobytes and the alternative — a
/// file handle and a seek per request — buys nothing at that size and makes the
/// scheme handler's threading its own problem.
struct AssetPack {

    struct Entry {
        let offset: Int
        let length: Int
        let contentType: String
    }

    enum Failure: LocalizedError {
        case unreadable(String)
        case notAPack
        case truncated
        case wrongKey
        case badIndex

        var errorDescription: String? {
            switch self {
            case .unreadable(let why): return "The interface bundle could not be read (\(why))."
            case .notAPack:            return "The interface bundle is not a ZigSolver pack."
            case .truncated:           return "The interface bundle is truncated."
            case .wrongKey:            return "The interface bundle does not open with this build's key — the app is damaged or was assembled from mismatched parts."
            case .badIndex:            return "The interface bundle's index is unreadable."
            }
        }
    }

    private static let magic = Array("ZSPACK1\0".utf8)
    private static let nonceLength = 12
    private static let tagLength = 16

    private let blob: Data
    private let entries: [String: Entry]

    /// Every path in the pack, for diagnostics.
    var paths: [String] { Array(entries.keys) }

    init(url: URL, key: [UInt8]) throws {
        guard let raw = try? Data(contentsOf: url, options: .mappedIfSafe) else {
            throw Failure.unreadable(url.lastPathComponent)
        }
        let head = Self.magic.count + Self.nonceLength + Self.tagLength
        guard raw.count > head else { throw Failure.truncated }
        guard Array(raw.prefix(Self.magic.count)) == Self.magic else { throw Failure.notAPack }

        var cursor = Self.magic.count
        let nonceData = raw.subdata(in: cursor ..< cursor + Self.nonceLength)
        cursor += Self.nonceLength
        let tagData = raw.subdata(in: cursor ..< cursor + Self.tagLength)
        cursor += Self.tagLength
        let ciphertext = raw.subdata(in: cursor ..< raw.count)

        let plain: Data
        do {
            let box = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: nonceData),
                                            ciphertext: ciphertext,
                                            tag: tagData)
            plain = try AES.GCM.open(box, using: SymmetricKey(data: key))
        } catch {
            // One tag over the whole pack: a wrong key and a tampered byte are
            // the same failure, and both mean "do not run this".
            throw Failure.wrongKey
        }

        guard plain.count > 4 else { throw Failure.badIndex }
        let headerLength = Int(plain.withUnsafeBytes { $0.loadUnaligned(as: UInt32.self).littleEndian })
        guard headerLength > 0, 4 + headerLength <= plain.count else { throw Failure.badIndex }

        let headerData = plain.subdata(in: 4 ..< 4 + headerLength)
        guard
            let json = try? JSONSerialization.jsonObject(with: headerData) as? [String: Any],
            let files = json["files"] as? [String: [String: Any]]
        else { throw Failure.badIndex }

        let body = plain.subdata(in: 4 + headerLength ..< plain.count)
        var table: [String: Entry] = [:]
        table.reserveCapacity(files.count)
        for (path, spec) in files {
            guard
                let offset = spec["o"] as? Int,
                let length = spec["n"] as? Int,
                let type = spec["t"] as? String,
                offset >= 0, length >= 0, offset + length <= body.count
            else { throw Failure.badIndex }
            table[path] = Entry(offset: offset, length: length, contentType: type)
        }
        guard table["index.html"] != nil else { throw Failure.badIndex }

        blob = body
        entries = table
    }

    /// The bytes and content type for a pack path, or nil if there is no such
    /// file. `path` is already normalized by the scheme handler.
    func file(at path: String) -> (data: Data, contentType: String)? {
        guard let entry = entries[path] else { return nil }
        let start = blob.startIndex + entry.offset
        return (blob.subdata(in: start ..< start + entry.length), entry.contentType)
    }
}
