import { NextRequest } from "next/server";
import { ilike, or, desc, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { currentScope } from "@/lib/session";
import { analyticsAccess } from "@/lib/analytics/access";

export const dynamic = "force-dynamic";
/** Komut menüsü kayıt araması — yalnız iç kullanıcılar; personel sonuçları analiz yetkisine bağlı */
export async function GET(req: NextRequest) {
  const { external, role } = await currentScope();
  if (external) return Response.json({ items: [] });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return Response.json({ items: [] });
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const [ops, vessels, parties, people, terms] = await Promise.all([
    db.select({ ref: s.operations.ref, type: s.operations.typeCode }).from(s.operations).where(ilike(s.operations.ref, like)).orderBy(desc(s.operations.ref)).limit(6),
    db.select({ id: s.vessels.id, name: s.vessels.name, imo: s.vessels.imo }).from(s.vessels).where(or(ilike(s.vessels.name, like), ilike(s.vessels.imo, like))).limit(5),
    db.select({ id: s.parties.id, name: s.parties.legalName }).from(s.parties).where(ilike(s.parties.legalName, like)).limit(5),
    analyticsAccess(role).people === "ALL" ? db.select({ id: s.personnel.id, name: s.personnel.fullName, title: s.personnel.title }).from(s.personnel).where(ilike(s.personnel.fullName, like)).limit(5) : Promise.resolve([]),
    db.select({ n: s.terms.number, tr: s.terms.tr }).from(s.terms).where(or(ilike(s.terms.tr, like), sql`${s.terms.aliases}::text ilike ${like}`)).limit(5),
  ]);
  const items = [
    ...ops.map((o) => ({ group: "İş emirleri", label: o.ref, sub: o.type, href: `/operasyonlar/${o.ref}` })),
    ...vessels.map((v) => ({ group: "Gemiler", label: v.name, sub: v.imo ? `IMO ${v.imo}` : "", href: `/gemiler?q=${encodeURIComponent(v.name)}` })),
    ...parties.map((p) => ({ group: "Taraflar", label: p.name, sub: "", href: `/taraflar?q=${encodeURIComponent(p.name)}` })),
    ...people.map((p) => ({ group: "Personel", label: p.name, sub: p.title, href: `/analiz/personel/${p.id}` })),
    ...terms.map((t) => ({ group: "Terminoloji", label: `#${t.n} ${t.tr}`, sub: "", href: `/terminoloji#t${t.n}` })),
  ];
  return Response.json({ items });
}
