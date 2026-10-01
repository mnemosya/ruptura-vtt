#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const path = "content/db_condicoes_normalizado_v1_5.json";
const db = JSON.parse(readFileSync(path, "utf8"));
const bySlug = new Map(db.condicoes.map((condition) => [condition.slug, condition]));
const update = (slug, patch) => Object.assign(bySlug.get(slug), patch);
const effect = (slug, efeitos, observacoes = []) => {
  const condition = bySlug.get(slug);
  condition.payload_automacao = { efeitos, ...(observacoes.length ? { observacoes } : {}) };
};

db._meta = {
  ...db._meta,
  fonte: "RUPTURA v1.2 — capítulo 22. CONDIÇÕES (Notion, 01/10/2026)",
  total_registros: 18,
  revisao: "RUPTURA v1.2: 18 condições; níveis cumulativos persistentes; Oculto incluído; cura reduz Contundido/Sangrando e não remove Envenenado.",
  observacoes: [
    "Condições cumulativas usam nivel_maximo e efeitos por nível.",
    "Níveis substituem os efeitos anteriores; abaixo de 1 a condição termina.",
    "Oculto é relativo ao observador; a relação fica registrada no texto até o VTT possuir percepção por criatura.",
  ],
};

for (const condition of db.condicoes) {
  condition.versao = "1.2.0";
  condition.updated_at = "2026-10-01";
  delete condition.nivel_maximo;
}

update("cego", {
  descricao_curta: "Falha em testes de visão; ofensivas contra o alvo recebem +2; ofensivas e defensivas visuais sofrem –2.",
  descricao_longa: "Falha automaticamente em testes que dependam de visão. Ações ofensivas contra você recebem +2 de vantagem, e suas ações ofensivas e defensivas que dependam de visão sofrem –2 de desvantagem. Novas aplicações renovam a duração.",
});
effect("cego", [
  { tipo: "falha_automatica", alvo_tags: ["visao"] },
  { tipo: "modificador_recebido", valor: 2, alvo_tags: ["ofensiva"], quando: "acoes_ofensivas_contra_o_alvo" },
  { tipo: "modificador", valor: -2, alvo_tags: ["ofensiva", "defensiva"] },
]);

update("contundido", {
  nivel_maximo: 2,
  descricao_curta: "Nível 1: –1 em Luta, Mobilidade e Reflexos; nível 2: –2. Cura de PV reduz 1 nível.",
  descricao_longa: "Pode alcançar 2 níveis. Nível 1: –1 de desvantagem em Luta, Mobilidade e Reflexos. Nível 2: –2. Nova aplicação no nível 2 fratura um membro. Recuperar ao menos 1 PV reduz a condição em 1 nível; a fratura permanece.",
  remove_por: [{ tipo: "recuperar_pv", minimo_pv: 1, reduzir_niveis: 1 }],
});
effect("contundido", [
  { tipo: "modificador", valor_por_nivel: { "1": -1, "2": -2 }, alvo_tags: ["luta", "mobilidade", "reflexos"] },
  { tipo: "reduzir_ao_recuperar_pv", minimo_pv: 1, niveis: 1 },
], ["Aplicação além do nível 2 causa fratura; a escolha do membro exige interface própria."]);

update("envenenado", {
  nivel_maximo: 3,
  descricao_curta: "–1 PA; Vigor CD 7 no fim da rodada ou dano tóxico de 1d4/1d6/1d8 conforme o nível.",
  descricao_longa: "Pode alcançar 3 níveis. Possui 1 PA a menos. No fim da rodada, Vigor CD 7; falha causa 1d4, 1d6 ou 1d8 de dano tóxico conforme o nível, ignorando MIT. Antídoto apropriado encerra a condição.",
  remove_por: [],
});
effect("envenenado", [
  { tipo: "reduzir_pa", valor: 1, escopo: "rodada" },
  { tipo: "teste_fim_de_rodada", resistencia: { pericia: "vigor", cd: 7 }, falha: { dano_por_nivel: { "1": "1d4", "2": "1d6", "3": "1d8" }, tipo_dano: "toxico", ignora_mit: true } },
]);

