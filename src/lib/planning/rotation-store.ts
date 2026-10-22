import "server-only";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { DEFAULT_ROTATION, validateModel, type RotationModel } from "./rotation";

export const ROTATION_KEY = "planning.rotation";

export async function getRotationModel(): Promise<{ model: RotationModel; saved: boolean; updatedAt: Date | null; updatedBy: string | null }> {
  const [row] = await db.select().from(s.appSettings).where(eq(s.appSettings.key, ROTATION_KEY));
  if (!row) return { model: DEFAULT_ROTATION, saved: false, updatedAt: null, updatedBy: null };
  const m = { ...DEFAULT_ROTATION, ...(row.value as Partial<RotationModel>) } as RotationModel;
  return { model: validateModel(m).length ? DEFAULT_ROTATION : m, saved: true, updatedAt: row.updatedAt, updatedBy: row.updatedBy };
}
