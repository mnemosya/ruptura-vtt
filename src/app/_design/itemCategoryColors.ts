import type { CSSProperties } from "react";

export const CORES_CATEGORIAS: Record<string, string> = {
  acessorios: "#5ccbb3",
  armaduras: "#f5a200",
  "armaduras e escudos": "#f5a200",
  // Armadura pela proteção que dá (`tipo_protecao`): física fica no âmbar
  // do grupo, energética em azul elétrico, híbrida no violeta entre as duas.
  "armaduras fisica": "#f5a200",
  "armaduras energetica": "#3fb4ff",
  "armaduras hibrida": "#b07cff",
  escudos: "#7894f4",
  armas: "#e0455f",
  "dispositivos tecnologicos": "#35c7d8",
  "drones e robos": "#b2ce62",
  escalpos: "#c578d9",
  explosivos: "#f07a1f",
  farmacia: "#4fb36e",
  "ferramentas e utilidades": "#ddd27b",
  municao: "#8fa9b8",
  mobilidade: "#569fdf",
  trajes: "#c88456",
  vertinas: "#8b5cf6",
};

const aliases: Record<string, string> = {
  dispositivos: "dispositivos tecnologicos", ferramentas: "ferramentas e utilidades",
  arma: "armas", armadura: "armaduras", escudo: "escudos", acessorio: "acessorios",
  dispositivo: "dispositivos tecnologicos", dispositivo_tecnologico: "dispositivos tecnologicos",
  drone: "drones e robos", robo: "drones e robos", escalpo: "escalpos", modulo_escalpo: "escalpos",
  veneno: "escalpos", explosivo: "explosivos", ferramenta: "ferramentas e utilidades",
  utilidade: "ferramentas e utilidades", veiculo: "mobilidade", traje: "trajes", vertina: "vertinas",
};
export function corCategoria(categoria: string): string | undefined {
  const key = categoria.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/_/g, " ");
  return CORES_CATEGORIAS[key] ?? CORES_CATEGORIAS[aliases[categoria] ?? aliases[key]];
}
export function estiloCategoria(categoria: string, vertente?: string): CSSProperties | undefined {
  const cor = corCategoria(categoria) ?? (vertente === "nenhuma" ? "#8eaef0" : undefined);
  return cor ? { ["--k" as string]: cor } : undefined;
}
