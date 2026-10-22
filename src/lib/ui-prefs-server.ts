import "server-only";
import { cookies } from "next/headers";
import { inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { resolvePrefs, sanitize, type UiPolicy, type UiPrefs } from "./ui-prefs";
import { currentRole } from "./session";

export const UI_COOKIE = "pilotis_ui";
export async function getUiPolicy(): Promise<UiPolicy> {
  const rows = await db.select().from(s.appSettings).where(inArray(s.appSettings.key, ["ui.corporate", "ui.roles", "ui.locked"]));
  const v = (k: string) => rows.find((r) => r.key === k)?.value;
  return { corporate: sanitize(v("ui.corporate")), roles: Object.fromEntries(Object.entries((v("ui.roles") as Record<string, unknown>) ?? {}).map(([r, p]) => [r, sanitize(p)])), locked: ((v("ui.locked") as string[]) ?? []) as UiPolicy["locked"] };
}
export async function getPersonalPrefs(): Promise<Partial<UiPrefs>> {
  try { return sanitize(JSON.parse((await cookies()).get(UI_COOKIE)?.value ?? "{}")); } catch { return {}; }
}
export async function getUiState() {
  const [policy, personal, role] = await Promise.all([getUiPolicy(), getPersonalPrefs(), currentRole()]);
  return { policy, personal, role, prefs: resolvePrefs(policy, role, personal) };
}
