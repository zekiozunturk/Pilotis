"use client";
import { htmlAttrs, type UiPrefs } from "@/lib/ui-prefs";
/** Tercihleri sayfayı yenilemeden uygular — açık formlar, filtreler ve kaydırma konumu korunur */
export function applyPrefs(p: UiPrefs) {
  const r = document.documentElement;
  const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const { attrs, style } = htmlAttrs(p, dark);
  for (const a of ["data-radius", "data-map"]) if (!(a in attrs)) r.removeAttribute(a);
  for (const [k, v] of Object.entries(attrs)) r.setAttribute(k, v);
  r.style.removeProperty("--orange"); r.style.removeProperty("--accent-fg");
  for (const [k, v] of Object.entries(style)) r.style.setProperty(k, v);
}
export const DEVICE_KEY = "pilotis.ui.device";
export function readDevice(): Partial<UiPrefs> { try { return JSON.parse(localStorage.getItem(DEVICE_KEY) ?? "{}"); } catch { return {}; } }
export function writeDevice(p: Partial<UiPrefs> | null) { try { if (p) localStorage.setItem(DEVICE_KEY, JSON.stringify(p)); else localStorage.removeItem(DEVICE_KEY); } catch { /* */ } }
