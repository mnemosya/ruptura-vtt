"use client";

/**
 * CARDS DO CHAT LOG — a estante de todos os cards do feed.
 *
 * REGRA DA PÁGINA (a mesma da galeria inteira): nada aqui é marcação
 * copiada. Cada exemplo é uma ENTRADA DE LOG de mentira que passa pela
 * projeção REAL (`projetarFeed`) e é desenhada pelo despachante REAL
 * (`EntradaFeed`). Ou seja: a estante exercita allowlist, projeção,
 * correlação e render no mesmo caminho da mesa. Se um projetor parar de ler um campo,
 * o card aqui esvazia junto — que é exatamente o alarme que se quer.
 *
 * É por isso que os exemplos são payloads, e não objetos `CartaoFeed`
 * montados à mão: um `CartaoFeed` literal provaria só que o componente
 * desenha o que recebe, e continuaria bonito mesmo com o projetor
 * quebrado — o bug que deixou o card de descanso sair sem um número
 * sequer passaria batido numa estante assim.
 *
 * A moldura `.rv-painel > .rv-pn-chat > .rv-pn-chat-scroll` não é
 * decoração: as regras fortes do card (`padding`, espinha, clip dos
 * cantos) moram sob `.rv-pn-chat` em `painel.css`. Sem a casca, o card
 * desenha meio cru.
 */

import { useState } from "react";
import { EntradaFeed } from "../../mesas/[campaignId]/vtt/_painel/feed/EntradaFeed";
import { projetarFeed, type CartaoFeed } from "../../mesas/[campaignId]/vtt/_painel/feed/contratos";
import type { TableLogEntry, TableLogVisibility } from "../../../lib/table";

/* ── fixtures ───────────────────────────────────────────────────── */

/**
 * Os atributos do sistema são TRÊS e têm nome por extenso: Corpo,
 * Mente e Ânimo (`ATRIBUTOS_PADRAO` em `_painel/acoes/rolagemPainel.ts`,
 * e é `atributoNome` que vai pro log). Uma versão anterior desta
 * estante inventou uma sigla de três letras e cinco atributos que não
 * existem — "COR", "DES", "VIG", "PRE" —, e o card passou a mostrar
 * teste de atributo que a ficha não tem. Fixture que inventa dado é
 * pior que fixture feia: a estante existe pra provar o desenho contra o
 * sistema, não contra um sistema imaginário.
 */

let seq = 0;

function log(
  type: string,
  payload: Record<string, unknown>,
  extra: Partial<TableLogEntry> = {},
): TableLogEntry {
  seq += 1;
  return {
    id: extra.id ?? `gal-${seq}`,
    campaign_id: "galeria",
    character_id: extra.character_id ?? null,
    type,
    visibility: (extra.visibility ?? "public") as TableLogVisibility,
    payload,
    created_at: extra.created_at ?? new Date(Date.UTC(2026, 1, 1, 21, 14, seq % 60)).toISOString(),
    created_by_user_id: extra.created_by_user_id ?? "u-galeria",
  };
}

interface Exemplo {
  chave: string;
  titulo: string;
  nota: string;
  entradas: TableLogEntry[];
}

export interface Grupo {
  chave: string;
  aba: string;
  titulo: string;
  componente: string;
  tipos: string;
  resumo: string;
  exemplos: Exemplo[];
}

/**
 * Um grupo por COMPONENTE de card, e dentro dele os estados que de fato
 * existem — o que muda de um exemplo pro outro é só o payload.
 */
