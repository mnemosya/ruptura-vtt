/** Glifo de cada Marca de Ruptura (path de 24×24, traço de 1,6). */
export const ICONE_MARCA: Record<string, string> = {
  carapaca_arcana: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  escudo_psiquico: "M21 16V8l-9-5-9 5v8l9 5 9-5z",
  pelicula_arcana: "M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  valvula_de_escape: "M12 2v5M12 17v5M3 12h5M16 12h5M8 8h8v8H8z",
  conduto_voraz: "M12 12a2 2 0 1 1 2 2 4 4 0 1 1-6-4 7 7 0 1 1 10 8",
  refluxo_arcano: "M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5",
  aura_continua: "M12 22V8M5 12H2a10 10 0 0 0 20 0h-3M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  furia_arcana: "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.2.3 1.6 1.6 2.7 2.5 2.7z",
  expansao_arcana: "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7",
  presenca_persistente: "M5 22h14M5 2h14M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2",
  pulso_de_movimento: "M13 17l5-5-5-5M6 17l5-5-5-5",
  poder_difuso: "M12 3v18M12 9l-7 6M12 9l7 6",
  sussurro_arcano: "M9.9 4.2A10 10 0 0 1 12 4c7 0 10 8 10 8a13 13 0 0 1-1.7 2.7M6.6 6.6A13.5 13.5 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20M9.9 9.9a3 3 0 0 0 4.2 4.2",
  manejo_intuitivo: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  repertorio_expandido: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15zM12 6v6M9 9h6",
};

/** Glifo de cada tipo de Traço, na ordem do 1d4. */
export const ICONE_TIPO_TRACO = [
  "M12 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM6 22v-6l-2-5 8-2 8 2-2 5v6",
  "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z",
  "M2 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 20c2-2 4-2 6 0s4 2 6 0 4-2 6 0",
] as const;

/** Cor por família de Marca e por tipo de Traço (mesma paleta do Console). */
export const COR_FAMILIA = { resistencia: "#22d3aa", conduto: "#00d4ff", magia: "#a98bff" } as const;
export const FUNDO_FAMILIA = { resistencia: "#0a2421", conduto: "#06202a", magia: "#150f2a" } as const;
export const COR_TIPO_TRACO = ["#22d3aa", "#00d4ff", "#a98bff", "#ff8a1f"] as const;
export const FUNDO_TIPO_TRACO = ["#0a1d1c", "#071b24", "#120e22", "#1d1309"] as const;

export function romano(n: number): string {
  const tabela: [number, string][] = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let resto = Math.max(0, Math.floor(n));
  let saida = "";
  for (const [v, s] of tabela) while (resto >= v) { saida += s; resto -= v; }
  return saida || "0";
}
