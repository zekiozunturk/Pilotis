import "server-only";
/**
 * Yunus asistan: soru yanıtlama. ANTHROPIC_API_KEY tanımlıysa yapay zekâ (Claude) ile, değilse
 * yerleşik bilgi tabanı (sayfa açıklamaları, SSS, terminoloji sözlüğü) üzerinden yanıt verir.
 */
import { desc, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { FAQ, helpFor, PAGE_HELP } from "@/data/yunus";
import { getTerms } from "./terms";
import { OPERATION_TYPES } from "@/data/catalog";
import { ROLE_LABELS, type SessionUser } from "./session";
import type { Role } from "./workflow";

export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY;
const norm = (x: string) => x.toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}\s.%-]/gu, " ").replace(/\s+/g, " ").trim();
const toks = (x: string) => norm(x).split(" ").filter((w) => w.length > 1);
const STOP = new Set(["ve", "ile", "bir", "bu", "şu", "ne", "nasıl", "neden", "mi", "mı", "mu", "mü", "da", "de", "için", "nedir", "var", "yok", "ben", "biz", "olan", "gibi", "kaç"]);

export type Answer = { answer: string; source: "ai" | "local"; links: { href: string; label: string }[]; suggestions: string[] };

async function localAnswer(q: string, path: string): Promise<Answer> {
  const t = toks(q).filter((w) => !STOP.has(w));
  const nq = norm(q);
  const hit = (k: string) => t.some((w) => w === k || (w.length >= 4 && k.length >= 4 && (w.startsWith(k.slice(0, 5)) || k.startsWith(w.slice(0, 5)))));
  const faq = FAQ.map((f) => ({ f, sc: f.keys.reduce((a, k) => a + (hit(norm(k)) ? 1 : 0), 0) + toks(f.q).filter((w) => !STOP.has(w) && hit(w)).length * 0.5 })).sort((a, b) => b.sc - a.sc);
  const terms = [...(await getTerms()).values()].map((r) => {
    const names = [r.tr, ...(r.aliases ?? [])].map(norm);
    const sc = names.some((n) => n.length > 2 && nq.includes(n)) ? 5 : names.reduce((a, n) => a + (n.split(" ").some((w) => w.length > 3 && hit(w)) ? 1.5 : 0), 0);
    return { r, sc };
  }).sort((a, b) => b.sc - a.sc);
  const page = /bu (sayfa|ekran)|burada|burası|ne işe|ne yapabilirim/.test(nq) ? helpFor(path) : null;
  const pageHit = PAGE_HELP.map((p) => ({ p, sc: toks(p.title).filter((w) => !STOP.has(w) && hit(w)).length })).sort((a, b) => b.sc - a.sc)[0];
  const sug = FAQ.filter((f) => f !== faq[0]?.f).slice(0, 3).map((f) => f.q);
  if (page) return { answer: `${page.title}: ${page.text}${page.tips?.length ? "\n\nİpuçları:\n• " + page.tips.join("\n• ") : ""}`, source: "local", links: [], suggestions: sug };
  if (terms[0]?.sc >= 5 || (terms[0]?.sc ?? 0) > (faq[0]?.sc ?? 0) + 0.5) {
    const r = terms[0].r;
    return { answer: `${r.tr}: ${r.definition}${r.confusedWith ? `\n\nKarıştırılmamalı: ${r.confusedWith}` : ""}`, source: "local", links: [{ href: `/terminoloji#t${r.number}`, label: "Sözlükte aç" }], suggestions: sug };
  }
  if ((faq[0]?.sc ?? 0) >= 1) { const f = faq[0].f; return { answer: f.a, source: "local", links: f.link ? [{ href: f.link, label: "İlgili ekrana git" }] : [], suggestions: faq.slice(1, 4).filter((x) => x.sc > 0).map((x) => x.f.q).concat(sug).slice(0, 3) }; }
  if (pageHit?.sc) return { answer: `${pageHit.p.title}: ${pageHit.p.text}`, source: "local", links: [{ href: pageHit.p.path, label: `${pageHit.p.title} ekranına git` }], suggestions: sug };
  return { answer: "Bunu tam anlayamadım. Ekranlar, talep ve onay akışı, tarife ve kurlar, harita, bildirimler veya bir terim hakkında sorabilirsiniz. Aşağıdaki sorulardan birini de seçebilirsiniz.", source: "local", links: [], suggestions: FAQ.slice(0, 4).map((f) => f.q) };
}

