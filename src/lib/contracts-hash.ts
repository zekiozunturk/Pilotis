import { createHash } from "node:crypto";
/** Kabul edilen metnin özeti — satır sonları normalize edilir */
export const textHash = (body: string) => createHash("sha256").update(body.replace(/\r\n/g, "\n").trim()).digest("hex");
