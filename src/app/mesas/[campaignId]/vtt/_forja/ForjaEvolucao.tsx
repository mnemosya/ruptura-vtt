"use client";

/**
 * FORJA DE EVOLUÇÃO — o avanço de Ranking de um personagem já criado,
 * no palco da Forja: a Progressão em sub-etapas (a mesma da criação),
 * partindo do Ranking atual da ficha até o Ranking escolhido.
 * Selar aplica os avanços em sequência (`avancarRankingV12Action`, que
 * revalida cada um no servidor). Se um falhar, para ali e mostra o erro:
 * os anteriores já ficaram gravados e a trilha recomeça do novo Ranking.
 */

import { useMemo, useState } from "react";
import { escolhasDoAvancoV12, etapasProgressaoV12, type DraftAvancoV12, type PartidaProgressaoV12, type RankingV12 } from "../../../../../lib/rulesetV12";
import type { CatalogosCriacaoV12 } from "../_acoes/criacaoV12Actions";
import { avancarRankingV12Action } from "../_acoes/evolucaoV12Actions";
import { oxanium } from "../../../../_design/oxanium";
import { BarraTopo } from "./Forja";
import { ProgressaoFluxo } from "./progressao/ProgressaoFluxo";
import { REGIOES } from "./acervo/regioes";

export function ForjaEvolucao({ catalogos, campaignId, characterId, nome, classeSlug, partida, alvo, regiaoId, onSair, onConcluir }: {
  catalogos: CatalogosCriacaoV12;
  campaignId: string | null;
  characterId: string;
  nome: string;
  classeSlug: string;
  partida: PartidaProgressaoV12;
  alvo: RankingV12;
  /** Região do personagem: a cidade dela fica atrás do console (sem ela, a primeira do acervo). */
  regiaoId?: string;
  onSair: () => void;
  onConcluir: (ranking: RankingV12) => void;
}) {
  const [avancos, setAvancos] = useState<Partial<Record<RankingV12, DraftAvancoV12>>>({});
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Depois de uma falha no meio, a trilha parte do Ranking já gravado.
  const [inicio, setInicio] = useState(partida);

  const classe = catalogos.classes.find((c) => c.slug === classeSlug);
  const etapas = useMemo(
    () => etapasProgressaoV12({ rankingInicial: alvo, avancos }, classe, catalogos.subclasses ?? [], inicio),
    [alvo, avancos, classe, catalogos.subclasses, inicio],
  );
  const pendentes = etapas.filter((e) => e.faltas.length).length;
  const pode = etapas.length > 0 && pendentes === 0 && !enviando;

  async function selar() {
    if (!pode) return;
    setEnviando(true);
    setErro(null);
    for (const [i, etapa] of etapas.entries()) {
      const r = await avancarRankingV12Action(campaignId, characterId, escolhasDoAvancoV12(etapa));
      if (!r.ok) {
        setErro(`Ranking ${etapa.para}: ${r.erro ?? "falha ao aplicar o avanço."}`);
        // Os anteriores já foram gravados: a trilha recomeça deste Ranking
        // (a base de uma etapa é a ficha depois da anterior).
        if (i > 0) setInicio({ de: etapas[i - 1].para, base: etapa.base });
        setEnviando(false);
        return;
      }
    }
    setEnviando(false);
    onConcluir(alvo);
  }

  return (
    <div className={`fj-root ${oxanium.variable} mo-scope fj-forja`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={(REGIOES.find((r) => r.id === regiaoId) ?? REGIOES[0]).img} alt="" className="fj-boot fj-palco__fundo" />
      <div className="fj-palco__veu" />
      <div className="fj-palco__tinta" />
      <div className="fj-hexgrid fj-palco__grade" />
      <div className="fj-scan fj-cobre fj-palco__scan" />
      <div className="fj-palco">
        <BarraTopo group="Evolução" label="Progressão" onExit={onSair} />
        <div className="fj-sem-barra fj-grade fj-grade--progressao">
          <main className="fj-boot fj-centro">
            <ProgressaoFluxo contexto="evolucao" kicker="Evolução" d={{ classeSlug, avancos }} set={(p) => setAvancos(p.avancos ?? {})}
              catalogos={catalogos} etapas={etapas} classe={classe} onFechar={onSair}
              concluir={{ rotulo: enviando ? "Selando…" : "Selar progressão", onClick: () => void selar(), desabilitado: !pode, erro }} />
          </main>
        </div>
      </div>
    </div>
  );
}
