/**
 * Acervo de apresentação das Vertentes na Forja: arte, cor e o grimório
 * do Códex (texto de abertura, prática, progressão, magias por nível).
 *
 * `id` é o slug da v1.2 (`biotica`, `cinetica`…, ver `VERTENTES_V12`). A
 * cor vem da paleta única (`_design/coresVertente.ts`), a mesma do token.
 *
 * O texto editorial de abertura e prática vem da extração enxuta do protótipo.
 * As magias são montadas do catálogo publicado v1.2; a Vertente Primária
 * vem das páginas atuais do Compêndio no Notion.
 */
import grimoriosTexto from "./vertentesTexto.json";
import primariasV12 from "./vertentesPrimariasV12.json";
import magiasV12 from "../../../../../../../content/v12/db_magias_vertentes_v1_2.json";
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
  primaria: { intro: string; nivel3: { titulo: string; descricao: string } };
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
  grimorio: Grimorio;
}

const GRIMORIOS = grimoriosTexto as Record<string, Omit<Grimorio, "primaria">>;
const PRIMARIAS = primariasV12.vertentes as Record<VertenteId, Grimorio["primaria"]>;

/** A extração do protótipo deixou divisores do Markdown (`---`) como parágrafos soltos no corpo. */
function montarGrimorio(id: VertenteId, g: Omit<Grimorio, "primaria">): Grimorio {
  return {
    ...g,
    primaria: PRIMARIAS[id],
    body: g.body.filter((p) => p.trim() !== "---"),
    levels: g.prog.map(({ lv }) => ({
      lv,
      note: g.levels.find((level) => level.lv === lv)?.note ?? "",
      spells: magiasV12.magias
        .filter((magia) => magia.status === "published" && magia.vertente === id && magia.estatisticas.nivel === lv)
        .map((magia) => {
          const stats = magia.estatisticas;
          const custo = stats.custo_mana_regra.texto.toUpperCase();
          return {
            n: magia.nome,
            tags: [custo.includes("MANA") ? custo : `${custo} MANA`, stats.conjuracao.texto.toUpperCase()],
            type: stats.tipo_magia,
            range: stats.alcance.texto,
            dur: stats.duracao.texto,
            req: stats.pre_requisito ?? "",
            d: magia.descricao_longa,
          };
        }),
    })),
  };
}

const META: Array<{ id: VertenteId; nome: string; frase: string }> = [
  { id: "biotica", nome: "Biótica", frase: "Carne, sangue e crescimento. Molda o que está vivo." },
  { id: "cinetica", nome: "Cinética", frase: "Movimento, impulso e inércia sob o seu comando." },
  { id: "cognitiva", nome: "Cognitiva", frase: "Percepção, memória e a arquitetura do pensamento." },
  { id: "energetica", nome: "Energética", frase: "Calor, luz e descarga. A face mais visível da ruptura." },
  { id: "material", nome: "Material", frase: "Matéria inerte que responde, dobra e se reforma." },
  { id: "sinaptica", nome: "Sináptica", frase: "Conexões entre mentes, máquinas e redes." },
];

export const VERTENTES_ACERVO: VertenteAcervo[] = META.map((m) => ({
  ...m,
  cor: CORES_VERTENTE[m.id],
  brilho: brilhoVertente(m.id),
  arte: `/forja/vertentes/${m.id}.webp`,
  grimorio: montarGrimorio(m.id, GRIMORIOS[m.nome]),
}));

export const vertentePorNome = (nome: string) => VERTENTES_ACERVO.find((v) => v.nome === nome);
