"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { MAPA_DO_IMPERIO, REGIOES, REGRAS_DE_ORIGEM, type RegiaoAcervo } from "../acervo/regioes";
import { BotaoCodex, BotaoEscolha, FaixaEstado, IndiceCodex, SecHead, Shell, useAtalhoCodex, useIndiceAtivo, type ItemIndice } from "../Codex";
import { Key, Mono, Panel } from "../ui";
import type { SetDraft } from "../tipos";
import type { DraftV12 } from "../../../../../../lib/rulesetV12";
import { oxanium } from "../fonte";
import type { RegiaoIdV12 } from "../../../../../../lib/rulesetV12/contracts";

const reg = (id: string) => REGIOES.find((r) => r.id === id) ?? REGIOES[0];

/** Idiomas conhecidos pela regra de origem: o da região e o da região onde a campanha começa. */
export function idiomas(id: string, regiaoCampanha: RegiaoIdV12): string[] {
  const own = REGIOES.find((r) => r.id === id)?.lang;
  const camp = reg(regiaoCampanha).lang;
  return own && own !== camp ? [own, camp] : [camp];
}

/** Troca primeiro nome ou sobrenome no campo Nome. */
const swapName = (d: DraftV12, part: "given" | "last", n: string) => {
  const [g = "", ...rest] = d.nome.trim().split(/\s+/);
  return part === "given" ? [n, ...rest].join(" ") : [g, n].filter(Boolean).join(" ");
};

export function RegiaoLateral({ d, set, id, regiaoCampanha }: { d: DraftV12; set: SetDraft; id: string; regiaoCampanha: RegiaoIdV12 }) {
  const [open, setOpen] = useState(false);
  const r = reg(id), on = d.regiaoId === id;
  const langs = idiomas(id, regiaoCampanha);
  useAtalhoCodex(() => setOpen(true));

  return (
    <>
      <Panel title={r.nome} right={<Mono tom="cy">{r.lang}</Mono>} ambar={on}>
        <FaixaEstado on={on} confirmado="ORIGEM FIXADA" pendente="VISUALIZANDO · NÃO CONFIRMADA" />

        <div key={id} className="fj-boot">
          <Mono tom="am">Como é crescer aqui</Mono>
          <p className="fj-lado__destaque">{r.grow}</p>
          <p className="fj-lado__citacao" style={{ borderColor: r.tint }}>{r.mark}</p>

          <dl className="fj-lado__dados">
            <div className="fj-lado__dado"><dt><Mono pequeno>Capital</Mono></dt><dd className="fj-lado__valor">{r.capital}</dd></div>
            <div className="fj-lado__dado"><dt><Mono pequeno>Idiomas</Mono></dt><dd className="fj-lado__valor fj-lado__valor--am">{langs.join(" · ")}</dd></div>
          </dl>
          <p className="fj-lado__nota">Mesa começa em {reg(regiaoCampanha).nome}. {langs.length === 1 ? "Mesma língua — apenas um idioma." : `Inclui ${langs[1]} da região da campanha.`}</p>

          <label className="fj-campo fj-lado__campo">
            <Mono pequeno>Cidade, distrito ou comunidade</Mono>
            <input
              value={on ? d.localOrigem : ""}
              disabled={!on}
              onChange={(e) => set({ localOrigem: e.target.value })}
              placeholder={on ? `Ex.: níveis baixos de ${r.capital}` : "Fixe a origem para especificar"}
              className="fj-campo__input fj-campo__input--display"
            />
          </label>
        </div>

        <div className="fj-lado__codex">
          <BotaoCodex arte={r.img} kicker="Atlas · Braxus Vantahl" titulo="Abrir códex regional" legenda="Mapa · Cultura · Nomes · Regras" onOpen={() => setOpen(true)} />
        </div>
      </Panel>

      {open && createPortal(
        <Shell rotulo="Códex regional" onClose={() => setOpen(false)}>
          <CodexRegional start={id} d={d} set={set} onClose={() => setOpen(false)} />
        </Shell>, document.body)}
    </>
  );
}

const FADE = "linear-gradient(to left, black 35%, transparent), linear-gradient(to top, transparent, black 30%)";

