/** Converte blocos textuais extraídos do Notion em Markdown para leitura no VTT. */
export type Trecho = { texto: string; negrito?: boolean; italico?: boolean; codigo?: boolean; riscado?: boolean; link?: string };
export type BlocoNotion = { tipo: string; texto?: string; trechos?: Trecho[]; celulas?: Trecho[][]; filhos?: BlocoNotion[] };

function renderizarTrechos(trechos: Trecho[] | undefined, fallback: string | undefined): string {
  if (!trechos?.length) return fallback ?? "";
  return trechos.map((t) => {
    let s = t.texto;
    if (t.codigo) s = `\`${s}\``;
    if (t.negrito) s = `**${s}**`;
    if (t.italico) s = `*${s}*`;
    if (t.riscado) s = `~~${s}~~`;
    if (t.link) s = `[${s}](${t.link})`;
    return s;
  }).join("");
}

function renderizarBloco(bloco: BlocoNotion): string {
  const texto = renderizarTrechos(bloco.trechos, bloco.texto).trim();
  const filhos = (bloco.filhos ?? []).map(renderizarBloco).filter(Boolean).join("\n\n");
  if (bloco.tipo === "divider") return "---";
  if (bloco.tipo === "image") return texto || "[Imagem no Notion]";
  if (bloco.tipo === "table") {
    const linhas = (bloco.filhos ?? []).filter((b) => b.tipo === "table_row").map((b) => (b.celulas ?? []).map((c) => renderizarTrechos(c, "").replaceAll("|", "\\|")));
    if (!linhas.length) return "";
    return [
      `| ${linhas[0].join(" | ")} |`,
      `| ${linhas[0].map(() => "---").join(" | ")} |`,
      ...linhas.slice(1).map((l) => `| ${l.join(" | ")} |`),
    ].join("\n");
  }
  if (bloco.tipo === "table_row") return "";
  if (bloco.tipo.startsWith("heading_")) return `${"#".repeat(Number(bloco.tipo.at(-1)) || 4)} ${texto}`;
  if (bloco.tipo === "quote") return `> ${texto}${filhos ? `\n> ${filhos.replaceAll("\n", "\n> ")}` : ""}`;
  if (bloco.tipo === "bulleted_list_item") return `- ${texto}${filhos ? `\n  ${filhos.replaceAll("\n", "\n  ")}` : ""}`;
  if (bloco.tipo === "numbered_list_item") return `1. ${texto}${filhos ? `\n   ${filhos.replaceAll("\n", "\n   ")}` : ""}`;
  if (bloco.tipo === "toggle") return `### ${texto}${filhos ? `\n\n${filhos}` : ""}`;
  return [texto, filhos].filter(Boolean).join("\n\n");
}

export function renderizarBlocos(blocos: BlocoNotion[]): string {
  return blocos.map(renderizarBloco).filter(Boolean).join("\n\n").trim();
}
