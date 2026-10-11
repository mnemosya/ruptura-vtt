import type { ItemContent } from "./inventory";
/** Penalidade canônica; nunca cria um alcance ausente. */
export function weaponRangeAt(item: ItemContent | null, meters: number, modeId?: string): { allowed: boolean; penalty: number; maximum: number | null } {
  if (!Number.isFinite(meters) || meters < 0) return {allowed:false,penalty:0,maximum:null};
  const range = item?.alcance;
  if (modeId === "corpo_a_corpo") return {allowed:meters <= 1,penalty:0,maximum:1};
  if (!range) return {allowed:true,penalty:0,maximum:null};
  const maximum = range.tipo === "adjacente" ? range.estendidoM ?? 1 : range.maxM;
  return {allowed:maximum == null || meters <= maximum,penalty:range.eficazM != null && meters > range.eficazM ? range.penalidadeAlemEficaz ?? 0 : 0,maximum};
}
