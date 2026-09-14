/**
 * Modelo de apresentação de token — o que o mapa/HUD/menus precisam
 * pra desenhar e interagir, derivado INTEIRAMENTE do token PERSISTIDO
 * (`vtt_tokens`, `TokenVtt` em `lib/vtt/sceneStorage.ts`).
 *
 * `CENA_DEMO.tokens` deixou de ser fonte de qualquer coisa depois do
 * seed inicial — este tipo existe pra `MapaHex`/`Trilha`/`Hud` pararem
 * de depender da forma rica de `TokenCena` (que carregava vitais
 * completos, ações, PA, reflexos… dados de FICHA que `vtt_tokens`
 * deliberadamente não replica, ver migration 0073). `id` AQUI é sempre
 * o id PERSISTIDO (`vtt_tokens.id`) — não existe mais conceito de "id
 * demo" em lugar nenhum do fluxo mecânico.
 *
 * Declarado com campos próprios (não `import type { TokenVtt }` de
 * `lib/vtt/sceneStorage.ts`) de propósito: aquele módulo importa
 * `"server-only"`, e mesmo um `import type` cruzando essa fronteira é
 * risco desnecessário de bundling — mais simples manter os dois tipos
 * estruturalmente compatíveis (e checados por `tokenApresentacaoDe`)
 * do que arriscar.
 */

import type { Hex, TamanhoCriatura } from "../_mapa/hex";
import type { CondicaoSlug } from "../_dados/cenaDemo";

export type LadoToken = "pj" | "pn" | "neutro";
export type VertenteToken =
  | "somatico" | "cognitivo" | "material" | "energetico" | "cinetica" | "sinaptica" | "nenhuma";

export interface TokenApresentacao {
  /** `vtt_tokens.id` — identidade canônica. Nunca casado por sigla/nome. */
  id: string;
  nome: string;
  sigla: string;
  lado: LadoToken;
  vertente: VertenteToken;
  tamanho: TamanhoCriatura;
  /** Posição da ÂNCORA — pertence à pegada, nunca o centro geométrico. */
  pos: Hex;
  /**
   * Deslocamento sub-célula dentro da âncora, em unidades axiais
   * fracionárias — só DESENHO (migration 0094). Quem ocupa célula é
   * `pos`; isto é onde dentro dela o token aparece, e é o que faz o
   * arrasto com a grade escondida parar onde foi solto.
   */
  offset: Hex;
  orientacao: number;
  /** Para onde ele OLHA (0–5) — livre, não muda as células ocupadas. */
  direcao: number;
  pegadaPersonalizada: Hex[] | null;
  retrato: string | null;
  /** Id do arquivo PRÓPRIO do token — `null` quando o retrato é herdado, externo, ou não existe. */
  retratoImageId: string | null;
  /**
   * De onde vem a cara que está sendo desenhada. A interface precisa
   * disto para não oferecer "Remover" sobre uma imagem que não é deste
   * token — foi exatamente o que confundiu na mesa: remover o próprio
   * fazia o avatar da ficha aparecer, e parecia "voltar" para uma
   * imagem antiga.
   */
  origemRetrato: "arquivo" | "endereco" | "herdado" | "nenhum";
  /** `null` = sem PV definido (a UI deve tratar como "sem barra de vida", não como 0). */
  pv: number | null;
  pvMax: number | null;
  /** PE e Mana PRÓPRIOS (migration 0133); nulos quando o token tem ficha. */
  pe: number | null;
  peMax: number | null;
  mana: number | null;
  manaMax: number | null;
  condicoes: CondicaoSlug[];
  visivel: boolean;
  bloqueado: boolean;
  characterId: string | null;
  pvPublico: boolean | null;
  pePublico: boolean | null;
  manaPublica: boolean | null;
  podeControlar: boolean;
  revision: number;
}

