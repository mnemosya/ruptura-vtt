import catalogoAcoes from "../../../../../../../content/v12/db_acoes_v1_2.json";
import indiceMagias from "../../../../../../lib/character/indiceMagiasChat.json";
import type { AcaoV12, CatalogoAcoesV12 } from "../../../../../../lib/character/abaAcoes";
import { normalizarComando } from "./comandoPericia";
import type { EtapaComando, OpcaoComando } from "./comandoConteudo";

const acoes = (catalogoAcoes as unknown as CatalogoAcoesV12).acoes;
const magias = indiceMagias as Record<string, { nome: string; vertente: string; pa: number; mana: number | null; manaTexto: string | null; conjuracao: string | null; etapas: EtapaComando[] }>;

function custoAcao(acao: AcaoV12): string {
  if (acao.custo.pa_preparado) return "1+ PA";
  if (acao.custo.proprio) return "PA —";
  const custos = acao.opcoes?.length ? acao.opcoes.map((o) => o.custo.pa ?? acao.custo.pa ?? 0) : [acao.custo.pa ?? 0];
  const min = Math.min(...custos), max = Math.max(...custos, acao.custo.pa_max ?? 0);
  return `${min}${acao.custo.repeticao_incremento ? "+" : max > min ? `–${max}` : ""} PA`;
}

/** Os dados publicados vencem; o catálogo local cobre uma resposta antiga em memória após HMR. */
export function completarIdentidadeComando(opcao: OpcaoComando, familia: "a" | "m"): OpcaoComando {
  if (familia === "a") {
    const acao = acoes.find((a) => `${a.cena}:${a.slug}` === opcao.id)
      ?? acoes.find((a) => normalizarComando(a.nome) === normalizarComando(opcao.nome));
    if (!acao) return { ...opcao, identidade: opcao.identidade ?? { familia: "a", cena: opcao.id.split(":")[0] ?? "combate", grupo: "diversa", slug: opcao.id.split(":").at(-1) } };
    const custo = { pa: custoAcao(acao), extra: acao.custo.reacao ? `${acao.custo.reacao} Reação` : acao.custo.ram ? `${acao.custo.ram} RAM` : acao.custo.proprio ? "Custo próprio" : undefined };
    return { ...opcao,
      identidade: opcao.identidade ?? { familia: "a", cena: acao.cena, grupo: acao.grupo, slug: acao.slug, classe: !!acao.classe },
      custo: opcao.custo?.pa ? opcao.custo : custo,
      custosPorComplemento: opcao.custosPorComplemento ?? Object.fromEntries((acao.opcoes ?? []).map((o) => [o.nome, { pa: `${o.custo.pa ?? acao.custo.pa ?? 0}${acao.custo.repeticao_incremento ? "+" : ""} PA` }])),
    };
  }
  const magia = magias[opcao.id] ?? Object.values(magias).find((m) => normalizarComando(m.nome) === normalizarComando(opcao.nome));
  const vertente = magia?.vertente ?? (normalizarComando(opcao.detalhe.split("·")[0].trim()) || opcao.id.split("_")[0]);
  if (!magia) return { ...opcao, identidade: opcao.identidade ?? { familia: "m", vertente } };
  return { ...opcao,
    identidade: opcao.identidade ?? { familia: "m", vertente },
    etapas: opcao.etapas?.length ? opcao.etapas : magia.etapas,
    custo: opcao.custo?.pa && opcao.custo.mana ? opcao.custo : {
      pa: `${magia.pa} PA`, mana: magia.mana == null ? "Mana variável" : `${magia.mana} Mana`,
      extra: magia.conjuracao ?? undefined,
    },
  };
}
