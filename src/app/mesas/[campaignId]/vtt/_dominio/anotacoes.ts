import type { PontoAxial } from "./escalaMapa";

export type TipoAnotacao = "desenho" | "texto";
export const CORES_ANOTACAO = {
  ciano: "#00d4ff", ambar: "#f5a200", verde: "#22d3aa",
  vermelho: "#ff5f74", roxo: "#8b5cf6", branco: "#eafcff",
} as const;
export type CorPredefinida = keyof typeof CORES_ANOTACAO;
export type CorAnotacao = CorPredefinida | `#${string}`;
export function corAnotacaoValida(cor: unknown): cor is CorAnotacao {
  return typeof cor === "string" && (Object.hasOwn(CORES_ANOTACAO, cor) || /^#[0-9a-fA-F]{6}$/.test(cor));
}
export function hexDaAnotacao(cor: CorAnotacao): string {
  return cor.startsWith("#") ? cor : CORES_ANOTACAO[cor as CorPredefinida];
}

export interface AnotacaoCena {
  id: string;
  sceneId: string;
  autorId: string;
  tipo: TipoAnotacao;
  pontos: PontoAxial[];
  texto: string | null;
  cor: CorAnotacao;
  espessura: number;
  tamanho: number;
  privada: boolean;
  revision: number;
}

/** Payload de Realtime é dado externo: só uma linha completa e válida entra no mapa. */
export function anotacaoDeLinha(row: Record<string, unknown>): AnotacaoCena | null {
  const tipo = row.tipo;
  const cor = row.cor;
  const pontos = row.pontos;
  const texto = row.texto;
  if (typeof row.id !== "string" || typeof row.scene_id !== "string" || typeof row.autor_id !== "string"
    || (tipo !== "desenho" && tipo !== "texto") || !corAnotacaoValida(cor)
    || !Array.isArray(pontos) || !pontos.every((p) => p && typeof p.q === "number" && typeof p.r === "number")
    || !pontosValidos(pontos as PontoAxial[], tipo)
    || (tipo === "texto" ? typeof texto !== "string" || !texto.trim() || texto.length > 500 : texto !== null)
    || !Number.isInteger(row.espessura) || Number(row.espessura) < 1 || Number(row.espessura) > 6
    || !Number.isInteger(row.tamanho) || Number(row.tamanho) < 12 || Number(row.tamanho) > 32
    || typeof row.privada !== "boolean" || !Number.isInteger(row.revision)) return null;
  return { id: row.id, sceneId: row.scene_id, autorId: row.autor_id, tipo, pontos: pontos as PontoAxial[],
    texto: texto as string | null, cor: cor as CorAnotacao, espessura: Number(row.espessura),
    tamanho: Number(row.tamanho), privada: row.privada, revision: Number(row.revision) };
}

export function pontosValidos(pontos: PontoAxial[], tipo: TipoAnotacao): boolean {
  return pontos.length >= (tipo === "desenho" ? 2 : 1) && pontos.length <= 512 && (tipo !== "texto" || pontos.length === 1)
    && pontos.every((p) => Number.isFinite(p.q) && Number.isFinite(p.r) && Math.abs(p.q) <= 10000 && Math.abs(p.r) <= 10000);
}

/** Na atualização o tipo já está fixado na linha; o banco verifica a cardinalidade final. */
export function pontosValidosParaAtualizacao(pontos: PontoAxial[]): boolean {
  return pontosValidos(pontos, pontos.length === 1 ? "texto" : "desenho");
}

/** Ramer–Douglas–Peucker, com tolerância em coordenadas axiais; mantém as pontas. */
export function simplificarTraco(pontos: PontoAxial[], tolerancia = 0.035): PontoAxial[] {
  if (pontos.length <= 2) return pontos;
  const distanciaQuadrada = (p: PontoAxial, a: PontoAxial, b: PontoAxial) => {
    const dq = b.q - a.q, dr = b.r - a.r;
    const t = dq || dr ? Math.max(0, Math.min(1, ((p.q - a.q) * dq + (p.r - a.r) * dr) / (dq * dq + dr * dr))) : 0;
    return (p.q - a.q - t * dq) ** 2 + (p.r - a.r - t * dr) ** 2;
  };
  function reduzir(inicio: number, fim: number, saida: number[]) {
    let maior = tolerancia * tolerancia, indice = -1;
    for (let i = inicio + 1; i < fim; i++) {
      const d = distanciaQuadrada(pontos[i], pontos[inicio], pontos[fim]);
      if (d > maior) { maior = d; indice = i; }
    }
    if (indice !== -1) { reduzir(inicio, indice, saida); saida.push(indice); reduzir(indice, fim, saida); }
  }
  const indices = [0]; reduzir(0, pontos.length - 1, indices); indices.push(pontos.length - 1);
  return indices.map((i) => pontos[i]);
}

export function limitarTraco(pontos: PontoAxial[]): PontoAxial[] {
  let resultado = simplificarTraco(pontos);
  if (resultado.length > 512) resultado = resultado.filter((_, i) => i === 0 || i === resultado.length - 1 || i % Math.ceil(resultado.length / 510) === 0);
  return resultado.map((p) => ({ q: Math.round(p.q * 1000) / 1000, r: Math.round(p.r * 1000) / 1000 }));
}
