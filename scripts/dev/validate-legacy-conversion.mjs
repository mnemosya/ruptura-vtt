#!/usr/bin/env node
/**
 * Verificação de conversão de legado (Etapa 6) com CÓPIAS INEQUÍVOCAS de
 * registros reais (spell:energetica_bola_de_fogo, talent:pistoleiro,
 * item:colete_reforcado, item:ansiolitico — buscados uma vez via SQL e
 * embutidos aqui como snapshot estático; nenhuma escrita acontece nos
 * registros oficiais).
 *
 * Roda o código REAL (compilado por `tsc`, executado com `node` puro —
 * mesmo padrão do validador de schema da Etapa 5, sem `tsx`/esbuild):
 * `gerarRelatorioSpell/Item/Talento` e `validarPerdaConversaoLegado`.
 *
 * Uso: node scripts/dev/validate-legacy-conversion.mjs <dir-compilado>
 */

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
void __dirname;

const compiledDir = process.argv[2];
if (!compiledDir) {
  console.error("Uso: node validate-legacy-conversion.mjs <diretorio-compilado>");
  process.exit(1);
}

const { gerarRelatorioSpell, gerarRelatorioItem, gerarRelatorioTalento, caminhosPendentesDeConfirmacao } = require(path.join(compiledDir, "lib/contentSchema/legacyConversion.js"));
const { validarPerdaConversaoLegado } = require(path.join(compiledDir, "lib/contentSchema/legacyLossValidation.js"));

let falhas = 0;
function checar(nome, condicao, detalhe) {
  console.log(`${condicao ? "OK " : "FALHA"} — ${nome}`);
  if (!condicao) {
    if (detalhe) console.log(`  ✕ ${detalhe}`);
    falhas++;
  }
}

// ---------------------------------------------------------------------
// Amostra real 1: spell:energetica_bola_de_fogo (resistência + efeito
// preservado efeito_com_resistencia + dano/aplicar_condicao editáveis,
// referência "queimando" como string solta).
// ---------------------------------------------------------------------
const spellRaw = {
  id: "energetica_bola_de_fogo", nome: "Bola de fogo", slug: "energetica_bola_de_fogo",
  tags: ["magia", "arcano", "ofensiva", "dano", "igneo"], status: "published", versao: "1.3.0",
  vertente: "energetica", categoria: "magia", created_at: "2026-06-29", updated_at: "2026-06-29",
  estatisticas: {
    area: { tipo: "esfera", texto: "25 metros (esfera, 3 m de raio)" }, nivel: 3,
    alcance: { tipo: "distancia", texto: "25 metros", valor_m: 25 },
    duracao: { texto: "Instantâneo", sustentavel: false },
    custo_pa: 2, resolucao: "resistencia", custo_mana: null, tipo_magia: "ataque", usa_reacao: false,
  },
  vertente_label: "Energética", categoria_label: "Magia",
  descricao_curta: "desc curta", descricao_longa: "desc longa",
  payload_automacao: {
    efeitos: [
      { tipo: "efeito_com_resistencia", resistencia: { acoes: ["esquivar"], cd_formula: "5 + nivel_vertente" } },
      { dado: "3d6", tipo: "dano", sucesso: "metade", tipo_dano: "energetico", subtipo_dano: "igneo" },
      { tipo: "aplicar_condicao", condicao: "queimando" },
    ],
  },
};

const relatorioSpell = gerarRelatorioSpell("energetica_bola_de_fogo", spellRaw);
checar("1. Magia real: dano é conversão direta", relatorioSpell.efeitos.find((e) => e.tipoLegado === "dano")?.classificacao === "conversao_direta");
checar("2. Magia real: aplicar_condicao é conversão direta", relatorioSpell.efeitos.find((e) => e.tipoLegado === "aplicar_condicao")?.classificacao === "conversao_direta");
checar("3. Magia real: efeito_com_resistencia é somente_leitura (preservado)", relatorioSpell.efeitos.find((e) => e.tipoLegado === "efeito_com_resistencia")?.classificacao === "somente_leitura");
checar("4. Magia real: referência 'queimando' (string solta) normalizada e encontrada", relatorioSpell.referencias.some((r) => r.referencia.slug === "queimando" && r.referencia.tipoConteudo === "condition"));
checar("5. Magia real: não bloqueada (sem perda inevitável)", relatorioSpell.bloqueado === false);

