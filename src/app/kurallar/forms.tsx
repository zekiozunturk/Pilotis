"use client";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import type { ActionState } from "@/app/actions";
import { setRuleStatus } from "../tarife/actions";

const NEXT: Record<string, [string, string] | undefined> = {
  DRAFT: ["SOURCE_FOUND", "Kaynak bulundu"], SOURCE_FOUND: ["EXPERT_REVIEW", "Uzman kontrolüne"], EXPERT_REVIEW: ["APPROVED", "Onayla"], APPROVED: ["IN_FORCE", "Yürürlüğe al"],
};

export function RuleStep({ code, status, basis }: { code: string; status: string; basis: string }) {
  const n = NEXT[status];
  if (!n) return null;
  return (
    <details>
      <summary style={{ cursor: "pointer", fontSize: 12 }}>{n[1]} →</summary>
      <ActionForm action={setRuleStatus as unknown as (s: ActionState, f: FormData) => Promise<ActionState>} hidden={{ code, to: n[0] }}>
        <div style={{ display: "grid", gap: 4, marginTop: 4, minWidth: 220 }}>
          {n[0] === "SOURCE_FOUND" && <input name="basis" defaultValue={basis} placeholder="Belge, madde *" required />}
          {(n[0] === "EXPERT_REVIEW" || n[0] === "APPROVED") && <input name="checker" placeholder="Kontrol eden kişi *" required />}
          <SubmitButton className="btn secondary">{n[1]}</SubmitButton>
        </div>
      </ActionForm>
    </details>
  );
}
