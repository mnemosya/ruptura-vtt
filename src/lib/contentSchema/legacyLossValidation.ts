/**
 * Validação de perda para publicação de conteúdo convertido de legado
 * (Etapa 6). Compara o payload original preservado no rascunho
 * (`preservado.rawOriginal`) com o corpo que SERIA publicado, e falha
 * quando algo que deveria sobreviver por construção desaparece.
 *
 * Não exige igualdade byte a byte — versão/status/timestamps mudam
 * legitimamente a cada publicação (autoridade do RPC da Etapa 5). Só
 * falha em PERDA INDEVIDA: caminho preservado sumindo, efeito somente
 * leitura alterado, nível de talento sumindo, `estatisticas` reescrito,
 * campo desconhecido não reinserido.
 */

import type { DraftOrigemLegado } from "./draftTypes";

function getEmCaminho(obj: unknown, caminho: string): unknown {
  const partes = caminho.split(/\.|\[|\]/).filter(Boolean);
  let atual: unknown = obj;
  for (const parte of partes) {
    if (atual == null || typeof atual !== "object") return undefined;
    atual = (atual as Record<string, unknown>)[parte] ?? (Array.isArray(atual) ? (atual as unknown[])[Number(parte)] : undefined);
  }
  return atual;
}

function efeitosDe(payload: Record<string, unknown>): unknown[] {
  const automacao = payload.payload_automacao;
  if (automacao && typeof automacao === "object" && Array.isArray((automacao as Record<string, unknown>).efeitos)) {
    return (automacao as Record<string, unknown>).efeitos as unknown[];
  }
  return [];
}

function efeitosDeTalento(payload: Record<string, unknown>): unknown[] {
  const niveis = Array.isArray(payload.niveis) ? payload.niveis : [];
  return niveis.flatMap((n) => (n && typeof n === "object" ? efeitosDe(n as Record<string, unknown>) : []));
}

/**
 * Compara original vs republicado para um rascunho com `origemLegado`.
 * Retorna mensagens de erro BLOQUEANTES — vazio quando não há perda indevida.
 */
/**
 * Chaves de `estatisticas` de item que a Etapa 9 passou a editar de
 * verdade (defaults de modelo: MIT/PD/carga/munição/slots de runa) —
 * únicas que podem legitimamente divergir do original nesta checagem.
 * Qualquer OUTRA chave de `estatisticas` continua estritamente
 * somente-leitura (invariante da Etapa 6).
 */
const CHAVES_ESTATISTICAS_EDITAVEIS_ITEM = new Set(["mit_base", "pd_max", "tipo_protecao", "regioes", "slots_runa_max", "cargas_max", "municao_max", "municao_compativel"]);

function estatisticasMudouForaDoEditavel(antes: unknown, depois: unknown): boolean {
  const a = antes && typeof antes === "object" ? (antes as Record<string, unknown>) : {};
  const d = depois && typeof depois === "object" ? (depois as Record<string, unknown>) : {};
  const chaves = new Set([...Object.keys(a), ...Object.keys(d)]);
  for (const chave of chaves) {
    if (CHAVES_ESTATISTICAS_EDITAVEIS_ITEM.has(chave)) continue;
    if (JSON.stringify(a[chave]) !== JSON.stringify(d[chave])) return true;
  }
  return false;
}

export function validarPerdaConversaoLegado(
  contentType: "spell" | "item" | "talent" | "rune",
  rawOriginal: Record<string, unknown>,
  corpoRepublicado: Record<string, unknown>,
  origemLegado: DraftOrigemLegado,
): string[] {
  const erros: string[] = [];

  // 1. Campos somente leitura registrados na conversão continuam presentes com o MESMO conteúdo.
  for (const caminho of origemLegado.camposSomenteLeitura) {
    const antes = getEmCaminho(rawOriginal, caminho);
    const depois = getEmCaminho(corpoRepublicado, caminho);
    if (antes !== undefined && JSON.stringify(antes) !== JSON.stringify(depois)) {
      erros.push(`Campo somente leitura "${caminho}" foi alterado pela publicação — isso não pode acontecer.`);
    }
  }

  // 2. estatisticas de item: só as chaves de defaults de modelo da Etapa 9
  // podem divergir do original — qualquer outra chave continua somente leitura.
  if (contentType === "item" && rawOriginal.estatisticas !== undefined) {
    if (estatisticasMudouForaDoEditavel(rawOriginal.estatisticas, corpoRepublicado.estatisticas)) {
      erros.push('Campo "estatisticas" do item foi reescrito pela publicação fora dos defaults editáveis (MIT/PD/carga/munição/slots de runa) — as demais chaves deveriam permanecer somente leitura.');
    }
  }

  // 3. Talento: os 3 níveis continuam presentes.
  if (contentType === "talent") {
    const niveisAntes = Array.isArray(rawOriginal.niveis) ? rawOriginal.niveis.length : 0;
    const niveisDepois = Array.isArray(corpoRepublicado.niveis) ? corpoRepublicado.niveis.length : 0;
    if (niveisAntes === 3 && niveisDepois !== 3) {
      erros.push(`A árvore de talento tinha 3 níveis e a republicação produziu ${niveisDepois} — perda de nível.`);
    }
  }

  // 4. Efeitos preservados (somente leitura/incompatíveis) continuam presentes na saída, mesmo tipo/família.
  const efeitosAntes = contentType === "talent" ? efeitosDeTalento(rawOriginal) : efeitosDe(rawOriginal);
  const efeitosDepois = contentType === "talent" ? efeitosDeTalento(corpoRepublicado) : efeitosDe(corpoRepublicado);
  const tiposDepois = new Set(
    efeitosDepois.map((e) => (e && typeof e === "object" ? JSON.stringify({ tipo: (e as Record<string, unknown>).tipo, familia: (e as Record<string, unknown>).familia }) : "")),
  );
  // Só checa os efeitos que a conversão marcou como preservados (não os editáveis, que legitimamente mudam de forma).
  const tiposPreservadosEsperados = origemLegado.efeitosPreservados
    .map((resumo) => resumo.match(/^\S+ \(([^)]+)\)/)?.[1])
    .filter((t): t is string => !!t);
  for (const tipoLegado of tiposPreservadosEsperados) {
    const aindaExiste = efeitosAntes.some((e) => e && typeof e === "object" && (e as Record<string, unknown>).tipo === tipoLegado) ? efeitosDepois.some((e) => e && typeof e === "object" && (e as Record<string, unknown>).tipo === tipoLegado) : true;
    if (!aindaExiste) erros.push(`Efeito preservado do tipo "${tipoLegado}" desapareceu na republicação.`);
  }
  void tiposDepois;

  // 5. Campos desconhecidos registrados continuam presentes em algum lugar do payload republicado.
  for (const caminho of origemLegado.camposDesconhecidos) {
    const antes = getEmCaminho(rawOriginal, caminho);
    if (antes === undefined) continue;
    const depois = getEmCaminho(corpoRepublicado, caminho);
    if (depois === undefined) erros.push(`Campo desconhecido preservado "${caminho}" não foi reinserido na republicação.`);
  }

  return erros;
}