// ---------------------------------------------------------------------
// Amostra real 2: talent:pistoleiro (3 níveis, TODOS os efeitos são
// bespoke/somente_leitura — nenhum é um dos 6 tipos do MVP).
// ---------------------------------------------------------------------
const talentoRaw = {
  id: "pistoleiro", nome: "Pistoleiro", slug: "pistoleiro", tags: ["ofensiva", "arma", "dano"],
  status: "published", versao: "1.0.0", created_at: "2026-06-25", updated_at: "2026-06-25",
  descricao_curta: "desc curta", descricao_longa: "desc longa",
  niveis: [
    {
      id: "pistoleiro_gatilho_quente", nome: "Gatilho Quente", slug: "pistoleiro_gatilho_quente", nivel: 1,
      status: "published", versao: "1.0.0", created_at: "2026-06-25", updated_at: "2026-06-25",
      requisitos: [], talento_id: "pistoleiro", tags: ["arma", "dano"], descricao_curta: "d", descricao_longa: "d",
      payload_automacao: { efeitos: [{ dado: "d8", tipo: "recurso_dado_gatilho", dados: 3, familia: "dado_gatilho", gatilho_resultado: 8 }] },
    },
    {
      id: "pistoleiro_bang_bang", nome: "Bang Bang", slug: "pistoleiro_bang_bang", nivel: 2,
      status: "published", versao: "1.0.0", created_at: "2026-06-25", updated_at: "2026-06-25",
      requisitos: [{ tipo: "talento_nivel_adquirido", nivel: 1, talento_id: "pistoleiro" }], talento_id: "pistoleiro",
      tags: [], descricao_curta: "d", descricao_longa: "d",
      payload_automacao: { efeitos: [{ tipo: "aumentar_recurso", valor: 1, familia: "recurso", recurso: "dado_gatilho" }, { tipo: "segundo_disparo", familia: "ataque_adicional", gatilho: "x", penalidade: -1 }] },
    },
    {
      id: "pistoleiro_showdown", nome: "Showdown", slug: "pistoleiro_showdown", nivel: 3,
      status: "published", versao: "1.0.0", created_at: "2026-06-25", updated_at: "2026-06-25",
      requisitos: [{ tipo: "talento_nivel_adquirido", nivel: 2, talento_id: "pistoleiro" }], talento_id: "pistoleiro",
      tags: [], descricao_curta: "d", descricao_longa: "d",
      payload_automacao: { efeitos: [{ tipo: "aumentar_recurso", valor: 1, familia: "recurso", recurso: "dado_gatilho" }, { tipo: "showdown", familia: "ataque_adicional", usos: 1, cadencia: "cena" }] },
    },
  ],
};

const relatorioTalento = gerarRelatorioTalento("pistoleiro", talentoRaw);
checar("6. Talento real: 3 níveis preservados no relatório (sem bloqueio por contagem)", !relatorioTalento.motivosBloqueio.some((m) => m.includes("deveria ter exatamente 3 níveis")));
checar("7. Talento real: todos os efeitos reais são somente_leitura (nenhum é MVP)", relatorioTalento.efeitos.every((e) => e.classificacao === "somente_leitura"));
checar("8. Talento real: efeitos preservados citam a família real (dado_gatilho/recurso/ataque_adicional)", relatorioTalento.efeitos.every((e) => ["dado_gatilho", "recurso", "ataque_adicional"].includes(e.familia)));
checar("9. Talento real: referência de requisito nível 2 encontrada", relatorioTalento.referencias.some((r) => r.referencia.slug === "pistoleiro"));

// ---------------------------------------------------------------------
// Amostra real 3: item:colete_reforcado (estatisticas preservado, campo
// desconhecido real "ocultavel", efeitos não-MVP "penalidade_pericia").
// ---------------------------------------------------------------------
const itemRaw = {
  id: "colete_reforcado", nome: "Colete reforçado", slug: "colete_reforcado",
  tags: ["armadura", "mit", "equipamento"], preco: 900, status: "published", versao: "1.2.0",
  subtipo: "pesada", raridade: "incomum", categoria: "armadura", ocultavel: "nao",
  created_at: "2026-06-29", updated_at: "2026-06-29",
  estatisticas: { regioes: ["tronco"], mit_base: 8, classe_porte: "pesada", tipo_protecao: "fisica", slots_runa_max: 3 },
  raridade_label: "Incomum", categoria_label: "Armadura", descricao_curta: "d", descricao_longa: "d",
  payload_automacao: {
    efeitos: [
      { tipo: "penalidade_pericia", valor: -1, alvo_tags: ["mobilidade"], condicao_aplicacao: "enquanto_equipada" },
      { tipo: "penalidade_pericia", valor: -1, alvo_tags: ["reflexos"], condicao_aplicacao: "enquanto_equipada" },
    ],
  },
};

