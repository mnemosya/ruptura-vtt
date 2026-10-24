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
import dossiesPrototipo from "./classesPrototipo.json";
import faceV12 from "../../../../../../../content/v12/db_classe_face_v1_2.json";
import tecnicoV12 from "../../../../../../../content/v12/db_classe_tecnico_v1_2.json";
import vanguardaV12 from "../../../../../../../content/v12/db_classe_vanguarda_v1_2.json";
import combatenteV12 from "../../../../../../../content/v12/db_classe_combatente_v1_2.json";

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
const roboticistaV12 = tecnicoV12.subclasses.find((subclasse) => subclasse.slug === "roboticista");
if (roboticistaV12) {
  const tecnico = DOSSIES["Técnico"];
  tecnico.subs = tecnico.subs.filter((subclasse) => subclasse.n !== "Maquinista");
  tecnico.subs.splice(1, 0, {
    n: roboticistaV12.nome,
    tag: "Desenvolve IAs para operar Máquinas Autônomas e reconfigura seus Sistemas.",
    lore: roboticistaV12.descricao,
    ranks: (["E", "C", "A"] as const).map((r) => ({
      r,
      lead: `Você adquire as características ${roboticistaV12.caracteristicas[r].map((f) => f.nome).join(", ")}.`,
      feats: roboticistaV12.caracteristicas[r].map((f) => ({ n: f.nome.toUpperCase(), d: f.descricao })),
    })),
  });
}
const iconeV12 = faceV12.subclasses.find((subclasse) => subclasse.slug === "icone");
if (iconeV12) {
  const icone = DOSSIES.Face.subs.find((subclasse) => subclasse.n === "Ícone");
  if (icone) {
    icone.ranks = (["E", "C", "A"] as const).map((r) => ({
      r,
      lead: `Você adquire as características ${iconeV12.caracteristicas[r].map((f) => f.nome).join(", ")}.`,
      feats: iconeV12.caracteristicas[r].map((f) => ({ n: f.nome.toUpperCase(), d: f.descricao })),
    }));
  }
}
const guardiaoV12 = vanguardaV12.subclasses.find((subclasse) => subclasse.slug === "guardiao");
if (guardiaoV12) {
  const guardiao = DOSSIES.Vanguarda.subs.find((subclasse) => subclasse.n === "Guardião");
  const arsenal = guardiao?.ranks.flatMap((rank) => rank.feats).find((feature) => feature.n === "ARSENAL DEFENSIVO");
  const arsenalAtual = guardiaoV12.caracteristicas.E.find((feature) => feature.nome === "Arsenal Defensivo");
  if (arsenal && arsenalAtual) arsenal.d = arsenalAtual.descricao;
  const abrigo = guardiao?.ranks.flatMap((rank) => rank.feats).find((feature) => feature.n === "ABRIGO MÓVEL");
  const regraAtual = guardiaoV12.caracteristicas.C.find((feature) => feature.nome === "Abrigo Móvel");
  if (abrigo && regraAtual) abrigo.d = regraAtual.descricao;
}
const acrobataV12 = combatenteV12.subclasses.find((subclasse) => subclasse.slug === "acrobata");
if (acrobataV12) {
  const acrobata = DOSSIES.Combatente.subs.find((subclasse) => subclasse.n === "Acrobata");
  const impulso = acrobata?.ranks.flatMap((rank) => rank.feats).find((feature) => feature.n === "IMPULSO CONTÍNUO");
  const regraAtual = acrobataV12.caracteristicas.C.find((feature) => feature.nome === "Impulso Contínuo");
  if (impulso && regraAtual) impulso.d = regraAtual.descricao;
}

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
