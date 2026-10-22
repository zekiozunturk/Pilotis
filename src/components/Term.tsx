import { getTerms } from "@/lib/terms";
import { TermSup } from "./TermSup";

/** Sunucu bileşeni: <Term n={5}>Palamar</Term> → Palamar⁵ (sözlükten tanımla) */
export async function Term({ n, children }: { n: number; children?: React.ReactNode }) {
  const t = (await getTerms()).get(n);
  if (!t) return <>{children}</>;
  return <TermSup n={n} title={t.tr} definition={t.definition}>{children ?? t.tr}</TermSup>;
}
