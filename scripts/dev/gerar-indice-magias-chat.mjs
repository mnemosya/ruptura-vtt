import { readFileSync, writeFileSync } from "node:fs";

// Reserva visual do autocomplete: só entra se uma resposta antiga da
// Server Action chegar sem os custos publicados. O servidor é a fonte
// principal; este índice pequeno impede que o menu vire uma lista de pontos.
const origem = new URL("../../content/v12/db_magias_v1_2_vertentes_rascunho.json", import.meta.url);
const origemEscolhas = new URL("../../content/v12/escolhas_conjuracao_v1_2.json", import.meta.url);
const destino = new URL("../../src/lib/character/indiceMagiasChat.json", import.meta.url);
const magias = JSON.parse(readFileSync(origem, "utf8")).magias;
const escolhas = JSON.parse(readFileSync(origemEscolhas, "utf8")).magias;
const indice = Object.fromEntries(magias.map((m) => [m.slug, {
  nome: m.nome,
  vertente: m.vertente,
  pa: m.conjuracao?.tipo === "pa" ? m.conjuracao.pa : 0,
  mana: m.custo_mana?.tipo === "fixo" ? m.custo_mana.valor : null,
  manaTexto: m.custo_mana?.texto ?? null,
  conjuracao: m.conjuracao?.tipo !== "pa" ? m.conjuracao?.texto ?? null : null,
  etapas: [
    ...(m.escolha_mana?.tipo === "nivel_com_tabela" ? [{ rotulo: "NÍVEL DA MAGIA", opcoes: m.escolha_mana.opcoes.map((o) => ({ codigo: `nivel ${o.nivel}`, nome: `Nível ${o.nivel}`, detalhe: `${o.mana} Mana`, custo: { mana: `${o.mana} Mana` } })) }] : []),
    ...(["valor_no_intervalo", "investimento_livre"].includes(m.escolha_mana?.tipo) ? [{ rotulo: "MANA INVESTIDA", opcoes: [{ codigo: `mana ${m.escolha_mana.min ?? 1}`, nome: `${m.escolha_mana.min ?? 1} Mana` }], valorLivre: { prefixo: "mana", min: m.escolha_mana.min ?? 1, max: m.escolha_mana.max ?? null } }] : []),
    ...(escolhas[m.slug] ?? []).map((e) => ({ rotulo: `ESCOLHA ${e.rotulo.toLocaleUpperCase("pt-BR")}`, opcoes: e.opcoes.map((o) => ({ codigo: `${e.id}=${o.id}`, nome: o.nome, detalhe: o.resumo })) })),
  ],
}]));
writeFileSync(destino, `${JSON.stringify(indice, null, 2)}\n`);