async function liveContext(u: SessionUser, external: boolean) {
  if (external) return "";
  const act = await db.select({ ref: s.operations.ref, st: s.operations.opStatus, type: s.operations.typeCode, start: s.operations.plannedStart }).from(s.operations).where(inArray(s.operations.opStatus, ["TRANSIT", "ON_SITE", "STARTED", "PAUSED"])).orderBy(desc(s.operations.plannedStart)).limit(15);
  return act.length ? `\nŞu an sahadaki işler (${act.length}): ${act.map((a) => `${a.ref} ${OPERATION_TYPES.find((t) => t.code === a.type)?.nameTr ?? a.type} [${a.st}]`).join("; ")}` : "\nŞu an sahada iş yok.";
}

export async function answer(q: string, path: string, u: SessionUser, role: Role, external: boolean): Promise<Answer> {
  const local = await localAnswer(q, path);
  if (!aiConfigured()) return local;
  try {
    const page = helpFor(path);
    const terms = [...(await getTerms()).values()].filter((r) => { const nq = norm(q); return [r.tr, ...(r.aliases ?? [])].some((n) => norm(n).split(" ").some((w) => w.length > 3 && nq.includes(w.slice(0, 5)))); }).slice(0, 10);
    const system = `Sen "Yunus"sun: Yalova Pilotaj A.Ş.'nin kılavuzluk/römorkaj operasyon yazılımı PILOTIS'in yardımcı asistanısın. Türkçe, kısa (en çok 6 cümle), sıcak ama profesyonel yanıt ver. Yalnız aşağıdaki bilgiye ve genel denizcilik bilgisine dayan; bilmediğin işletme kararını uydurma, "bunu işletmeye sormak gerekir" de. Fiyat tutarı uydurma; fiyatın sistemde otomatik hesaplandığını söyle. Hukuki kesin yorum yapma.
Kullanıcı: ${u.name}, rol: ${ROLE_LABELS[role]}${external ? " (müşteri tarafı — iç operasyon ayrıntısı verme)" : ""}. Açık ekran: ${page ? `${page.title} (${path}) — ${page.text}` : path}.
Kurallar: faturalar TL; döviz kalemi iş bitiş günü TCMB döviz satış kuru, hafta sonu cuma 15:30 bülteni; portal talebi en az 6 saat sonrası için; talep önce (varsa) fatura muhatabı, sonra Yalova Pilotaj operasyon/işletme müdürü, kıyı operasyon veya planlamacı tarafından onaylanır.
Ekranlar: ${PAGE_HELP.map((p) => `${p.title} (${p.path}): ${p.text}`).join(" | ")}
SSS: ${FAQ.map((f) => `S: ${f.q} Y: ${f.a}`).join(" | ")}
${terms.length ? `İlgili terimler: ${terms.map((r) => `${r.tr}: ${r.definition}`).join(" | ")}` : ""}${await liveContext(u, external)}`;
    const ctl = AbortSignal.timeout(20000);
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", signal: ctl, headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.YUNUS_MODEL ?? "claude-haiku-5-5", max_tokens: 600, system, messages: [{ role: "user", content: q.slice(0, 1000) }] }) });
    if (!r.ok) throw new Error(`AI ${r.status}`);
    const j = (await r.json()) as { content?: { type: string; text?: string }[] };
    const text = j.content?.filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
    if (!text) throw new Error("boş yanıt");
    return { answer: text, source: "ai", links: local.links, suggestions: local.suggestions };
  } catch (e) { console.error("yunus ai", e); return local; }
}
