export interface TargetVtt { tokenId: string; autorId: string; expiresAt: string }
export interface AlvoAcaoToken {
  tokenId: string; characterId: string | null; nome: string;
  /** Lado do token no mapa — só apresentação (cor do cartão do alvo). */
  lado?: string;
  /** Rosto do cartão do alvo: o retrato do token, ou a sigla sem ele. */
  retrato?: string | null;
  sigla?: string;
}
export type CategoriaAcaoToken = "atacar" | "conjurar" | "item";
export interface PedidoAcaoToken {
  tokenId: string;
  categoria: CategoriaAcaoToken;
}
export interface ContextoAcaoToken {
  campaignId: string; sceneId: string; actorCharacterId: string; actorTokenId: string;
  alvoTokenId: string | null; alvoCharacterId: string | null; alvoNome: string | null;
  distanciaMetros?: number | null;
  logVisibility: "public" | "gm";
}
export function lerTargets(bruto: unknown): TargetVtt[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.filter((v): v is TargetVtt => !!v && typeof v.tokenId === "string"
    && typeof v.autorId === "string" && typeof v.expiresAt === "string"
    && Number.isFinite(Date.parse(v.expiresAt)));
}
export function targetsVisiveis(targets: TargetVtt[], ids: ReadonlySet<string>, agora=Date.now()): TargetVtt[] {
  return targets.filter(t => ids.has(t.tokenId) && Date.parse(t.expiresAt)>agora);
}
