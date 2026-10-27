import "server-only";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { currentUser } from "./session";
export type HomeVariant = "CLASSIC" | "MAP";
export const HOME_DEFAULT_KEY = "ui.homeDefault";
export const HOME_LABEL: Record<HomeVariant, string> = { CLASSIC: "Klasik kokpit", MAP: "Harita kokpiti" };
export async function corporateHome(): Promise<HomeVariant> {
  const [r] = await db.select().from(s.appSettings).where(eq(s.appSettings.key, HOME_DEFAULT_KEY));
  return r?.value === "MAP" ? "MAP" : "CLASSIC";
}
/** Kişisel seçim → kurum varsayılanı → klasik */
export async function homeVariant(): Promise<{ variant: HomeVariant; personal: HomeVariant | null; corporate: HomeVariant }> {
  const u = await currentUser();
  const [row] = u ? await db.select({ v: s.users.homeVariant }).from(s.users).where(eq(s.users.id, u.id)) : [];
  const personal = row?.v === "MAP" || row?.v === "CLASSIC" ? (row.v as HomeVariant) : null;
  const corporate = await corporateHome();
  return { variant: personal ?? corporate, personal, corporate };
}
