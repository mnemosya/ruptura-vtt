/**
 * Modelo de visão da aba Ações do Console (ruleset v1.2).
 *
 * Lê o catálogo `content/v12/db_acoes_v1_2.json` (gerado por
 * `scripts/dev/v12/gerar_acoes_v12.mjs`) e o personagem, e devolve o que a
 * aba mostra: cena sugerida, recursos do turno, atalhos e grupos.
 *
 * NADA TRAVA. O VTT nem sempre está 100% registrado (a mesa pode estar
 * jogando sem o tracker, a ficha pode estar desatualizada), então o que a
 * ficha contradiz vira AVISO e a ação continua usável. A UI prefixa os
 * textos com "Pela ficha:".
 *
 * Ações de classe vêm de `SUBCLASS_ACTIONS` (classManagement.ts) e entram
 * na cena em que se aplicam.
 */

import type { Character } from "./types";
import { getActionItemRequirements, normalizeConditionSlug, type ActionItemContext, type CombatActionContent } from "./actionConsole";
import { SUBCLASS_ACTIONS, progression, reached, type ClassAction } from "./classManagement";

export type CenaAcao = "combate" | "investigacao" | "trama";
export const CENAS: CenaAcao[] = ["combate", "investigacao", "trama"];

export interface CustoAcaoV12 {
  pa?: number;
  /** Com `pa_max`, o livro escreve "1/2 PA": 1 OU 2 PA conforme a opção, nunca meio PA. */
  pa_max?: number;
  reacao?: number;
  ram?: number;
  livre?: boolean;
  proprio?: boolean;
  repeticao_incremento?: number;
  pa_preparado?: boolean;
}

export interface RequisitoAcaoV12 {
  tipo: string;
  aviso: string;
  condicao?: string | string[];
  propriedade?: string;
}

export interface OpcaoAcaoV12 {
  slug: string;
  nome: string;
  custo: CustoAcaoV12;
  funcao: string;
  teste?: TesteAcaoV12;
  requisitos?: RequisitoAcaoV12[];
  descricao?: string;
}

export interface TesteAcaoV12 {
  pericias?: string[] | "qualquer";
  contra?: string | null;
  condicional?: boolean;
}

export interface AcaoV12 {
  slug: string;
  nome: string;
  cena: CenaAcao;
  grupo: string;
  tipo: "acao" | "reacao" | "livre" | "protocolo" | "comando";
  custo: CustoAcaoV12;
  funcao: string;
  teste: TesteAcaoV12 | null;
  requisitos: RequisitoAcaoV12[];
  opcoes?: OpcaoAcaoV12[];
  estado?: "postura";
  rastro?: number;
  alvo?: string | null;
  alcance?: string | null;
  duracao?: string | null;
  descricao: string;
  /** Presente quando o item é uma ação de classe (não vem do catálogo). */
  classe?: ClassAction;
}

export interface CatalogoAcoesV12 {
  grupos: Record<CenaAcao, { slug: string; nome: string }[]>;
  acoes: AcaoV12[];
}

export interface AvisoAcao {
  /** `cena` = vale para a cena inteira (ex.: sem acesso à Trama); a UI mostra num banner, não em cada cartão. */
  alcance: "acao" | "cena";
  texto: string;
}

export interface ItemAbaAcao {
  chave: string;
  acao: AcaoV12;
  custoValor: string;
  custoUnidade: string;
  ram: number | null;
  avisos: AvisoAcao[];
  ativa: boolean;
  fixada: boolean;
}

export interface GrupoAbaAcao {
  cena: CenaAcao;
  slug: string;
  nome: string;
  nota?: string;
  itens: ItemAbaAcao[];
}

export interface AtaqueAtalho {
  instanceId: string | null;
  nome: string;
  /** Ex.: "Corpo a corpo", "À distância". */
  forma: string;
  pericia: string | null;
  dano: string | null;
}

export interface RecursosAbaAcoes {
  pa: { restantes: number; max: number };
  reacoes: { restantes: number; total: number };
  trama: { ram: number; ramMax: number; deteccao: number; limite: number | null; rastro: number } | null;
}

export interface AbaAcoes {
  cenaSugerida: CenaAcao;
  recursos: RecursosAbaAcoes;
  /** Aviso da cena inteira (hoje só a Trama sem deck nem Sináptica). */
  avisoDaCena: Partial<Record<CenaAcao, string>>;
  ataques: AtaqueAtalho[];
  fixadas: ItemAbaAcao[];
  grupos: GrupoAbaAcao[];
}

