/** Basit sözleşme işaretlemesi: "## " başlık, "- " madde, boş satır paragraf */
export function ContractText({ body }: { body: string }) {
  const blocks = body.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="contract">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        const out: React.ReactNode[] = [];
        let list: string[] = [];
        const flush = () => { if (list.length) { out.push(<ul key={`l${out.length}`}>{list.map((x, j) => <li key={j}>{x}</li>)}</ul>); list = []; } };
        for (const l of lines) {
          if (l.startsWith("## ")) { flush(); out.push(<h3 key={`h${out.length}`}>{l.slice(3)}</h3>); }
          else if (l.startsWith("- ")) list.push(l.slice(2));
          else { flush(); if (l.trim()) out.push(<p key={`p${out.length}`}>{l}</p>); }
        }
        flush();
        return <div key={i}>{out}</div>;
      })}
    </div>
  );
}
