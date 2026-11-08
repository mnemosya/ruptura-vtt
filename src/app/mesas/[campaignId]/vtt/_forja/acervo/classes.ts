/** Apresentação das classes na Forja, derivada do conteúdo canônico v1.2. */
import ancoraV12 from "../../../../../../../content/v12/db_classe_ancora_v1_2.json";
import cacadorV12 from "../../../../../../../content/v12/db_classe_cacador_v1_2.json";
import combatenteV12 from "../../../../../../../content/v12/db_classe_combatente_v1_2.json";
import faceV12 from "../../../../../../../content/v12/db_classe_face_v1_2.json";
import infiltradorV12 from "../../../../../../../content/v12/db_classe_infiltrador_v1_2.json";
import tecnicoV12 from "../../../../../../../content/v12/db_classe_tecnico_v1_2.json";
import vanguardaV12 from "../../../../../../../content/v12/db_classe_vanguarda_v1_2.json";
import type { ClassContentV12, SubclassContentV12 } from "../../../../../../lib/rulesetV12/contracts";

export type Caracteristica = { n: string; d: string };
export type RankDossie = { r: string; lead: string; feats: Caracteristica[] };
export type DossieClasse = {
  role: string;
  sec: string;
  intro: string[];
  /** IDs canônicos; o catálogo de perícias fornece os nomes exibidos. */
  skills3: string[];
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

type FonteClasse = { classes: ClassContentV12[]; subclasses: SubclassContentV12[] };
const FONTES = [ancoraV12, cacadorV12, combatenteV12, faceV12, infiltradorV12, tecnicoV12, vanguardaV12] as unknown as FonteClasse[];
const VERTENTES: Record<string, string> = {
  biotica: "Biótica", cinetica: "Cinética", cognitiva: "Cognitiva",
  energetica: "Energética", material: "Material", sinaptica: "Sináptica",
};
const RANKINGS = ["F", "E", "D", "C", "B", "A", "S"] as const;
const RANKINGS_SUBCLASSE = ["E", "C", "A"] as const;

function feats(features: { nome: string; descricao: string }[]): Caracteristica[] {
  return features.map((feature) => ({ n: feature.nome, d: feature.descricao }));
}

function leadCaracteristicas(features: Caracteristica[]): string {
  const nomes = features.map((feature) => feature.n);
  if (nomes.length === 1) return `Você adquire a característica ${nomes[0]}.`;
  return `Você adquire as características ${nomes.join(", ")}.`;
}

function dossieClasse(classe: ClassContentV12, subclasses: SubclassContentV12[]): DossieClasse {
  return {
    role: classe.papel_principal,
    sec: classe.papeis_secundarios.join(", "),
    intro: classe.descricao.split(/\n\s*\n/).filter(Boolean),
    skills3: classe.criacao.pericias_valor_3,
    syn: Object.entries(classe.criacao.sinergia_vertentes ?? {}).map(([id, n]) => ({
      v: VERTENTES[id] ?? id,
      d: classe.criacao.sinergia_textos?.[id] ?? `Sinergia ${n} de 5 com ${VERTENTES[id] ?? id}.`,
      n,
    })),
    feats: RANKINGS.map((r) => {
      const caracteristicas = r === "F" || r === "D" || r === "B" || r === "S" ? feats(classe.caracteristicas[r]) : [];
      const lead = caracteristicas.length ? leadCaracteristicas(caracteristicas)
        : classe.progressao[r].escolhe_subclasse ? `Escolha uma Subclasse de ${classe.nome}: ${subclasses.map((s) => s.nome).join(", ")}.`
          : `Você recebe as características de sua Subclasse neste Ranking.`;
      return { r, lead, feats: caracteristicas };
    }),
    subs: subclasses.map((subclasse) => ({
      n: subclasse.nome,
      tag: subclasse.descricao.split(/[.!?](?:\s|$)/)[0] + ".",
      lore: subclasse.descricao,
      ranks: RANKINGS_SUBCLASSE.map((r) => ({ r, lead: "", feats: feats(subclasse.caracteristicas[r]) })),
    })),
  };
}

const META: Array<{ id: string; sigla: string; frase: string }> = [
  { id: "ancora", sigla: "ANC", frase: "Mantém o grupo de pé quando a realidade dobra." },
  { id: "cacador", sigla: "CAÇ", frase: "Segue o rastro, escolhe o terreno, fecha o cerco." },
  { id: "combatente", sigla: "CMB", frase: "Disciplina física aplicada no ponto de ruptura." },
  { id: "face", sigla: "FAC", frase: "Abre portas que nenhuma arma abriria." },
  { id: "infiltrador", sigla: "INF", frase: "Entra onde não deveria. Sai antes do alarme." },
  { id: "tecnico", sigla: "TEC", frase: "Integra máquinas, sistemas e dispositivos em campo." },
  { id: "vanguarda", sigla: "VNG", frase: "Primeiro a entrar, último a recuar." },
];

export const CLASSES_ACERVO: ClasseAcervo[] = META.map((meta) => {
  const fonte = FONTES.find((item) => item.classes[0]?.slug === meta.id);
  const classe = fonte?.classes[0];
  if (!fonte || !classe) throw new Error(`Conteúdo da classe ${meta.id} ausente na Forja.`);
  const subclasses = classe.subclasses.map((slug) => {
    const subclasse = fonte.subclasses.find((item) => item.slug === slug);
    if (!subclasse) throw new Error(`Subclasse ${slug} ausente na classe ${classe.nome}.`);
    return subclasse;
  });
  return {
    ...meta,
    nome: classe.nome,
    papel: classe.papel_principal,
    arte: `/forja/classes/${meta.id}.webp`,
    dossie: dossieClasse(classe, subclasses),
  };
});
