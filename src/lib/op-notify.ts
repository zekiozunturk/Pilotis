import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { OPERATION_TYPES } from "@/data/catalog";
import { notify } from "./notify";
import type { Role } from "./workflow";

const OPS_STAFF: Role[] = ["OPERATIONS_MANAGER", "BUSINESS_MANAGER", "SHORE_OPS", "PLANNER"];
async function info(opId: string) {
  const [r] = await db.select({ op: s.operations, vessel: s.vessels.name }).from(s.operations).innerJoin(s.portCalls, eq(s.portCalls.id, s.operations.portCallId)).innerJoin(s.vessels, eq(s.vessels.id, s.portCalls.vesselId)).where(eq(s.operations.id, opId));
  if (!r) return null;
  const name = async (id: string | null) => (id ? (await db.select({ n: s.parties.legalName }).from(s.parties).where(eq(s.parties.id, id)))[0]?.n ?? "—" : "—");
  const when = r.op.plannedStart?.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" }) ?? "—";
  return { ...r, type: OPERATION_TYPES.find((t) => t.code === r.op.typeCode)?.nameTr ?? r.op.typeCode, when, requester: await name(r.op.requesterPartyId), billing: await name(r.op.billingPartyId) };
}

export async function notifyNewRequest(opId: string, actorUserId?: string | null) {
  const i = await info(opId); if (!i) return;
  await notify({ roles: OPS_STAFF, exceptUserId: actorUserId }, { kind: "REQUEST_NEW", ref: i.op.ref, link: `/operasyonlar/${i.op.ref}`, title: `Yeni talep ${i.op.ref} — ${i.vessel}`, body: `${i.requester} · ${i.type} · istenen zaman ${i.when}. Talebi inceleyip kabul edin, eksik bilgi isteyin veya reddedin.` });
  if (i.op.billingPartyId) await notifyBillingPending(opId, actorUserId);
}
export async function notifyBillingPending(opId: string, _actorUserId?: string | null, why?: string) {
  const i = await info(opId); if (!i?.op.billingPartyId) return;
  await notify({ partyIds: [i.op.billingPartyId] }, { kind: "BILLING_PENDING", ref: i.op.ref, link: "/portal/belgeler#isler", title: `Onayınız bekleniyor: ${i.op.ref} — ${i.vessel}`, body: `${i.type} (${i.when}) için firmanız fatura muhatabı olarak seçildi${why ? ` — ${why}` : ""}. Talepnameyi görüntüleyip onaylayın veya reddedin.` });
}
export async function notifyBillingDecided(opId: string, decision: string, person: string, actorUserId?: string | null) {
  const i = await info(opId); if (!i) return;
  const ok = decision === "APPROVED";
  const m = { kind: "BILLING_DECIDED" as const, ref: i.op.ref, link: `/operasyonlar/${i.op.ref}`, title: `${i.op.ref}: fatura muhatabı ${ok ? "onayladı" : "reddetti"}`, body: `${i.billing} adına ${person || "yetkili"} ${ok ? "talepnameyi onayladı" : "talebi reddetti"}. ${i.vessel} · ${i.type} · ${i.when}` };
  await notify({ roles: OPS_STAFF, exceptUserId: actorUserId }, m);
  if (i.op.requesterPartyId && i.op.requesterPartyId !== i.op.billingPartyId) await notify({ partyIds: [i.op.requesterPartyId] }, { ...m, link: `/operasyonlar/${i.op.ref}` });
}
export async function notifyRequestDecided(opId: string, decision: "ACCEPTED" | "REJECTED" | "INFO_MISSING", note: string | null) {
  const i = await info(opId); if (!i) return;
  const t = { ACCEPTED: "kabul edildi", REJECTED: "reddedildi", INFO_MISSING: "için eksik bilgi isteniyor" }[decision];
  await notify({ partyIds: [i.op.requesterPartyId, i.op.billingPartyId] }, { kind: "REQUEST_DECIDED", ref: i.op.ref, link: `/operasyonlar/${i.op.ref}`, title: `Talebiniz ${t}: ${i.op.ref} — ${i.vessel}`, body: `${i.type} · ${i.when}${note ? `\nYalova Pilotaj notu: ${note}` : ""}${decision === "ACCEPTED" ? "\nRömorkör sayısı ve kesin saat planlama ile netleşir." : ""}` });
}
export async function notifyOpClosed(opId: string, outcome: string, reason: string | null) {
  const i = await info(opId); if (!i) return;
  const t = { COMPLETED: "tamamlandı", PARTIAL: "kısmen tamamlandı", CANCELLED: "iptal edildi" }[outcome] ?? outcome;
  await notify({ partyIds: [i.op.requesterPartyId, i.op.billingPartyId] }, { kind: "OP_COMPLETED", ref: i.op.ref, link: `/operasyonlar/${i.op.ref}`, title: `${i.vessel} — ${i.type} ${t}`, body: `İş emri ${i.op.ref}${reason ? ` · ${reason}` : ""}. Fatura TL olarak kesilecek; döviz kalemleri iş bitiş günü TCMB döviz satış kuruyla çevrilir.` });
  if (outcome !== "CANCELLED") await notify({ roles: ["ACCOUNTING"] }, { kind: "ACCRUAL_PENDING", ref: i.op.ref, link: `/operasyonlar/${i.op.ref}`, title: `Tahakkuk bekliyor: ${i.op.ref}`, body: `${i.vessel} · ${i.type} ${t}. Fatura muhatabı: ${i.billing}.` }, { email: false });
}

