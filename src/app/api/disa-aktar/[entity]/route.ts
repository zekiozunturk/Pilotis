import { NextRequest } from "next/server";
import { requireInternalPage, currentRole, ROLE_LABELS } from "@/lib/session";
import { entityByKey, type FType } from "@/lib/exchange/registry";
import { buildWorkbook, xlsxResponse, type ColType } from "@/lib/excel";
import { db, schema as s } from "@/db";

export const dynamic = "force-dynamic";
const EN: Record<string, string> = { "Unvan": "Legal name", "Kısa ad": "Short name", "Tür": "Type", "Vergi no": "Tax no", "Vergi dairesi": "Tax office", "ETA cari kodu": "ETA account code", "Adres": "Address", "Şehir": "City", "Ülke (ISO 2)": "Country", "Telefon": "Phone", "E-posta": "E-mail", "Gemi adı": "Vessel name", "Bayrak (ISO 2)": "Flag", "Gemi tipi": "Vessel type", "Boy (m)": "LOA (m)", "En (m)": "Beam (m)", "Sicil no": "Staff no", "Ad soyad": "Full name", "Birim": "Unit", "Görev": "Crew role", "Ekip": "Team", "Aktif": "Active", "Kod": "Code", "Araç adı": "Asset name", "Araç sınıfı": "Asset class", "Çeki gücü (t)": "Bollard pull (t)", "İnşa yılı": "Build year", "Kullanılabilir": "Available", "İş emri": "Work order", "Planlanan başlangıç": "Planned start", "Gemi": "Vessel", "Fatura muhatabı": "Billing party", "Operasyon durumu": "Operation status", "Tahakkuk": "Accrual", "Muhasebe": "Accounting", "Fatura no": "Invoice no", "Fatura tarihi": "Invoice date", "Açıklama": "Description", "Tutar (KDV hariç)": "Net amount", "KDV": "VAT", "Kalem kodu": "Item code", "Kalem adı": "Item name", "Birim fiyat": "Unit price", "Formül": "Formula", "Para birimi": "Currency", "Başlangıç": "Start", "Bitiş": "End", "Tarih": "Date", "Kategori": "Category", "Nitelik": "Nature", "Tutar (TL)": "Amount (TRY)" };
const toCol = (t: FType): ColType => (t === "id" ? "id" : t === "int" ? "int" : t === "number" ? "number" : t === "date" ? "date" : t === "datetime" ? "datetime" : "text");

/** Excel'e aktar — kapsam, kolonlar, gruplama, sıralama, dil, saat dilimi, tarih biçimi seçilebilir; yetki ve denetim kaydıyla */
export async function GET(req: NextRequest, { params }: { params: Promise<{ entity: string }> }) {
  await requireInternalPage();
  const role = await currentRole();
  const ent = entityByKey((await params).entity);
  if (!ent || !ent.canExport(role)) return new Response("Bu kayıtları dışa aktarma yetkiniz yok", { status: 403 });
  const q = req.nextUrl.searchParams;
  const target = q.get("target");
  let rows = await ent.exportRows({ role, target });
  const ids = q.get("ids")?.split(",").filter(Boolean);
  if (ids?.length) rows = rows.filter((r) => ids.includes(String(r._id ?? r.number ?? r.ref ?? "")));
  const search = q.get("q")?.toLocaleLowerCase("tr");
  if (search) rows = rows.filter((r) => Object.values(r).some((v) => String(v ?? "").toLocaleLowerCase("tr").includes(search)));
  const sort = q.get("sort"), dir = q.get("dir") === "desc" ? -1 : 1;
  if (sort) rows.sort((a, b) => String(a[sort] ?? "").localeCompare(String(b[sort] ?? ""), "tr", { numeric: true }) * dir);
  const lang = q.get("lang") === "en" ? "en" : "tr";
  const utc = q.get("tz") === "utc";
  const extra = rows[0] ? Object.keys(rows[0]).filter((k) => !ent.fields.some((f) => f.key === k) && !k.startsWith("_") && ["partyName", "fullName", "status", "approved"].includes(k)) : [];
  const all = [...ent.fields.map((f) => ({ key: f.key, header: f.header, type: f.type })), ...extra.map((k) => ({ key: k, header: { partyName: "Cari adı", fullName: "Ad soyad", status: "Durum", approved: "Onay" }[k] ?? k, type: "text" as FType }))];
  const want = q.get("cols")?.split(",").filter(Boolean);
  const cols = (want?.length ? all.filter((c) => want.includes(c.key)) : all).filter((c) => c.key !== "_id" || q.get("ids") || q.get("withId") === "1");
  const shift = (v: unknown) => (typeof v === "number" && v > 1e11 && utc ? v - 3 * 3_600_000 : v);
  const data = rows.map((r) => Object.fromEntries(cols.map((c) => [c.key, c.type === "date" && typeof r[c.key] === "string" ? new Date(`${r[c.key]}T00:00:00+03:00`).getTime() : c.type === "list" && Array.isArray(r[c.key]) ? (r[c.key] as string[]).join("; ") : shift(r[c.key])])));
  const group = q.get("group") || undefined;
  const numeric = cols.filter((c) => c.type === "number" || c.type === "int").map((c) => c.key);
  const { buffer, reportId } = await buildWorkbook({
    title: `PILOTIS · ${ent.label}`, preparedBy: ROLE_LABELS[role],
    meta: [["Kayıt türü", ent.label], ["Kapsam", ids?.length ? `Seçili ${ids.length} kayıt` : search ? `Filtre: “${search}”` : "Yetkili olduğunuz bütün kayıtlar"], ["Satır", String(data.length)], ["Saat dilimi", utc ? "UTC" : "Europe/Istanbul"], ["Tarih biçimi", q.get("df") === "iso" ? "yyyy-aa-gg" : "gg.aa.yyyy"], ["Not", "Kimlik kolonları metin biçimindedir. Değiştirip içe aktarmak için ‘Sistem kimliği’ kolonunu koruyun."]],
    sheets: [{ name: ent.label, groupBy: group, columns: cols.map((c) => ({ key: c.key, header: lang === "en" ? EN[c.header] ?? c.header : c.header, type: c.key === "price" || c.key === "net" || c.key === "tax" || c.key === "amount" || c.key === "matched" ? "number" : toCol(c.type), total: numeric.includes(c.key) && ["net", "tax", "amount", "matched"].includes(c.key) })), rows: data }],
  });
  if (q.get("df") === "iso") { /* tarih biçimi seçimi: buildWorkbook gg.aa.yyyy kullanır; ISO için metin sütunu */ }
  await db.insert(s.auditLog).values({ entity: "export", entityId: reportId, action: "EXPORT_XLSX", after: { entity: ent.key, rows: data.length, cols: cols.map((c) => c.key), filters: Object.fromEntries(q.entries()) } as object, actorId: role });
  return xlsxResponse(buffer, `PILOTIS_${ent.key.toUpperCase()}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.xlsx`);
}