update("lento", {
  nivel_maximo: 2,
  descricao_curta: "Nível 1: deslocamento à metade e –1 em Mobilidade/Reflexos; nível 2: deslocamento 0 e –2.",
  descricao_longa: "Pode alcançar 2 níveis. Nível 1 reduz o deslocamento à metade e impõe –1 em Mobilidade e Reflexos. Nível 2 torna o deslocamento total 0 e aumenta a penalidade para –2. Não impede ações ofensivas ou defensivas.",
});
effect("lento", [
  { tipo: "deslocamento_por_nivel", valor_por_nivel: { "1": 0.5, "2": 0 }, operacao: "multiplicar_ou_definir" },
  { tipo: "modificador", valor_por_nivel: { "1": -1, "2": -2 }, alvo_tags: ["reflexos", "mobilidade"] },
]);

update("ofuscado", {
  nivel_maximo: 2,
  descricao_curta: "–1/–2 em testes visuais. Nova aplicação no nível 2 causa Cego até o fim do próximo turno.",
  descricao_longa: "Pode alcançar 2 níveis. Sofre –1 ou –2 em testes que dependam de visão, incluindo ações ofensivas e defensivas. Nova aplicação no nível 2 causa Cego até o fim do próximo turno e depois retorna a Ofuscado 2.",
});
effect("ofuscado", [
  { tipo: "modificador", valor_por_nivel: { "1": -1, "2": -2 }, alvo_tags: ["visao"] },
  { tipo: "modificador", valor_por_nivel: { "1": -1, "2": -2 }, alvo_tags: ["ofensiva", "defensiva"], quando: "dependem_de_visao" },
], ["Overflow no nível 2 aplica Cego temporário até o fim do próximo turno."]);

update("queimando", {
  nivel_maximo: 3,
  descricao_curta: "No fim da rodada sofre 1d6/1d8/1d12 ígneo. Interagir 1 PA reduz 1 nível.",
  descricao_longa: "Pode alcançar 3 níveis. No fim da rodada sofre 1d6, 1d8 ou 1d12 de dano ígneo conforme o nível, reduzido pela MIT da região atingida ou do Tronco. Interagir 1 PA reduz 1 nível; submersão ou meio apropriado encerra.",
  acoes_habilitadas: [{ acao: "apagar_fogo", base_acao: "interagir", custo_pa: 1, reduzir_niveis: 1 }],
});
effect("queimando", [
  { tipo: "dano_fim_de_rodada", dano_por_nivel: { "1": "1d6", "2": "1d8", "3": "1d12" }, tipo_dano: "igneo", aplica_mit: true, regiao_fallback: "tronco" },
  { tipo: "habilitar_acao", acao: "apagar_fogo", base_acao: "interagir", custo_pa: 1, reduzir_niveis: 1 },
]);

update("sangrando", {
  nivel_maximo: 3,
  descricao_curta: "No fim da rodada sofre 1d6/1d8/1d12 físico e aumenta 1 nível. Cura reduz 1 nível.",
  descricao_longa: "Pode alcançar 3 níveis. No fim da rodada sofre 1d6, 1d8 ou 1d12 de dano físico conforme o nível, ignorando MIT, e aumenta 1 nível a partir da rodada seguinte à aplicação. Interagir 1 PA contém o agravamento naquela rodada. Recuperar ao menos 1 PV reduz 1 nível.",
  remove_por: [{ tipo: "recuperar_pv", minimo_pv: 1, reduzir_niveis: 1 }],
  acoes_habilitadas: [{ acao: "conter_sangramento", base_acao: "interagir", custo_pa: 1 }],
});
effect("sangrando", [
  { tipo: "dano_fim_de_rodada", dano_por_nivel: { "1": "1d6", "2": "1d8", "3": "1d12" }, tipo_dano: "fisico", ignora_mit: true },
  { tipo: "agravar_fim_de_rodada", niveis: 1, inicia_na_rodada_seguinte: true, impedido_por: "conter_sangramento" },
  { tipo: "reduzir_ao_recuperar_pv", minimo_pv: 1, niveis: 1 },
  { tipo: "habilitar_acao", acao: "conter_sangramento", base_acao: "interagir", custo_pa: 1 },
]);

