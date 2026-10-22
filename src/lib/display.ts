import "server-only";
import { cookies } from "next/headers";
import { latestFx } from "./fx";

export type DisplayCcy = "TRY" | "USD" | "EUR";
export interface DisplayCtx { ccy: DisplayCcy; rate: string | null; source: string | null; date: string | null }

/** Kullanıcının gösterim para birimi (bilgi amaçlı). Hesap ve fatura her zaman TL. */
export async function getDisplay(): Promise<DisplayCtx> {
  const c = (await cookies()).get("pilotis_ccy")?.value as DisplayCcy | undefined;
  const ccy: DisplayCcy = c === "USD" || c === "EUR" ? c : "TRY";
  if (ccy === "TRY") return { ccy, rate: null, source: null, date: null };
  const fx = await latestFx();
  const r = fx[ccy];
  return { ccy, rate: r?.rate ?? null, source: r?.source ?? null, date: r?.date ?? null };
}