function CodexRegional({ start, d, set, onClose }: { start: string; d: DraftV12; set: SetDraft; onClose: () => void }) {
  const [id, setId] = useState(start);
  const r = reg(id), on = d.regiaoId === id;
  const { scroller, active, go } = useIndiceAtivo(null);
  const toc: ItemIndice[] = [
    { k: "visao", label: "Visão geral" },
    { k: "mapa", label: "Mapa do Império" },
    { k: "nomes", label: "Nomes", kids: [{ k: "n-f", label: "Femininos" }, { k: "n-m", label: "Masculinos" }, { k: "n-s", label: "Sobrenomes" }] },
    { k: "regra", label: "Regra de origem", kids: [{ k: "comparar", label: "Comparar regiões" }] },
  ];
  const [big, setBig] = useState(false);
  useEffect(() => {
    if (!big) return;
    // captura o Esc antes do Shell para fechar só o mapa
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); setBig(false); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [big]);
  const pick = () => set({ regiaoId: r.id, localOrigem: on ? d.localOrigem : "" });

  return (
    <div className="fj-borda fj-ch fj-codex" style={{ "--rt": r.tint } as CSSProperties}>
      <div className="fj-ch fj-vidro fj-codex__corpo">
        <header className="fj-codex-cab">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <span className="fj-ch-hex fj-codex-cab__hex"><img src={r.img} alt="" /></span>
          <div className="fj-codex-cab__titulos">
            <Mono pequeno tom="cy">Região de origem · Códex</Mono>
            <div className="fj-codex-cab__titulo">{r.nome}</div>
          </div>
          <div className="fj-regioes-rapidas">
            {REGIOES.map((x) => (
              <button type="button" key={x.id} onClick={() => setId(x.id)} className={`fj-regiao-rapida ${x.id === id ? "fj-regiao-rapida--atual" : ""}`}>
                <span>{x.nome}{d.regiaoId === x.id && <span className="fj-regiao-rapida__origem">●</span>}</span>
              </button>
            ))}
          </div>
          <div className="fj-codex-cab__acoes">
            <BotaoEscolha on={on} onClick={pick}>{on ? "✓ Origem fixada" : "Fixar origem"}</BotaoEscolha>
            <button type="button" onClick={onClose} className="fj-fechar"><Key k="ESC" /> Fechar</button>
          </div>
        </header>

        <div className="fj-codex__grade">
          <IndiceCodex toc={toc} active={active} go={go} />

          <div ref={scroller} className="fj-codex__leitura">
            <section id="visao" data-sec key={id} className="fj-boot fj-codex__heroi">
              <div className="fj-codex__heroi-arte fj-codex__heroi-arte--regiao" style={{ maskImage: FADE, WebkitMaskImage: FADE, maskComposite: "intersect", WebkitMaskComposite: "source-in" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.img} alt={r.capital} />
              </div>
              <span className="fj-codex__heroi-legenda">{r.capital.toUpperCase()}</span>
              <div className="fj-codex__heroi-texto">
                <Mono tom="am">Capital · {r.capital} &nbsp;/&nbsp; Idioma · {r.lang}</Mono>
                <h2 className="fj-codex__heroi-titulo" style={{ textShadow: `0 0 18px ${r.tint}88` }}>{r.nome}</h2>
                <div className="fj-codex__paragrafos">{r.lore.map((p, i) => <p key={i} className={i === 0 ? "fj-codex__abertura" : ""}>{p}</p>)}</div>
                <div className="fj-codex__dupla">
                  <div className="fj-codex__nota"><Mono pequeno tom="cy">Como é crescer aqui</Mono><p>{r.grow}</p></div>
                  <div className="fj-codex__nota" style={{ borderColor: r.tint }}><Mono pequeno>O que marca alguém daqui</Mono><p>{r.mark}</p></div>
                </div>
              </div>
            </section>

            <div className="fj-codex__coluna fj-codex__coluna--larga">
              <section id="mapa" data-sec className="fj-codex__secao">
                <SecHead n="02" t="Mapa do Império" />
                <div className="fj-borda fj-ch">
                  <div className="fj-ch fj-mapa">
                    <MapaImperio id={id} origin={d.regiaoId} onPin={setId} />
                    <button type="button" onClick={() => setBig(true)} className="fj-mapa__expandir">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg> Expandir
                    </button>
                  </div>
                </div>
                <p className="fj-codex__dica">Toque em uma capital para trocar a região exibida no códex.</p>
              </section>

              <section id="nomes" data-sec className="fj-codex__secao fj-codex__secao--fio">
                <SecHead n="03" t="Nomes" />
                <p className="fj-codex__nota-nomes">{r.namesNote}</p>
                {([["n-f", "Femininos", r.names.f, "given"], ["n-m", "Masculinos", r.names.m, "given"], ["n-s", "Sobrenomes", r.names.s, "last"]] as const).map(([k, t, list, part]) => (
                  <div key={k} id={k} data-sec className="fj-nomes">
                    <Mono tom="cy">{t}</Mono>
                    <div className="fj-nomes__lista">
                      {list.map((n) => {
                        const used = d.nome.split(/\s+/).includes(n);
                        return (
                          <button type="button" key={n} onClick={() => set({ nome: swapName(d, part, n) })} title={part === "given" ? "Usar como primeiro nome" : "Usar como sobrenome"} className={`fj-nome ${used ? "fj-nome--usado" : ""}`}>{n}</button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <p className="fj-codex__dica">Clique para aplicar ao nome do refratário · atual: <span className="fj-codex__dica-forte">{d.nome || "—"}</span></p>
              </section>

              <section id="regra" data-sec className="fj-codex__secao fj-codex__secao--fio">
                <SecHead n="04" t="Regra de origem" />
                <div className="fj-codex__paragrafos">{REGRAS_DE_ORIGEM.map((p, i) => <p key={i}>{p}</p>)}</div>
                <div id="comparar" data-sec className="fj-comparar">
                  <Mono tom="cy">Comparar regiões</Mono>
                  <div className="fj-comparar__lista">
                    {REGIOES.map((x) => (
                      <button type="button" key={x.id} onClick={() => setId(x.id)} className={`fj-comparar__linha ${x.id === id ? "fj-comparar__linha--atual" : ""}`}>
                        <span className="fj-comparar__nome"><span className="fj-losango" style={{ background: x.tint }} />{x.nome}</span>
                        <span className="fj-comparar__grow">{x.grow}</span>
                        <span className="fj-comparar__mark">{x.mark}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>

        {/* portal no body: o Shell usa transform, o que prenderia o fixed dentro do códex */}
        {big && createPortal(
          <div onClick={() => setBig(false)} className={`fj-root ${oxanium.variable} fj-mapa-grande`} role="dialog" aria-modal="true" aria-label="Mapa do Império">
            <div onClick={(e) => e.stopPropagation()} className="fj-mapa-grande__topo">
              <div><Mono pequeno tom="cy">Atlas imperial</Mono><div className="fj-codex-cab__titulo">Braxus Vantahl</div></div>
              <div className="fj-mapa-grande__regioes">
                {REGIOES.map((x) => (
                  <button type="button" key={x.id} onClick={() => setId(x.id)} className={`fj-mapa-grande__regiao ${x.id === id ? "fj-mapa-grande__regiao--atual" : ""}`}>
                    <span className="fj-losango" style={{ background: x.tint }} />{x.nome}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setBig(false)} className="fj-fechar fj-mapa-grande__fechar"><Key k="ESC" /> Fechar mapa</button>
            </div>
            <div className="fj-mapa-grande__area">
              <div onClick={(e) => e.stopPropagation()} className="fj-borda fj-ch fj-mapa-grande__moldura">
                <div className="fj-ch fj-mapa">
                  <MapaImperio id={id} origin={d.regiaoId} onPin={setId} big />
                </div>
              </div>
            </div>
            <div onClick={(e) => e.stopPropagation()} className="fj-mapa-grande__rodape">
              <span className="fj-mapa-grande__nome">{r.nome}</span>
              <Mono>Capital · {r.capital}</Mono>
              <span className="fj-mapa-grande__grow">{r.grow}</span>
            </div>
          </div>, document.body)}
      </div>
    </div>
  );
}

function MapaImperio({ id, origin, onPin, big }: { id: string; origin: string; onPin: (id: string) => void; big?: boolean }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={MAPA_DO_IMPERIO} alt="Mapa de Braxus Vantahl" className="fj-mapa__img" />
      <div className="fj-mapa__tinta" />
      {REGIOES.map((x: RegiaoAcervo) => {
        const cur = x.id === id;
        return (
          <button type="button" key={x.id} onClick={() => onPin(x.id)} className={`fj-pino ${big ? "fj-pino--grande" : ""} ${cur ? "fj-pino--atual" : ""}`} style={{ left: `${x.pin.x}%`, top: `${x.pin.y}%`, "--pino": x.tint } as CSSProperties} aria-label={x.nome}>
            {cur && <span className="fj-ping fj-pino__onda" />}
            <span className="fj-pino__marca" />
            <span className={`fj-pino__rotulo ${cur || big ? "fj-pino__rotulo--visivel" : ""}`}>
              {x.capital.toUpperCase()}{origin === x.id && <span className="fj-pino__origem"> · ORIGEM</span>}
            </span>
          </button>
        );
      })}
    </>
  );
}