export const GRUPOS_CARDS: Grupo[] = [
  {
    chave: "mensagem",
    aba: "Mensagem",
    titulo: "Conversa",
    componente: "feed/ChatMessageEntry.tsx",
    tipos: "chat",
    resumo:
      "A única entrada que não é um card mecânico. Mensagens seguidas do mesmo autor colapsam o cabeçalho; visibilidade diferente nunca colapsa.",
    exemplos: [
      {
        chave: "fala",
        titulo: "Fala e continuação",
        nota: "A segunda mensagem do mesmo autor perde o cabeçalho — agrupamento por autor e janela de tempo.",
        entradas: [
          log("chat", { text: "Alguém checou a escotilha de carga?", autorNome: "Mara Venn", autorTipo: "personagem" }, { character_id: "p1" }),
          log(
            "chat",
            { text: "Porque tem alguma coisa batendo do outro lado.", autorNome: "Mara Venn", autorTipo: "personagem" },
            { character_id: "p1", created_at: new Date(Date.UTC(2026, 1, 1, 21, 14, 28)).toISOString() },
          ),
        ],
      },
      {
        chave: "narracao",
        titulo: "Narração e sussurro",
        nota: "Narração é um ESTILO da mensagem (acento âmbar), não um tipo à parte. Abaixo, uma entrada só do narrador.",
        entradas: [
          log("chat", { text: "A névoa desce pelo pátio de carga e engole os contêineres um a um.", autorNome: "Narrador", autorTipo: "narrador", estilo: "narracao" }),
          log("chat", { text: "O trinco já estava arrombado antes de vocês chegarem.", autorNome: "Narrador", autorTipo: "narrador" }, { visibility: "gm" }),
        ],
      },
    ],
  },
  {
    chave: "rolagem",
    aba: "Rolagem",
    titulo: "Teste e bandeja",
    componente: "feed/RollCard.tsx",
    tipos: "rolagem_pericia · rolagem_expressao · overload_will_roll",
    resumo:
      "Dois desenhos, porque são duas coisas. TESTE usa a MESMA leitura da ferramenta de rolar dados — fileira de d8 parados e faixa de classificação, sem bloco recolhível. BANDEJA LIVRE fica na grade de módulos: ali os dados são somados, e a faixa de teste diria 'maior 7 · sem perícia' sobre uma conta que não é essa.",
    exemplos: [
      {
        chave: "faixas",
        titulo: "As seis faixas de margem",
        nota: "A régua inteira, de cima a baixo. A classificação manda em tudo que tem cor no card: a espinha, o dado que valeu e a faixa saem no mesmo acento.",
        entradas: [
          log("rolagem_pericia", {
            characterNome: "Corvo", atributo: "Corpo", atributoValor: 5, pericia: "Furtividade", periciaValor: 2,
            modificador: 1, cd: 10, total: 11, sucesso: true, dados: [8, 2, 5, 8], maiorDado: 8,
            classificacaoMargem: "sucesso_critico", margemRotulo: "Sucesso Crítico",
            effectsApplied: [{ sourceName: "Botas de Aderência", modifier: 1 }],
          }),
          log("rolagem_pericia", {
            characterNome: "Mara Venn", atributo: "Corpo", atributoValor: 2, pericia: null, periciaValor: 0,
            modificador: 3, cd: 8, total: 10, sucesso: true, dados: [6, 7], maiorDado: 7,
            classificacaoMargem: "sucesso_padrao", margemRotulo: "Sucesso Padrão",
          }),
          log("rolagem_pericia", {
            characterNome: "Siv", atributo: "Mente", atributoValor: 6, pericia: "Arcana", periciaValor: 4,
            modificador: 0, cd: 12, total: 12, sucesso: true, dados: [3, 8, 5], maiorDado: 8,
            classificacaoMargem: "sucesso_limitado", margemRotulo: "Sucesso Limitado",
          }),
          log("rolagem_pericia", {
            characterNome: "Corvo", atributo: "Corpo", atributoValor: 3, pericia: "Atletismo", periciaValor: 2,
            modificador: 0, cd: 12, total: 11, sucesso: false, dados: [7, 9], maiorDado: 9,
            classificacaoMargem: "falha_limitada", margemRotulo: "Falha Limitada",
          }),
          log("rolagem_pericia", {
            characterNome: "Mara Venn", atributo: "Ânimo", atributoValor: 2, pericia: "Persuasão", periciaValor: 1,
            modificador: 0, cd: 13, total: 7, sucesso: false, dados: [6, 4], maiorDado: 6,
            classificacaoMargem: "falha", margemRotulo: "Falha",
          }),
          log("rolagem_pericia", {
            characterNome: "Siv", atributo: "Mente", atributoValor: 6, pericia: "Percepção", periciaValor: 3,
            modificador: 0, cd: 16, total: 9, sucesso: false, dados: [7, 3, 6], maiorDado: 6,
            classificacaoMargem: "falha_critica", margemRotulo: "Falha Crítica",
          }),
        ],
      },
      {
        chave: "semcd",
        titulo: "Teste sem CD",
        nota: "Sem CD não existe sucesso nem margem — a faixa diz isso e mostra só o total, em vez de fingir uma classificação que a regra não produziu.",
        entradas: [
          log("rolagem_pericia", {
            characterNome: "Mara Venn", atributo: "Corpo", atributoValor: 2, pericia: null, periciaValor: 0,
            modificador: 0, cd: null, total: 2, dados: [2, 1], maiorDado: 2,
          }),
        ],
      },
      {
        chave: "livre",
        titulo: "Bandeja livre e sobrecarga",
        nota: "Sem atributo nem perícia não há leitura de teste: o card cai na grade de módulos, com os dados no bloco recolhível. Somar não destaca dado nenhum — nenhum venceu.",
        entradas: [
          log("rolagem_expressao", { characterNome: "Siv", expressao: "3d8", dados: [7, 3, 6], modificador: 0, modo: "sum", total: 16 }),
          log("overload_will_roll", { characterNome: "Siv", total: 9, cd: 12, sucesso: false, dados: [4, 9] }),
        ],
      },
    ],
  },
  {
    chave: "referencia",
    aba: "Referência",
    titulo: "Compêndio compartilhado",
    componente: "feed/ContentReferenceCard.tsx",
    tipos: "compendio_compartilhado",
    resumo:
      "Tudo sai do snapshot gravado no evento — editar o documento no Compêndio hoje não reescreve o que o Chat mostrou ontem.",
    exemplos: [
      {
        chave: "magia",
        titulo: "Magia e item homebrew",
        nota: "O chip de origem só aparece quando o conteúdo não é oficial.",
        entradas: [
          log("compendio_compartilhado", {
            autorNome: "Narrador", autorTipo: "narrador", categoria: "magias", categoriaRotulo: "Magia", slug: "compressao",
            nome: "Compressão", origem: "oficial", tags: ["Cognitiva", "Nível 2"],
            estatisticas: [{ rotulo: "Alcance", valor: "12 m" }, { rotulo: "Área", valor: "Esfera 3 m" }, { rotulo: "Resistência", valor: "Corpo" }],
            descricao: "O ar dentro da área ganha peso. Cada criatura sofre penalidade de deslocamento até o fim da rodada.",
          }),
          log("compendio_compartilhado", {
            autorNome: "Narrador", autorTipo: "narrador", categoria: "itens", categoriaRotulo: "Item", slug: "selo-de-doca",
            nome: "Selo de Doca Falsificado", origem: "homebrew", origemRotulo: "Homebrew da mesa", tags: ["Documento"],
            estatisticas: [{ rotulo: "Peso", valor: "—" }, { rotulo: "Valor", valor: "80 cr" }],
            resumo: "Passa por autêntico em inspeção casual; falha em leitura técnica.",
          }),
        ],
      },
    ],
  },
  {
    chave: "uso",
    aba: "Uso",
    titulo: "Item e talento usados",
    componente: "feed/ContentReferenceCard.tsx · ContentUseCard",
    tipos: "item_used · talent_used",
    resumo:
      "Mesma moldura, dados diferentes: o ITEM diz quanto sobrou, o TALENTO diz o que dispara e quando recarrega. PA e munição aparecem aqui dentro — é por isso que action_used e ammunition não têm card próprio.",
    exemplos: [
      {
        chave: "item",
        titulo: "Item — com restante",
        nota: "O chip 'Restam' é do item; gatilho e recarga nunca aparecem nele.",
        entradas: [
          log("item_used", {
            characterNome: "Corvo", itemNome: "Estimulante de Combate", paGasto: 1, cargasGastas: 1,
            restanteRotulo: "2 de 3 cargas", tags: ["Consumível", "Química"],
            resultado: "+2 em testes de Corpo até o fim da cena.",
            descricao: "Injetor de uso único. Sobrecarrega o sistema nervoso por poucos minutos.",
          }),
        ],
      },
      {
        chave: "talento",
        titulo: "Talento — gatilho e recarga",
        nota: "Acento violeta e os dois chips que só o talento tem.",
        entradas: [
          log("talent_used", {
            characterNome: "Mara Venn", talentoNome: "Leitura de Terreno", paGasto: 0, usosRestantes: 1,
            gatilho: "Ao entrar numa cena nova", recarga: "Descanso curto", tags: ["Perceptivo"],
            resultado: "Revela uma característica tática do ambiente.",
          }),
        ],
      },
    ],
  },
  {
    chave: "ataque",
    aba: "Ataque",
    titulo: "Workflow de ataque",
    componente: "feed/AttackWorkflowCard.tsx",
    tipos: "attack_resolved · spell_attack_resolved · attack_damage_applied",
    resumo:
      "O card EVOLUI no lugar: o evento de dano aplicado compartilha o workflowId e substitui a entrada anterior em vez de criar outra. Por isso o terceiro exemplo é uma lista de duas entradas que vira um card só.",
    exemplos: [
      {
        chave: "acertou",
        titulo: "Acerto — aguardando aplicação",
        nota: "Ataque resolvido com dano calculado, esperando alguém aplicar.",
        entradas: [
          log("attack_resolved", {
            workflowId: "wf-1", armaNome: "Arco Curto", atacanteNome: "Mara Venn", paGasto: 2, municaoGasta: 1,
            totalAtaque: 14, totalDefesa: 6, alvoNome: "Gravenight", alvoCharacterId: "p9",
            acertou: true, margem: 6, dano: 17, danoTipo: "perfurante", regiao: "torso", tags: ["À distância"],
          }),
        ],
      },
      {
        chave: "errou",
        titulo: "Erro",
        nota: "Sem dano, sem etapa de aplicação — o card fecha em 'errou'.",
        entradas: [
          log("attack_resolved", {
            workflowId: "wf-2", armaNome: "Cutelo", atacanteNome: "Corvo",
            paGasto: 2, totalAtaque: 4, totalDefesa: 9, alvoNome: "Sentinela da Doca", acertou: false, margem: -5,
          }),
        ],
      },
      {
        chave: "evolui",
        titulo: "Dano aplicado (o card evolui)",
        nota: "Duas entradas de log, um card só: PV anterior → PV atual no mesmo lugar onde o ataque foi declarado.",
        entradas: [
          log("attack_resolved", {
            workflowId: "wf-3", armaNome: "Arco Curto", atacanteNome: "Mara Venn", paGasto: 2,
            totalAtaque: 15, totalDefesa: 7, alvoNome: "Gravenight", acertou: true, margem: 8, dano: 17, danoTipo: "perfurante",
          }, { id: "wf3-a" }),
          log("attack_damage_applied", {
            workflowId: "wf-3", armaNome: "Arco Curto", atacanteNome: "Mara Venn", alvoNome: "Gravenight",
            acertou: true, dano: 17, danoTipo: "perfurante", mitigacao: 2, pvAntes: 20, pvDepois: 5,
          }, { id: "wf3-b" }),
        ],
      },
    ],
  },
  {
    chave: "magia",
    aba: "Magia",
    titulo: "Conjuração",
    componente: "feed/SpellCastWorkflowCard.tsx",
    tipos: "spell_cast · spell_attack_used",
    resumo:
      "Conjurar não rola ataque nem dano. Quando a magia exige ataque, o card nasce aguardando e o fluxo continua no card de ataque, com acento violeta.",
    exemplos: [
      {
        chave: "aguardando",
        titulo: "Conjurada — aguardando ataque",
        nota: "PA e Mana consumidos como módulos.",
        entradas: [
          log("spell_cast", {
            spellNome: "Compressão", characterNome: "Siv", vertente: "Cognitivo", nivel: 2,
            paGasto: 3, manaGasta: 2, exigeAtaque: true, tags: ["Cognitiva"],
            estatisticas: [{ rotulo: "Alcance", valor: "12 m" }, { rotulo: "Resistência", valor: "Corpo" }],
            descricao: "O ar dentro da área ganha peso.",
          }),
        ],
      },
      {
        chave: "manual",
        titulo: "Resolução manual",
        nota: "Sem estrutura suficiente para automatizar, o card ASSUME a resolução manual em vez de inventar regra.",
        entradas: [
          log("spell_cast", {
            spellNome: "Véu de Estática", characterNome: "Siv", vertente: "Sináptico", nivel: 1, paGasto: 2, manaGasta: 1,
            resolucaoManual: "Sem fórmula de dano publicada.",
          }),
        ],
      },
    ],
  },
  {
    chave: "efeito",
    aba: "Efeito",
    titulo: "Condição e efeito temporário",
    componente: "feed/CombatCards.tsx · EffectApplicationCard",
    tipos: "condition_* · temporary_effect_* · scene_effect_expired",
    resumo:
      "O card lê `familia` para decidir o que mostrar: CONDIÇÃO abre intensidade, dano por rodada e como sair dela; EFEITO TEMPORÁRIO abre só a duração. São perguntas diferentes — e é a separação que o design de origem faz entre ConditionCard e EffectCard.",
    exemplos: [
      {
        chave: "condicao",
        titulo: "Condição — aplicada, cobrando e removida",
        nota: "Intensidade e dano por rodada só aparecem na família condição. Encerrado vira neutro, nunca vermelho de alarme.",
        entradas: [
          log("condition_applied", {
            condicaoNome: "Sangrando", characterNome: "Corvo", fonteNome: "Lâmina Cinética",
            duracao: "2 rodadas restantes", intensidade: 2, danoPorRodada: "1d8", cura: "Teste de Corpo CD 12",
            descricao: "Sofre dano no início de cada turno conforme a regra da condição.",
          }),
          log("condition_end_round_damage", { condicaoNome: "Sangrando", characterNome: "Corvo", dano: 3, intensidade: 2 }),
          log("condition_removed", { condicaoNome: "Sangrando", characterNome: "Corvo", fonteNome: "Primeiros socorros" }),
        ],
      },
      {
        chave: "temporario",
        titulo: "Efeito temporário e efeito de cena",
        nota: "Aqui a pergunta é só 'quando acaba' — nenhuma intensidade, nenhum campo de cura meio vazio.",
        entradas: [
          log("temporary_effect_added", {
            efeitoNome: "Compressão", characterNome: "Siv", fonteNome: "Siv", duracao: "Até o fim da rodada",
            descricao: "Penalidade de deslocamento dentro da área.",
          }),
          log("temporary_effect_expired", { efeitoNome: "Compressão", characterNome: "Siv", duracao: "Expirado" }),
          log("scene_effect_expired", { efeitoNome: "Névoa Densa", duracao: "Fim da cena" }),
        ],
      },
    ],
  },
  {
    chave: "colapso",
    aba: "Colapso",
    titulo: "Colapso",
    componente: "feed/EstadoCards.tsx · CollapseCard",
    tipos: "collapse_started · collapse_advanced · collapse_stabilized · collapse_ended · collapse_outcome",
    resumo:
      "Card NOVO. Os cinco tipos são momentos da mesma queda: o card mostra em que segmento ela está e o que a parou. Antes todos caíam no efeito genérico com `acao: \"dano\"` forçado e saíam com a mesma cara.",
    exemplos: [
      {
        chave: "queda",
        titulo: "Queda — início e avanço",
        nota: "Acento vermelho enquanto está caindo; o módulo de segmento mostra a distância até o fim.",
        entradas: [
          log("collapse_started", { characterNome: "Corvo", tipo: "pv", segmentos: 1, motivo: "PV reduzidos a zero por dano perfurante." }),
          log("collapse_advanced", { characterNome: "Corvo", tipo: "pv", segmentos: 2, motivo: "Falha no teste de fim de rodada." }),
        ],
      },
      {
        chave: "parou",
        titulo: "Estabilizado e encerrado",
        nota: "Estabilizar é ALÍVIO — o acento vira verde. Deixar vermelho manteria o alarme depois que o perigo passou.",
        entradas: [
          log("collapse_stabilized", { characterNome: "Corvo", tipo: "pv", segmentos: 2, motivo: "Primeiros socorros aplicados a tempo." }),
          log("collapse_ended", { characterNome: "Corvo", tipo: "pv", desfecho: "Consciência recuperada" }),
        ],
      },
      {
        chave: "desfecho",
        titulo: "Desfecho",
        nota: "O último segmento não é mais um aviso: é resultado, e fecha o card numa faixa.",
        entradas: [
          log("collapse_outcome", { characterNome: "Estivador", tipo: "pe", segmentos: 3, desfecho: "Colapso mental completo", motivo: "Terceiro segmento alcançado." }),
        ],
      },
    ],
  },
  {
    chave: "sobrecarga",
    aba: "Sobrecarga",
    titulo: "Surto de sobrecarga",
    componente: "feed/EstadoCards.tsx · OverloadCard",
    tipos: "overload_surge · overload_surge_used",
    resumo:
      "Card NOVO. O teste de vontade que antecede o surto já tinha card de rolagem; o surto em si virava efeito genérico. Agora mostra qual surto, quanto custou e se abriu Ruptura.",
    exemplos: [
      {
        chave: "surto",
        titulo: "Surto — dentro do limite",
        nota: "Índice sobre o máximo diário, dano psíquico com o dado da regra. A aplicação é manual, e o card diz isso.",
        entradas: [
          log("overload_surge_used", {
            characterNome: "Siv", tipo: "Eco Sináptico", indice: 1, maxSurtos: 3, danoDado: "1d4", danoPsiquico: 3,
          }),
        ],
      },
      {
        chave: "ruptura",
        titulo: "Surto que abre Ruptura",
        nota: "Com Ruptura pendente o acento vira perigo e o chip avisa — o próximo card da mesa provavelmente é o de Ruptura.",
        entradas: [
          log("overload_surge_used", {
            characterNome: "Siv", tipo: "Fratura de Vontade", indice: 3, maxSurtos: 3, danoDado: "1d4", danoPsiquico: 4,
            rupturaPendente: true,
          }),
        ],
      },
    ],
  },
  {
    chave: "descanso",
    aba: "Descanso",
    titulo: "Recuperação",
    componente: "feed/EstadoCards.tsx · RestCard",
    tipos: "rest_short · rest_long",
    resumo:
      "Card NOVO, e o conserto do pior caso do inventário: o payload é { before, after } de PV/PE/Mana, e o projetor de efeito não lia nenhuma dessas chaves — o card saía literalmente com o nome 'Efeito' e nenhum número.",
    exemplos: [
      {
        chave: "curto",
        titulo: "Descanso curto",
        nota: "Só os recursos que MUDARAM. Listar recurso intacto num card de recuperação é ruído.",
        entradas: [
          log("rest_short", { characterNome: "Mara Venn", before: { pv: 12, pe: 4, mana: 2 }, after: { pv: 20, pe: 7, mana: 2 } }),
        ],
      },
      {
        chave: "longo",
        titulo: "Descanso longo e descanso sem efeito",
        nota: "Quando nada mudou o card diz isso, em vez de mostrar uma grade vazia.",
        entradas: [
          log("rest_long", { characterNome: "Corvo", before: { pv: 5, pe: 1, mana: 0 }, after: { pv: 26, pe: 8, mana: 6 } }),
          log("rest_short", { characterNome: "Siv", before: { pv: 18, pe: 8, mana: 6 }, after: { pv: 18, pe: 8, mana: 6 } }),
        ],
      },
    ],
  },
  {
    chave: "ruptura",
    aba: "Ruptura",
    titulo: "Ruptura resolvida",
    componente: "feed/EstadoCards.tsx · RuptureCard",
    tipos: "rupture_resolved",
    resumo:
      "Card NOVO. Este tipo era o único ÓRFÃO de verdade do inventário: sem projetor e sem motivo registrado em EXCLUIDOS_DO_FEED — sumia do feed por esquecimento, não por decisão.",
    exemplos: [
      {
        chave: "resolvida",
        titulo: "Preço cobrado e devolvido",
        nota: "A Integridade paga fica no módulo; a faixa fecha com o que a Ruptura deu em troca.",
        entradas: [
          log("rupture_resolved", { characterNome: "Siv", ruptureLevel: 2, integrityBefore: 7, integrityAfter: 6, manaBonusApplied: 2 }),
        ],
      },
    ],
  },
  {
    chave: "resolucao",
    aba: "Resolução",
    titulo: "Fim de rodada e de cena",
    componente: "feed/CombatCards.tsx · TurnResolutionCard",
    tipos: "round_end_processed · scene_end_processed",
    resumo:
      "UM card por resolução, com tabela compacta. É o que impede dez linhas soltas toda vez que a rodada vira.",
    exemplos: [
      {
        chave: "rodada",
        titulo: "Fim de rodada",
        nota: "Linha riscada é efeito encerrado.",
        entradas: [
          log("round_end_processed", {
            newRound: 3,
            linhas: [
              { ator: "Corvo", efeito: "Sangrando", resultado: "−3 PV", restante: "1" },
              { ator: "Siv", efeito: "Compressão", resultado: "—", restante: "Expired", encerrado: true },
              { ator: "Mara Venn", efeito: "Leitura de Terreno", resultado: "recarregado", restante: "—" },
            ],
          }),
        ],
      },
      {
        chave: "vazia",
        titulo: "Resolução sem efeitos",
        nota: "Nada a resolver também é informação — o card existe e diz isso.",
        entradas: [log("scene_end_processed", { newScene: 4, linhas: [] })],
      },
    ],
  },
  {
    chave: "divisor",
    aba: "Divisor",
    titulo: "Ritmo do combate",
    componente: "feed/CombatCards.tsx · CombatDivider",
    tipos: "round_ended · scene_ended · combate_vtt",
    resumo:
      "Faixa que atravessa o feed, nunca um card grande: mudança de turno é ritmo, não evento a ser lido em detalhe.",
    exemplos: [
      {
        chave: "faixas",
        titulo: "Rodada, janela e cena",
        nota: "Três divisores em sequência, como aparecem entre os cards da mesa.",
        entradas: [
          log("combate_vtt", { evento: "combate_iniciado", source: "vtt_trilha", rodada: 1, janela: "rapidos", janelaRotulo: "Turnos rápidos" }),
          log("combate_vtt", { evento: "rodada_avancou", source: "vtt_trilha", rodada: 3, janela: "lentos", janelaRotulo: "Turnos lentos" }),
          log("scene_ended", { previousScene: 3, newScene: 4 }),
        ],
      },
    ],
  },
  {
    chave: "pendencia",
    aba: "Pendência",
    titulo: "O que trava a mesa",
    componente: "feed/CombatCards.tsx · PendingCheckCard",
    tipos: "condition_end_round_check_created · integrity_zero_pending · rupture_choice_created",
    resumo:
      "Âmbar enquanto espera, verde quando outra entrada a resolve — o card é atualizado no lugar, e é por isso que os eventos *_resolved não precisam de card próprio.",
    exemplos: [
      {
        chave: "aberta",
        titulo: "Aguardando resolução",
        nota: "Teste de condição e integridade zerada, os dois esperando alguém agir.",
        entradas: [
          log("condition_end_round_check_created", {
            characterNome: "Corvo", condicaoNome: "Sangrando",
            resistencia: { atributo: "Corpo", cd: 12 },
          }),
          log("integrity_zero_pending", { characterNome: "Siv" }),
        ],
      },
      {
        chave: "resolvida",
        titulo: "Resolvida",
        nota: "A entrada de resolução não cria card: encontra a pendência pelo personagem e a fecha.",
        entradas: [
          log("rupture_choice_created", { characterNome: "Siv" }, { id: "pend-a", character_id: "p-siv" }),
          log("rupture_choice_resolved", { characterNome: "Siv", marca: "Cicatriz Sináptica", traco: "Fala em ecos" }, { id: "pend-b", character_id: "p-siv" }),
        ],
      },
    ],
  },
];

