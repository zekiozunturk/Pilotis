import "server-only";
/**
 * Bildirimler: her olay sistem içi bildirim kutusuna yazılır; kullanıcının tercihine göre e-posta/SMS kuyruğa alınır.
 * E-posta altyapısı (SMTP_*) veya SMS sağlayıcısı (SMS_*) tanımlı değilse kayıt "NO_CONFIG" durumunda bekler;
 * yapılandırma yapılınca yönetim ekranından yeniden gönderilebilir. Gönderim hatası işlemi asla durdurmaz.
 */
import { and, arrayOverlaps, eq, inArray, lt } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { OPERATOR, BRAND } from "@/data/catalog";
import { storage } from "./storage";
import type { Role } from "./workflow";

export type Kind = "REQUEST_NEW" | "BILLING_PENDING" | "BILLING_DECIDED" | "REQUEST_DECIDED" | "OP_COMPLETED" | "ACCRUAL_PENDING" | "TASK_ASSIGNED" | "REGISTRATION" | "USER_INVITED" | "PASSWORD_RESET" | "REPORT" | "TEST";
export const KIND_LABEL: Record<Kind, string> = {
  REQUEST_NEW: "Yeni talep", BILLING_PENDING: "Muhatap onayı bekleniyor", BILLING_DECIDED: "Muhatap kararı", REQUEST_DECIDED: "Talep kararı",
  OP_COMPLETED: "İş tamamlandı", ACCRUAL_PENDING: "Tahakkuk bekliyor", TASK_ASSIGNED: "Yeni görev", REGISTRATION: "Yeni müşteri kaydı",
  USER_INVITED: "Kullanıcı daveti", PASSWORD_RESET: "Şifre sıfırlama", REPORT: "Zamanlanmış rapor", TEST: "Deneme",
};
/** Hangi olaylar SMS'e uygun (kısa, zamana duyarlı) */
const SMS_KINDS: Kind[] = ["REQUEST_DECIDED", "BILLING_PENDING", "TASK_ASSIGNED", "OP_COMPLETED"];

export interface Message { kind: Kind; title: string; body: string; link?: string; ref?: string }
export type Audience = { userIds?: string[]; roles?: Role[]; partyIds?: (string | null | undefined)[]; personnelIds?: (string | null | undefined)[]; exceptUserId?: string | null };

export const smtpConfigured = () => !!(process.env.SMTP_URL || process.env.SMTP_HOST);
export const smsConfigured = () => !!(process.env.SMS_WEBHOOK_URL);
export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function recipients(a: Audience) {
  const conds = [];
  if (a.userIds?.length) conds.push(inArray(s.users.id, a.userIds));
  if (a.roles?.length) conds.push(arrayOverlaps(s.users.roles, a.roles));
  const parties = (a.partyIds ?? []).filter(Boolean) as string[];
  if (parties.length) conds.push(inArray(s.users.partyId, parties));
  const people = (a.personnelIds ?? []).filter(Boolean) as string[];
  if (people.length) conds.push(inArray(s.users.personnelId, people));
  if (!conds.length) return [];
  const seen = new Map<string, typeof s.users.$inferSelect>();
  for (const c of conds) for (const u of await db.select().from(s.users).where(and(eq(s.users.active, true), c))) if (u.id !== a.exceptUserId) seen.set(u.id, u);
  return [...seen.values()];
}

const emailHtml = (m: Message) => `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f3f6fa;padding:24px;color:#14213d">
<table role="presentation" style="max-width:560px;margin:auto;background:#fff;border-radius:10px;padding:24px;border:1px solid #dde4ee"><tr><td>
<div style="font-weight:800;font-size:20px;color:#0b2d6b">PILOTIS</div><div style="font-size:12px;color:#5b6b82;margin-bottom:16px">${OPERATOR.legalName}</div>
<h2 style="font-size:18px;margin:0 0 8px">${esc(m.title)}</h2><p style="font-size:14px;line-height:1.6;white-space:pre-line">${esc(m.body)}</p>
${m.link ? `<p><a href="${appUrl()}${m.link}" style="display:inline-block;background:#e8501a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:700">Görüntüle</a></p>` : ""}
<p style="font-size:11px;color:#8a97ab;border-top:1px solid #eef2f7;padding-top:12px;margin-top:20px">${BRAND.slogan} · Bu ileti otomatik gönderilmiştir. Bildirim tercihlerinizi Hesabım sayfasından değiştirebilirsiniz.</p>
</td></tr></table></body></html>`;
const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Bildirim gönder: kutuya yaz + tercihe göre e-posta/SMS kuyruğa al + kuyruğu boşaltmayı dene */
export async function notify(a: Audience, m: Message, opts: { email?: boolean; sms?: boolean; inbox?: boolean } = {}) {
  try {
    const users = await recipients(a);
    if (!users.length) return 0;
    if (opts.inbox !== false) await db.insert(s.notifications).values(users.map((u) => ({ userId: u.id, kind: m.kind, title: m.title, body: m.body, link: m.link ?? null })));
    const out: (typeof s.outbox.$inferInsert)[] = [];
    for (const u of users) {
      if (opts.email !== false && u.notifyEmail && u.email && !u.email.endsWith(".local")) out.push({ channel: "EMAIL", to: u.email, subject: `${m.title} · PILOTIS`, body: emailHtml(m), kind: m.kind, ref: m.ref ?? null });
      if ((opts.sms ?? SMS_KINDS.includes(m.kind)) && u.notifySms && u.phone) out.push({ channel: "SMS", to: u.phone, body: `PILOTIS: ${m.title}${m.ref ? ` (${m.ref})` : ""}. ${appUrl()}${m.link ?? ""}`.slice(0, 300), kind: m.kind, ref: m.ref ?? null });
    }
    if (out.length) { await db.insert(s.outbox).values(out); void flushOutbox(); }
    return users.length;
  } catch (e) { console.error("bildirim", e); return 0; }
}