const relatorioItem1 = gerarRelatorioItem("colete_reforcado", itemRaw);
checar("10. Item real: estatisticas continua marcado somente leitura (campo desconhecido)", relatorioItem1.camposDesconhecidos.some((c) => c.caminho === "estatisticas"));
checar("11. Item real: campo desconhecido real 'ocultavel' preservado com caminho original", relatorioItem1.camposDesconhecidos.some((c) => c.caminho === "ocultavel"));
checar("12. Item real: penalidade_pericia (não-MVP) é somente_leitura", relatorioItem1.efeitos.every((e) => e.classificacao === "somente_leitura"));

// ---------------------------------------------------------------------
// Amostra real 4: item:ansiolitico (efeito MVP real editável: cura 1d6 PE).
// ---------------------------------------------------------------------
const item2Raw = {
  id: "ansiolitico", nome: "Ansiolítico", slug: "ansiolitico", tags: ["cura", "equipamento"],
  preco: 100, status: "published", versao: "1.2.0", raridade: "comum", categoria: "farmacia",
  created_at: "2026-06-29", updated_at: "2026-06-29",
  estatisticas: { custo_pa: 1, cargas_max: 1 },
  raridade_label: "Comum", categoria_label: "Farmácia", descricao_curta: "d", descricao_longa: "d",
  payload_automacao: { efeitos: [{ dado: "1d6", tipo: "cura", recurso: "pe" }] },
};
const relatorioItem2 = gerarRelatorioItem("ansiolitico", item2Raw);
checar("13. Item real: cura 1d6 PE é conversão direta (efeito MVP editável)", relatorioItem2.efeitos[0]?.classificacao === "conversao_direta" && relatorioItem2.efeitos[0]?.editavel === true);
checar("14. Item real: nenhuma pendência de confirmação para este item simples", caminhosPendentesDeConfirmacao(relatorioItem2).length === 0);

// ---------------------------------------------------------------------
// Validação de perda: republicação que NÃO toca nada preservado passa;
// republicação que reescreve estatisticas ou derruba o efeito preservado é pega.
// ---------------------------------------------------------------------
const origemLegadoItem = {
  adapterId: "item", adapterVersion: "item.legacy.v1", classificacaoLegado: relatorioItem1.classificacaoGeral,
  decisoesConfirmadas: {}, camposSomenteLeitura: ["estatisticas"], camposDesconhecidos: ["ocultavel"],
  efeitosPreservados: relatorioItem1.efeitos.map((e) => `${e.id} (${e.tipoLegado}) — preservado`),
  avisos: [], convertidoEm: "2026-01-01T00:00:00.000Z", convertidoPor: "teste",
};

const corpoRepublicadoOk = JSON.parse(JSON.stringify(itemRaw));
corpoRepublicadoOk.nome = "Colete reforçado (editado)"; // mudança legítima, não toca preservado
checar("15. Perda: republicação segura não acusa perda", validarPerdaConversaoLegado("item", itemRaw, corpoRepublicadoOk, origemLegadoItem).length === 0);

const corpoRepublicadoRuim = JSON.parse(JSON.stringify(itemRaw));
corpoRepublicadoRuim.estatisticas = { mit_base: 999 }; // reescreve estatisticas — deveria ser pego
delete corpoRepublicadoRuim.ocultavel; // derruba campo desconhecido — deveria ser pego
const errosDePerda = validarPerdaConversaoLegado("item", itemRaw, corpoRepublicadoRuim, origemLegadoItem);
checar("16. Perda: reescrita de estatisticas é detectada", errosDePerda.some((e) => e.includes("estatisticas")));
checar("17. Perda: campo desconhecido não reinserido é detectado", errosDePerda.some((e) => e.includes("ocultavel")));

console.log(`\n${falhas === 0 ? "=== TODOS OS CASOS PASSARAM ===" : `=== ${falhas} FALHA(S) ===`}`);
process.exit(falhas === 0 ? 0 : 1);
