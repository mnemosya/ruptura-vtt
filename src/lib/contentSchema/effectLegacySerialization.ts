/**
 * Serialização REVERSA de efeitos: `EfeitoEditavel` (Construtor de
 * Efeitos, Etapa 4) → objeto de efeito no formato legado de
 * `payload_automacao.efeitos[]` (o que `content_documents.payload`
 * guarda e os consumidores do jogo leem).
 *
 * A Etapa 4 só tinha o caminho DIRETO (legado/canônico → editável,
 * `effectDraftMapping.ts`). Publicar (Etapa 5) exige o inverso. Ver a
 * decisão de arquitetura de serialização em
 * docs/CHECKPOINT_ETAPA5_PUBLICACAO_VERSIONAMENTO.md §Serialização.
 *
 * GARANTIA ANTI-PERDA: cada efeito serializado carrega, além das chaves
 * que os consumidores atuais entendem (para o jogo continuar lendo o
 * formato legado), um blob `_editor` com o `EfeitoEditavel` COMPLETO —
 * a representação autoritativa do editor. Consumidores ignoram `_editor`
 * (chave desconhecida); nada que o editor sabe é descartado
 * silenciosamente. Uma futura extensão dos adapters (Etapa 1/4) pode
 * reler `_editor` para round-trip 100% fiel; hoje o caminho de re-edição
 * relê pelas chaves legadas conhecidas (round-trip fiel dos campos com
 * equivalente legado; ver limitações no checkpoint).
 */

import type { DraftContentType } from "./draftTypes";
import { EFFECT_TYPE_REGISTRY } from "./effectTypeRegistry";
import { formatarFormulaCura, formatarFormulaDano, type EfeitoEditavel, type TipoEfeitoMvp } from "./effectDraftTypes";

/**
 * `tipo` legado a emitir para um efeito canônico de um dado content_type.
 * Usa o primeiro alias legado registrado no catálogo (Etapa 1) quando
 * existir para aquele content_type; senão cai no próprio nome canônico
 * do MVP (efeitos novos do editor sem equivalente legado prévio — ex.:
 * "dano" em talento, que o conteúdo importado nunca teve).
 */
export function tipoLegadoParaEfeito(contentType: DraftContentType, tipoCanonico: TipoEfeitoMvp): string {
  const aliases = EFFECT_TYPE_REGISTRY[tipoCanonico]?.aliasesLegado[contentType];
  return aliases && aliases.length > 0 ? aliases[0] : tipoCanonico;
}

function limpar(obj: Record<string, unknown>): Record<string, unknown> {
  // Remove chaves undefined para não poluir o JSON publicado.
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) saida[k] = v;
  }
  return saida;
}

/** Chaves transversais (gatilho/alvo/duração/habilitado) só quando fazem diferença. */
function comunsLegado(efeito: EfeitoEditavel): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  if (efeito.gatilho) c.gatilho = efeito.gatilho;
  if (efeito.alvo) c.alvo = efeito.alvo;
  if (efeito.duracao) c.duracao = efeito.duracao;
  if (efeito.habilitado === false) c.habilitado = false;
  if (efeito.nomeOpcional) c.nome = efeito.nomeOpcional;
  if (efeito.textoLog) c.texto_log = efeito.textoLog;
  return c;
}

/** Chaves específicas por tipo, no vocabulário legado que os consumidores leem. */
function especificoLegado(efeito: EfeitoEditavel): Record<string, unknown> {
  switch (efeito.tipo) {
    case "dano": {
      const cp = efeito.campos;
      return {
        dado: cp.tipoFormula === "fixo" ? undefined : formatarFormulaDano(cp),
        valor_fixo: cp.tipoFormula === "fixo" ? cp.valorFixo : undefined,
        tipo_dano: cp.tipoDano || undefined,
        subtipo_dano: cp.subtipoDano || undefined,
        sucesso: cp.metadeEmSucesso ? "metade" : undefined,
        dano_adicional: cp.danoPrincipalOuAdicional === "adicional" ? true : undefined,
        ignora_mit: cp.ignoraMit ? true : undefined,
        ignora_pd: cp.ignoraPd ? true : undefined,
      };
    }
    case "cura": {
      const cp = efeito.campos;
      return {
        dado: cp.tipoFormula === "fixo" ? undefined : formatarFormulaCura(cp),
        valor_fixo: cp.tipoFormula === "fixo" ? cp.valorFixo : undefined,
        recurso: cp.recurso,
      };
    }
    case "aplicar_condicao": {
      const cp = efeito.campos;
      return {
        condicao: cp.condicaoSlug || undefined,
        intensidade: cp.intensidadeOuPilhas,
        acumulavel: cp.acumulavel ? true : undefined,
        maximo_pilhas: cp.maximoDePilhas,
      };
    }
    case "remover_condicao": {
      const cp = efeito.campos;
      return {
        condicao: cp.condicaoSlug || undefined,
        todas: cp.removerTodas ? true : undefined,
        quantidade: cp.quantidadeRemovida,
      };
    }
    case "modificar_teste": {
      const cp = efeito.campos;
      return {
        valor: cp.valor,
        modo: cp.modo,
        pericia: cp.pericia,
        atributo: cp.atributo,
        alvo_tags: cp.tags.length > 0 ? cp.tags : undefined,
        alvo_acoes: cp.acao ? [cp.acao] : undefined,
      };
    }
    case "alterar_recurso": {
      const cp = efeito.campos;
      return {
        recurso: cp.recurso,
        operacao: cp.operacao,
        valor: cp.valorFixo,
        formula: cp.formula,
      };
    }
  }
}

/**
 * Serializa UM efeito editável para o objeto legado. `_editor` guarda o
 * efeito editável completo (fonte autoritativa anti-perda).
 */
export function serializarEfeitoLegado(contentType: DraftContentType, efeito: EfeitoEditavel): Record<string, unknown> {
  return limpar({
    tipo: tipoLegadoParaEfeito(contentType, efeito.tipo),
    ...comunsLegado(efeito),
    ...especificoLegado(efeito),
    _editor: efeito,
  });
}

/**
 * Reconstrói `payload_automacao.efeitos[]` para publicação:
 * efeitos PRESERVADOS (não-MVP: teste_resistencia, outro/bespoke) na
 * ordem original, seguidos dos efeitos EDITÁVEIS na ordem do editor.
 *
 * Regra de ordem documentada (checkpoint §Serialização): preservados
 * mantêm posição relativa e vêm primeiro; editáveis vêm depois, em
 * `ordem`. Para o caso comum (ex.: magia com `efeito_com_resistencia`
 * seguido de dano/condição) isso reproduz exatamente a ordem original.
 */
export function reconstruirEfeitosLegado(
  contentType: DraftContentType,
  efeitosLegadoOriginais: unknown[],
  efeitosEditaveis: EfeitoEditavel[],
  isTipoEfeitoMvpLegado: (tipoLegado: string | undefined) => boolean,
): unknown[] {
  const preservados = efeitosLegadoOriginais.filter((e) => {
    const tipo = typeof e === "object" && e !== null ? (e as Record<string, unknown>).tipo : undefined;
    return !isTipoEfeitoMvpLegado(typeof tipo === "string" ? tipo : undefined);
  });

  const editaveisSerializados = [...efeitosEditaveis]
    .sort((a, b) => a.ordem - b.ordem)
    .map((e) => serializarEfeitoLegado(contentType, e));

  return [...preservados, ...editaveisSerializados];
}
