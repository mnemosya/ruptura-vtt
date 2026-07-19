/**
 * Comparação estruturada entre o conteúdo publicado atual e o corpo que
 * será publicado (Etapa 5). Produz uma lista legível de mudanças — nunca
 * só um diff textual de JSON — usada na tela de revisão e gravada no
 * changelog (`changed_paths`).
 *
 * Ignora chaves que o RPC injeta/gerencia (status/versao/timestamps) e o
 * blob `_editor` (representação interna, não é "mudança de conteúdo").
 */

export type TipoMudanca = "adicionado" | "removido" | "alterado";

export interface MudancaCampo {
  caminho: string;
  tipo: TipoMudanca;
  antes?: unknown;
  depois?: unknown;
}

export interface MudancaEfeitos {
  adicionados: number;
  removidos: number;
  alterados: number;
  ordemMudou: boolean;
}

export interface ResultadoDiff {
  campos: MudancaCampo[];
  efeitos: MudancaEfeitos;
  houveMudanca: boolean;
}

const CHAVES_GERENCIADAS = new Set(["status", "versao", "created_at", "updated_at", "payload_automacao"]);

function ehPrimitivoOuArray(v: unknown): boolean {
  return v === null || typeof v !== "object" || Array.isArray(v);
}

function iguais(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Diff recursivo de objetos aninhados (arrays comparados como folha). */
function diffRecursivo(antes: Record<string, unknown>, depois: Record<string, unknown>, prefixo: string, saida: MudancaCampo[]): void {
  const chaves = new Set([...Object.keys(antes), ...Object.keys(depois)]);
  for (const chave of chaves) {
    if (prefixo === "" && CHAVES_GERENCIADAS.has(chave)) continue;
    const caminho = prefixo ? `${prefixo}.${chave}` : chave;
    const a = antes[chave];
    const b = depois[chave];
    if (iguais(a, b)) continue;

    const aExiste = chave in antes;
    const bExiste = chave in depois;
    if (!aExiste) {
      saida.push({ caminho, tipo: "adicionado", depois: b });
    } else if (!bExiste) {
      saida.push({ caminho, tipo: "removido", antes: a });
    } else if (!ehPrimitivoOuArray(a) && !ehPrimitivoOuArray(b)) {
      diffRecursivo(a as Record<string, unknown>, b as Record<string, unknown>, caminho, saida);
    } else {
      saida.push({ caminho, tipo: "alterado", antes: a, depois: b });
    }
  }
}

function efeitosDe(payload: Record<string, unknown>): Record<string, unknown>[] {
  const automacao = payload.payload_automacao;
  if (!automacao || typeof automacao !== "object") return [];
  const efeitos = (automacao as Record<string, unknown>).efeitos;
  return Array.isArray(efeitos) ? efeitos.map((e) => (e && typeof e === "object" ? (e as Record<string, unknown>) : {})) : [];
}

/** Assinatura de um efeito para comparação (ignora o blob `_editor`). */
function assinaturaEfeito(efeito: Record<string, unknown>): string {
  const { _editor, ...resto } = efeito;
  void _editor;
  return JSON.stringify(resto);
}

function idEfeito(efeito: Record<string, unknown>): string | undefined {
  const ed = efeito._editor;
  if (ed && typeof ed === "object" && "id" in ed) return String((ed as Record<string, unknown>).id);
  return undefined;
}

function compararEfeitos(antes: Record<string, unknown>[], depois: Record<string, unknown>[]): MudancaEfeitos {
  // Compara por id do editor quando disponível; senão por assinatura.
  const antesPorId = new Map<string, Record<string, unknown>>();
  const antesSemId: Record<string, unknown>[] = [];
  for (const e of antes) {
    const id = idEfeito(e);
    if (id) antesPorId.set(id, e);
    else antesSemId.push(e);
  }

  let adicionados = 0;
  let alterados = 0;
  const idsDepois: string[] = [];
  const idsAntes: string[] = [];
  for (const e of antes) {
    const id = idEfeito(e);
    if (id) idsAntes.push(id);
  }

  for (const e of depois) {
    const id = idEfeito(e);
    if (id) {
      idsDepois.push(id);
      const original = antesPorId.get(id);
      if (!original) adicionados++;
      else if (assinaturaEfeito(original) !== assinaturaEfeito(e)) alterados++;
    } else {
      // Sem id (efeito preservado/legado): conta como adicionado se assinatura nova.
      const existe = antesSemId.some((a) => assinaturaEfeito(a) === assinaturaEfeito(e));
      if (!existe) adicionados++;
    }
  }

  let removidos = 0;
  const idsDepoisSet = new Set(idsDepois);
  for (const id of idsAntes) {
    if (!idsDepoisSet.has(id)) removidos++;
  }

  const ordemMudou = idsAntes.length === idsDepois.length && idsAntes.some((id, i) => idsDepois[i] !== id);

  return { adicionados, removidos, alterados, ordemMudou };
}

/** Compara o payload publicado atual (ou null, para conteúdo novo) com o corpo a publicar. */
export function compararPublicado(publicadoAtual: Record<string, unknown> | null, corpoNovo: Record<string, unknown>): ResultadoDiff {
  const campos: MudancaCampo[] = [];
  if (publicadoAtual === null) {
    // Conteúdo novo — tudo é "adicionado" no nível de topo (resumo enxuto).
    for (const chave of Object.keys(corpoNovo)) {
      if (CHAVES_GERENCIADAS.has(chave)) continue;
      campos.push({ caminho: chave, tipo: "adicionado", depois: corpoNovo[chave] });
    }
    const efeitos = compararEfeitos([], efeitosDe(corpoNovo));
    return { campos, efeitos, houveMudanca: true };
  }

  diffRecursivo(publicadoAtual, corpoNovo, "", campos);
  const efeitos = compararEfeitos(efeitosDe(publicadoAtual), efeitosDe(corpoNovo));
  const houveMudanca = campos.length > 0 || efeitos.adicionados > 0 || efeitos.removidos > 0 || efeitos.alterados > 0 || efeitos.ordemMudou;
  return { campos, efeitos, houveMudanca };
}
