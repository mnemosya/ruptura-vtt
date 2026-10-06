"use client";

/**
 * FORJA DE EVOLUÇÃO — o avanço de Ranking de um personagem já criado,
 * no palco da Forja: a mesma trilha de hexágonos + painel do passo
 * Progressão, partindo do Ranking atual da ficha até o Ranking escolhido.
 * Selar aplica os avanços em sequência (`avancarRankingV12Action`, que
 * revalida cada um no servidor). Se um falhar, para ali e mostra o erro:
 * os anteriores já ficaram gravados e a trilha recomeça do novo Ranking.
 */

import { useEffect, useMemo, useState } from "react";
import { escolhasDoAvancoV12, etapasProgressaoV12, type DraftAvancoV12, type PartidaProgressaoV12, type RankingV12 } from "../../../../../lib/rulesetV12";
import type { CatalogosCriacaoV12 } from "../_acoes/criacaoV12Actions";
import { avancarRankingV12Action } from "../_acoes/evolucaoV12Actions";
import { oxanium } from "../../../../_design/oxanium";
import { BarraTopo } from "./Forja";
import { Progressao, ProgressaoLateral } from "./passos/Progressao";
import { Key, Mono } from "./ui";

export function ForjaEvolucao({ catalogos, campaignId, characterId, nome, classeSlug, partida, alvo, onSair, onConcluir }: {
  catalogos: CatalogosCriacaoV12;
  campaignId: string | null;
  characterId: string;
  nome: string;
  classeSlug: string;
  partida: PartidaProgressaoV12;
  alvo: RankingV12;
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

  // Q sai, E sela — os mesmos atalhos da doca da criação.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const tecla = e.key.toLowerCase();
      if (tecla === "q" || e.key === "Escape") onSair();
      else if (tecla === "e") void selar();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  return (
    <div className={`fj-root ${oxanium.variable} mo-scope fj-forja`}>
      <div className="fj-palco__veu" />
      <div className="fj-palco__tinta" />
      <div className="fj-hexgrid fj-palco__grade" />
      <div className="fj-scan fj-cobre fj-palco__scan" />
      <div className="fj-palco">
        <BarraTopo group="Evolução" label="Progressão" onExit={onSair} />
        <div className="fj-sem-barra fj-grade fj-grade--evolucao">
          <main className="fj-boot fj-centro">
            <Progressao semSalto kicker={`Evolução · ${nome || "Personagem"}`} d={{ classeSlug, avancos }} set={(p) => setAvancos(p.avancos ?? {})}
              catalogos={catalogos} etapas={etapas} irParaClasse={onSair} />
          </main>
          <aside className="fj-sem-barra fj-lateral">
            <div className="fj-evolucao__placa fj-ch-l">
              <div>
                <div className="fj-placa__nome">{nome || "Sem nome"}</div>
                <Mono tom="cy">{classe?.nome ?? classeSlug}</Mono>
              </div>
              <span className="fj-evolucao__salto"><span>{inicio.de}</span><em>→</em><span className="fj-glow">{alvo}</span></span>
            </div>
            <ProgressaoLateral etapas={etapas} nota="Ao selar, o personagem sobe Ranking a Ranking com estas escolhas. Magias adicionais ficam pendentes na ficha." />
          </aside>
        </div>
        <footer className="fj-doca">
          <button type="button" onClick={onSair} className="fj-doca__voltar"><Key k="Q" /> Voltar</button>
          <div className="fj-doca__selo">
            {erro ? <span className="fj-doca__erro" role="alert">{erro}</span> : pendentes > 0 ? <Mono tom="am">{pendentes} pendência{pendentes > 1 ? "s" : ""}</Mono> : null}
            <button type="button" disabled={!pode} aria-busy={enviando} onClick={() => void selar()} className="fj-ch fj-doca__selar">
              {enviando ? "Selando…" : `Selar Ranking ${alvo}`}
            </button>
            <Key k="E" />
          </div>
        </footer>
      </div>
    </div>
  );
}