/** Görev başlangıç/bitişi: yöneticiler ve sistem yöneticisi (sağ altta Yunus sesli duyurur) */
const ANNOUNCE: Role[] = ["OPERATIONS_MANAGER", "BUSINESS_MANAGER", "SYSTEM_ADMIN"];
async function opAssets(opId: string) {
  const r = await db.selectDistinct({ name: s.fleetAssets.name, code: s.fleetAssets.code }).from(s.assignments).innerJoin(s.fleetAssets, eq(s.fleetAssets.id, s.assignments.assetId)).where(and(eq(s.assignments.operationId, opId), isNotNull(s.assignments.assetId)));
  return r.map((x) => x.name);
}
const OUT_TXT: Record<string, string> = { COMPLETED: "tamamlandı", PARTIAL: "kısmen tamamlandı", CANCELLED: "iptal edildi" };
export async function notifyOpStarted(opId: string) {
  const i = await info(opId); if (!i) return;
  const assets = await opAssets(opId);
  await notify({ roles: ANNOUNCE }, { kind: "OP_STARTED", ref: i.op.ref, link: `/operasyonlar/${i.op.ref}`, title: `Görev başladı: ${i.vessel} — ${i.type}`, body: `İş emri ${i.op.ref}${assets.length ? ` · ${assets.join(", ")}` : ""} · başlangıç ${new Date().toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" })}` }, { email: false, sms: false });
}
export async function notifyOpEnded(opId: string, outcome: string, reason: string | null) {
  const i = await info(opId); if (!i) return;
  const assets = await opAssets(opId);
  await notify({ roles: ANNOUNCE }, { kind: "OP_ENDED", ref: i.op.ref, link: `/operasyonlar/${i.op.ref}`, title: `Görev ${OUT_TXT[outcome] ?? "bitti"}: ${i.vessel} — ${i.type}`, body: `İş emri ${i.op.ref}${assets.length ? ` · ${assets.join(", ")}` : ""}${reason ? ` · ${reason}` : ""}` }, { email: false, sms: false });
}
/** Sesli duyuru metni */
export async function opSpeech(ref: string, kind: "OP_STARTED" | "OP_ENDED", title: string) {
  const [o] = await db.select({ id: s.operations.id, st: s.operations.opStatus }).from(s.operations).where(eq(s.operations.ref, ref));
  const i = o ? await info(o.id) : null;
  if (!i) return title;
  const all = (await opAssets(i.op.id)).map((n) => n.replace(/-/g, " "));
  const assets = all.length > 4 ? [...all.slice(0, 3), `${all.length - 3} araç daha`] : all;
  const verb = kind === "OP_STARTED" ? "başladı" : (OUT_TXT[String(i.op.opStatus)] ?? "bitti");
  const who = assets.length ? ` ${assets.length > 1 ? assets.slice(0, -1).join(", ") + " ve " + assets.at(-1) : assets[0]} ${kind === "OP_STARTED" ? "görevde" : "görevi tamamladı"}.` : "";
  return `Dikkat. ${i.vessel} gemisinin ${i.type.toLocaleLowerCase("tr")} görevi ${verb}.${who}`;
}
