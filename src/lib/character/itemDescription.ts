type ItemText = { descricao_longa?: string; descricao_curta?: string };
const key = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const canonicalField = (label: string) => {
  const k = key(label);
  const aliases: Record<string, string> = {
    valor: "preco", preco_a: "preco", espacos_item: "espacos", espacos_por_item: "espacos",
    regiao: "cobertura", regioes: "cobertura", resistencia: "protecao",
    mitigacao_mit: "mit", durabilidade_pd: "pd", pa_para_uso: "custo", custo_pa: "custo",
  };
  return aliases[k] ?? k;
};

/** Texto editorial completo, sem apêndice da importação nem campos já desenhados no card. */
export function itemDescription(item: ItemText | undefined, displayedFields: string[] = []): string {
  if (!item) return "";
  const fields = new Set(["preco", "espacos", "raridade", ...displayedFields.map(canonicalField)]);
  const clean = (text: string) => {
    const editorial = text.replace(/\r\n?/g, "\n").split(/^\s*Dados da lista de mercadorias:\s*$/im)[0];
    const lines = editorial.split("\n");
    let first = true;
    return lines.filter(line => {
      const plain = line.replace(/\*\*/g, "").trim();
      if (!plain) return true;
      // O cabeçalho importado repete raridade e, às vezes, o tipo do item.
      if (first) {
        first = false;
        if (/^\*[^*]*(?:comum|incomum|raro|rara|lend[aá]rio|lend[aá]ria)\*$/i.test(plain)) return false;
      }
      if (/^\[Imagem no Notion\]$/i.test(plain)) return false;
      const field = /^(?:[-*•]\s+)?([^:]{1,60}):/.exec(plain);
      return !field || !fields.has(canonicalField(field[1]));
    }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  };
  return clean(item.descricao_longa?.trim() || item.descricao_curta || "") || clean(item.descricao_curta || "");
}
