import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
export async function requireAdmin() { const u = await requireUser(); if (!u.roles.includes("SYSTEM_ADMIN")) notFound(); return u; }
