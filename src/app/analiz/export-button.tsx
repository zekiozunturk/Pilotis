"use client";
import { useSearchParams } from "next/navigation";
/** Görünen kapsamla aynı filtre ve yetkiyle Excel çıktısı */
export function ExportButton({ tab, label = "Excel'e aktar" }: { tab: string; label?: string }) {
  const sp = useSearchParams();
  const u = new URLSearchParams(sp.toString()); u.set("tab", tab);
  return <a className="btn secondary" href={`/api/analiz/export?${u.toString()}`} download>{label}</a>;
}
