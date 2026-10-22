import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

/**
 * Sürümlü nesne depolama adaptörü. Geliştirmede yerel disk; üretimde S3 uyumlu sağlayıcıya geçilecek.
 * Kural: var olan anahtar asla üzerine yazılmaz (orijinal korunur).
 */
export interface StoredObject { key: string; size: number; sha256: string }
export interface ObjectStorage {
  put(key: string, data: Uint8Array): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
}

const ROOT = path.resolve(process.env.STORAGE_DIR ?? "./storage");

function safe(key: string) {
  const p = path.resolve(ROOT, key);
  if (!p.startsWith(ROOT + path.sep)) throw new Error("Geçersiz depolama anahtarı");
  return p;
}

export const storage: ObjectStorage = {
  async put(key, data) {
    const p = safe(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, data, { flag: "wx" }); // varsa hata: üzerine yazma yok
    return { key, size: data.byteLength, sha256: createHash("sha256").update(data).digest("hex") };
  },
  async get(key) { return fs.readFile(safe(key)); },
};