update("sufocando", {
  descricao_curta: "–1 em Corpo e –1 PA; Vigor CD 6 crescente no fim da rodada. Falhas causam inconsciência e depois morte.",
  descricao_longa: "Após 5 + Vigor rodadas sem respirar, fica Sufocando. Sofre –1 em Corpo e possui 1 PA a menos. No fim da rodada testa Vigor, começando em CD 6 e aumentando 1 a cada teste. Falha causa Inconsciente; nova falha enquanto Inconsciente causa morte. Voltar a respirar encerra imediatamente.",
});
effect("sufocando", [
  { tipo: "modificador", valor: -1, alvo_tags: ["corpo"] },
  { tipo: "reduzir_pa", valor: 1, escopo: "rodada" },
  { tipo: "teste_fim_de_rodada_progressivo", resistencia: { pericia: "vigor", cd_inicial: 6, incremento: 1 }, falha: { aplicar_condicao: "inconsciente", se_ja_inconsciente: "morte" } },
]);

effect("insaturado", [
  { tipo: "teste_apos_exposicao", apos_rodadas: 1, cadencia: "cena", resistencia: { pericia: "vigor", cd: 7 }, falha: { aplicar_condicao: "lento", duracao: "enquanto_na_area" } },
  { tipo: "alterar_custo_mana", valor: 1, operacao: "somar", minimo: 1 },
]);
effect("saturado", [
  { tipo: "teste_apos_exposicao", apos_rodadas: 1, cadencia: "cena", resistencia: { pericia: "vigor", cd: 7 }, falha: { aplicar_condicao: "envenenado", nivel: 1 } },
  { tipo: "teste_fim_de_rodada_para_remover_condicao", condicao: "envenenado", resistencia: { pericia: "vigor", cd: 7 } },
  { tipo: "alterar_custo_mana", valor: -1, operacao: "somar", minimo: 1 },
]);

if (!bySlug.has("oculto")) {
  db.condicoes.splice(db.condicoes.findIndex((c) => c.slug === "queimando"), 0, {
    id: "oculto", slug: "oculto", nome: "Oculto", categoria: "condicao", categoria_label: "Condição",
    descricao_curta: "Localização desconhecida para certas criaturas; primeira ofensiva recebe +1 e revela sua posição.",
    descricao_longa: "Sua localização não é conhecida pelas criaturas das quais está escondido. Elas não podem escolhê-lo como alvo de ações visuais. Sua primeira ação ofensiva contra quem não saiba onde você está recebe +1 de vantagem e encerra Oculto para essa criatura. É uma condição relativa por observador.",
    tags: ["controle", "relacional", "visao"], duracao_padrao: null, remove_por: [], acoes_habilitadas: [],
    payload_automacao: { efeitos: [
      { tipo: "bloquear_alvo_visual", relativo_ao_observador: true },
      { tipo: "modificador", valor: 1, alvo_tags: ["ofensiva"], quando: "primeira_acao_contra_observador_que_nao_localizou" },
    ], observacoes: ["A relação por observador exige estado de percepção no VTT e permanece informativa nesta etapa."] },
    status: "published", versao: "1.2.0", created_at: "2026-10-01", updated_at: "2026-10-01",
  });
}

db.condicoes = [...bySlug.values()].filter((c) => c.slug !== "oculto");
const queimandoIndex = db.condicoes.findIndex((c) => c.slug === "queimando");
const oculto = {
  id: "oculto", slug: "oculto", nome: "Oculto", categoria: "condicao", categoria_label: "Condição",
  descricao_curta: "Localização desconhecida para certas criaturas; primeira ofensiva recebe +1 e revela sua posição.",
  descricao_longa: "Sua localização não é conhecida pelas criaturas das quais está escondido. Elas não podem escolhê-lo como alvo de ações visuais. Sua primeira ação ofensiva contra quem não saiba onde você está recebe +1 de vantagem e encerra Oculto para essa criatura. É uma condição relativa por observador.",
  tags: ["controle", "relacional", "visao"], duracao_padrao: null, remove_por: [], acoes_habilitadas: [],
  payload_automacao: { efeitos: [
    { tipo: "bloquear_alvo_visual", relativo_ao_observador: true },
    { tipo: "modificador", valor: 1, alvo_tags: ["ofensiva"], quando: "primeira_acao_contra_observador_que_nao_localizou" },
  ], observacoes: ["A relação por observador exige estado de percepção no VTT e permanece informativa nesta etapa."] },
  status: "published", versao: "1.2.0", created_at: "2026-10-01", updated_at: "2026-10-01",
};
db.condicoes.splice(queimandoIndex, 0, oculto);
writeFileSync(path, JSON.stringify(db, null, 2) + "\n");
