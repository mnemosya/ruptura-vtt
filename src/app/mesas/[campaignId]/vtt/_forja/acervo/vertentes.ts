/**
 * Acervo de apresentação das Vertentes na Forja: arte, cor e o grimório
 * do Códex (texto de abertura, prática, progressão, magias por nível).
 *
 * `id` é o slug da v1.2 (`biotica`, `cinetica`…, ver `VERTENTES_V12`). A
 * cor vem da paleta única (`_design/coresVertente.ts`), a mesma do token.
 *
 * TEMPORÁRIO (Fase 3 do plano da Forja): o grimório ainda é o JSON
 * extraído pelo protótipo do Figma. As magias saem da criação (ficam
 * pendentes, como o servidor já faz) e o texto passa a vir do conteúdo
 * publicado quando o capítulo de magias fechar.
 */
import grimoriosPrototipo from "../../../../../../../High-Fidelity Character Creator Exploration/src/forge/vertentes.json";
import { CORES_VERTENTE, brilhoVertente } from "../../../../../_design/coresVertente";

export type MagiaGrimorio = { n: string; tags: string[]; type: string; range: string; dur: string; req: string; d: string };
export type Grimorio = {
  desc: string;
  house: string;
  diff: string;
  lead: string;
  quote: string[];
  attr: string;
  body: string[];
  cast: string;
  castLabel: string;
  manif: string;
  prog: { lv: number; n: number; cd: number }[];
  levels: { lv: number; note: string; spells: MagiaGrimorio[] }[];
};

export type VertenteId = "biotica" | "cinetica" | "cognitiva" | "energetica" | "material" | "sinaptica";

export interface VertenteAcervo {
  id: VertenteId;
  nome: string;
  /** Cor base: bordas, marcas, pips. */
  cor: string;
  /** Cor de brilho: glow, feixe e luz do holograma. */
  brilho: string;
  arte: string;
  /** Uma frase de apresentação, usada na carta do carrossel. */
  frase: string;
  /** Como a Vertente é conjurada, em poucas palavras. */
  gatilho: string;
  grimorio: Grimorio;
}

const GRIMORIOS = grimoriosPrototipo as Record<string, Grimorio>;

const META: Array<{ id: VertenteId; nome: string; frase: string; gatilho: string }> = [
  { id: "biotica", nome: "Biótica", frase: "Carne, sangue e crescimento. Molda o que está vivo.", gatilho: "Foco mental + domínio corporal" },
  { id: "cinetica", nome: "Cinética", frase: "Movimento, impulso e inércia sob o seu comando.", gatilho: "Movimento corporal" },
  { id: "cognitiva", nome: "Cognitiva", frase: "Percepção, memória e a arquitetura do pensamento.", gatilho: "Silêncio — só o pensamento" },
  { id: "energetica", nome: "Energética", frase: "Calor, luz e descarga. A face mais visível da ruptura.", gatilho: "Controle preciso das mãos" },
  { id: "material", nome: "Material", frase: "Matéria inerte que responde, dobra e se reforma.", gatilho: "Cálculo + gestos precisos" },
  { id: "sinaptica", nome: "Sináptica", frase: "Conexões entre mentes, máquinas e redes.", gatilho: "Mente, com gestos de interface" },
];

export const VERTENTES_ACERVO: VertenteAcervo[] = META.map((m) => ({
  ...m,
  cor: CORES_VERTENTE[m.id],
  brilho: brilhoVertente(m.id),
  arte: `/forja/vertentes/${m.id}.webp`,
  grimorio: GRIMORIOS[m.nome],
}));

export const vertentePorNome = (nome: string) => VERTENTES_ACERVO.find((v) => v.nome === nome);
