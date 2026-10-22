/** Şifre özeti — scrypt (Node yerleşik), sabit zamanlı karşılaştırma. Düz şifre hiçbir yerde saklanmaz veya kaydedilmez. */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
const N = 16384, KEYLEN = 64;
export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("base64url");
  return `scrypt$${N}$${salt}$${scryptSync(pw, salt, KEYLEN, { N }).toString("base64url")}`;
}
export function verifyPassword(pw: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [alg, n, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const want = Buffer.from(hash, "base64url");
  const got = scryptSync(pw, salt, want.length, { N: Number(n) });
  return got.length === want.length && timingSafeEqual(got, want);
}
/** Canlı ortam için asgari şifre politikası (sunum hesapları bu kuralın dışındadır ve canlıda kapatılır) */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Şifre en az 8 karakter olmalı";
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(pw) || !/\d/.test(pw)) return "Şifre harf ve rakam içermeli";
  return null;
}
