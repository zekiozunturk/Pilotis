import { asc } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireInternalPage } from "@/lib/session";
import { Glossary } from "./glossary";

export const metadata = { title: "Terminoloji" };

export default async function Terminology() {
  await requireInternalPage();
  const rows = await db.select().from(s.terms).orderBy(asc(s.terms.number));
  const reviewed = rows.reduce((a, r) => a + Object.values(r.translations as Record<string, { reviewed: boolean }>).filter((x) => x.reviewed).length, 0);
  return (
    <>
      <div className="pagehead">
        <div><h1>Terminoloji sözlüğü</h1>
          <div className="muted">Mevzuat terimi ile işletme dili ayrımı · {rows.length} terim · 6 dil · onaylı çeviri {reviewed}/{rows.length * 5}. Numaralar kalıcıdır: ekranlarda <span className="mono">Palamar<sup style={{ color: "var(--orange)" }}>5</sup></span> biçiminde gösterilir.</div>
        </div>
        <a className="btn secondary" href="/api/terminoloji">Excel'e aktar (CSV)</a>
      </div>
      <div className="alert warn" style={{ marginBottom: 16 }}><span>⚠</span><div><b>Çeviriler taslaktır</b>Yabancı dil karşılıkları denizcilik uzmanı veya onaylı çevirmen kontrolünden geçmeden hukuki ya da bağlayıcı metinde kullanılmaz. Onay, kontrol eden kişinin adıyla kaydedilir.</div></div>
      <Glossary terms={rows.map((r) => ({ n: r.number, slug: r.slug, tr: r.tr, aliases: r.aliases, definition: r.definition, source: r.source, confused: r.confusedWith, status: r.status, version: r.version, translations: r.translations as Record<string, { text: string; reviewed: boolean; reviewer?: string }> }))} />
    </>
  );
}
