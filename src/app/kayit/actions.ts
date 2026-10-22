"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq, or, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { hashPassword, passwordProblem } from "@/lib/password";
import { createSession } from "@/lib/session";
import { currentTemplates, textHash } from "@/lib/contracts";
import { vknValid } from "@/lib/exchange/parse";
import { notify } from "@/lib/notify";

export type RegState = { ok: false; message: string; field?: string; values?: Record<string, string> } | null;
const KINDS = { AGENT: "Acente", OWNER: "Armatör / gemi sahibi", OPERATOR_MANAGER: "Gemi işletmecisi", SHIPYARD: "Tersane", CHARTERER: "Kiracı" } as const;

/** Müşteri firma kaydı: cari (doğrulama bekler) + yetkili kullanıcı + KVKK ve isteğe bağlı sözleşme onayları — tek işlemde */
export async function register(_: RegState, f: FormData): Promise<RegState> {
  const v = Object.fromEntries([...f.entries()].filter(([k, x]) => typeof x === "string" && !k.startsWith("$") && !/password/.test(k))) as Record<string, string>;
  const g = (k: string) => String(f.get(k) ?? "").trim();
  const bad = (message: string, field?: string): RegState => ({ ok: false, message, field, values: v });
  const legalName = g("legalName"), taxNumber = g("taxNumber").replace(/\s/g, ""), username = g("username").toLocaleLowerCase("tr"), email = g("email").toLocaleLowerCase("tr");
  if (legalName.length < 3) return bad("Firma unvanı gerekli", "legalName");
  if (!/^\d{10}$/.test(taxNumber)) return bad("Vergi numarası 10 haneli olmalı (şahıs firmaları için yetkili ile iletişime geçin)", "taxNumber");
  if (!vknValid(taxNumber)) return bad("Vergi numarası doğrulanamadı — denetim hanesi tutmuyor", "taxNumber");
  if (!g("taxOffice")) return bad("Vergi dairesi gerekli", "taxOffice");
  if (!g("address")) return bad("Fatura adresi gerekli", "address");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad("Geçerli bir e-posta girin", "email");
  if (g("name").length < 3) return bad("Yetkili ad soyad gerekli", "name");
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) return bad("Kullanıcı adı 3–32 karakter: küçük harf, rakam, nokta, tire", "username");
  const pw = String(f.get("password") ?? ""), pw2 = String(f.get("password2") ?? "");
  const pp = passwordProblem(pw); if (pp) return bad(pp, "password");
  if (pw !== pw2) return bad("Şifreler aynı değil", "password2");
  if (f.get("kvkk") !== "on") return bad("KVKK aydınlatma metnini okuduğunuzu onaylayın", "kvkk");
  const [dupParty] = await db.select({ id: s.parties.id }).from(s.parties).where(eq(s.parties.taxNumber, taxNumber));
  if (dupParty) return bad("Bu vergi numarasıyla kayıtlı bir firma var. Firmanıza yeni kullanıcı eklenmesi için Yalova Pilotaj ile iletişime geçin.", "taxNumber");
  const [dupUser] = await db.select({ id: s.users.id }).from(s.users).where(or(eq(s.users.username, username), sql`lower(${s.users.email}) = ${email}`));
  if (dupUser) return bad("Bu kullanıcı adı veya e-posta kullanımda", "username");
  const kind = (g("kind") in KINDS ? g("kind") : "AGENT") as keyof typeof KINDS;
  const tpls = await currentTemplates();
  const accept = ["KVKK_AYDINLATMA", ...(f.get("acceptContracts") === "on" ? ["HIZMET_SOZLESMESI", "ODEME_TAAHHUDU"] : [])];
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null, ua = h.get("user-agent")?.slice(0, 200) ?? null;
  const userId = await db.transaction(async (tx) => {
    const [p] = await tx.insert(s.parties).values({ kind: "COMPANY", legalName, taxNumber, taxOffice: g("taxOffice"), address: g("address"), city: g("city") || null, country: (g("country") || "TR").toUpperCase().slice(0, 2), phone: g("phone") || null, email, registrationStatus: "PENDING_REVIEW" }).returning();
    await tx.insert(s.partyRoles).values([{ partyId: p.id, role: kind }, { partyId: p.id, role: "BILLING_PARTY" }]);
    const [u] = await tx.insert(s.users).values({ username, email, name: g("name"), title: g("title") || null, phone: g("phone") || null, roles: ["CUSTOMER", "BILLING_PARTY"], partyId: p.id, partyAdmin: true, passwordHash: hashPassword(pw) }).returning();
    for (const t of tpls.filter((t) => accept.includes(t.code))) await tx.insert(s.contractAcceptances).values({ templateId: t.id, partyId: p.id, userId: u.id, signerName: u.name, signerTitle: u.title, textHash: textHash(t.body), method: "CLICKWRAP", ip, userAgent: ua });
    await tx.insert(s.auditLog).values({ entity: "auth", entityId: u.id, action: "REGISTER", after: { party: legalName, taxNumber, accepted: accept }, actorId: username });
    return u.id;
  });
  await createSession(userId);
  await notify({ roles: ["SYSTEM_ADMIN", "ACCOUNTING"] }, { kind: "REGISTRATION", link: "/yonetim", title: `Yeni müşteri kaydı: ${legalName}`, body: `Vergi no ${taxNumber} · ${g("taxOffice")} · yetkili ${g("name")} (${email}). Cari doğrulaması bekliyor.` });
  redirect("/portal?hosgeldin=1");
}
