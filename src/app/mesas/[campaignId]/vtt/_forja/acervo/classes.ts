/**
 * Acervo de apresentação das Classes na Forja: sigla, papel, frase de
 * efeito, arte e o dossiê do Códex (introdução, características por
 * Ranking, subclasses, sinergia com Vertentes).
 *
 * O `id` é o slug da Classe publicada (`ancora`, `cacador`…). As regras
 * (perfis, perícias, recursos) vêm de `ClassContentV12`, nunca daqui.
 *
 * TEMPORÁRIO (Fase 3 do plano da Forja): o dossiê ainda é o JSON extraído
 * pelo protótipo do Figma. Ele passa a ser montado do conteúdo canônico
 * (`content/v12/db_classe_*`, campos `caracteristicas`, `progressao`,
 * `subclasses`) e este import sai.
 */
import dossiesPrototipo from "../../../../../../../High-Fidelity Character Creator Exploration/src/forge/classes.json";

export type Caracteristica = { n: string; d: string };
export type RankDossie = { r: string; lead: string; feats: Caracteristica[] };
export type DossieClasse = {
  role: string;
  sec: string;
  intro: string[];
  skills3: string[];
  /** Sinergia por Vertente: `v` é o NOME exibido (ex.: "Biótica"), `n` de 0 a 5. */
  syn: { v: string; d: string; n: number }[];
  feats: RankDossie[];
  subs: { n: string; tag: string; lore: string; ranks: RankDossie[] }[];
};

export interface ClasseAcervo {
  id: string;
  nome: string;
  sigla: string;
  papel: string;
  frase: string;
  arte: string;
  dossie: DossieClasse;
}

const DOSSIES = dossiesPrototipo as Record<string, DossieClasse>;

const META: Array<Omit<ClasseAcervo, "arte" | "dossie">> = [
  { id: "ancora", nome: "Âncora", sigla: "ANC", papel: "Sustentação", frase: "Mantém o grupo de pé quando a realidade dobra." },
  { id: "cacador", nome: "Caçador", sigla: "CAÇ", papel: "Preparação", frase: "Segue o rastro, escolhe o terreno, fecha o cerco." },
  { id: "combatente", nome: "Combatente", sigla: "CMB", papel: "Eliminação", frase: "Disciplina física aplicada no ponto de ruptura." },
  { id: "face", nome: "Face", sigla: "FAC", papel: "Influência", frase: "Abre portas que nenhuma arma abriria." },
  { id: "infiltrador", nome: "Infiltrador", sigla: "INF", papel: "Infiltração", frase: "Entra onde não deveria. Sai antes do alarme." },
  { id: "tecnico", nome: "Técnico", sigla: "TEC", papel: "Engenharia", frase: "Conserta, adapta e sobrecarrega máquinas." },
  { id: "vanguarda", nome: "Vanguarda", sigla: "VNG", papel: "Linha de frente", frase: "Primeiro a entrar, último a recuar." },
];

export const CLASSES_ACERVO: ClasseAcervo[] = META.map((m) => ({
  ...m,
  arte: `/forja/classes/${m.id}.webp`,
  dossie: DOSSIES[m.nome],
}));

export const RANKINGS = ["F", "E", "D", "C", "B", "A", "S"] as const;
