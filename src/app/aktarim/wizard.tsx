"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadFile, remap, preview, start, saveMapping, listMappings, type UploadRes, type PreviewRes } from "./actions";

type Ent = { key: string; label: string; group: string; description: string; keys: { field: string; label: string }[]; fields: { key: string; header: string; required: boolean; type: string; help: string }[]; mode: string; target: string | null; needsApproval: boolean };
type Opts = { key: string; emptyCell: "KEEP" | "CLEAR" | "ERROR"; mode: "ALL" | "SKIP_BAD"; formulas: "VALUE" | "ERROR"; target?: string | null; allowNameDuplicates?: boolean };
type Status = { status: string; progress: number; total: number; summary: Record<string, number> | null; message: string | null; rows: { rowNo: number; action: string; errors: string[] | null; warnings: string[] | null; applied: boolean }[] };
const STEPS = ["Dosya", "Eşleştirme", "Önizleme", "Çalıştır"];
const ACT: Record<string, [string, string]> = { INSERT: ["Eklenecek", "ok"], UPDATE: ["Güncellenecek", ""], SKIP: ["Değişiklik yok", "grey"], ERROR: ["Hatalı", "bad"] };

export function Wizard({ entities, initial, targets, initialTarget }: { entities: Ent[]; initial: string; targets: { v: string; l: string; editable: boolean }[]; initialTarget?: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [entKey, setEntKey] = useState(initial || entities[0]?.key || "");
  const ent = entities.find((e) => e.key === entKey)!;
  const [up, setUp] = useState<Extract<UploadRes, { ok: true }> | null>(null);
  const [sheet, setSheet] = useState("");
  const [header, setHeader] = useState(0);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [opts, setOpts] = useState<Opts>({ key: ent?.keys[0]?.field ?? "", emptyCell: "KEEP", mode: "ALL", formulas: "VALUE", target: targets.find((t) => t.v === initialTarget && t.editable)?.v ?? targets.find((t) => t.editable)?.v ?? null });
  const [pv, setPv] = useState<Extract<PreviewRes, { ok: true }> | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [st, setSt] = useState<Status | null>(null);
  const [templates, setTemplates] = useState<{ name: string; profile: string | null; mapping: Record<string, string> }[]>([]);
  const [tplName, setTplName] = useState("");
  const [pending, startT] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { if (ent) setOpts((o) => ({ ...o, key: ent.keys[0]?.field ?? "" })); listMappings(entKey).then(setTemplates).catch(() => setTemplates([])); }, [entKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (poll.current) clearInterval(poll.current); }, []);
  // sihirbaz yarıdayken sayfadan ayrılma uyarısı
  useEffect(() => {
    if (step === 0 || step === 3) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h);
  }, [step]);

  const sh = up?.sheets.find((x) => x.name === sheet) ?? up?.sheets[0];
  const headers = sh?.preview[header] ?? [];
  const mappedFields = new Set(Object.values(mapping).filter(Boolean));
  const missing = ent?.fields.filter((f) => f.required && !mappedFields.has(f.key)) ?? [];
  const dupTargets = useMemo(() => { const c: Record<string, number> = {}; Object.values(mapping).forEach((v) => v && (c[v] = (c[v] ?? 0) + 1)); return Object.keys(c).filter((k) => c[k] > 1); }, [mapping]);

  const doUpload = () => {
    setErr(null); setInfo(null);
    const f = fileRef.current?.files?.[0];
    if (!f) { setErr("Dosya seçin"); return; }
    const fd = new FormData(); fd.set("entity", entKey); fd.set("file", f); if (opts.target) fd.set("target", opts.target);
    startT(async () => {
      const r = await uploadFile(fd);
      if (!r.ok) { setErr(r.message); return; }
      setUp(r); setSheet(r.sheet); setHeader(r.header); setMapping(r.mapping); setStep(1);
      if (r.duplicateOf) setInfo(`Bu dosya daha önce ${r.duplicateOf} numaralı aktarımla yüklenmiş. Tekrar aktarım mevcut kayıtları güncelleyebilir; emin değilseniz önizlemeyi dikkatle inceleyin.`);
      else if (r.macroNote) setInfo("Makro içeren dosya: makrolar çalıştırılmadı, yalnız hücre değerleri okundu.");
    });
  };
  const changeSheetOrHeader = (name: string, h: number) => {
    setSheet(name); setHeader(h);
    if (up) startT(async () => setMapping(await remap(up.batchId, name, h)));
  };
  const applyTemplate = (name: string) => {
    const t = templates.find((x) => x.name === name); if (!t) return;
    const m: Record<string, string> = {};
    headers.forEach((h, i) => { const f = t.mapping[h]; if (f) m[String(i)] = f; });
    setMapping(m); setInfo(`“${name}” şablonu uygulandı — ${Object.keys(m).length} kolon eşleşti`);
  };
  const doPreview = () => {
    if (!up) return; setErr(null);
    startT(async () => {
      const r = await preview({ batchId: up.batchId, sheet: sh!.name, header, mapping, options: opts });
      if (!r.ok) { setErr(r.message); return; }
      setPv(r); setFilter(r.summary.error ? "ERROR" : ""); setStep(2);
    });
  };
  const watch = () => {
    if (!up) return;
    if (poll.current) clearInterval(poll.current);
    const tick = async () => {
      const r = await fetch(`/api/aktarim/${up.batchId}`, { cache: "no-store" }); if (!r.ok) return;
      const j = (await r.json()) as Status; setSt(j);
      if (!["RUNNING", "VALIDATED"].includes(j.status)) { if (poll.current) clearInterval(poll.current); router.refresh(); }
    };
    void tick(); poll.current = setInterval(tick, 800);
  };
  const doRun = (dry: boolean) => {
    if (!up) return; setErr(null);
    if (!dry && opts.mode === "ALL" && pv?.summary.error) { setErr("“Ya hep ya hiç” modunda hatalı satır varken aktarım yapılamaz. Hataları düzeltin veya “hatalıları ayır” modunu seçin."); return; }
    startT(async () => {
      const r = await start(up.batchId, dry);
      if (!r.ok) { setErr(r.message); return; }
      setInfo(r.message); setStep(3);
      if (!r.message.startsWith("Aktarım onaya")) watch(); else router.refresh();
    });
  };
  const reset = () => { setStep(0); setUp(null); setPv(null); setSt(null); setErr(null); setInfo(null); if (fileRef.current) fileRef.current.value = ""; };
  const backToMapping = () => { setStep(1); setSt(null); };

  if (!ent) return null;
  return (
    <div className="wizard">
      <ol className="steps" aria-label="Aktarım adımları">
        {STEPS.map((s, i) => <li key={s} className={i === step ? "on" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined}>{i + 1}. {s}</li>)}
      </ol>
      {err && <div className="alert bad" role="alert"><span>✕</span><div>{err}</div></div>}
      {info && <div className="alert info" role="status"><span>ℹ</span><div>{info}</div></div>}

      {step === 0 && (
        <div className="form">
          <label>Kayıt türü
            <select value={entKey} onChange={(e) => { setEntKey(e.target.value); router.replace(`/aktarim?varlik=${e.target.value}`, { scroll: false }); }}>
              {Object.entries(entities.reduce<Record<string, Ent[]>>((a, e) => ((a[e.group] ??= []).push(e), a), {})).map(([g, es]) => (
                <optgroup key={g} label={g}>{es.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}</optgroup>
              ))}
            </select>
          </label>
          <div className="muted small">{ent.description} · {ent.mode === "insert" ? "Yalnız yeni kayıt eklenir" : "Yeni kayıt eklenir, mevcut kayıt tekil anahtarla güncellenir"}{ent.needsApproval && " · Aktarım ikinci bir kişinin onayıyla çalışır"}</div>
          {ent.target && (
            <label>{ent.target}
              <select value={opts.target ?? ""} onChange={(e) => setOpts({ ...opts, target: e.target.value })}>
                {targets.map((t) => <option key={t.v} value={t.v} disabled={!t.editable}>{t.l}{t.editable ? "" : " (kilitli)"}</option>)}
              </select>
            </label>
          )}
          <label>Dosya (.xlsx, .xlsm, .csv — en fazla 25 MB, 20.000 satır)
            <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.csv,.txt" />
          </label>
          <div className="toolbar">
            <button className="btn orange" disabled={pending} onClick={doUpload}>{pending ? "Okunuyor…" : "Yükle ve kolonları eşleştir"}</button>
            <a className="btn secondary" href={`/api/aktarim/sablon/${ent.key}`} download>Boş şablon indir</a>
          </div>
        </div>
      )}

      {step === 1 && up && sh && (
        <div className="form">
          <div className="muted small">Aktarım <span className="mono">{up.no}</span> · {sh.rows} satır okundu</div>
          <div className="grid2">
            <label>Sayfa
              <select value={sh.name} onChange={(e) => changeSheetOrHeader(e.target.value, 0)}>{up.sheets.map((x) => <option key={x.name} value={x.name}>{x.name} ({x.rows} satır)</option>)}</select>
            </label>
            <label>Başlık satırı
              <select value={header} onChange={(e) => changeSheetOrHeader(sh.name, Number(e.target.value))}>{sh.preview.map((r, i) => <option key={i} value={i}>{i + 1}. satır — {r.filter(Boolean).slice(0, 3).join(" · ").slice(0, 60)}</option>)}</select>
            </label>
          </div>
          {templates.length > 0 && (
            <label>Kayıtlı eşleştirme şablonu
              <select defaultValue="" onChange={(e) => applyTemplate(e.target.value)}><option value="">— seçin —</option>{templates.map((t) => <option key={t.name} value={t.name}>{t.name}{t.profile ? ` (${t.profile})` : ""}</option>)}</select>
            </label>
          )}
          <div className="tablewrap"><table className="table">
            <thead><tr><th>Dosyadaki kolon</th><th>Örnek değer</th><th>PILOTIS alanı</th></tr></thead>
            <tbody>
              {headers.map((h, i) => (
                <tr key={i}>
                  <td><b>{h || <span className="muted">(başlıksız {i + 1})</span>}</b></td>
                  <td className="small muted">{sh.preview.slice(header + 1, header + 3).map((r) => r[i]).filter(Boolean).join(" · ").slice(0, 50)}</td>
                  <td>
                    <select aria-label={`${h} kolonunun alanı`} value={mapping[String(i)] ?? ""} onChange={(e) => setMapping({ ...mapping, [String(i)]: e.target.value })} className={dupTargets.includes(mapping[String(i)]) ? "invalid" : ""}>
                      <option value="">— aktarılmaz —</option>
                      {ent.fields.map((f) => <option key={f.key} value={f.key}>{f.header}{f.required ? " *" : ""}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {missing.length > 0 && <div className="alert warn"><span>⚠</span><div>Zorunlu alan eşleşmedi: {missing.map((f) => f.header).join(", ")}{ent.mode === "upsert" && " — yalnız güncelleme yapılacaksa bu alanlar boş kalabilir"}</div></div>}
          {dupTargets.length > 0 && <div className="alert bad"><span>✕</span><div>Aynı alana birden fazla kolon eşlendi: {dupTargets.map((k) => ent.fields.find((f) => f.key === k)?.header).join(", ")}</div></div>}
          <fieldset className="opts">
            <legend>Aktarım seçenekleri</legend>
            <div className="grid2">
              <label>Eşleştirme anahtarı
                <select value={opts.key} onChange={(e) => setOpts({ ...opts, key: e.target.value })}>{ent.keys.map((k) => <option key={k.field} value={k.field}>{k.label}</option>)}</select>
              </label>
              <label>Boş hücre
                <select value={opts.emptyCell} onChange={(e) => setOpts({ ...opts, emptyCell: e.target.value as Opts["emptyCell"] })}>
                  <option value="KEEP">Mevcut değeri koru</option><option value="CLEAR">Alanı temizle</option><option value="ERROR">Hata say</option>
                </select>
              </label>
              <label>Hata durumunda
                <select value={opts.mode} onChange={(e) => setOpts({ ...opts, mode: e.target.value as Opts["mode"] })}>
                  <option value="ALL">Ya hep ya hiç (tek işlem)</option><option value="SKIP_BAD">Hatalıları ayır, doğruları aktar</option>
                </select>
              </label>
              <label>Formüllü hücre
                <select value={opts.formulas} onChange={(e) => setOpts({ ...opts, formulas: e.target.value as Opts["formulas"] })}>
                  <option value="VALUE">Hesaplanmış değeri kullan</option><option value="ERROR">Hata say</option>
                </select>
              </label>
            </div>
          </fieldset>
          <details><summary>Bu eşleştirmeyi şablon olarak kaydet</summary>
            <div className="toolbar" style={{ marginTop: 8 }}>
              <input placeholder="Şablon adı (ör. ETA cari listesi)" value={tplName} onChange={(e) => setTplName(e.target.value)} aria-label="Şablon adı" />
              <button className="btn secondary" disabled={pending} onClick={() => startT(async () => { const r = await saveMapping({ entity: ent.key, name: tplName, profile: "", mapping, headers }); setInfo(r.message); setTemplates(await listMappings(ent.key)); })}>Şablonu kaydet</button>
            </div>
          </details>
          <div className="toolbar">
            <button className="btn secondary" onClick={reset}>Vazgeç</button>
            <button className="btn orange" disabled={pending || dupTargets.length > 0} onClick={doPreview}>{pending ? "Doğrulanıyor…" : "Doğrula ve önizle"}</button>
          </div>
        </div>
      )}

      {step === 2 && pv && (
        <div className="form">
          <div className="tiles">
            {(["INSERT", "UPDATE", "SKIP", "ERROR"] as const).map((a) => (
              <button key={a} className={`tile ${filter === a ? "on" : ""}`} onClick={() => setFilter(filter === a ? "" : a)} aria-pressed={filter === a}>
                <div className="muted small">{ACT[a][0]}</div><div className="big">{pv.summary[a.toLowerCase() as "insert"]}</div>
              </button>
            ))}
          </div>
          {pv.summary.groups != null && <div className="muted small">{pv.summary.total} satır → {pv.summary.groups} kayıt (aynı numaralı satırlar tek kayıtta birleşir)</div>}
          <div className="tablewrap" style={{ maxHeight: 420 }}><table className="table">
            <thead><tr><th>Satır</th><th>Sonuç</th><th>Anahtar</th><th>Değişiklik / sorun</th></tr></thead>
            <tbody>
              {pv.rows.filter((r) => !filter || r.action === filter).slice(0, 300).map((r) => (
                <tr key={r.rowNo}>
                  <td className="num">{r.rowNo}</td>
                  <td><span className={`badge ${ACT[r.action][1]}`}>{ACT[r.action][0]}</span></td>
                  <td className="mono small">{r.keyValue ?? "—"}</td>
                  <td className="small">
                    {r.errors.map((e, i) => <div key={i} style={{ color: "var(--bad)" }}>✕ {e}</div>)}
                    {r.warnings.map((e, i) => <div key={i} style={{ color: "var(--warn)" }}>⚠ {e}</div>)}
                    {r.action === "UPDATE" && r.changes.map((c, i) => <div key={i}><b>{ent.fields.find((f) => f.key === c.field)?.header ?? c.field}</b>: <s className="muted">{String(c.from || "∅")}</s> → {String(c.to || "∅")}</div>)}
                    {r.action === "INSERT" && <span className="muted">{Object.entries(r.data).filter(([, v]) => v !== "").slice(0, 4).map(([k, v]) => `${ent.fields.find((f) => f.key === k)?.header ?? k}: ${v}`).join(" · ")}</span>}
                    {r.reason && <span className="muted">{r.reason}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {pv.needsApproval && <div className="alert warn"><span>⚠</span><div>Bu aktarım {pv.approvers.join(" / ")} onayından sonra çalışır. Onaylayan kişi aktarımı hazırlayandan farklı olmalıdır.</div></div>}
          {pv.summary.error > 0 && opts.mode === "ALL" && <div className="alert bad"><span>✕</span><div>{pv.summary.error} hatalı satır var. “Ya hep ya hiç” modunda hiçbir satır aktarılmaz. Dosyayı düzeltip yeniden yükleyin veya “hatalıları ayır” modunu seçin.</div></div>}
          <div className="toolbar">
            <button className="btn secondary" onClick={backToMapping}>← Eşleştirmeye dön</button>
            <button className="btn secondary" disabled={pending} onClick={() => doRun(true)}>Kuru çalıştır (kaydetmeden dene)</button>
            <button className="btn orange" disabled={pending || pv.summary.insert + pv.summary.update === 0 || (opts.mode === "ALL" && pv.summary.error > 0)} onClick={() => doRun(false)}>
              {pv.needsApproval ? "Onaya gönder" : `Aktar (${pv.summary.insert} ekle, ${pv.summary.update} güncelle)`}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="form" aria-live="polite">
          {st ? (
            <>
              <div className="loadbar" style={{ ["--p" as string]: `${st.total ? Math.round((st.progress / st.total) * 100) : 0}%` }} role="progressbar" aria-valuenow={st.progress} aria-valuemax={st.total} />
              <div><b>{st.status === "RUNNING" ? `Çalışıyor… ${st.progress}/${st.total}` : st.status === "DONE" ? "Aktarım tamamlandı" : st.status === "DRY_RUN" ? "Kuru çalıştırma tamamlandı — hiçbir kayıt değiştirilmedi" : st.status === "FAILED" ? "Aktarım başarısız — hiçbir değişiklik kalıcı olmadı" : st.status}</b></div>
              {st.summary && <div className="muted">Eklenen {st.summary.insert ?? 0} · güncellenen {st.summary.update ?? 0} · atlanan {st.summary.skip ?? 0} · hatalı {st.summary.error ?? 0}</div>}
              {st.message && <div className="muted small">{st.message}</div>}
              {!["RUNNING", "VALIDATED"].includes(st.status) && (
                <div className="toolbar">
                  <a className="btn secondary" href={`/api/aktarim/${up!.batchId}/hata`} download>Satır satır sonuç raporu (Excel)</a>
                  {st.status === "DRY_RUN" && <button className="btn orange" onClick={() => doRun(false)} disabled={pending}>Şimdi gerçekten aktar</button>}
                  {st.status === "DRY_RUN" && <button className="btn secondary" onClick={backToMapping}>Eşleştirmeye dön</button>}
                  <button className="btn secondary" onClick={reset}>Yeni aktarım</button>
                </div>
              )}
            </>
          ) : <div className="toolbar"><button className="btn secondary" onClick={reset}>Yeni aktarım</button></div>}
        </div>
      )}
    </div>
  );
}
