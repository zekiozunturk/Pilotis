"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { THEMES, type UiPrefs, type PrefKey } from "@/lib/ui-prefs";
import { applyPrefs, readDevice, writeDevice } from "./ui-apply";
import { savePersonal } from "@/app/ayarlar/tema/actions";

/** Üst çubukta hızlı tema seçimi — sayfa yenilenmez; kişisel tercih olarak kaydedilir */
export function ThemeQuick({ prefs, personal, locked }: { prefs: UiPrefs; personal: Partial<UiPrefs>; locked: PrefKey[] }) {
  const [p, setP] = useState(prefs);
  const [, start] = useTransition();
  const set = (patch: Partial<UiPrefs>) => {
    // Bu alan için cihaz tercihi varsa kaldırılır (kişisel tercih geçerli olur)
    const d = readDevice() as Record<string, unknown>; for (const k of Object.keys(patch)) delete d[k]; writeDevice(Object.keys(d).length ? d : null);
    const merged = { ...p, ...patch };
    setP(merged); applyPrefs({ ...merged, ...(d as Partial<UiPrefs>) });
    start(async () => { await savePersonal({ ...personal, ...patch }); });
  };
  const t = THEMES.find((x) => x.id === p.theme)!;
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "var(--muted)" }}>
      <label htmlFor="q-theme" style={{ margin: 0, fontWeight: 400 }}>Tema:</label>
      <select id="q-theme" value={p.theme} disabled={locked.includes("theme")} onChange={(e) => set({ theme: e.target.value as UiPrefs["theme"] })} style={{ width: 170, minHeight: 30, padding: "3px 6px" }}>
        {THEMES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      {t.modes.length > 1 && !locked.includes("appearance") && (
        <button type="button" className="btn secondary" style={{ minHeight: 30, padding: "3px 9px" }} title="Açık / koyu / sistem" onClick={() => set({ appearance: p.appearance === "light" ? "dark" : p.appearance === "dark" ? "system" : "light" })}>
          {p.appearance === "light" ? "☀" : p.appearance === "dark" ? "☾" : "◐"}
        </button>
      )}
      <Link href="/ayarlar/tema" className="btn secondary" style={{ minHeight: 30, padding: "3px 9px" }} title="Tema Stüdyosu">🎨</Link>
    </div>
  );
}
