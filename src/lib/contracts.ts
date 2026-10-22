import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { REQUIRED_FOR_REQUESTS, type ContractCode } from "@/data/contracts";
import { textHash } from "./contracts-hash";
export { textHash };

/** Her metnin yürürlükteki (yayınlanmış en yüksek) sürümü */
export async function currentTemplates(codes?: ContractCode[]) {
  const rows = await db.select().from(s.contractTemplates).where(and(eq(s.contractTemplates.status, "PUBLISHED"), codes ? inArray(s.contractTemplates.code, codes) : undefined)).orderBy(desc(s.contractTemplates.version));
  const m = new Map<string, typeof rows[number]>();
  for (const r of rows) if (!m.has(r.code)) m.set(r.code, r);
  return [...m.values()];
}
/** Firmanın kabul durumu — yeni sürüm yayınlanınca eski kabul geçerliliğini yitirir */
export async function contractStatus(partyId: string, codes: ContractCode[] = Object.keys({ HIZMET_SOZLESMESI: 1, ODEME_TAAHHUDU: 1, BEYAN_TAAHHUDU: 1, KVKK_AYDINLATMA: 1 }) as ContractCode[]) {
  const tpls = await currentTemplates(codes);
  const acc = tpls.length ? await db.select().from(s.contractAcceptances).where(and(eq(s.contractAcceptances.partyId, partyId), inArray(s.contractAcceptances.templateId, tpls.map((t) => t.id)), isNull(s.contractAcceptances.revokedAt))).orderBy(desc(s.contractAcceptances.acceptedAt)) : [];
  return tpls.map((t) => ({ template: t, acceptance: acc.find((a) => a.templateId === t.id && a.textHash === textHash(t.body)) ?? null }));
}
/** Talep göndermek için eksik kabuller */
export async function missingForRequests(partyId: string) {
  return (await contractStatus(partyId, REQUIRED_FOR_REQUESTS)).filter((x) => !x.acceptance).map((x) => x.template);
}
