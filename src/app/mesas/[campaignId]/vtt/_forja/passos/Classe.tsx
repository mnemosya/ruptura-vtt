"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { CLASSES_ACERVO, type RankDossie } from "../acervo/classes";
import { vertentePorNome } from "../acervo/vertentes";
import { BotaoCodex, BotaoEscolha, CabecalhoCodex, FaixaEstado, IndiceCodex, RuleText, SecHead, Shell, useAtalhoCodex, useIndiceAtivo, type ItemIndice } from "../Codex";
import { Mono, Panel } from "../ui";
import type { Build, SetBuild } from "../tipos";

const title = (s: string) => s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a: string, c: string) => a + c.toUpperCase());
const meta = (id: string) => CLASSES_ACERVO.find((c) => c.id === id) ?? CLASSES_ACERVO[0];

function Feats({ rank, accent }: { rank: RankDossie; accent?: boolean }) {
  return (
    <div className="fj-feats">
      {rank.feats.map((f) => (
        <article key={f.n}>
          <h5 className={`fj-feats__nome ${accent ? "fj-feats__nome--am" : ""}`}>{title(f.n)}</h5>
          <RuleText text={f.d} className="fj-texto-leitura" />
        </article>
      ))}
    </div>
  );
}

function Sinergia({ id }: { id: string }) {
  return (
    <div className="fj-sinergia">
      {meta(id).dossie.syn.map((s) => {
        const v = vertentePorNome(s.v);
        return (
          <div key={s.v} title={s.d} className="fj-sinergia__linha">
            <span className="fj-sinergia__nome">{s.v}</span>
            <span className="fj-sinergia__pips" aria-label={`${s.n} de 5`}>
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className="fj-losango" style={i < s.n && v ? { background: v.cor, boxShadow: `0 0 6px ${v.brilho}` } : undefined} />
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Assumir({ id, b, set }: { id: string; b: Build; set: SetBuild }) {
  const on = b.classe === id;
  return <BotaoEscolha on={on} onClick={() => set({ classe: id })}>{on ? `✓ ${meta(id).nome} assumida` : "Assumir classe"}</BotaoEscolha>;
}

export function ClasseLateral({ b, set, id }: { b: Build; set: SetBuild; id: string }) {
  const [open, setOpen] = useState(false);
  const c = meta(id), d = c.dossie, on = b.classe === id;
  const now = d.feats.find((r) => r.r === "F")?.feats ?? [];
  const top = [...d.syn].sort((a, z) => z.n - a.n).filter((s) => s.n === 5);
  useAtalhoCodex(() => setOpen(true));

  return (
    <>
      <Panel title={c.nome} right={<Mono tom="cy">{c.sigla}</Mono>} ambar={on}>
        <FaixaEstado on={on} confirmado="SELECIONADA" pendente="VISUALIZANDO · NÃO CONFIRMADA" />

        <div key={id} className="fj-boot">
          <Mono tom="am">Papel · {d.role}</Mono>
          <p className="fj-lado__destaque fj-lado__destaque--grande">{c.frase}</p>
          <p className="fj-lado__resumo">{d.intro[0]}</p>

          <dl className="fj-lado__lista">
            <div><dt><Mono pequeno>Você começa com</Mono></dt><dd className="fj-lado__chips">{now.map((f) => title(f.n)).join(" · ")}</dd></div>
            <div>
              <dt><Mono pequeno>Afinidade máxima</Mono></dt>
              <dd className="fj-lado__afinidades">
                {top.map((s) => {
                  const v = vertentePorNome(s.v);
                  return <span key={s.v} className="fj-lado__afinidade"><span className="fj-losango" style={v ? { background: v.cor } : undefined} />{s.v}</span>;
                })}
              </dd>
            </div>
            <div><dt><Mono pequeno>Caminhos · Ranking E</Mono></dt><dd className="fj-lado__caminhos">{d.subs.map((s) => s.n).join(" · ")}</dd></div>
          </dl>
        </div>

        <div className="fj-lado__codex">
          <BotaoCodex arte={c.arte} posicaoArte="topo" kicker={`Dossiê · ${c.sigla}-01`} titulo="Ler códex completo" legenda="Regras · Progressão · Subclasses" onOpen={() => setOpen(true)} />
        </div>
      </Panel>

      {open && createPortal(
        <Shell rotulo={`Códex de ${c.nome}`} onClose={() => setOpen(false)}>
          <CodexClasse id={id} b={b} set={set} onClose={() => setOpen(false)} />
        </Shell>, document.body)}
    </>
  );
}

function CodexClasse({ id, b, set, onClose }: { id: string; b: Build; set: SetBuild; onClose: () => void }) {
  const c = meta(id), d = c.dossie;
  const { scroller, active, go } = useIndiceAtivo(id);
  const toc: ItemIndice[] = [
    { k: "visao", label: "Visão geral" },
    { k: "criacao", label: "Criação" },
    { k: "prog", label: "Progressão", kids: d.feats.filter((r) => r.feats.length).map((r) => ({ k: `r-${r.r}`, label: `${r.r} · ${title(r.feats[0].n)}` })) },
    { k: "subs", label: "Subclasses", kids: d.subs.map((s) => ({ k: `s-${s.n}`, label: s.n })) },
  ];

  return (
    <div className="fj-borda fj-ch fj-codex">
      <div className="fj-ch fj-vidro fj-codex__corpo">
        <CabecalhoCodex icone={<span className="fj-ch-hex fj-codex-cab__sigla">{c.sigla}</span>} kicker="Dossiê de classe · Códex" titulo={c.nome} onClose={onClose}>
          <Assumir id={id} b={b} set={set} />
        </CabecalhoCodex>
        <div className="fj-codex__grade">
          <IndiceCodex toc={toc} active={active} go={go} />

          <div ref={scroller} className="fj-codex__leitura">
            <section id="visao" data-sec className="fj-codex__heroi">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.arte} alt="" className="fj-codex__heroi-img fj-codex__heroi-img--topo" />
              <div className="fj-codex__heroi-texto">
                <Mono tom="am">Papel principal · {d.role}</Mono>
                <h2 className="fj-codex__heroi-titulo fj-glow">{c.nome}</h2>
                <div className="fj-codex__paragrafos">{d.intro.map((p, i) => <p key={i}>{p}</p>)}</div>
                <p className="fj-codex__secundario">Papéis secundários — <span>{d.sec}</span></p>
              </div>
            </section>

            <div className="fj-codex__coluna">
              <section id="criacao" data-sec className="fj-codex__secao">
                <SecHead n="02" t="Criação" />
                <h4 className="fj-codex__sub">Perícias de especialidade</h4>
                <p className="fj-texto-leitura">{d.skills3.join(" · ")}</p>
                <h4 className="fj-codex__sub fj-codex__sub--espaco">Sinergia com Vertentes</h4>
                <Sinergia id={id} />
                <p className="fj-codex__dica">A Vertente Primária é livre — a sinergia só indica o quanto ela conversa com a classe.</p>
              </section>

              <section id="prog" data-sec className="fj-codex__secao fj-codex__secao--fio">
                <SecHead n="03" t="Progressão" />
                {d.feats.map((r) => (
                  <div key={r.r} id={`r-${r.r}`} data-sec className="fj-rank">
                    <div className="fj-rank__trilho">
                      <span className={`fj-ch-hex fj-rank__hex ${r.r === "F" ? "fj-rank__hex--atual" : ""}`}>{r.r}</span>
                      <span className="fj-rank__fio" />
                    </div>
                    <div className="fj-rank__conteudo">
                      <p className="fj-rank__lead">{r.lead}</p>
                      {r.feats.length > 0 && <Feats rank={r} accent={r.r === "F"} />}
                    </div>
                  </div>
                ))}
              </section>

              <section id="subs" data-sec className="fj-codex__secao fj-codex__secao--fio">
                <SecHead n="04" t="Subclasses" />
                <p className="fj-codex__dica fj-codex__dica--antes">Escolhida ao alcançar o Ranking E. Aqui é só reconhecimento.</p>
                {d.subs.map((s) => (
                  <div key={s.n} id={`s-${s.n}`} data-sec className="fj-subclasse">
                    <div className="fj-ch-l fj-subclasse__cab">
                      <h3 className="fj-subclasse__nome">{s.n}</h3>
                      <p className="fj-subclasse__tag">{s.tag}</p>
                    </div>
                    <p className="fj-texto-leitura fj-subclasse__lore">{s.lore}</p>
                    {s.ranks.map((r) => (
                      <div key={r.r} className="fj-subclasse__rank">
                        <Mono tom="cy">Ranking {r.r}</Mono>
                        <div className="fj-subclasse__feats"><Feats rank={r} /></div>
                      </div>
                    ))}
                  </div>
                ))}
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
