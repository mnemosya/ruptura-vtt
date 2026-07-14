/**
 * Conversão canônico (Etapa 1) → editável (Etapa 4). Roda uma única vez,
 * no momento em que um rascunho é criado a partir de conteúdo publicado
 * (ou duplicado) — depois disso, `efeitos: EfeitoEditavel[]` vive dentro
 * de `camposEditaveis` e é a fonte de verdade (o `rawOriginal` nunca é
 * reescrito, conforme a arquitetura da Etapa 3).
 *
 * Só os 6 tipos do MVP são promovidos a editável. `teste_resistencia` e
 * `outro` (e qualquer tipo futuro fora do MVP) permanecem somente
 * leitura, sempre re-derivados de `rawOriginal` — nunca convertidos.
 */

import type { EfeitoCanonico, Referencia } from "./types";
import { isTipoEfeitoMvp, type EfeitoEditavel, type CamposAplicarCondicao, type CamposAlterarRecurso, type CamposModificarTeste, type RecursoAlterar, type RecursoCura } from "./effectDraftTypes";

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}
function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function asBoolean(v: unknown, padrao: boolean): boolean {
  return typeof v === "boolean" ? v : padrao;
}

function parseDado(dado: unknown): { quantidadeDados?: number; faces?: number } {
  if (typeof dado !== "string") return {};
  const m = dado.trim().match(/^(\d+)d(\d+)$/i);
  if (!m) return {};
  return { quantidadeDados: Number(m[1]), faces: Number(m[2]) };
}

function referenciaCondicao(payloadEspecifico: Record<string, unknown>): string {
  const condicao = payloadEspecifico.condicao;
  if (condicao && typeof condicao === "object" && "slug" in (condicao as Referencia)) return (condicao as Referencia).slug;
  return typeof condicao === "string" ? condicao : "";
}

const RECURSOS_CURA_VALIDOS = new Set(["pv", "pe", "mana", "integridade", "pd"]);
const RECURSOS_ALTERAR_VALIDOS = new Set(["pv", "pe", "mana", "integridade", "pa", "reacoes", "sobrecarga", "ram", "cargas", "municao", "dados_de_gatilho"]);

function normalizarRecursoCura(v: unknown): RecursoCura {
  const s = typeof v === "string" ? v.toLowerCase() : "";
  return (RECURSOS_CURA_VALIDOS.has(s) ? s : "pv") as RecursoCura;
}

function normalizarRecursoAlterar(v: unknown): RecursoAlterar {
  const s = typeof v === "string" ? v.toLowerCase() : "";
  return (RECURSOS_ALTERAR_VALIDOS.has(s) ? s : "pa") as RecursoAlterar;
}

/** Converte um efeito canônico (Etapa 1) já reconhecido como um dos 6 tipos MVP em `EfeitoEditavel`. */
export function converterEfeitoCanonicoParaEditavel(efeito: EfeitoCanonico, ordem: number): EfeitoEditavel {
  const p = efeito.payloadEspecifico;
  const comuns = {
    id: efeito.id,
    habilitado: efeito.habilitado,
    ordem,
    gatilho: efeito.gatilho,
    alvo: efeito.alvo,
    duracao: efeito.duracao,
  };

  switch (efeito.tipo) {
    case "dano": {
      const { quantidadeDados, faces } = parseDado(p.dado);
      const modificador = asNumber(p.modificador);
      return {
        ...comuns,
        tipo: "dano",
        campos: {
          tipoFormula: p.valorFixo != null ? "fixo" : modificador != null ? "dados_com_modificador" : "dados",
          quantidadeDados,
          faces,
          modificador,
          valorFixo: asNumber(p.valorFixo),
          tipoDano: asString(p.tipoDano) ?? "",
          subtipoDano: asString(p.subtipoDano),
          danoPrincipalOuAdicional: "principal",
          ignoraMit: asBoolean(p.ignoraMit, false),
          ignoraPd: asBoolean(p.ignoraPd, false),
          metadeEmSucesso: p.sucesso === "metade",
        },
      };
    }
    case "cura": {
      const { quantidadeDados, faces } = parseDado(p.dado);
      return {
        ...comuns,
        tipo: "cura",
        campos: {
          tipoFormula: p.valorFixo != null ? "fixo" : "dados",
          quantidadeDados,
          faces,
          valorFixo: asNumber(p.valorFixo),
          recurso: normalizarRecursoCura(p.recurso),
          limitarAoMaximo: true,
          permitirValorTemporario: false,
        },
      };
    }
    case "aplicar_condicao": {
      const campos: CamposAplicarCondicao = {
        condicaoSlug: referenciaCondicao(p),
        acumulavel: false,
        autoria: "sem_autoria",
        confirmacaoManual: true,
      };
      return { ...comuns, tipo: "aplicar_condicao", campos };
    }
    case "remover_condicao": {
      const slug = referenciaCondicao(p);
      return {
        ...comuns,
        tipo: "remover_condicao",
        campos: { condicaoSlug: slug || undefined, condicoesPossiveis: [], selecaoManual: !slug, removerTodas: Boolean(p.todas), bloquearSemCondicaoCompativel: true },
      };
    }
    case "modificar_teste": {
      const campos: CamposModificarTeste = {
        modo: "bonus",
        valor: asNumber(p.valor),
        tags: Array.isArray(p.alvoTags) ? (p.alvoTags as unknown[]).filter((t): t is string => typeof t === "string") : [],
        acao: Array.isArray(p.alvoAcoes) ? asString(p.alvoAcoes[0]) : undefined,
        acumulavel: false,
        consumirNoProximoTeste: false,
        confirmacaoDeContexto: Boolean(p.recebido),
      };
      return { ...comuns, tipo: "modificar_teste", campos };
    }
    case "alterar_recurso": {
      const campos: CamposAlterarRecurso = {
        recurso: normalizarRecursoAlterar(p.recurso),
        operacao: "somar",
        valorFixo: asNumber(p.valor),
        bloquearPorInsuficiencia: false,
      };
      return { ...comuns, tipo: "alterar_recurso", campos };
    }
    default:
      // Nunca deveria chegar aqui — quem chama já filtra por isTipoEfeitoMvp.
      throw new Error(`Tipo de efeito "${efeito.tipo}" não é um dos 6 tipos do MVP do Construtor de Efeitos.`);
  }
}

/** A partir dos efeitos canônicos (Etapa 1) de um documento/nível, extrai os editáveis (MVP) já convertidos. */
export function extrairEfeitosEditaveis(efeitosCanonicos: EfeitoCanonico[]): EfeitoEditavel[] {
  return efeitosCanonicos
    .filter((e) => isTipoEfeitoMvp(e.tipo))
    .map((e, indice) => converterEfeitoCanonicoParaEditavel(e, indice));
}

/** Os efeitos que NÃO entraram no construtor (teste_resistencia, outro, ...) — permanecem somente leitura, sempre re-derivados do rawOriginal. */
export function filtrarEfeitosSomenteLeitura(efeitosCanonicos: EfeitoCanonico[]): EfeitoCanonico[] {
  return efeitosCanonicos.filter((e) => !isTipoEfeitoMvp(e.tipo));
}
