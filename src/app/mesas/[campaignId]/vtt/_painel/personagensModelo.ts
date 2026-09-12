/**
 * Lógica PURA do diretório de Personagens: montar a árvore de pastas,
 * ordenar, buscar e decidir a sigla de cada linha.
 *
 * Regra que atravessa tudo aqui: este diretório é de DOCUMENTOS
 * persistentes. Token de cena não entra, nem quando existe um token
 * ligado ao personagem — o token é uma INSTÂNCIA da cena, o documento
 * é o personagem. Por isso nenhuma função deste arquivo aceita
 * `TokenApresentacao`: não há como misturar as duas coisas por
 * engano.
 */

import type { EntradaDiretorio, PastaDiretorio } from "./acoes/personagensPainel";

/** Uma pasta com o que vive dentro dela, já ordenado. */
export interface NoDiretorio {
  pasta: PastaDiretorio | null;
  subpastas: NoDiretorio[];
  entradas: EntradaDiretorio[];
}

export type Ordenacao = "alfabetica" | "manual";

function compararAlfabetico(a: EntradaDiretorio, b: EntradaDiretorio): number {
  const porNome = a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
  return porNome !== 0 ? porNome : a.characterId < b.characterId ? -1 : a.characterId > b.characterId ? 1 : 0;
}

function compararManual(a: EntradaDiretorio, b: EntradaDiretorio): number {
  return a.posicao !== b.posicao ? a.posicao - b.posicao : compararAlfabetico(a, b);
}

/**
 * Casa uma entrada contra a busca por nome. Sem acento e sem caixa —
 * `localeCompare` não serve pra "contém", então a normalização é
 * explícita (`NFD` + remoção de diacríticos).
 */
export function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function entradaCasaBusca(entrada: EntradaDiretorio, consulta: string): boolean {
  const alvo = normalizarBusca(consulta);
  if (!alvo) return true;
  return normalizarBusca(entrada.nome).includes(alvo);
}

/**
 * Monta a árvore. Pastas órfãs (pai apagado numa corrida entre duas
 * sessões) sobem para a raiz em vez de sumirem — nenhum personagem
 * fica invisível por causa de uma pasta que não existe mais.
 *
 * Com BUSCA ativa a árvore é ACHATADA: procurar por nome num diretório
 * é procurar no diretório inteiro, não só na pasta aberta (mesmo
 * comportamento dos diretórios do Foundry). A raiz devolvida então
 * tem `subpastas: []` e todas as entradas que casaram.
 */
export function montarArvore(params: {
  pastas: readonly PastaDiretorio[];
  entradas: readonly EntradaDiretorio[];
  consulta: string;
  ordenacao: Ordenacao;
  incluirArquivados: boolean;
}): NoDiretorio {
  const comparar = params.ordenacao === "manual" ? compararManual : compararAlfabetico;
  const visiveis = params.entradas.filter(
    (e) => (params.incluirArquivados || !e.arquivado) && entradaCasaBusca(e, params.consulta),
  );

  if (normalizarBusca(params.consulta)) {
    return { pasta: null, subpastas: [], entradas: [...visiveis].sort(comparar) };
  }

  const idsDePasta = new Set(params.pastas.map((p) => p.id));
  const entradasPorPasta = new Map<string | null, EntradaDiretorio[]>();
  for (const e of visiveis) {
    const chave = e.pastaId && idsDePasta.has(e.pastaId) ? e.pastaId : null;
    const lista = entradasPorPasta.get(chave);
    if (lista) lista.push(e);
    else entradasPorPasta.set(chave, [e]);
  }

  const filhasPorPai = new Map<string | null, PastaDiretorio[]>();
  const ordemPastas = [...params.pastas].sort((a, b) =>
    a.posicao !== b.posicao ? a.posicao - b.posicao : a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }),
  );
  for (const p of ordemPastas) {
    const chave = p.parentId && idsDePasta.has(p.parentId) ? p.parentId : null;
    const lista = filhasPorPai.get(chave);
    if (lista) lista.push(p);
    else filhasPorPai.set(chave, [p]);
  }

  function montar(pasta: PastaDiretorio | null): NoDiretorio {
    const chave = pasta?.id ?? null;
    return {
      pasta,
      subpastas: (filhasPorPai.get(chave) ?? []).map(montar),
      entradas: [...(entradasPorPasta.get(chave) ?? [])].sort(comparar),
    };
  }
  return montar(null);
}

/** Quantas entradas (recursivamente) o nó contém — o número ao lado do nome da pasta. */
export function contarEntradas(no: NoDiretorio): number {
  return no.entradas.length + no.subpastas.reduce((n, s) => n + contarEntradas(s), 0);
}

/**
 * Sigla do retrato textual — as mesmas iniciais que `sugerirSigla` do
 * `GerenciadorToken` produz para um nome, para que o personagem e o
 * token criado a partir dele nasçam com a MESMA marca visual.
 */
export function siglaDoNome(nome: string): string {
  const palavras = nome.trim().split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return "";
  if (palavras.length === 1) return palavras[0].slice(0, 3).toUpperCase();
  return palavras.slice(0, 3).map((p) => p[0]).join("").toUpperCase();
}

/** Tipo de arrasto do diretório para o mapa — o `dataTransfer` carrega isto, e o mapa só aceita este formato. */
export const MIME_PERSONAGEM_ARRASTADO = "application/x-ruptura-personagem";

export interface PersonagemArrastado {
  characterId: string;
  nome: string;
  sigla: string;
  tipo: "jogador" | "pn";
}

/** Serialização do arrasto. Formato explícito e versionado — nunca `text/plain` solto, que qualquer campo de texto aceitaria por acidente. */
export function serializarPersonagemArrastado(p: PersonagemArrastado): string {
  return JSON.stringify({ v: 1, ...p });
}

/** Desserialização tolerante: qualquer coisa fora do formato devolve `null`, e o drop é ignorado. */
export function desserializarPersonagemArrastado(bruto: string): PersonagemArrastado | null {
  try {
    const json = JSON.parse(bruto) as Record<string, unknown>;
    if (json.v !== 1) return null;
    if (typeof json.characterId !== "string" || typeof json.nome !== "string") return null;
    return {
      characterId: json.characterId,
      nome: json.nome,
      sigla: typeof json.sigla === "string" ? json.sigla : siglaDoNome(json.nome),
      tipo: json.tipo === "pn" ? "pn" : "jogador",
    };
  } catch {
    return null;
  }
}