const VERTENTES_VALIDAS: readonly VertenteToken[] = [
  "somatico", "cognitivo", "material", "energetico", "cinetica", "sinaptica", "nenhuma",
];
const CONDICOES_VALIDAS: readonly CondicaoSlug[] = [
  "atordoado", "caido", "cego", "surdo", "lento", "sangrando", "queimando",
  "envenenado", "saturado", "insaturado", "imobilizado", "agarrado",
  "ofuscado", "contundido", "sufocando", "inconsciente",
];

function vertenteValida(v: string): VertenteToken {
  return (VERTENTES_VALIDAS as readonly string[]).includes(v) ? (v as VertenteToken) : "nenhuma";
}

/** Filtra condições pra só as que a UI sabe desenhar — o banco já valida o slug na escrita (migration 0073), isto é só a ponte de tipo. */
function condicoesValidas(cs: readonly string[]): CondicaoSlug[] {
  return cs.filter((c): c is CondicaoSlug => (CONDICOES_VALIDAS as readonly string[]).includes(c));
}

/** Fonte única de tradução token-persistido → apresentação — todo lugar que hoje lê `estadoCena.tokens` direto passa por aqui, uma vez. */
export function tokenApresentacaoDe(t: {
  id: string;
  nome: string;
  sigla: string;
  lado: string;
  vertente: string;
  tamanho: string;
  q: number;
  r: number;
  offsetQ?: number;
  offsetR?: number;
  orientacao: number;
  /** Para onde ele OLHA (0–5) — livre, não muda as células ocupadas. */
  direcao: number;
  pegadaPersonalizada: Hex[] | null;
  retratoUrl: string | null;
  retratoImageId: string | null;
  retratoEfetivoId: string | null;
  pvAtual: number | null;
  pvMax: number | null;
  peAtual: number | null;
  peMax: number | null;
  manaAtual: number | null;
  manaMax: number | null;
  condicoes: string[];
  visivel: boolean;
  bloqueado: boolean;
  characterId: string | null;
  pvPublico: boolean | null;
  pePublico: boolean | null;
  manaPublica: boolean | null;
  podeControlar: boolean;
  revision: number;
},
  /**
   * URLs já assinadas por id de arquivo. Opcional: quem não tem imagem
   * de arquivo em cena (ou ainda não recebeu as assinaturas) passa
   * nada, e o retrato cai no endereço externo ou na sigla.
   */
  urlsAssinadas?: Record<string, string>,
): TokenApresentacao {
  return {
    id: t.id,
    nome: t.nome,
    sigla: t.sigla,
    lado: (t.lado as LadoToken) ?? "neutro",
    vertente: vertenteValida(t.vertente),
    tamanho: t.tamanho as TamanhoCriatura,
    pos: { q: t.q, r: t.r },
    /** Onde DENTRO da célula âncora desenhar — ver `TokenVtt.offsetQ`. */
    offset: { q: t.offsetQ ?? 0, r: t.offsetR ?? 0 },
    orientacao: t.orientacao,
    direcao: t.direcao ?? t.orientacao,
    pegadaPersonalizada: t.pegadaPersonalizada,
    // A precedência é do BANCO, não daqui: a 0101 garante que só uma
    // das duas origens está preenchida por vez. Resolver na ordem é
    // só refletir isso — `??` e não um fallback que "conserta".
    retrato: t.retratoEfetivoId
      ? (urlsAssinadas?.[t.retratoEfetivoId] ?? null)
      : t.retratoUrl,
    retratoImageId: t.retratoImageId,
    origemRetrato:
      t.retratoImageId !== null ? "arquivo"
      : t.retratoUrl !== null ? "endereco"
      : t.retratoEfetivoId !== null ? "herdado"
      : "nenhum",
    pv: t.pvAtual,
    pvMax: t.pvMax,
    pe: t.peAtual,
    peMax: t.peMax,
    mana: t.manaAtual,
    manaMax: t.manaMax,
    condicoes: condicoesValidas(t.condicoes),
    visivel: t.visivel,
    bloqueado: t.bloqueado,
    characterId: t.characterId,
    pvPublico: t.pvPublico,
    pePublico: t.pePublico,
    manaPublica: t.manaPublica,
    podeControlar: t.podeControlar,
    revision: t.revision,
  };
}
