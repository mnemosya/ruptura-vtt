"use client";

import { useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { VERTENTES_ACERVO, type MagiaGrimorio, type VertenteAcervo, type VertenteId } from "../acervo/vertentes";
import { BotaoCodex, BotaoEscolha, CabecalhoCodex, FaixaEstado, IndiceCodex, RuleText, SecHead, Shell, useAtalhoCodex, useIndiceAtivo, type ItemIndice } from "../Codex";
import { Mono, Panel } from "../ui";
import type { Build, SetBuild } from "../tipos";

const title = (s: string) => s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a: string, c: string) => a + c.toUpperCase());
const vmeta = (id: string): VertenteAcervo => VERTENTES_ACERVO.find((v) => v.id === id) ?? VERTENTES_ACERVO[0];
const plain = (s: string) => s.replace(/\*\*/g, "");
const DIFF: Record<string, number> = { "Fácil": 1, "Média": 2, "Difícil": 3 };

/** Magias iniciais = magias aprendidas no nível 1 (tabela da Vertente). */
export const magiasIniciais = (id: string) => vmeta(id).grimorio.prog[0].n;

function useMagias(id: VertenteId, b: Build, set: SetBuild) {
  const tuned = b.vertente === id, need = magiasIniciais(id);
  const spells = tuned ? b.magias : [];
  const toggle = (n: string) => {
    const on = spells.includes(n);
    set({ vertente: id, magias: on ? spells.filter((x) => x !== n) : spells.length < need ? [...spells, n] : spells });
  };
  return { tuned, need, spells, toggle };
}

function Dificuldade({ diff, cor }: { diff: string; cor: string }) {
  const n = DIFF[diff] ?? 2;
  return (
    <span className="fj-dificuldade">
      <span className="fj-dificuldade__pips" aria-hidden="true">{[1, 2, 3].map((i) => <span key={i} className="fj-dificuldade__pip" style={i <= n ? { background: cor } : undefined} />)}</span>
      <span className="fj-dificuldade__rotulo">{diff}</span>
    </span>
  );
}

function Vagas({ id, b }: { id: string; b: Build }) {
  const need = magiasIniciais(id), have = b.vertente === id ? b.magias.length : 0;
  return (
    <div className="fj-vagas">
      <span className="fj-vagas__pips" aria-hidden="true">{Array.from({ length: need }).map((_, i) => <span key={i} className={`fj-losango fj-losango--md ${i < have ? "fj-losango--ambar" : "fj-losango--contorno"}`} />)}</span>
      <Mono pequeno>{have}/{need} magias · escolha no códex</Mono>
    </div>
  );
}

function Essencia({ id, b }: { id: string; b: Build }) {
  const v = vmeta(id), d = v.grimorio;
  return (
    <div className="fj-essencia">
      <div className="fj-essencia__arte">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={v.arte} alt="" />
        <div className="fj-essencia__veu" />
        <div className="fj-essencia__casa">
          <Mono pequeno>{d.house}</Mono>
          <div className="fj-essencia__fio" style={{ background: v.cor, boxShadow: `0 0 10px ${v.brilho}` }} />
        </div>
      </div>
      <div>
        <p className="fj-lado__destaque fj-lado__destaque--grande">{d.desc}</p>
        <p className="fj-lado__resumo fj-lado__resumo--livre">{plain(d.lead).split(". ").slice(1).join(". ") || plain(d.lead)}</p>
      </div>
      <div className="fj-essencia__linha">
        <Dificuldade diff={d.diff} cor={v.cor} />
        <span className="fj-essencia__gatilho">{v.gatilho}</span>
      </div>
      <Vagas id={id} b={b} />
    </div>
  );
}

