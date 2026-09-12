/**
 * Lógica PURA do Chat do painel: ordem cronológica, mesclagem de
 * envios em voo, contagem de não lidos e resolução de AUTORIA.
 *
 * Sem React e sem rede — o `ChatTab.tsx` só liga isto ao
 * `CampaignRealtimeProvider` e à Server Action de envio. Tudo aqui é
 * exercitado por `scripts/test-vtt-painel.ts`.
 *
 * AVISO sobre autoria: nada nesta função é AUTORIZAÇÃO. Ela decide o
 * que a interface OFERECE e o que o cliente PEDE; quem decide se o
 * pedido vale é o servidor (`acoes/chatPainel.ts` revalida o
 * personagem, e a RPC `append_table_log` recusa `p_character_id` que o
 * autor não possa gerenciar — `can_manage_character`, migration 0057).
 */

import type { TableLogEntry, TableLogVisibility } from "../../../../../lib/table";

/**
 * Ordem CRONOLÓGICA convencional (mais antigo em cima, mais novo
 * embaixo) — a ordem de leitura de um chat.
 *
 * `listLogsForViewer` devolve DESCENDENTE (mais novo primeiro), e essa
 * ordem é o contrato de outros consumidores (`SessionPanel`,
 * `/dev/table`, `MesaTab`). Nada disso muda: a inversão acontece AQUI,
 * numa cópia, só pra apresentação do Chat.
 *
 * Empate de `created_at` (duas entradas gravadas no mesmo
 * milissegundo, comum quando uma ação registra dois eventos) é
 * desempatado pelo `id`, então a ordem é TOTAL e estável entre
 * renders — nunca duas entradas trocando de lugar a cada releitura.
 */