export interface ContextoAbaAcoes {
  paMax: number;
  reacoesPorRodada: number;
  /** Armas empunhadas já resolvidas (perícia e dano) para os atalhos de Atacar. */
  ataques?: AtaqueAtalho[];
  /** Modelos de item e propriedades, para os requisitos de arma e escudo. */
  itens?: ActionItemContext;
  /** Chaves "cena:slug" que o jogador fixou. */
  fixadas?: string[];
  /** Há um tracker de combate ativo na mesa. */
  emCombate?: boolean;
  /** Última cena aberta pelo jogador, para quando nada indica a cena. */
  ultimaCena?: CenaAcao;
  /** Comandos de Trama conhecidos (deck ou Sináptica). `null`/ausente = desconhecido, sem aviso. */
  comandosConhecidos?: string[] | null;
}

const DECK_SINAPTICO = /^escalpos_deck_sinaptico/;

/** Subclasses cujas ações acontecem fora do combate. Ausente = combate. */
const CENA_DA_SUBCLASSE: Record<string, CenaAcao> = {
  tecelao: "trama",
  perito: "investigacao",
  mercador: "investigacao",
  rato_de_rua: "investigacao",
  icone: "investigacao",
};

export function chaveAcao(acao: Pick<AcaoV12, "cena" | "slug">): string {
  return `${acao.cena}:${acao.slug}`;
}

export function temAcessoATrama(character: Character): boolean {
  if ((character.niveis_vertente?.sinaptica ?? 0) > 0) return true;
  return (character.escalpos_instalados ?? []).some((e) => DECK_SINAPTICO.test(e.contentId));
}

function condicoesAtivas(character: Character): Set<string> {
  return new Set(
    (character.condicoes_ativas ?? [])
      .filter((c) => c.ativa)
      .map((c) => normalizeConditionSlug(c.conditionId ?? c.nome)),
  );
}

/** Texto do custo no cartão: valor grande + unidade pequena. */
export function custoDoCartao(custo: CustoAcaoV12): { valor: string; unidade: string } {
  if (custo.reacao) return { valor: String(custo.reacao), unidade: "Reação" };
  if (custo.livre) return { valor: "—", unidade: "Livre" };
  if (custo.proprio) return { valor: "—", unidade: "Custo próprio" };
  const pa = custo.pa ?? 0;
  return { valor: custo.pa_max ? `${pa}–${custo.pa_max}` : String(pa), unidade: "PA" };
}

function recursos(character: Character, ctx: ContextoAbaAcoes): RecursosAbaAcoes {
  const jogo = character.estado_jogo ?? {};
  const trama = character.trama_ativa?.ativa ? character.trama_ativa : null;
  return {
    pa: { restantes: Math.max(0, ctx.paMax - (jogo.pa_gastos ?? 0)), max: ctx.paMax },
    reacoes: { restantes: Math.max(0, ctx.reacoesPorRodada - (jogo.reacoes_usadas ?? 0)), total: ctx.reacoesPorRodada },
    trama: trama
      ? { ram: trama.ramAtual, ramMax: trama.ramMaximo, deteccao: trama.deteccaoAtual, limite: trama.limiteDeteccao, rastro: trama.rastro }
      : null,
  };
}

/** Requisitos da ação contra a ficha. Nunca bloqueiam: viram avisos. */
function avisosDaAcao(acao: AcaoV12, character: Character, ctx: ContextoAbaAcoes, rec: RecursosAbaAcoes, acessoTrama: boolean): AvisoAcao[] {
  const avisos: AvisoAcao[] = [];
  const condicoes = condicoesAtivas(character);

  for (const r of acao.requisitos) {
    let atendido = true;
    let alcance: AvisoAcao["alcance"] = "acao";
    switch (r.tipo) {
      case "condicao_em_si": {
        const lista = Array.isArray(r.condicao) ? r.condicao : r.condicao ? [r.condicao] : [];
        atendido = lista.some((c) => condicoes.has(c));
        break;
      }
      case "acesso_trama":
        atendido = acessoTrama;
        if (acao.cena === "trama") alcance = "cena";
        break;
      case "sessao_ativa":
        // Sem acesso, o aviso da cena já diz tudo; com acesso e sem Sessão, avisa na ação.
        atendido = !acessoTrama || rec.trama !== null;
        break;
      case "comando_conhecido":
        atendido = !ctx.comandosConhecidos || ctx.comandosConhecidos.includes(acao.slug);
        break;
      case "arma_com_propriedade":
      case "protecao_empunhada": {
        // Mesmo cálculo do motor v1.1; sem modelos de item não dá para saber, então não avisa.
        if (!ctx.itens) break;
        const req = getActionItemRequirements(character, { requisitos: [r] } as unknown as CombatActionContent, ctx.itens);
        atendido = req.every((x) => x.satisfied);
        break;
      }
    }
    if (!atendido) avisos.push({ alcance, texto: r.aviso });
  }

  const custo = acao.custo;
  if (custo.pa && custo.pa > rec.pa.restantes) {
    avisos.push({ alcance: "acao", texto: `Você tem ${rec.pa.restantes} PA nesta rodada` });
  }
  if (custo.reacao && rec.reacoes.restantes < custo.reacao) {
    avisos.push({ alcance: "acao", texto: "Sem Reação nesta rodada: a defesa sofre –1 de desvantagem cumulativa" });
  }
  if (rec.trama && custo.ram && custo.ram > rec.trama.ram) {
    avisos.push({ alcance: "acao", texto: `Você tem ${rec.trama.ram} RAM` });
  }
  return avisos;
}

