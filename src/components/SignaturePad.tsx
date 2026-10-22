"use client";
import { useEffect, useRef, useState } from "react";

/** Ekrana çizilen imza — güvence düzeyi "Çizilmiş imza"; güvenli e-imza yerine geçmez (R-016). */
export function SignaturePad({ name = "signature" }: { name?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState("");
  const drawing = useRef(false);
  useEffect(() => {
    const c = ref.current!; const ctx = c.getContext("2d")!;
    ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.strokeStyle = "#0b2d6b";
    const pos = (e: PointerEvent) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * (c.width / r.width), (e.clientY - r.top) * (c.height / r.height)]; };
    const down = (e: PointerEvent) => { drawing.current = true; c.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); };
    const move = (e: PointerEvent) => { if (!drawing.current) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); };
    const up = () => { if (!drawing.current) return; drawing.current = false; setData(c.toDataURL("image/png")); };
    c.addEventListener("pointerdown", down); c.addEventListener("pointermove", move); c.addEventListener("pointerup", up);
    return () => { c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", up); };
  }, []);
  const clear = () => { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setData(""); };
  return (
    <div>
      <label>İmza (isteğe bağlı — çizilmiş imza)</label>
      <canvas ref={ref} width={600} height={140} style={{ width: "100%", height: 110, border: "1px dashed var(--border)", borderRadius: 8, background: "#fff", touchAction: "none" }} aria-label="İmza alanı" />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }} className="muted">
        <span>{data ? "İmza alındı" : "Parmak veya fare ile imzalayın"}</span>
        <button type="button" className="btn secondary" style={{ minHeight: 26, padding: "2px 8px", fontSize: 11.5 }} onClick={clear}>Temizle</button>
      </div>
      <input type="hidden" name={name} value={data} />
    </div>
  );
}