export function VertenteLateral({ b, set, id }: { b: Build; set: SetBuild; id: string }) {
  const [open, setOpen] = useState(false);
  const v = vmeta(id), tuned = b.vertente === id;
  useAtalhoCodex(() => setOpen(true));

  return (
    <>
      <Panel title={v.nome} ambar={tuned}>
        <FaixaEstado colada on={tuned} confirmado="SINTONIZADA" pendente="VISUALIZANDO · NÃO SINTONIZADA" />
        <div key={id} className="fj-boot"><Essencia id={id} b={b} /></div>
        <div className="fj-lado__codex">
          <BotaoCodex arte={v.arte} hexCor={`${v.cor}55`} kicker={`Grimório · ${v.grimorio.house}`} titulo="Abrir códex e magias" onOpen={() => setOpen(true)} />
        </div>
      </Panel>

      {open && createPortal(
        <Shell rotulo={`Códex de ${v.nome}`} onClose={() => setOpen(false)}>
          <CodexVertente id={v.id} b={b} set={set} onClose={() => setOpen(false)} />
        </Shell>, document.body)}
    </>
  );
}

function CodexVertente({ id, b, set, onClose }: { id: VertenteId; b: Build; set: SetBuild; onClose: () => void }) {
  const v = vmeta(id), d = v.grimorio;
  const { tuned, need, spells, toggle } = useMagias(id, b, set);
  const { scroller, active, go } = useIndiceAtivo(id);
  const toc: ItemIndice[] = [
    { k: "visao", label: "Visão geral" },
    { k: "pratica", label: "Prática", kids: [{ k: "cast", label: d.castLabel }, { k: "manif", label: "Manifestação" }, { k: "prog", label: "Progressão" }] },
    { k: "magias", label: "Magias", kids: d.levels.map((l) => ({ k: `lv-${l.lv}`, label: `Nível ${l.lv} · ${l.spells.length}` })) },
  ];

  return (
    <div className="fj-borda fj-ch fj-codex" style={{ "--vc": v.cor, "--vc-brilho": v.brilho } as CSSProperties}>
      <div className="fj-ch fj-vidro fj-codex__corpo">
        <CabecalhoCodex icone={<span className="fj-ch-hex fj-codex-cab__hex" style={{ background: v.cor, boxShadow: `0 0 14px ${v.brilho}` }} />} kicker="Grimório de vertente · Códex" titulo={v.nome} onClose={onClose}>
          <span className="fj-codex-cab__contador"><Mono pequeno>Magias iniciais</Mono><span>{spells.length}/{need}</span></span>
          <BotaoEscolha on={tuned} onClick={() => set({ vertente: id, magias: tuned ? spells : [] })}>{tuned ? "✓ Sintonizada" : "Sintonizar"}</BotaoEscolha>
        </CabecalhoCodex>

        <div className="fj-codex__grade">
          <IndiceCodex toc={toc} active={active} go={go} />

          <div ref={scroller} className="fj-codex__leitura">
            <section id="visao" data-sec className="fj-codex__heroi">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v.arte} alt="" className="fj-codex__heroi-img" />
              <div className="fj-codex__heroi-texto">
                <Mono tom="am">{d.house} · Dificuldade {d.diff}</Mono>
                <h2 className="fj-codex__heroi-titulo" style={{ textShadow: `0 0 18px color-mix(in srgb, ${v.brilho} 55%, transparent)` }}>{v.nome}</h2>
                <RuleText text={d.lead} className="fj-codex__abertura fj-codex__abertura--espaco" />
                <div className="fj-codex__paragrafos fj-codex__paragrafos--suave">{d.body.map((p, i) => <p key={i}>{p}</p>)}</div>
                <blockquote className="fj-citacao" style={{ borderColor: v.cor }}>
                  <div className="fj-citacao__texto">{d.quote.map((q, i) => <p key={i}>{q}</p>)}</div>
                  <footer className="fj-citacao__autor" style={{ color: v.brilho }}>— {d.attr}</footer>
                </blockquote>
              </div>
            </section>

            <div className="fj-codex__coluna">
              <section id="pratica" data-sec className="fj-codex__secao">
                <SecHead n="02" t="Prática" />
                <div id="cast" data-sec className="fj-codex__bloco">
                  <h4 className="fj-codex__sub fj-codex__sub--grande">{d.castLabel}</h4>
                  <RuleText text={d.cast} className="fj-texto-leitura" />
                </div>
                <div id="manif" data-sec className="fj-codex__bloco">
                  <h4 className="fj-codex__sub fj-codex__sub--grande">Manifestação</h4>
                  <RuleText text={d.manif} className="fj-texto-leitura" />
                </div>
                <div id="prog" data-sec>
                  <h4 className="fj-codex__sub fj-codex__sub--grande">Progressão</h4>
                  <div className="fj-progressao">
                    {d.prog.map((p) => (
                      <div key={p.lv} className={`fj-ch fj-progressao__nivel ${p.lv === 1 ? "fj-progressao__nivel--atual" : ""}`}>
                        <Mono pequeno>Nível {p.lv}</Mono>
                        <div className="fj-progressao__n">{p.n}</div>
                        <Mono pequeno tom="cy">magias · CD {p.cd}</Mono>
                      </div>
                    ))}
                  </div>
                  <p className="fj-codex__dica">CD da vertente = 6 + nível. Na criação, a Vertente Primária começa no nível 1.</p>
                </div>
              </section>

              <section id="magias" data-sec className="fj-codex__secao fj-codex__secao--fio">
                <SecHead n="03" t="Magias" />
                {d.levels.map((l) => (
                  <div key={l.lv} id={`lv-${l.lv}`} data-sec className="fj-nivel">
                    <div className="fj-ch-l fj-nivel__cab">
                      <h3 className="fj-subclasse__nome">Nível {l.lv}</h3>
                      {l.lv === 1 ? <Mono tom="am">Escolha {need} · {spells.length}/{need}</Mono> : <Mono>Desbloqueia depois</Mono>}
                    </div>
                    {l.note && <p className="fj-codex__dica fj-codex__dica--italico">{l.note}</p>}
                    <div className="fj-nivel__magias">
                      {l.spells.map((s) => (
                        <CartaoMagia key={s.n} s={s} cor={v.cor} pick={l.lv === 1 ? { on: spells.includes(s.n), full: spells.length >= need, toggle: () => toggle(s.n) } : undefined} />
                      ))}
                    </div>
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

function CartaoMagia({ s, cor, pick }: { s: MagiaGrimorio; cor: string; pick?: { on: boolean; full: boolean; toggle: () => void } }) {
  const on = !!pick?.on;
  return (
    <article className={`fj-magia ${on ? "fj-magia--on" : ""}`} style={{ borderColor: on ? undefined : `${cor}88` }}>
      <div className="fj-magia__topo">
        <div>
          <h5 className="fj-magia__nome">{title(s.n)}</h5>
          <div className="fj-magia__tags">
            {s.tags.map((t) => <span key={t} className="fj-magia__tag">{t}</span>)}
            {s.type && <span className="fj-magia__tag" style={{ color: cor, background: `${cor}1a` }}>{s.type.toUpperCase()}</span>}
          </div>
        </div>
        {pick && (
          <button type="button" onClick={pick.toggle} disabled={!on && pick.full} className={`fj-ch-tab fj-magia__vincular ${on ? "fj-magia__vincular--on" : ""}`}>
            {on ? "✓ Vinculada" : "+ Vincular"}
          </button>
        )}
      </div>
      <dl className="fj-magia__dados">
        {([["Alcance", s.range], ["Duração", s.dur], ["Requisito", s.req]] as const).filter(([, x]) => x).map(([k, x]) => (
          <div key={k}><dt className="fj-magia__dt">{k}</dt><dd className="fj-magia__dd">{x}</dd></div>
        ))}
      </dl>
      <RuleText text={s.d} className="fj-magia__texto" />
    </article>
  );
}
