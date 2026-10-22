"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { currentScope, currentUser } from "@/lib/session";
import { textHash } from "@/lib/contracts";
import { storage } from "@/lib/storage";

export type AcceptState = { ok: boolean; message: string } | null;
/** Metni firma adına kabul et (tıkla-kabul; isteğe bağlı çizilmiş imza). Kabul, metnin özetine bağlanır. */
export async function acceptContract(_: AcceptState, f: FormData): Promise<AcceptState> {
  try {
    const scope = await currentScope();
    const user = await currentUser();
    if (!scope.external || !scope.partyId || !user) return { ok: false, message: "Yalnız firma adına giriş yapmış müşteri kullanıcısı onaylayabilir" };
    const [t] = await db.select().from(s.contractTemplates).where(eq(s.contractTemplates.id, String(f.get("templateId"))));
    if (!t || t.status !== "PUBLISHED") return { ok: false, message: "Metin yürürlükte değil" };
    if (String(f.get("hash")) !== textHash(t.body)) return { ok: false, message: "Metin siz okurken güncellenmiş — sayfayı yenileyip yeni sürümü okuyun" };
    const name = String(f.get("signerName") ?? "").trim(), title = String(f.get("signerTitle") ?? "").trim();
    if (name.length < 3) return { ok: false, message: "Ad soyad gerekli" };
    if (f.get("read") !== "on" || f.get("authority") !== "on") return { ok: false, message: "Metni okuduğunuzu ve firma adına yetkili olduğunuzu işaretleyin" };
    let sigKey: string | null = null;
    const sig = String(f.get("signature") ?? "");
    if (sig.startsWith("data:image/png;base64,")) { const png = Buffer.from(sig.slice(22), "base64"); if (png.byteLength < 400_000) sigKey = (await storage.put(`sozlesme/${scope.partyId}/${t.code}_v${t.version}_${Date.now()}.png`, png)).key; }
    const h = await headers();
    await db.insert(s.contractAcceptances).values({ templateId: t.id, partyId: scope.partyId, userId: user.id, signerName: name, signerTitle: title || null, textHash: textHash(t.body), method: sigKey ? "DRAWN" : "CLICKWRAP", signatureImageKey: sigKey, ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null, userAgent: h.get("user-agent")?.slice(0, 200) ?? null });
    await db.insert(s.auditLog).values({ entity: "contract", entityId: `${t.code}-v${t.version}`, action: "ACCEPT", after: { partyId: scope.partyId, name, title, method: sigKey ? "DRAWN" : "CLICKWRAP" }, actorId: user.username ?? user.email });
    revalidatePath("/portal/belgeler"); revalidatePath("/portal");
    return { ok: true, message: `${t.title} onaylandı` };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}
