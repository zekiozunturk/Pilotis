/** Sunum/deneme: sesli görev bildirimini yalnız isteyen kullanıcıya gönderir */
import { NextResponse } from "next/server";
import { desc, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { currentUser } from "@/lib/session";
import { notify } from "@/lib/notify";
import { OPERATION_TYPES } from "@/data/catalog";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u?.roles.some((r) => ["OPERATIONS_MANAGER", "BUSINESS_MANAGER", "SYSTEM_ADMIN"].includes(r))) return NextResponse.json({ ok: false }, { status: 403 });
  const { kind } = (await req.json().catch(() => ({}))) as { kind?: string };
  const k = kind === "end" ? "OP_ENDED" : "OP_STARTED";
  const q = () => db.select({ ref: s.operations.ref, type: s.operations.typeCode, vessel: s.vessels.name }).from(s.operations).innerJoin(s.portCalls, eq(s.portCalls.id, s.operations.portCallId)).innerJoin(s.vessels, eq(s.vessels.id, s.portCalls.vesselId))
    .$dynamic();
  const pick = async (st: string[] | null) => (await (st ? q().where(inArray(s.operations.opStatus, st as ("STARTED")[])) : q()).orderBy(desc(s.operations.updatedAt)).limit(1))[0];
  const o = (await pick(k === "OP_STARTED" ? ["STARTED", "TRANSIT", "ON_SITE"] : ["COMPLETED", "STARTED"])) ?? (await pick(null));
  if (!o) return NextResponse.json({ ok: false, message: "Deneme için uygun iş bulunamadı" });
  const type = OPERATION_TYPES.find((t) => t.code === o.type)?.nameTr ?? o.type;
  await notify({ userIds: [u.id] }, { kind: k, ref: o.ref, link: `/operasyonlar/${o.ref}`, title: `[Deneme] Görev ${k === "OP_STARTED" ? "başladı" : "tamamlandı"}: ${o.vessel} — ${type}`, body: `İş emri ${o.ref} · bu bir deneme bildirimidir` }, { email: false, sms: false });
  return NextResponse.json({ ok: true });
}