export function ordenarCronologicamente(logs: readonly TableLogEntry[]): TableLogEntry[] {
  return [...logs].sort((a, b) => {
    const ta = Date.parse(a.created_at);
    const tb = Date.parse(b.created_at);
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Mensagem local ainda não confirmada (ou recusada) pelo servidor. */
export interface EnvioPendente {
  /** Id do CLIENTE — nunca um id de `table_logs`. */
  id: string;
  texto: string;
  autorNome: string;
  visibilidade: TableLogVisibility;
  /** `null` enquanto em voo; preenchido no sucesso, com o id REAL da linha criada. */
  idServidor: string | null;
  erro: string | null;
  criadoEm: string;
}

/**
 * Descarta os pendentes que já apareceram na lista real — o único
 * caminho por onde uma mensagem enviada poderia ser desenhada DUAS
 * vezes (bolha otimista + eco do Realtime).
 *
 * O casamento é por ID DE LINHA (o servidor devolve a linha criada),
 * nunca por texto+horário: duas mensagens idênticas seguidas são
 * legítimas e não podem colapsar numa só.
 */
export function pendentesAindaVisiveis(
  logs: readonly TableLogEntry[],
  pendentes: readonly EnvioPendente[],
): EnvioPendente[] {
  if (pendentes.length === 0) return [];
  const idsReais = new Set(logs.map((l) => l.id));
  return pendentes.filter((p) => p.idServidor === null || !idsReais.has(p.idServidor));
}

/**
 * Quantas entradas NOVAS existem em relação ao último id que a pessoa
 * de fato viu. Conta por ID (não por diferença de tamanho): uma
 * releitura pode trazer um bloco inteiro de uma vez, e uma entrada
 * apagada em outra sessão encolheria a lista — os dois casos quebram
 * qualquer contagem baseada em `length`.
 *
 * `ultimoIdVisto === null` (nunca viu nada) NÃO conta tudo como não
 * lido: quem abre a mesa pela primeira vez não deve encarar um badge
 * com o histórico inteiro. Nesse caso a contagem é zero e o "visto"
 * passa a ser o fim da lista.
 *
 * Recebe qualquer lista com `id` de propósito: o Chat conta sobre os
 * CARTÕES PROJETADOS (o que a pessoa de fato veria), nunca sobre o log
 * bruto — senão um evento técnico filtrado pela allowlist acenderia o
 * badge de "mensagem nova" sem nada aparecer na tela.
 */
export function contarNaoLidos(logsCronologicos: readonly { id: string }[], ultimoIdVisto: string | null): number {
  if (ultimoIdVisto === null) return 0;
  const i = logsCronologicos.findIndex((l) => l.id === ultimoIdVisto);
  // Id desconhecido (entrada removida, ou releitura que não a trouxe):
  // não dá pra saber onde a pessoa parou — não inventa um número.
  if (i < 0) return 0;
  return logsCronologicos.length - 1 - i;
}

/** Distância do fim (px) abaixo da qual o Chat ainda "está no fim" e pode ancorar sozinho. */
export const LIMIAR_FIM_PX = 40;

export function estaNoFim(scrollTop: number, scrollHeight: number, clientHeight: number): boolean {
  return scrollHeight - scrollTop - clientHeight <= LIMIAR_FIM_PX;
}

// =====================================================================
// AUTORIA
// =====================================================================

/** Identidade com que a próxima mensagem sai. `characterId` nulo = fala como Narrador ou como a própria conta. */
export type IdentidadeChat =
  | { modo: "personagem"; characterId: string; nome: string }
  | { modo: "narrador"; characterId: null; nome: "Narrador" }
  | { modo: "conta"; characterId: null; nome: string };

export interface EntradaAutoria {
  papel: "narrator" | "player";
  /** Nome público da conta (vem do roster — `list_campaign_roster`, nunca e-mail nem UUID). */
  nomeDaConta: string;
  /**
   * Personagem do token SELECIONADO no mapa, se o token tiver um e a
   * conta puder controlá-lo. O `nome` aqui é só uma dica de
   * apresentação — a identidade só é aceita se o id constar em
   * `personagensDisponiveis`, e o nome usado é o de lá.
   */
  personagemDoTokenSelecionado: { id: string; nome: string } | null;
  /** Personagens que a conta pode usar como identidade nesta campanha (narrador: os da campanha; jogador: os que controla). */
  personagensDisponiveis: readonly { id: string; nome: string }[];
  /** Escolha explícita no seletor do rodapé. `"narrador"`/`"conta"` falam sem personagem. */
  escolhaManual: string | null;
}

/**
 * Com quem a próxima mensagem sai, em ordem de precedência:
 *
 *  1. escolha MANUAL válida (o seletor do rodapé vence sempre — quem
 *     escolheu não pode ser atropelado por trocar de token no mapa);
 *  2. personagem do token selecionado, quando a conta pode controlá-lo
 *     (o comportamento que o pedido chama de "falar como o personagem
 *     do token");
 *  3. sem identidade de personagem válida: narrador fala como
 *     "Narrador"; jogador cai no PRIMEIRO personagem disponível e, se
 *     não tiver nenhum, na própria conta — identidade explícita e
 *     autorizada, nunca "Mesa" anônimo.
 *
 * Uma escolha manual que não está mais em `personagensDisponiveis`
 * (controle revogado enquanto a aba estava aberta) é IGNORADA e o
 * fluxo cai para os itens 2/3 — nunca envia com um personagem que a
 * pessoa deixou de poder usar.
 */
export function resolverIdentidade(e: EntradaAutoria): IdentidadeChat {
  if (e.escolhaManual === "narrador" && e.papel === "narrator") {
    return { modo: "narrador", characterId: null, nome: "Narrador" };
  }
  if (e.escolhaManual === "conta") {
    return { modo: "conta", characterId: null, nome: e.nomeDaConta };
  }
  if (e.escolhaManual) {
    const escolhido = e.personagensDisponiveis.find((p) => p.id === e.escolhaManual);
    if (escolhido) return { modo: "personagem", characterId: escolhido.id, nome: escolhido.nome };
  }

  const doToken = e.personagemDoTokenSelecionado;
  if (doToken) {
    // O NOME sai da lista de disponíveis (resolvida no servidor a
    // partir de `characters.name`), nunca do nome do TOKEN: os dois
    // podem divergir de propósito ("Encapuzado" no mapa, "Mara Venn"
    // na ficha), e a autoria é do personagem, não do token.
    const autorizado = e.personagensDisponiveis.find((p) => p.id === doToken.id);
    if (autorizado) return { modo: "personagem", characterId: autorizado.id, nome: autorizado.nome };
  }

  if (e.papel === "narrator") return { modo: "narrador", characterId: null, nome: "Narrador" };

  const primeiro = e.personagensDisponiveis[0];
  if (primeiro) return { modo: "personagem", characterId: primeiro.id, nome: primeiro.nome };
  return { modo: "conta", characterId: null, nome: e.nomeDaConta };
}

/** Visibilidades que este papel pode ESCOLHER. Jogador nunca oferece "gm" — e o servidor recusa de novo, não é só a interface. */
export function visibilidadesDoPapel(papel: "narrator" | "player"): TableLogVisibility[] {
  return papel === "narrator" ? ["public", "gm", "private"] : ["public", "private"];
}

export const ROTULO_VISIBILIDADE: Record<TableLogVisibility, string> = {
  public: "Todos",
  private: "Só eu",
  gm: "Narrador",
};

// =====================================================================
// APRESENTAÇÃO DE UMA ENTRADA
// =====================================================================

/** Famílias visuais do Chat — o CSS tem uma regra por família, nunca uma por tipo de log. */
export type FamiliaEntrada = "mensagem" | "narracao" | "rolagem" | "sistema" | "combate" | "magia" | "condicao" | "turno";

const TIPOS_ROLAGEM = new Set(["rolagem_pericia", "rolagem_expressao", "overload_will_roll"]);
const TIPOS_COMBATE = new Set(["attack_resolved", "defense_reaction_used", "action_used", "spell_attack_used", "spell_attack_resolved"]);
const TIPOS_MAGIA = new Set(["spell_cast"]);
const TIPOS_TURNO = new Set(["round_ended", "round_end_processed", "scene_ended", "scene_end_processed", "scene_rupture_pending", "round_pa_reduced_by_condition"]);

/**
 * Família visual de uma entrada. `chat` com `estilo: "narracao"` no
 * payload vira narração (é como o narrador manda uma fala de cena);
 * qualquer tipo que este mapa não conheça cai em "sistema" — a
 * apresentação genérica legível, NUNCA JSON cru (o texto em si vem de
 * `formatTableLogEntry`, que já garante isso).
 */
export function familiaDaEntrada(entry: Pick<TableLogEntry, "type" | "payload">): FamiliaEntrada {
  if (entry.type === "chat") {
    return entry.payload?.estilo === "narracao" ? "narracao" : "mensagem";
  }
  if (TIPOS_ROLAGEM.has(entry.type)) return "rolagem";
  if (TIPOS_COMBATE.has(entry.type)) return "combate";
  if (TIPOS_MAGIA.has(entry.type)) return "magia";
  if (TIPOS_TURNO.has(entry.type)) return "turno";
  if (entry.type.startsWith("condition_") || entry.type.startsWith("temporary_effect_")) return "condicao";
  return "sistema";
}

export interface DetalheRolagem {
  rotulo: string;
  dados: number[];
  maior: number | null;
  total: number | null;
  margem: string | null;
}

/**
 * Detalhe expansível de uma rolagem, SÓ quando o payload realmente o
 * tem. Devolve `null` para rolagens antigas sem `dados` — o cartão
 * então mostra só o texto formatado, sem um "expandir" que abriria
 * vazio.
 */
export function detalheDaRolagem(payload: Record<string, unknown>): DetalheRolagem | null {
  const bruto = payload.dados ?? payload.rolagens ?? payload.resultados;
  const dados = Array.isArray(bruto) ? bruto.filter((d): d is number => typeof d === "number") : [];
  if (dados.length === 0) return null;
  const total = typeof payload.total === "number" ? payload.total : null;
  // Mesma ordem do cartão do feed: a INTENÇÃO manda sobre a mecânica —
  // "Aparar" antes de "Luta" — senão os dois lugares que mostram a
  // mesma rolagem discordam sobre o nome dela.
  const rotulo =
    (typeof payload.intencaoNome === "string" && payload.intencaoNome) ||
    (typeof payload.pericia === "string" && payload.pericia) ||
    (typeof payload.atributo === "string" && payload.atributo) ||
    (typeof payload.expressao === "string" && payload.expressao) ||
    "Dados";
  const margem =
    (typeof payload.margemRotulo === "string" && payload.margemRotulo) ||
    (typeof payload.margem === "string" && payload.margem) ||
    null;
  return { rotulo, dados, maior: Math.max(...dados), total, margem };
}

/** Iniciais para o avatar textual do autor (nunca mais de 2 letras — o círculo é de 22px). */
export function iniciaisDe(nome: string): string {
  const palavras = nome.trim().split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return "?";
  if (palavras.length === 1) return palavras[0].slice(0, 1).toUpperCase();
  return (palavras[0][0] + palavras[palavras.length - 1][0]).toUpperCase();
}
