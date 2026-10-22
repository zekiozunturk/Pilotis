export default function Loading() {
  return (
    <div role="status" aria-live="polite" style={{ padding: "8px 0" }}>
      <div style={{ height: 3, background: "var(--navy-100)", borderRadius: 2, overflow: "hidden", marginBottom: 14 }}><div className="loadbar" /></div>
      <div className="muted" style={{ fontSize: 13 }}>Yükleniyor… Veriler hazırlanıyor.</div>
    </div>
  );
}
