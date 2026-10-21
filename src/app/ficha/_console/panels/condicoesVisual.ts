import { ArrowDownToLine, Bone, CircleAlert, CircleDashed, CircleDot, CloudFog, Droplet, EarOff, EyeOff, Flame, Ghost, Grab, Hand, Lock, Moon, Skull, Snail, Sparkle, SunDim, type LucideIcon } from "lucide-react";

/** Famílias das condições (cor + ordem) e o glifo de cada uma, à moda das runas de jogo. */
export const FAMILIAS_CONDICAO = [
  { id: "controle", nome: "Controle", cor: "#00d4ff", fundo: "#06202a", slugs: ["agarrado", "agarrando", "imobilizado", "caido", "lento"] },
  { id: "sentidos", nome: "Sentidos", cor: "#a98bff", fundo: "#150f2a", slugs: ["cego", "surdo", "ofuscado", "oculto"] },
  { id: "dano", nome: "Dano contínuo", cor: "#ff5f74", fundo: "#2a0f16", slugs: ["envenenado", "queimando", "sangrando", "sufocando", "contundido"] },
  { id: "incapacitante", nome: "Incapacitante", cor: "#ff8a1f", fundo: "#24170a", slugs: ["atordoado", "inconsciente"] },
  { id: "arcano", nome: "Arcano", cor: "#22d3aa", fundo: "#0a2421", slugs: ["insaturado", "saturado"] },
] as const;
export const ICONE_CONDICAO: Record<string, LucideIcon> = {
  agarrado: Hand, agarrando: Grab, imobilizado: Lock, caido: ArrowDownToLine, lento: Snail,
  cego: EyeOff, surdo: EarOff, ofuscado: SunDim, oculto: Ghost,
  envenenado: Skull, queimando: Flame, sangrando: Droplet, sufocando: CloudFog, contundido: Bone,
  atordoado: Sparkle, inconsciente: Moon, insaturado: CircleDashed, saturado: CircleDot,
};


/** Família (cor) e glifo de uma condição pelo slug; desconhecida cai no neutro. */
export function visualDaCondicao(slug: string | null | undefined): { cor: string; fundo: string; Icone: LucideIcon } {
  const fam = FAMILIAS_CONDICAO.find((f) => (f.slugs as readonly string[]).includes(slug ?? ""));
  return { cor: fam?.cor ?? "#ff5f74", fundo: fam?.fundo ?? "#2a0f16", Icone: (slug && ICONE_CONDICAO[slug]) || CircleAlert };
}