/* ── render ─────────────────────────────────────────────────────── */

const SEM_EFEITO = () => {};

const ACOES = {
  onAplicarDano: SEM_EFEITO,
  aplicandoId: null,
  errosPorCartao: {},
  podeAplicarDano: true,
};

/**
 * Desenha os cards de um exemplo.
 *
 * A projeção usa `projetarFeed` (não `projetarEntrada`) porque é ela
 * que correlaciona: o ataque que evolui pelo `workflowId` e a pendência
 * que fecha quando a resolução chega. Dois exemplos existem só para
 * mostrar essas duas correlações acontecendo.
 */
function Feed({ cartoes }: { cartoes: CartaoFeed[] }) {
  const [expandidos, setExpandidos] = useState<ReadonlySet<string>>(new Set());
  const alternar = (id: string) =>
    setExpandidos((atuais) => {
      const proximo = new Set(atuais);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });

  return (
    <div className="gal-feed rv-painel">
      <div className="rv-pn-chat">
        <div className="rv-pn-chat-scroll">
          {cartoes.map((cartao, i) => (
            <EntradaFeed
              key={cartao.id}
              cartao={cartao}
              anterior={cartoes[i - 1]}
              papel="narrator"
              expandidos={expandidos}
              onAlternar={alternar}
              acoes={ACOES}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * UM grupo de cards — a ficha do componente e os seus exemplos.
 *
 * Quem escolhe o grupo é a navegação da galeria (`GaleriaEstilos`), não
 * este arquivo: antes as abas moravam aqui, e o resultado era uma
 * página com dois níveis de navegação disputando — trilho pra tudo,
 * menos pros cards, que tinham abas próprias no meio do scroll.
 */
export function GrupoDeCards({ grupo }: { grupo: Grupo }) {
  return (
    <>
      <div className="gal-ficha">
        <h3>{grupo.titulo}</h3>
        <p>{grupo.resumo}</p>
        <dl>
          <dt>Componente</dt>
          <dd><code>{grupo.componente}</code></dd>
          <dt>Tipos</dt>
          <dd><code>{grupo.tipos}</code></dd>
        </dl>
      </div>

      <div className="gal-grade gal-grade--cards">
        {grupo.exemplos.map((ex) => (
          <figure key={`${grupo.chave}-${ex.chave}`} className="gal-cartao">
            <Feed cartoes={projetarFeed(ex.entradas)} />
            <figcaption>
              <strong>{ex.titulo}</strong>
              <span>{ex.nota}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}
