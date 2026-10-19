export type Bloco =
  | { tipo: "titulo"; nivel: number; texto: string }
  | { tipo: "divisor" }
  | { tipo: "p"; linhas: string[] }
  | { tipo: "lista"; ordenada: boolean; itens: { nivel: number; texto: string }[] }
  | { tipo: "tabela"; linhas: string[][] }
  | { tipo: "citacao"; linhas: string[] };

export const ITEM = /^(\s*)([-*•]|\d+[.)])\s+(.*)$/;
const CELULAS = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
const SEPARADOR_TABELA = /^\s*\|?\s*:?-{2,}/;

export function emBlocos(texto: string): Bloco[] {
  const blocos: Bloco[] = [];
  for (const linha of texto.replace(/\r\n?/g, "\n").split("\n")) {
    const ultimo = blocos[blocos.length - 1];
    if (!linha.trim()) {
      // Linha em branco fecha parágrafo/citação; listas e tabelas continuam se o próximo for do mesmo tipo.
      if (ultimo?.tipo === "p" || ultimo?.tipo === "citacao") blocos.push({ tipo: "p", linhas: [] });
      continue;
    }
    const titulo = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(linha);
    const textoTitulo = linha.trim();
    // Os livros legados usam títulos isolados em caixa alta, sem Markdown.
    const tituloLegado = textoTitulo.length <= 90 && /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ\s/–—:()-]+$/.test(textoTitulo);
    if (titulo || tituloLegado) {
      blocos.push({ tipo: "titulo", nivel: titulo ? Math.min(6, titulo[1].length + 2) : 4, texto: titulo ? titulo[2] : textoTitulo.replace(/:$/, "") });
      continue;
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(linha)) {
      blocos.push({ tipo: "divisor" });
      continue;
    }
    const item = ITEM.exec(linha);
    if (item) {
      const ordenada = /\d/.test(item[2]);
      const nivel = Math.floor(item[1].replace(/\t/g, "  ").length / 2);
      if (ultimo?.tipo === "lista" && (ultimo.ordenada === ordenada || nivel > 0)) ultimo.itens.push({ nivel, texto: item[3] });
      else blocos.push({ tipo: "lista", ordenada, itens: [{ nivel, texto: item[3] }] });
      continue;
    }
    if (linha.trim().startsWith("|")) {
      if (SEPARADOR_TABELA.test(linha) && !/[^\s|:-]/.test(linha)) continue;
      if (ultimo?.tipo === "tabela") ultimo.linhas.push(CELULAS(linha));
      else blocos.push({ tipo: "tabela", linhas: [CELULAS(linha)] });
      continue;
    }
    if (linha.startsWith(">")) {
      const t = linha.replace(/^>\s?/, "");
      if (ultimo?.tipo === "citacao") ultimo.linhas.push(t);
      else blocos.push({ tipo: "citacao", linhas: [t] });
      continue;
    }
    // Linha recuada logo depois de um item continua o item.
    if (ultimo?.tipo === "lista" && /^\s+/.test(linha)) {
      ultimo.itens[ultimo.itens.length - 1].texto += ` ${linha.trim()}`;
      continue;
    }
    if (ultimo?.tipo === "p") ultimo.linhas.push(linha);
    else blocos.push({ tipo: "p", linhas: [linha] });
  }
  return blocos.filter((b) => (b.tipo === "p" ? b.linhas.length > 0 : true));
}
