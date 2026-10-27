"use client";
/** Oturum nabzı: sayfa değişimi ve sekme görünürken geçen süre sunucuya bildirilir (admin oturum kayıtları için). */
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export function ActivityBeacon() {
  const path = usePathname();
  const since = useRef(Date.now());
  const visible = useRef(true);
  const send = (nav: boolean, beacon = false) => {
    const active = visible.current ? Math.round((Date.now() - since.current) / 1000) : 0;
    since.current = Date.now();
    const body = JSON.stringify({ path: location.pathname, active, nav });
    try {
      if (beacon && navigator.sendBeacon) navigator.sendBeacon("/api/oturum/nabiz", new Blob([body], { type: "application/json" }));
      else void fetch("/api/oturum/nabiz", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
    } catch { /* yok say */ }
  };
  useEffect(() => { send(true); }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    visible.current = document.visibilityState === "visible";
    const iv = setInterval(() => { if (visible.current) send(false); }, 60_000);
    const vis = () => { if (document.visibilityState === "hidden") { send(false, true); visible.current = false; } else { visible.current = true; since.current = Date.now(); } };
    const hide = () => send(false, true);
    document.addEventListener("visibilitychange", vis); window.addEventListener("pagehide", hide);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", vis); window.removeEventListener("pagehide", hide); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
