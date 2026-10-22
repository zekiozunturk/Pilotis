import { requireInternalPage } from "@/lib/session";
import { db, schema as s } from "@/db";
import { asc } from "drizzle-orm";
import { NewOperationForm } from "./form";

export const metadata = { title: "Yeni talep" };

export default async function NewOperation() {
  await requireInternalPage();
  const [vessels, types, facilities, parties] = await Promise.all([
    db.select().from(s.vessels).orderBy(asc(s.vessels.name)),
    db.select().from(s.operationTypes).orderBy(asc(s.operationTypes.code)),
    db.select().from(s.facilities).orderBy(asc(s.facilities.name)),
    db.select().from(s.parties).orderBy(asc(s.parties.legalName)),
  ]);
  const companies = parties.filter((p) => p.kind !== "AUTHORITY");
  return (
    <>
      <div className="pagehead">
        <div><h1>Yeni hizmet talebi</h1><div className="muted">Talepname v1 müşteri beyanı olarak saklanır; saha doğrulaması ayrı sürümdür.</div></div>
      </div>
      <NewOperationForm
        vessels={vessels.map((v) => ({ id: v.id, label: `${v.name}${v.imo ? ` · IMO ${v.imo}` : ""}${v.gt ? ` · ${Number(v.gt).toLocaleString("tr-TR")} GT` : " · GT bilinmiyor"}`, gt: v.gt }))}
        types={types.map((t) => ({ id: t.code, label: `${t.code} — ${t.nameTr}` }))}
        facilities={facilities.map((f) => ({ id: f.id, label: f.name }))}
        parties={companies.map((p) => ({ id: p.id, label: p.legalName }))}
      />
    </>
  );
}
