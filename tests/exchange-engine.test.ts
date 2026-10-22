/**
 * Aktarım motoru — gerçek veritabanıyla bütünleşik testler (yerel PostgreSQL gerekir).
 * Her test kendine özgü IMO numaraları üretir ve sonunda temizler.
 */
import { describe, it, expect, vi, afterAll } from "vitest";
vi.mock("server-only", () => ({}));
import { eq, inArray, like } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { parseCsv, imoValid as imoValidLike } from "@/lib/exchange/parse";
import { entityByKey } from "@/lib/exchange/registry";
import { buildPlan, runBatch, revertBatch, storeUpload, batchNo, type Options } from "@/lib/exchange/engine";

const ent = entityByKey("gemiler")!;
const TAG = `TST${Date.now().toString(36).toUpperCase()}`;
let seq = Math.floor(Math.random() * 50000) + 100000;
/** denetim haneli geçerli IMO üretir */
function imo() { const b = String(seq++).slice(0, 6).padStart(6, "0"); const d = b.split("").map(Number); const c = (d[0] * 7 + d[1] * 6 + d[2] * 5 + d[3] * 4 + d[4] * 3 + d[5] * 2) % 10; return b + c; }
const OPT: Options = { key: "imo", emptyCell: "KEEP", mode: "ALL", formulas: "VALUE" };
const MAP = { "0": "name", "1": "imo", "2": "gt", "3": "flag" };
const sheet = (csv: string) => ({ name: "S", rows: parseCsv(`Gemi adı;IMO;GT;Bayrak\n${csv}`) });
const ctx = { role: "SYSTEM_ADMIN" as const, batchId: "test" };
const created: string[] = [];

async function batch(csv: string, opts: Options = OPT) {
  const buf = Buffer.from(`Gemi adı;IMO;GT;Bayrak\n${csv}`, "utf8");
  const { key, hash } = await storeUpload(buf, "csv");
  const [b] = await db.insert(s.importBatches).values({ no: batchNo(), entity: "gemiler", fileName: "t.csv", fileHash: hash, storageKey: key, sheet: "Sayfa1", headerRow: 0, mapping: MAP, options: opts, status: "VALIDATED", createdBy: "SYSTEM_ADMIN" }).returning();
  return b.id;
}
const status = async (id: string) => (await db.select().from(s.importBatches).where(eq(s.importBatches.id, id)))[0];

afterAll(async () => {
  const vs = await db.select({ id: s.vessels.id }).from(s.vessels).where(like(s.vessels.name, `${TAG}%`));
  if (vs.length) await db.delete(s.vessels).where(inArray(s.vessels.id, vs.map((v) => v.id)));
  void created;
});

