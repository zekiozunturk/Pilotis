import { cookies } from "next/headers";
import type { Role } from "./workflow";

/** GELİŞTİRME OTURUMU — Faz 1'de rol seçimi çerezle yapılır; gerçek kimlik doğrulama + MFA Faz 9 öncesi devreye alınır. */
export const ROLE_LABELS: Record<Role, string> = {
  SYSTEM_ADMIN: "Sistem yöneticisi", BUSINESS_MANAGER: "İşletme yöneticisi", OPERATIONS_MANAGER: "Operasyon yöneticisi",
  PLANNER: "Planlamacı", SHORE_OPS: "Kıyı operasyon sorumlusu", PILOT: "Kılavuz kaptan", TUG_MASTER: "Römorkör kaptanı",
  CREW: "Mürettebat", ACCOUNTING: "Muhasebe", TARIFF_OFFICER: "Tarife/mevzuat sorumlusu", CUSTOMER: "Müşteri/acente",
  BILLING_PARTY: "Fatura muhatabı", AUDITOR: "Denetçi",
};

export async function currentRole(): Promise<Role> {
  const c = await cookies();
  const r = c.get("pilotis_role")?.value as Role | undefined;
  return r && r in ROLE_LABELS ? r : "OPERATIONS_MANAGER";
}

export const EXTERNAL_ROLES: Role[] = ["CUSTOMER", "BILLING_PARTY"];

/** Dış kullanıcı (müşteri/muhatap) hangi firma adına? Geliştirmede çerezle seçilir; canlıda kullanıcı-firma ilişkisinden gelir. */
export async function currentScope(): Promise<{ role: Role; partyId: string | null; external: boolean }> {
  const role = await currentRole();
  const c = await cookies();
  const external = EXTERNAL_ROLES.includes(role);
  return { role, external, partyId: external ? c.get("pilotis_party")?.value ?? null : null };
}

/** Yalnız işletme personeline açık sayfalar: dış kullanıcıya varlığı dahi gösterilmez. */
export async function requireInternalPage() {
  const { notFound } = await import("next/navigation");
  if ((await currentScope()).external) notFound();
}
