"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
/** Mobilde sol menüyü aç/kapat — sayfa değişince kapanır */
export function MenuToggle() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => { document.querySelector(".side")?.classList.toggle("open", open); }, [open]);
  return <button type="button" className="menu-toggle" aria-expanded={open} aria-controls="ana-menu" onClick={() => setOpen((x) => !x)}>{open ? "✕ Kapat" : "☰ Menü"}</button>;
}
