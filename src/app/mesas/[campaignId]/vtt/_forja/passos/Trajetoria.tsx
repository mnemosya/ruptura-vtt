"use client";

import { useState, type ReactNode } from "react";
import type { CatalogosCriacaoV12, OpcaoTrajetoriaV12 } from "../../_acoes/criacaoV12Actions";
import { Mono, Panel, Rich } from "../ui";
import { CATEGORIAS_TRACO, type Build, type SetBuild } from "../tipos";

const pad = (i: number) => String(i + 1).padStart(2, "0");

/**
 * Orçamento de Traços do protótipo (Fase 1). A Fase 3 troca pela regra
 * da v1.2: Qualidades somam exatamente 3; Complicações, ao menos 2.
 */
export const ORCAMENTO = { qualidades: 3, complicacoes: 2 } as const;
type Tipo = keyof typeof ORCAMENTO;
export const gasto = (m: Record<string, number>) => Object.values(m).reduce((a, c) => a + c, 0);

function Cabecalho({ kicker, title, right }: { kicker: string; title: string; right?: ReactNode }) {
  return (
    <div className="fj-cabecalho">
      <div><Mono tom="cy">{kicker}</Mono><h2 className="fj-cabecalho__titulo">{title}</h2></div>
      {right}
    </div>
  );
}

/* ---------------- Antecedente: índice vertical + registro selecionado ---------------- */

/** A descrição publicada repete a frase de Familiaridade no fim; ela já tem caixa própria. */
const semFamiliaridade = (descricao: string, familiaridade: string) => (familiaridade ? descricao.replace(familiaridade, "").trim() : descricao);

