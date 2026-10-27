import { NextResponse } from "next/server";
import { currentScope, currentUser } from "@/lib/session";
import { answer } from "@/lib/yunus";

const hits = new Map<string, number[]>();
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
  const now = Date.now(), h = (hits.get(u.id) ?? []).filter((t) => now - t < 60_000);
  if (h.length >= 15) return NextResponse.json({ answer: "Biraz yavaşlayalım 🙂 Bir dakika içinde çok soru geldi, birazdan tekrar sorun.", source: "local", links: [], suggestions: [] });
  hits.set(u.id, [...h, now]);
  const b = (await req.json().catch(() => ({}))) as { q?: string; path?: string };
  const q = String(b.q ?? "").trim().slice(0, 1000);
  if (!q) return NextResponse.json({ error: "Soru boş" }, { status: 400 });
  const { role, external } = await currentScope();
  return NextResponse.json(await answer(q, String(b.path ?? "/"), u, role, external));
}