describe("aktarım motoru", () => {
  it("kuru plan: ekle / hata sayıları ve geçersiz IMO", async () => {
    const a = imo(), b = imo();
    const p = await buildPlan(ent, sheet(`${TAG} A;${a};1200;TR\n${TAG} B;${b};"2.500,5";MT\n${TAG} C;1234568;900;TR`), 0, MAP, OPT, ctx);
    expect(p.summary).toMatchObject({ insert: 2, update: 0, error: 1, total: 3 });
    expect(p.rows[1].data.gt).toBe(2500.5);
    expect(p.rows[2].errors.join()).toMatch(/IMO/);
    // kuru plan veritabanına yazmaz
    expect((await db.select().from(s.vessels).where(eq(s.vessels.imo, a))).length).toBe(0);
  });

  it("dosya içi tekrar eden anahtar ve isimle birleştirme yapılmaması", async () => {
    const a = imo();
    const p = await buildPlan(ent, sheet(`${TAG} D;${a};1000;TR\n${TAG} D2;${a};1100;TR`), 0, MAP, OPT, ctx);
    expect(p.rows[1].action).toBe("ERROR");
    expect(p.rows[1].errors.join()).toMatch(/tekrar eden anahtar/);
    // mevcut adla, IMO'suz satır: isimle eşleştirilmez, hata verir
    const [ex] = await db.select().from(s.vessels).limit(1);
    const q = await buildPlan(ent, sheet(`${ex.name};;1000;TR`), 0, MAP, OPT, ctx);
    expect(q.rows[0].action).toBe("ERROR");
    expect(q.rows[0].errors.join()).toMatch(/ada göre birleştirilmez/);
  });

  it("ya hep ya hiç: hatalı satır varsa hiçbir kayıt yazılmaz", async () => {
    const a = imo();
    const id = await batch(`${TAG} E;${a};1000;TR\n${TAG} F;1234568;1000;TR`);
    await runBatch(id, false);
    expect((await status(id)).status).toBe("FAILED");
    expect((await db.select().from(s.vessels).where(eq(s.vessels.imo, a))).length).toBe(0);
  });

  it("hatalıları ayır: doğru satırlar yazılır, sonuç satır satır kaydedilir", async () => {
    const a = imo();
    const id = await batch(`${TAG} G;${a};1000;TR\n${TAG} H;1234568;1000;TR`, { ...OPT, mode: "SKIP_BAD" });
    await runBatch(id, false);
    const b = await status(id);
    expect(b.status).toBe("DONE");
    expect((b.summary as { applied: { insert: number; error: number } }).applied).toMatchObject({ insert: 1, error: 1 });
    expect((await db.select().from(s.vessels).where(eq(s.vessels.imo, a))).length).toBe(1);
    const rows = await db.select().from(s.importRows).where(eq(s.importRows.batchId, id));
    expect(rows.map((r) => r.action).sort()).toEqual(["ERROR", "INSERT"]);
  });

  it("kuru çalıştırma durum kaydı oluşturur ama yazmaz", async () => {
    const a = imo();
    const id = await batch(`${TAG} I;${a};1000;TR`);
    await runBatch(id, true);
    expect((await status(id)).status).toBe("DRY_RUN");
    expect((await db.select().from(s.vessels).where(eq(s.vessels.imo, a))).length).toBe(0);
  });

  it("boş hücre: koru / temizle / hata", async () => {
    const a = imo();
    await runBatch(await batch(`${TAG} J;${a};1000;TR`), false);
    const keep = await buildPlan(ent, sheet(`${TAG} J;${a};;TR`), 0, MAP, OPT, ctx);
    expect(keep.rows[0].action).toBe("SKIP");
    const clear = await buildPlan(ent, sheet(`${TAG} J;${a};;TR`), 0, MAP, { ...OPT, emptyCell: "CLEAR" }, ctx);
    expect(clear.rows[0].action).toBe("UPDATE");
    expect(clear.rows[0].changes).toEqual([{ field: "gt", from: 1000, to: null }]);
    const err = await buildPlan(ent, sheet(`${TAG} J;${a};;TR`), 0, MAP, { ...OPT, emptyCell: "ERROR" }, ctx);
    expect(err.rows[0].action).toBe("ERROR");
  });

  it("geri alma: sonradan değişen kayıt ve alanlar korunur, diğerleri geri alınır", async () => {
    const a = imo(), b = imo(), c = imo();
    await runBatch(await batch(`${TAG} K;${c};500;TR`), false); // önceden var olan kayıt
    const id = await batch(`${TAG} L;${a};1000;TR\n${TAG} M;${b};1000;TR\n${TAG} K;${c};800;MT`);
    await runBatch(id, false);
    expect((await status(id)).status).toBe("DONE");
    // aktarımdan sonra elle değişiklik: M'nin GT'si ve K'nin bayrağı
    await db.update(s.vessels).set({ gt: "1111" }).where(eq(s.vessels.imo, b));
    await db.update(s.vessels).set({ flag: "GR" }).where(eq(s.vessels.imo, c));
    const r = await revertBatch(id, "SYSTEM_ADMIN");
    expect(r.status).toBe("PARTIALLY_REVERTED");
    expect((await db.select().from(s.vessels).where(eq(s.vessels.imo, a))).length).toBe(0);       // L silindi
    expect((await db.select().from(s.vessels).where(eq(s.vessels.imo, b))).length).toBe(1);       // M korundu
    const [k] = await db.select().from(s.vessels).where(eq(s.vessels.imo, c));
    expect(Number(k.gt)).toBe(500);   // aktarımın yaptığı GT değişikliği geri alındı
    expect(k.flag).toBe("GR");        // sonradan yapılan değişiklik korundu
    await expect(revertBatch(id, "SYSTEM_ADMIN")).rejects.toThrow();
  });

  it("kayıtta zaten duran ve değiştirilmeyen kural dışı değer uyarıdır, yeni değer hatadır", async () => {
    const bad = `9${String(seq++).slice(-5)}0`;
    const fixed = imoValidLike(bad) ? `${bad.slice(0, 6)}${(Number(bad[6]) + 1) % 10}` : bad;
    await db.insert(s.vessels).values({ name: `${TAG} ESKİ`, imo: fixed, gt: "100" });
    const p = await buildPlan(ent, sheet(`${TAG} ESKİ;${fixed};150;TR`), 0, MAP, OPT, ctx);
    expect(p.rows[0].action).toBe("UPDATE");
    expect(p.rows[0].warnings.join()).toMatch(/mevcut kayıttaki değer/);
  });

  it("onaylı tarife sürümü aktarımla değiştirilemez", async () => {
    const pl = entityByKey("fiyat-listesi")!;
    const [v] = await db.select().from(s.tariffVersions).where(inArray(s.tariffVersions.status, ["IN_FORCE", "APPROVED"])).limit(1);
    if (!v) return;
    const items = ((v.definition as { items?: { code: string }[] }).items ?? []);
    const code = items[0]?.code ?? "200.001";
    const p = await buildPlan(pl, { name: "S", rows: parseCsv(`Kalem kodu;Birim fiyat\n${code};999`) }, 0, { "0": "code", "1": "price" }, { ...OPT, key: "code", target: v.id }, { ...ctx, target: v.id });
    expect(p.rows[0].action).toBe("ERROR");
    expect(p.rows[0].errors.join()).toMatch(/onaylı|yürürlük/i);
  });
});