/** Doğrudan e-posta (kullanıcı kaydı olmayan veya kutuya düşmemesi gereken ileti: şifre sıfırlama, rapor) */
export async function queueEmail(to: string, m: Message, attachments?: { name: string; storageKey: string; contentType: string }[]) {
  const [row] = await db.insert(s.outbox).values({ channel: "EMAIL", to, subject: `${m.title} · PILOTIS`, body: emailHtml(m), kind: m.kind, ref: m.ref ?? null, attachments: attachments ?? null }).returning();
  await flushOutbox([row.id]);
  const [after] = await db.select().from(s.outbox).where(eq(s.outbox.id, row.id));
  return after;
}

let flushing = false;
/** Kuyruğu gönder. Altyapı yoksa NO_CONFIG olarak işaretler (sonra yeniden denenebilir). */
export async function flushOutbox(ids?: string[]) {
  if (flushing && !ids) return;
  flushing = true;
  try {
    const rows = await db.select().from(s.outbox).where(ids ? inArray(s.outbox.id, ids) : and(inArray(s.outbox.status, ["QUEUED", "FAILED"]), lt(s.outbox.attempts, 5))).limit(100);
    if (!rows.length) return;
    let mailer: { sendMail: (o: object) => Promise<unknown> } | null = null;
    if (smtpConfigured() && rows.some((r) => r.channel === "EMAIL")) {
      const nodemailer = await import("nodemailer");
      mailer = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT ?? 587), secure: process.env.SMTP_SECURE === "1", auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined });
    }
    for (const r of rows) {
      try {
        if (r.channel === "EMAIL") {
          if (!mailer) { await db.update(s.outbox).set({ status: "NO_CONFIG", error: "E-posta sunucusu (SMTP) tanımlı değil" }).where(eq(s.outbox.id, r.id)); continue; }
          const att = await Promise.all(((r.attachments as { name: string; storageKey: string; contentType: string }[] | null) ?? []).map(async (a) => ({ filename: a.name, content: await storage.get(a.storageKey), contentType: a.contentType })));
          await mailer.sendMail({ from: process.env.SMTP_FROM ?? `PILOTIS <no-reply@yalovapilotaj.com>`, to: r.to, subject: r.subject ?? "PILOTIS", html: r.body, attachments: att });
        } else {
          if (!smsConfigured()) { await db.update(s.outbox).set({ status: "NO_CONFIG", error: "SMS sağlayıcısı (SMS_WEBHOOK_URL) tanımlı değil" }).where(eq(s.outbox.id, r.id)); continue; }
          const res = await fetch(process.env.SMS_WEBHOOK_URL!, { method: "POST", headers: { "content-type": "application/json", ...(process.env.SMS_TOKEN ? { authorization: `Bearer ${process.env.SMS_TOKEN}` } : {}) }, body: JSON.stringify({ to: r.to, text: r.body }) });
          if (!res.ok) throw new Error(`SMS sağlayıcısı ${res.status}`);
        }
        await db.update(s.outbox).set({ status: "SENT", sentAt: new Date(), attempts: r.attempts + 1, error: null }).where(eq(s.outbox.id, r.id));
      } catch (e) {
        await db.update(s.outbox).set({ status: "FAILED", attempts: r.attempts + 1, error: (e as Error).message.slice(0, 300) }).where(eq(s.outbox.id, r.id));
      }
    }
  } finally { flushing = false; }
}

/** Operasyonla ilgili tarafların kullanıcıları için yardımcı */
export async function opAudience(opId: string) {
  const [o] = await db.select({ req: s.operations.requesterPartyId, bill: s.operations.billingPartyId, ref: s.operations.ref }).from(s.operations).where(eq(s.operations.id, opId));
  return o;
}
