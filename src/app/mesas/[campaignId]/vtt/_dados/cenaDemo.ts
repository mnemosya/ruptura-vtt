/**
 * Tabelas de referência do domínio VTT — rótulos e texto de efeito
 * mecânico pra condições, cobertura e terreno, mais os tipos de forma
 * (`ObjetoCena`/`AreaTerreno`) que a camada de mapa desenha.
 *
 * Este arquivo NÃO contém mais conteúdo de cena fictício: a antiga
 * `CENA_DEMO` (elenco de tokens, objetos e terrenos de uma cena
 * "Doca 7" de demonstração) foi removida — toda cena real começa
 * vazia e o narrador povoa com as ferramentas de Token/Objetos/
 * Terreno. O que sobra aqui é só vocabulário de regra (`16 COMBATE`,
 * `17 CONDIÇÕES`): cobertura em três graus com PD por categoria
 * (Frágil 2–5, Média 6–15, Resistente 16+), terreno difícil/elevado,
 * e as condições de personagem.
 */

import type { Hex } from "../_mapa/hex";

/** Condições do sistema (`17 CONDIÇÕES`) que a interface sabe desenhar. */
export type CondicaoSlug =
  | "atordoado" | "caido" | "cego" | "surdo" | "lento" | "sangrando" | "queimando"
  | "envenenado" | "saturado" | "insaturado" | "imobilizado" | "agarrado"
  | "ofuscado" | "contundido" | "sufocando" | "inconsciente";

export const CONDICOES: Record<CondicaoSlug, { rotulo: string; glifo: string }> = {
  atordoado: { rotulo: "Atordoado", glifo: "✷" },
  caido: { rotulo: "Caído", glifo: "▼" },
  cego: { rotulo: "Cego", glifo: "◍" },
  surdo: { rotulo: "Surdo", glifo: "◔" },
  lento: { rotulo: "Lento", glifo: "≈" },
  sangrando: { rotulo: "Sangrando", glifo: "◆" },
  queimando: { rotulo: "Queimando", glifo: "▲" },
  envenenado: { rotulo: "Envenenado", glifo: "✦" },
  saturado: { rotulo: "Saturado", glifo: "◈" },
  insaturado: { rotulo: "Insaturado", glifo: "◇" },
  imobilizado: { rotulo: "Imobilizado", glifo: "⊗" },
  agarrado: { rotulo: "Agarrado", glifo: "⊕" },
  ofuscado: { rotulo: "Ofuscado", glifo: "◐" },
  contundido: { rotulo: "Contundido", glifo: "▣" },
  sufocando: { rotulo: "Sufocando", glifo: "◒" },
  inconsciente: { rotulo: "Inconsciente", glifo: "✕" },
};

export type CategoriaCobertura = "fragil" | "media" | "resistente";
export type GrauCobertura = "parcial" | "maior" | "total";

export interface ObjetoCena {
  id: string;
  nome: string;
  /** Células ocupadas — objetos podem ter forma irregular (6×1, 2×5…). */
  celulas: Hex[];
  grau: GrauCobertura;
  categoria: CategoriaCobertura;
  /** `null` = objeto sem durabilidade definida (o narrador não atribuiu PD). */
  pd: number | null;
  pdMax: number | null;
  /** Aparência do objeto no mapa. */
  tipo: "conteiner" | "veiculo" | "entulho" | "muro" | "barril" | "grade" | "banca";
  rotacao?: number;
}

export interface AreaTerreno {
  id: string;
  tipo: "dificil" | "elevado" | "zona_morta";
  nome: string;
  celulas: Hex[];
  /** Só pra elevado: diferença em metros (3+ dá +1 a ataques de cima). */
  altura?: number;
}

export const CATEGORIA_COBERTURA: Record<CategoriaCobertura, { rotulo: string; faixaPd: string }> = {
  fragil: { rotulo: "Frágil", faixaPd: "2–5 PD" },
  media: { rotulo: "Média", faixaPd: "6–15 PD" },
  resistente: { rotulo: "Resistente", faixaPd: "16+ PD" },
};

export const GRAU_COBERTURA: Record<GrauCobertura, { rotulo: string; efeito: string }> = {
  parcial: { rotulo: "Cobertura parcial", efeito: "–1 em ataques direcionais contra o alvo." },
  maior: { rotulo: "Cobertura maior", efeito: "–2 em ataques direcionais contra o alvo." },
  total: { rotulo: "Cobertura total", efeito: "Alvo inalvejável por ataques direcionais." },
};

export const TERRENO_INFO = {
  dificil: { rotulo: "Terreno difícil", efeito: "Cada deslocamento custa o dobro da distância. Alternativa: ação Manobrar." },
  elevado: { rotulo: "Terreno elevado", efeito: "Diferença de 3+ m: ataques à distância de cima recebem +1." },
  zona_morta: { rotulo: "Zona morta", efeito: "Jammers bloqueiam condução arcana e comunicação digital na área." },
} as const;
