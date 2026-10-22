import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/session";
import { fmtDT } from "@/lib/format";
import { KIND_LABEL, type Kind } from "@/lib/notify";
import { markAllRead } from "./actions";

export const metadata = { title: "Bildirimler" };
export const dynamic = "force-dynamic";
export default async function Bildirimler() {
  const u = await requireUser();
  const rows = await db.select().from(s.notifications).where(eq(s.notifications.userId, u.id)).orderBy(desc(s.notifications.createdAt)).limit(100);
  const unread = rows.filter((r) => !r.readAt).length;
  return (
    <>
      <div className="pagehead">
        <div><h1>Bildirimler</h1><div className="muted">{unread} okunmamış · E-posta ve SMS tercihlerinizi <Link href="/hesabim#bildirim">Hesabım</Link> sayfasından değiştirebilirsiniz.</div></div>
        {unread > 0 && <form action={markAllRead}><button className="btn secondary">Tümünü okundu işaretle</button></form>}
      </div>
      {rows.length === 0 ? <div className="empty">Henüz bildirim yok. Talep, onay, görev ve iş tamamlama olayları burada görünür.</div> : (
        <ul className="notif-list">
          {rows.map((n) => (
            <li key={n.id} className={n.readAt ? "" : "unread"}>
              <a href={`/bildirimler/ac/${n.id}`}>
                <span className="badge grey">{KIND_LABEL[n.kind as Kind] ?? n.kind}</span>
                <b>{n.title}</b>
                {n.body && <span className="b">{n.body}</span>}
                <span className="t">{fmtDT(n.createdAt)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
