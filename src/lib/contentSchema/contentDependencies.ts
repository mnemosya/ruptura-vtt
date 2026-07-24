/**
 * Coleta de dependências estruturadas (Etapa 11) — pura, sem I/O. Lê o
 * payload PÚBLICO (legado) de um documento e extrai as referências
 * REAIS já estruturadas no schema — nunca inventa uma referência que o
 * conteúdo não declara, nunca resolve ambiguidade escolhendo o primeiro
 * resultado (isso é feito depois, cruzando contra o pacote/Biblioteca).
 *
 * Formas reais cobertas (auditoria):
 *   - `requisitos[]` de topo (`{tipo_conteudo, slug}`) — magia/item,
 *     escrito por `publishSerialization.ts::aplicarRequisitosTopo`.
 *   - `requisitos[]` por nível de talento (mesma forma), escrito por
 *     `aplicarRequisitosNivel`.
 *   - `condicao`/`condicoes_possiveis[]` em efeitos de
 *     aplicar_condicao/remover_condicao → dependência tipo "condition".
 *   - `propriedades[]` em `estatisticas` de item → dependência tipo
 *     "property".
 *
 * Não exaustivo — documentado no checkpoint. Qualquer referência fora
 * dessas formas conhecidas simplesmente não é coletada (nunca
 * fabricada).
 */

import type { DependenciaPacote, EstadoResolucaoDependencia } from "./contentPackage";

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

interface RefBruta {
  tipo: string;
  slugOuId: string;
  obrigatoria: boolean;
}

function coletarDeEfeitos(efeitos: unknown[], refs: RefBruta[]): void {
  for (const efeitoBruto of efeitos) {
    const efeito = asRecord(efeitoBruto);
    if (!efeito) continue;
    if (typeof efeito.condicao === "string" && efeito.condicao.trim() !== "") {
      refs.push({ tipo: "condition", slugOuId: efeito.condicao, obrigatoria: true });
    }
    for (const slug of asArray(efeito.condicoes_possiveis)) {
      if (typeof slug === "string") refs.push({ tipo: "condition", slugOuId: slug, obrigatoria: false });
    }
  }
}

/** Extrai as dependências brutas (tipo+slug+obrigatoriedade) de um payload público — sem resolvê-las ainda. */
export function coletarReferenciasBrutas(payload: Record<string, unknown>): RefBruta[] {
  const refs: RefBruta[] = [];

  for (const req of asArray(payload.requisitos)) {
    const r = asRecord(req);
    if (r && typeof r.tipo_conteudo === "string" && typeof r.slug === "string" && r.tipo_conteudo !== "desconhecido") {
      refs.push({ tipo: r.tipo_conteudo, slugOuId: r.slug, obrigatoria: true });
    }
  }

  const automacao = asRecord(payload.payload_automacao);
  if (automacao) coletarDeEfeitos(asArray(automacao.efeitos), refs);

  // Talento: 3 níveis, cada um com requisitos + payload_automacao próprios.
  for (const nivel of asArray(payload.niveis)) {
    const n = asRecord(nivel);
    if (!n) continue;
    for (const req of asArray(n.requisitos)) {
      const r = asRecord(req);
      if (r && typeof r.tipo_conteudo === "string" && typeof r.slug === "string" && r.tipo_conteudo !== "desconhecido") {
        refs.push({ tipo: r.tipo_conteudo, slugOuId: r.slug, obrigatoria: true });
      }
    }
    const automacaoNivel = asRecord(n.payload_automacao);
    if (automacaoNivel) coletarDeEfeitos(asArray(automacaoNivel.efeitos), refs);
  }

  const estatisticas = asRecord(payload.estatisticas);
  for (const slug of asArray(estatisticas?.propriedades)) {
    if (typeof slug === "string") refs.push({ tipo: "property", slugOuId: slug, obrigatoria: false });
  }

  // Capítulo (Etapa 11, correção do drag): blocos de entidade são a
  // hierarquia/vínculo editorial do capítulo — sempre OPCIONAL (um
  // capítulo continua legível como texto mesmo se uma entidade vinculada
  // for removida depois; nunca bloqueia publicação, igual a `property`).
  for (const bloco of asArray(payload.blocos)) {
    const b = asRecord(bloco);
    if (!b || b.tipo !== "entidade") continue;
    const entidade = asRecord(b.entidade);
    if (entidade && typeof entidade.tipo_conteudo === "string" && typeof entidade.slug === "string") {
      refs.push({ tipo: entidade.tipo_conteudo, slugOuId: entidade.slug, obrigatoria: false });
    }
  }

  // Dedup por (tipo, slugOuId) — mantém a obrigatoriedade mais forte (obrigatória vence).
  const porChave = new Map<string, RefBruta>();
  for (const r of refs) {
    const chave = `${r.tipo}:${r.slugOuId}`;
    const existente = porChave.get(chave);
    if (!existente || (r.obrigatoria && !existente.obrigatoria)) porChave.set(chave, r);
  }
  return [...porChave.values()];
}

/**
 * Resolve cada referência bruta contra: (a) os documentos incluídos no
 * PRÓPRIO pacote, (b) a Biblioteca publicada atual (via callback —
 * mantém este módulo puro/sem I/O direto). Nunca escolhe resultado
 * ambíguo automaticamente — `resolverNaBiblioteca` deve devolver
 * `"ambigua"` explicitamente quando aplicável.
 */
export function resolverDependencias(
  brutas: RefBruta[],
  slugsNoPacote: Set<string>,
  resolverNaBiblioteca: (tipo: string, slug: string) => EstadoResolucaoDependencia,
): DependenciaPacote[] {
  return brutas.map((r): DependenciaPacote => {
    const chavePacote = `${r.tipo}:${r.slugOuId}`;
    if (slugsNoPacote.has(chavePacote)) {
      return { tipo: r.tipo, slugOuId: r.slugOuId, obrigatoria: r.obrigatoria, incluida: true, estadoResolucao: "resolvida_no_pacote" };
    }
    const estado = resolverNaBiblioteca(r.tipo, r.slugOuId);
    return { tipo: r.tipo, slugOuId: r.slugOuId, obrigatoria: r.obrigatoria, incluida: false, estadoResolucao: estado };
  });
}