export function Antecedente({ b, set, catalogos }: { b: Build; set: SetBuild; catalogos: CatalogosCriacaoV12 }) {
  const lista = catalogos.antecedentes;
  const idx = Math.max(0, lista.findIndex((x) => x.slug === b.antecedente));
  const cur = lista[idx];
  if (!cur) return <p className="fj-vazio">Nenhum Antecedente publicado para esta mesa.</p>;
  const linked = b.antecedente === cur.slug;
  return (
    <div className="fj-passo">
      <Cabecalho kicker="Trajetória · 02" title="Antecedente" right={<Mono>{lista.length} registros</Mono>} />
      <div className="fj-mestre-detalhe">
        <div className="fj-borda fj-ch fj-mestre-detalhe__lista">
          <div className="fj-ch fj-vidro fj-sem-barra fj-indice-lista">
            {lista.map((bg, i) => {
              const on = bg.slug === b.antecedente;
              return (
                <button type="button" key={bg.slug} onClick={() => set({ antecedente: bg.slug })} className={`fj-indice-lista__item ${on ? "fj-indice-lista__item--on" : ""}`}>
                  <span className="fj-indice-lista__n">{pad(i)}</span>
                  <span className="fj-indice-lista__nome">{bg.nome}</span>
                  {on && <span className="fj-losango fj-losango--sm fj-losango--ambar fj-indice-lista__marca" />}
                </button>
              );
            })}
          </div>
        </div>
        <div className={`${linked ? "fj-borda-ambar" : "fj-borda"} fj-ch fj-mestre-detalhe__registro`}>
          <div key={cur.slug} className="fj-ch fj-vidro fj-boot fj-sem-barra fj-registro">
            <span className="fj-registro__marca-dagua">{pad(idx)}</span>
            <div className="fj-registro__linha">
              <Mono tom="am">ANT-{pad(idx)}</Mono>
              <span className="fj-registro__fio" />
              <Mono tom={linked ? "am" : undefined}>{linked ? "✓ Vinculado" : "Não vinculado"}</Mono>
            </div>
            <h3 className="fj-registro__titulo fj-glow">{cur.nome}</h3>
            <div className="fj-registro__texto">{semFamiliaridade(cur.descricao, cur.familiaridade).split("\n\n").map((p, i) => <p key={i}>{p}</p>)}</div>
            {cur.familiaridade && (
              <div className="fj-registro__caixa">
                <Mono tom="cy">Familiaridade</Mono>
                <p>{cur.familiaridade}</p>
              </div>
            )}
            <div className="fj-registro__trilho" aria-hidden="true">
              {lista.map((x, i) => <span key={x.slug} className={`fj-registro__passo ${i === idx ? "fj-registro__passo--atual" : i < idx ? "fj-registro__passo--antes" : ""}`} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Painel lateral do Antecedente: a narrativa de como virou refratário e o RPI. */
export function OrigemNarrativa({ b, set }: { b: Build; set: SetBuild }) {
  return (
    <Panel title="Como se tornou refratário" right={<Mono tom="cy">Narrativo</Mono>}>
      <label className="fj-sr" htmlFor="fj-origem">Como se tornou refratário</label>
      <textarea id="fj-origem" rows={8} value={b.origem} onChange={(e) => set({ origem: e.target.value })} placeholder="O dia em que a ruptura te tocou…" className="fj-area-livre" />
      <div className="fj-rpi">
        <label htmlFor="fj-rpi-codinome"><Mono>RPI forjado</Mono></label>
        <input id="fj-rpi-codinome" value={b.codinome} onChange={(e) => set({ codinome: e.target.value.toUpperCase() })} className="fj-rpi__input" />
      </div>
    </Panel>
  );
}

/* ---------------- Qualidades & Complicações ---------------- */

function Pips({ n, max, tipo }: { n: number; max: number; tipo: Tipo }) {
  return (
    <span className="fj-pips" aria-label={`${n} de ${max} pontos`}>
      {Array.from({ length: max }).map((_, i) => <span key={i} className={`fj-pips__pip ${i < n ? `fj-pips__pip--${tipo}` : ""}`} />)}
    </span>
  );
}

const ROTULO: Record<Tipo, string> = { qualidades: "Qualidades", complicacoes: "Complicações" };
const nomeCategoria = (id?: string) => CATEGORIAS_TRACO.find((c) => c.id === id)?.nome ?? "Outras";

/** Linhas de custo ("Por 1 ponto…") e de campanha ("Na campanha:…") ganham caixa própria. */
const estiloLinha = (x: string) => (/^(Por|Use) \**\d/.test(x) ? "fj-traco__custo" : /^\**Na campanha/.test(x) ? "fj-traco__campanha" : "");

export function Tracos({ b, set, catalogos }: { b: Build; set: SetBuild; catalogos: CatalogosCriacaoV12 }) {
  const [tipo, setTipo] = useState<Tipo>("qualidades");
  const [viewId, setViewId] = useState<Record<Tipo, string>>({ qualidades: catalogos.qualidades[0]?.slug ?? "", complicacoes: catalogos.complicacoes[0]?.slug ?? "" });
  const [lvl, setLvl] = useState<number | null>(null);
  const list: OpcaoTrajetoriaV12[] = catalogos[tipo];
  const picked = b[tipo], spent = gasto(picked), max = ORCAMENTO[tipo];
  const cur = list.find((x) => x.slug === viewId[tipo]) ?? list[0];
  if (!cur) return <p className="fj-vazio">Nenhuma opção publicada para esta mesa.</p>;
  const ownCost = picked[cur.slug];
  const level = lvl ?? ownCost ?? cur.custos[0];
  const room = max - spent + (ownCost ?? 0);
  const view = (id: string) => { setViewId({ ...viewId, [tipo]: id }); setLvl(null); };
  const commit = (cost: number | null) => {
    const next = { ...picked };
    if (cost === null) delete next[cur.slug]; else next[cur.slug] = cost;
    set({ [tipo]: next } as Partial<Build>);
    setLvl(null);
  };
  const categorias = [...CATEGORIAS_TRACO.map((c) => c.id), ...new Set(list.map((x) => x.categoria ?? "").filter((c) => !CATEGORIAS_TRACO.some((k) => k.id === c)))];

  return (
    <div className="fj-passo" data-tipo={tipo}>
      <Cabecalho kicker="Trajetória · 03" title="Qualidades & Complicações" right={
        <div className="fj-orcamentos">
          {(["qualidades", "complicacoes"] as const).map((k) => (
            <div key={k} className="fj-orcamento"><Mono tom={k === "qualidades" ? "cy" : "am"}>{ROTULO[k]}</Mono><Pips n={gasto(b[k])} max={ORCAMENTO[k]} tipo={k} /></div>
          ))}
        </div>
      } />
      <div className="fj-mestre-detalhe fj-mestre-detalhe--tracos">
        <div className="fj-tracos__coluna">
          <div className="fj-tracos__abas" role="tablist">
            {(["qualidades", "complicacoes"] as const).map((k) => (
              <button type="button" role="tab" aria-selected={tipo === k} key={k} onClick={() => { setTipo(k); setLvl(null); }} className={`fj-ch-tab fj-tracos__aba fj-tracos__aba--${k} ${tipo === k ? "fj-tracos__aba--on" : ""}`}>
                {ROTULO[k]} <span className="fj-tracos__qtd">{catalogos[k].length}</span>
              </button>
            ))}
          </div>
          <div className="fj-borda fj-ch fj-tracos__lista">
            <div className="fj-ch fj-vidro fj-sem-barra fj-tracos__rolagem">
              {categorias.map((cat) => {
                const items = list.filter((x) => (x.categoria ?? "") === cat);
                if (!items.length) return null;
                return (
                  <div key={cat}>
                    <div className="fj-tracos__categoria"><Mono pequeno>{nomeCategoria(cat)}</Mono><span className="fj-tracos__categoria-fio" /></div>
                    {items.map((t) => {
                      const on = t.slug in picked, viewing = t.slug === cur.slug;
                      return (
                        <button type="button" key={t.slug} onClick={() => view(t.slug)} className={`fj-tracos__item ${viewing ? "fj-tracos__item--vendo" : ""}`}>
                          <span className="fj-tracos__item-nome">
                            <span className={`fj-losango fj-losango--sm ${on ? "fj-losango--tipo" : "fj-losango--vazio"}`} />
                            <span className={on ? "fj-tracos__nome--on" : ""}>{t.nome}</span>
                          </span>
                          <CustoTag t={t} on={on ? picked[t.slug] : undefined} />
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className={`${ownCost && tipo === "complicacoes" ? "fj-borda-ambar" : "fj-borda"} fj-ch fj-mestre-detalhe__registro`}>
          <div key={tipo + cur.slug} className="fj-ch fj-vidro fj-boot fj-sem-barra fj-registro fj-registro--traco">
            <div className="fj-registro__linha">
              <Mono className="fj-tom-tipo">{tipo === "qualidades" ? "Qualidade" : "Complicação"} · {nomeCategoria(cur.categoria)}</Mono>
              <span className="fj-registro__fio fj-registro__fio--cy" />
              <Mono className={ownCost ? "fj-tom-tipo" : ""}>{ownCost ? `✓ Adquirida · ${ownCost} pt` : "Disponível"}</Mono>
            </div>
            <h3 className="fj-registro__titulo fj-registro__titulo--menor fj-glow">{cur.nome}</h3>
            <div className="fj-traco__texto">
              {cur.descricao.split("\n\n").map((x, i) => <Rich key={i} text={x} className={estiloLinha(x)} />)}
            </div>
            <div className="fj-traco__acoes">
              <div className="fj-traco__custos">
                <Mono>Custo</Mono>
                {cur.custos.map((c) => (
                  <button type="button" key={c} disabled={cur.custos.length < 2} onClick={() => setLvl(c)} className={`fj-ch-tab fj-traco__custo-btn ${level === c ? "fj-traco__custo-btn--on" : ""}`}>{c} pt</button>
                ))}
              </div>
              <div className="fj-traco__botoes">
                {ownCost && <button type="button" onClick={() => commit(null)} className="fj-ch fj-botao-fantasma">Remover</button>}
                {ownCost !== level && (
                  <button type="button" disabled={level > room} onClick={() => commit(level)} className="fj-ch fj-botao-tipo">
                    {level > room ? "Sem pontos" : ownCost ? `Ajustar para ${level} pt` : "Adquirir"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CustoTag({ t, on }: { t: OpcaoTrajetoriaV12; on?: number }) {
  const n = on ?? Math.max(...t.custos);
  return (
    <span className="fj-custo">
      {t.custos.length > 1 && on === undefined && <span className="fj-custo__faixa">1–2</span>}
      {Array.from({ length: n }).map((_, i) => (
        <span key={i} className={`fj-losango fj-losango--xs ${on !== undefined ? "fj-losango--tipo" : i < t.custos[0] ? "fj-losango--cheio" : "fj-losango--contorno"}`} />
      ))}
    </span>
  );
}

/** Painel lateral dos Traços: o que já foi adquirido e os pontos que sobram. */
export function FichaTracos({ b, set, catalogos }: { b: Build; set: SetBuild; catalogos: CatalogosCriacaoV12 }) {
  const drop = (k: Tipo, id: string) => { const n = { ...b[k] }; delete n[id]; set({ [k]: n } as Partial<Build>); };
  return (
    <div className="fj-pilha">
      {(["qualidades", "complicacoes"] as const).map((k) => {
        const entries = Object.entries(b[k]), left = ORCAMENTO[k] - gasto(b[k]), q = k === "qualidades";
        const nome = (slug: string) => catalogos[k].find((x) => x.slug === slug)?.nome ?? slug;
        return (
          <Panel key={k} ambar={!q} title={ROTULO[k]} right={<span className={`fj-ficha-tracos__sobra ${q ? "" : "fj-ficha-tracos__sobra--escuro"}`}>{left}</span>}>
            <div className="fj-ficha-tracos__topo" data-tipo={k}><Mono>Pontos restantes</Mono><Pips n={gasto(b[k])} max={ORCAMENTO[k]} tipo={k} /></div>
            {entries.length ? entries.map(([id, v]) => (
              <div key={id} className="fj-ficha-tracos__linha">
                <span className="fj-ficha-tracos__nome">{nome(id)}</span>
                <span className="fj-ficha-tracos__dir">
                  <Mono tom={q ? "cy" : "am"}>{v} pt</Mono>
                  <button type="button" onClick={() => drop(k, id)} className="fj-ficha-tracos__remover" aria-label={`Remover ${nome(id)}`}>✕</button>
                </span>
              </div>
            )) : <p className="fj-ficha-tracos__vazio">Nenhum registro adquirido.</p>}
          </Panel>
        );
      })}
    </div>
  );
}
