/**
 * Catálogo de criação montado direto do conteúdo canônico em
 * `content/v12`, para ver a Forja sem banco e sem campanha.
 *
 * Mesmo formato que a mesa recebe de `lerCatalogosCriacaoV12Action`. Na
 * mesa, o catálogo vem do banco (conteúdo publicado + o da campanha);
 * aqui é só a transcrição versionada no repositório.
 */
import type { CatalogosCriacaoV12, OpcaoTrajetoriaV12 } from "../../mesas/[campaignId]/vtt/_acoes/criacaoV12Actions";
import { REGIOES_V12, type ClassContentV12, type TrajectoryOptionContentV12 } from "../../../lib/rulesetV12/contracts";
import { VERTENTES_V12 } from "../../../lib/rulesetV12/creation";
import trajetoria from "../../../../content/v12/db_trajetoria_v1_2.json";
import ancora from "../../../../content/v12/db_classe_ancora_v1_2.json";
import cacador from "../../../../content/v12/db_classe_cacador_v1_2.json";
import combatente from "../../../../content/v12/db_classe_combatente_v1_2.json";
import face from "../../../../content/v12/db_classe_face_v1_2.json";
import infiltrador from "../../../../content/v12/db_classe_infiltrador_v1_2.json";
import tecnico from "../../../../content/v12/db_classe_tecnico_v1_2.json";
import vanguarda from "../../../../content/v12/db_classe_vanguarda_v1_2.json";

const porNome = <T extends { nome: string }>(a: T, b: T) => a.nome.localeCompare(b.nome, "pt-BR");

function opcao(p: TrajectoryOptionContentV12): OpcaoTrajetoriaV12 {
  return {
    slug: p.slug,
    nome: p.nome,
    descricao: p.descricao ?? "",
    categoria: p.categoria,
    custos: Array.isArray(p.custos_permitidos) ? p.custos_permitidos : [1],
    repetivel: p.repetivel === true,
  };
}

export function catalogoDev(): CatalogosCriacaoV12 {
  const classes = [ancora, cacador, combatente, face, infiltrador, tecnico, vanguarda].map((d) => (d as unknown as { classes: ClassContentV12[] }).classes[0]);
  const t = trajetoria as unknown as {
    backgrounds: Array<{ slug: string; nome: string; descricao: string; familiaridade: string }>;
    qualities: TrajectoryOptionContentV12[];
    complications: TrajectoryOptionContentV12[];
  };
  return {
    ehNarrador: false,
    classes,
    pericias: [],
    regioes: Object.entries(REGIOES_V12).map(([id, r]) => ({ id, nome: r.nome, idioma: r.idioma })),
    vertentes: [...VERTENTES_V12],
    antecedentes: t.backgrounds.map((a) => ({ slug: a.slug, nome: a.nome, descricao: a.descricao, familiaridade: a.familiaridade })).sort(porNome),
    qualidades: t.qualities.map(opcao).sort(porNome),
    complicacoes: t.complications.map(opcao).sort(porNome),
    itens: [],
  };
}