function acaoDeClasse(a: ClassAction, cena: CenaAcao): AcaoV12 {
  const primeiraFrase = a.description.split(/(?<=\.)\s/)[0];
  return {
    slug: `classe_${a.id}`,
    nome: a.name,
    cena,
    grupo: "classe",
    tipo: "acao",
    custo: { pa: a.pa },
    funcao: primeiraFrase,
    teste: null,
    requisitos: [],
    descricao: a.description,
    classe: a,
  };
}

export function montarAbaAcoes(catalogo: CatalogoAcoesV12, character: Character, ctx: ContextoAbaAcoes): AbaAcoes {
  const rec = recursos(character, ctx);
  const acessoTrama = temAcessoATrama(character);
  const condicoes = condicoesAtivas(character);
  const fixadas = new Set(ctx.fixadas ?? []);

  const item = (acao: AcaoV12): ItemAbaAcao => {
    const { valor, unidade } = custoDoCartao(acao.custo);
    const avisos = avisosDaAcao(acao, character, ctx, rec, acessoTrama);
    return {
      chave: chaveAcao(acao),
      acao,
      custoValor: valor,
      custoUnidade: unidade,
      ram: acao.cena === "trama" ? acao.custo.ram ?? 0 : null,
      avisos,
      ativa: acao.estado === "postura" && condicoes.has(acao.slug),
      fixada: fixadas.has(chaveAcao(acao)),
    };
  };

  const grupos: GrupoAbaAcao[] = [];
  for (const cena of CENAS) {
    for (const g of catalogo.grupos[cena] ?? []) {
      const itens = catalogo.acoes.filter((a) => a.cena === cena && a.grupo === g.slug).map(item);
      if (!itens.length) continue;
      const grupo: GrupoAbaAcao = { cena, slug: g.slug, nome: g.nome, itens };
      if (g.slug === "defensiva") grupo.nota = "usam Reação";
      if (g.slug === "comando" && ctx.comandosConhecidos) {
        const conhecidos = itens.filter((i) => ctx.comandosConhecidos!.includes(i.acao.slug)).length;
        grupo.nota = `${conhecidos} de ${itens.length} conhecidos · cada uso +1 Rastro`;
      } else if (g.slug === "comando") {
        grupo.nota = "cada uso +1 Rastro";
      }
      grupos.push(grupo);
    }
  }

  // Ações de classe: um grupo com o nome da subclasse, na cena em que se aplica.
  const prog = progression(character);
  const daClasse = prog?.subclasse_id ? SUBCLASS_ACTIONS[prog.subclasse_id] ?? [] : [];
  if (prog?.subclasse_id && daClasse.length) {
    const cena = CENA_DA_SUBCLASSE[prog.subclasse_id] ?? "combate";
    const itens = daClasse.map((a) => {
      const i = item(acaoDeClasse(a, cena));
      if (!reached(prog.ranking, a.rank)) i.avisos.unshift({ alcance: "acao", texto: `Disponível no Ranking ${a.rank}` });
      return i;
    });
    const nome = prog.subclasse_id.split("_").map((p) => p[0].toUpperCase() + p.slice(1)).join(" ");
    // Depois dos grupos de ação da cena e antes das Livres/Posturas não importa a ordem exata; fica ao fim da cena.
    const ultimo = grupos.map((g) => g.cena).lastIndexOf(cena);
    grupos.splice(ultimo + 1, 0, { cena, slug: "classe", nome, nota: "da sua classe", itens });
  }

  const todos = grupos.flatMap((g) => g.itens);
  const avisoDaCena: AbaAcoes["avisoDaCena"] = {};
  if (!acessoTrama) avisoDaCena.trama = "Você não tem Deck Sináptico nem Sináptica";

  return {
    cenaSugerida: rec.trama ? "trama" : ctx.emCombate ? "combate" : ctx.ultimaCena ?? "combate",
    recursos: rec,
    avisoDaCena,
    ataques: ctx.ataques ?? [],
    fixadas: todos.filter((i) => i.fixada),
    grupos,
  };
}

/** Busca por nome nas três cenas, sem acento e sem caixa. */
export function buscarAcoes(aba: AbaAcoes, termo: string): ItemAbaAcao[] {
  const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const t = norm(termo.trim());
  if (!t) return [];
  return aba.grupos.flatMap((g) => g.itens).filter((i) => norm(i.acao.nome).includes(t));
}
