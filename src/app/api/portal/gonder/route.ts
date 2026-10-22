import { submitCart } from "@/app/portal/actions";
export const dynamic = "force-dynamic";
/** Sepet gönderimi düz JSON uç noktası: sunucu eylemi akışına bağlı kalmadan sonuç döner, istemci yönlendirir */
export async function POST(req: Request) {
  const r = await submitCart(null, await req.formData());
  return Response.json(r ?? { ok: false, message: "İşlem başarısız" }, { status: r?.ok ? 200 : 400 });
}
