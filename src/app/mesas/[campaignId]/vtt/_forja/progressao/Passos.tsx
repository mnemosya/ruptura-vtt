"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Zap } from "lucide-react";
import type { CatalogosCriacaoV12 } from "../../_acoes/criacaoV12Actions";
import {
  ATRIBUTO_MAXIMO_V12,
  NIVEL_MAXIMO_VERTENTE_V12,
  VERTENTES_V12,
  resolveClassResourceV12,
  type AttributeIdV12,
  type ClassContentV12,
  type DraftAvancoV12,
  type EtapaProgressaoV12,
  type FeatureV12,
} from "../../../../../../lib/rulesetV12";
import { VERTENTES_ACERVO } from "../acervo/vertentes";
import { enquadramentoSubclasse } from "../acervo/subclasses";
import { ArteSubclasse, type Acao } from "./Partes";
import { TextoMd } from "./TextoMd";

type Catalogos = Pick<CatalogosCriacaoV12, "subclasses" | "pericias">;
export interface PropsPasso {
  etapa: EtapaProgressaoV12;
  catalogos: Catalogos;
  classe?: ClassContentV12;
  classeSlug: string;
  mudar: (p: Partial<DraftAvancoV12>) => void;
}

const RANKS_SUBCLASSE = ["E", "C", "A"] as const;
const paragrafos = (t: string) => t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

/* ════════════ SUBCLASSE ════════════ */

/**
 * Herói + texto integral da subclasse por Ranking (com um índice ao lado) e
 * o roster embaixo. O "Confirmar" vai no rodapé, que o fluxo desenha com a
 * subclasse à vista.
 */
export function PassoSubclasse({ etapa, catalogos, classe, classeSlug, mudar, rodape }: PropsPasso & { rodape: (confirmar?: Acao) => ReactNode }) {
  const lista = (catalogos.subclasses ?? []).filter((s) => s.classe_slug === classeSlug);
  const [vendo, setVendo] = useState(etapa.escolha.subclasse_id ?? lista[0]?.slug);
  const secoes = useRef<Record<string, HTMLDivElement | null>>({});
  const sel = lista.find((s) => s.slug === vendo) ?? lista[0];
  if (!sel) return <><div className="pg-corpo"><p className="pg-sb-vazio">Esta classe não tem subclasses publicadas.</p></div>{rodape()}</>;
  const ir = (r: string) => secoes.current[r]?.scrollIntoView({ block: "start", behavior: "smooth" });

  return (
    <>
      <div className="pg-corpo pg-corpo--coluna">
        <div className="pg-sb-topo">
          <div className="pg-sb-heroi">
            <ArteSubclasse slug={sel.slug} classeSlug={classeSlug} posicao={enquadramentoSubclasse(sel.slug).retrato} alt={sel.nome} />
            <span className="pg-sb-heroi__veu" />
            <span className="pg-sb-heroi__nome"><i /><b>{sel.nome}</b></span>
          </div>
          <div className="pg-sb-texto">
            <div className="pg-sb-papel">
              <span className="pg-sb-papel__ic"><Zap size={15} strokeWidth={2.2} aria-hidden="true" /></span>
              {classe?.papel_principal && <span className="pg-sb-papel__nome">{classe.papel_principal}</span>}
              <span className="pg-mono">Características de Subclasse</span>
            </div>
            <div className="pg-sb-ler">
              <div key={sel.slug} className="pg-sb-scroll pg-rolagem">
                {paragrafos(sel.descricao).map((p, i) => <p key={i} className="pg-sb-lore">{p}</p>)}
                {RANKS_SUBCLASSE.map((r) => {
                  const feats = sel.caracteristicas[r] ?? [];
                  if (!feats.length) return null;
                  return (
                    <div key={r} ref={(el) => { secoes.current[r] = el; }}>
                      <div className="pg-sb-rank"><b>RANK {r}</b><i /></div>
                      {feats.map((f) => (
                        <div key={f.slug} className="pg-sb-feat">
                          <h3>{f.nome}</h3>
                          <TextoMd texto={f.descricao} />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
              <nav className="pg-sb-indice" aria-label="Características por Ranking">
                {RANKS_SUBCLASSE.map((r) => {
                  const feats = sel.caracteristicas[r] ?? [];
                  if (!feats.length) return null;
                  const on = r === etapa.para;
                  return (
                    <div key={r} className={`pg-sb-indice__rk ${on ? "pg-sb-indice__rk--on" : ""}`}>
                      <span className={`pg-mono ${on ? "pg-mono--cy" : ""}`}>Rank {r}</span>
                      {feats.map((f) => <button type="button" key={f.slug} onClick={() => ir(r)} className="pg-sb-indice__item">{f.nome}</button>)}
                    </div>
                  );
                })}
              </nav>
            </div>
          </div>
        </div>

        <div className="pg-sb-roster" style={{ "--n": lista.length } as CSSProperties}>
          {lista.map((s, i) => {
            const on = s.slug === sel.slug;
            return (
              <button type="button" key={s.slug} onClick={() => setVendo(s.slug)} aria-pressed={on}
                aria-label={`${s.nome}${etapa.escolha.subclasse_id === s.slug ? " (escolhida)" : ""}`}
                className={`pg-sb-tile ${on ? "pg-sb-tile--on" : ""}`}>
                <ArteSubclasse slug={s.slug} classeSlug={classeSlug} posicao={enquadramentoSubclasse(s.slug).faixa} />
                <span className="pg-sb-tile__veu" />
                <span className="pg-sb-tile__no">{String(i + 1).padStart(2, "0")}</span>
                {/* Nome + a primeira característica do Rank E (dado real), como na prancheta. */}
                <span className="pg-sb-tile__txt"><b>{s.nome}</b><span>{s.caracteristicas.E?.[0]?.nome}</span></span>
              </button>
            );
          })}
        </div>
      </div>
      {rodape({ rotulo: `Confirmar ${sel.nome}`, onClick: () => mudar({ subclasse_id: sel.slug }) })}
    </>
  );
}

/* ════════════ VOCÊ GANHA ════════════ */

const NUMERAL = ["", "I", "II", "III", "IV"];
/** "Característica de Subclasse II", pela posição do Ranking na lista da classe/subclasse. */
export function rotuloGanho(etapa: EtapaProgressaoV12): string {
  const partes: string[] = [];
  const nSub = ["E", "C", "A"].indexOf(etapa.para) + 1;
  const nCla = ["F", "D", "B", "S"].indexOf(etapa.para) + 1;
  if (etapa.caracteristicas_classe.length && nCla) partes.push(`Característica de Classe ${NUMERAL[nCla]}`);
  if ((etapa.caracteristicas_subclasse.length || etapa.avanco.escolhe_subclasse) && nSub) partes.push(`Característica de Subclasse ${NUMERAL[nSub]}`);
  if (etapa.avanco.magias_adicionais > 0) partes.push(`+${etapa.avanco.magias_adicionais} magia${etapa.avanco.magias_adicionais > 1 ? "s" : ""}`);
  return partes.join(" · ");
}

export function PassoGanhos({ etapa, catalogos, classe, classeSlug }: PropsPasso) {
  const subSlug = etapa.escolha.subclasse_id ?? etapa.base.subclasse_id;
  const sub = (catalogos.subclasses ?? []).find((s) => s.slug === subSlug);
  const feats: FeatureV12[] = [...etapa.caracteristicas_classe, ...etapa.caracteristicas_subclasse];
  const magias = etapa.avanco.magias_adicionais;
  return (
    <div className="pg-corpo">
      <aside className="pg-vg-retrato pg-vidro">
        {sub
          ? <ArteSubclasse slug={sub.slug} classeSlug={classeSlug} posicao={enquadramentoSubclasse(sub.slug).retrato} alt={sub.nome} />
          // eslint-disable-next-line @next/next/no-img-element
          : <img src={`/forja/classes/${classeSlug}.webp`} alt="" className="pg-arte" />}
        <span className="pg-vg-retrato__veu" />
        <div className="pg-vg-retrato__txt">
          <span className="pg-mono pg-mono--cy">{sub ? "Sua subclasse" : "Sua classe"}</span>
          <i />
          <b>{sub ? sub.nome : classe?.nome ?? classeSlug}</b>
        </div>
      </aside>

      <div className="pg-vg-main">
        <div className="pg-vg-titulo"><h2>Características novas</h2><span className="pg-vg-n">{feats.length}</span></div>
        <span className="pg-mono pg-vg-sub">{rotuloGanho(etapa)}</span>
        <div className="pg-vg-lista pg-rolagem">
          {!feats.length && etapa.avanco.escolhe_subclasse && (
            <article className="pg-feat pg-feat--nota"><TextoMd texto="As características chegam com a Subclasse escolhida." /></article>
          )}
          {feats.map((f, i) => (
            <article key={f.slug} className="pg-feat">
              <div className="pg-feat__cab"><span className="pg-feat__n">{String(i + 1).padStart(2, "0")}</span><h3 className="pg-feat__nome">{f.nome}</h3></div>
              <TextoMd texto={f.descricao} />
            </article>
          ))}
          {magias > 0 && (
            <article className="pg-feat pg-feat--nota">
              <div className="pg-feat__cab"><span className="pg-feat__n">+{magias}</span><h3 className="pg-feat__nome">Magia{magias > 1 ? "s" : ""}</h3></div>
              <TextoMd texto="Escolhida depois, na ficha." />
            </article>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════ VERTENTE ════════════ */

/** Cor-luz (textos claros) quando a prancheta define; nas outras, o CSS deriva da cor da vertente. */
const LUZ: Record<string, string | undefined> = { cinetica: "#ff9fae" };

export function PassoVertente({ etapa, classe, mudar, primaria }: PropsPasso & { primaria?: string }) {
  const sinergia = classe?.criacao.sinergia_vertentes ?? {};
  const escolhida = etapa.escolha.vertente;
  const [vendo, setVendo] = useState<string>(escolhida ?? primaria ?? VERTENTES_V12[0]);
  const v = VERTENTES_ACERVO.find((x) => x.id === vendo) ?? VERTENTES_ACERVO[0];
  const nivel = (id: string) => etapa.base.vertentes[id] ?? 0;
  const cheia = (id: string) => nivel(id) + 1 > NIVEL_MAXIMO_VERTENTE_V12;
  const s = sinergia[v.id] ?? 0;
  // Clicar na escolhida desfaz (toda escolha tem volta).
  const escolher = (id: string) => { setVendo(id); mudar({ vertente: escolhida === id ? undefined : id }); };

  return (
    <div className="pg-corpo">
      <section className="pg-vt-foco" style={{ "--vx": v.cor, "--vx-luz": LUZ[v.id] } as CSSProperties}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div className="pg-vt-arte"><img src={v.arte} alt={v.nome} className="pg-arte" /></div>
        <div className="pg-vt-placa">
          <div>
            <span className="pg-vt-kicker">{v.id === primaria ? "Vertente primária" : "Vertente"}</span>
            <h2 className="pg-vt-nome">{v.nome}</h2>
            {/* O texto da vertente para ESTA classe ("Biótica favorece Combatentes que…"), do capítulo da classe. */}
            <p className="pg-vt-frase">{classe?.criacao.sinergia_textos?.[v.id] ?? v.frase}</p>
          </div>
          <div>
            {s > 0 && (
              <div className="pg-vt-sin">
                <span className="pg-vt-sin__rot">Sinergia · {classe?.nome}</span>
                <span className="pg-vt-sin__pips">{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= s ? "pg-on" : ""} />)}</span>
                {s === 5 && <span className="pg-vt-sin__max">MÁXIMA</span>}
              </div>
            )}
            <div className="pg-vt-nivel">
              <span className="pg-vt-nivel__rot">Nível</span>
              <span className="pg-vt-nivel__valor">{nivel(v.id)} <em>→</em> <em>{nivel(v.id) + 1}</em></span>
            </div>
          </div>
        </div>
      </section>

      <aside className="pg-vt-lista">
        <span className="pg-mono pg-mono--cy">{VERTENTES_V12.length} Vertentes</span>
        {VERTENTES_V12.map((id) => {
          const a = VERTENTES_ACERVO.find((x) => x.id === id);
          if (!a) return null;
          const on = escolhida === id;
          return (
            <button type="button" key={id} onClick={() => escolher(id)} aria-pressed={on} disabled={cheia(id) && !on}
              className={`pg-vt-row ${on ? "pg-vt-row--on" : ""}`} style={{ "--vx": a.cor, "--vx-luz": LUZ[id] } as CSSProperties}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <span className="pg-vt-thumb"><img src={a.arte} alt="" className="pg-arte" /></span>
              <span className="pg-vt-row__texto">
                <span className="pg-vt-row__nome">{a.nome}</span>
                <span className="pg-vt-pip">{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= (sinergia[id] ?? 0) ? "pg-on" : ""} />)}</span>
              </span>
              <span className="pg-vt-row__nivel">{nivel(id)}→{nivel(id) + 1}</span>
            </button>
          );
        })}
      </aside>
    </div>
  );
}

/* ════════════ PERÍCIAS ════════════ */

export function PassoPericias({ etapa, catalogos, classe, mudar }: PropsPasso) {
  const a = etapa.avanco;
  const recs = classe?.criacao.pericias_valor_3 ?? [];
  const restam = Math.max(0, a.pontos_pericia - etapa.pericias_gastas);
  const nomeDe = (id: string) => catalogos.pericias.find((p) => p.id === id)?.nome ?? id;
  return (
    <div className="pg-corpo">
      <aside className="pg-pk-lado">
        <div className="pg-pk-saldo">
          <span className="pg-mono pg-mono--am">Pontos a distribuir</span>
          <b>{restam}</b>
          <span className="pg-pk-saldo__de">de {a.pontos_pericia} restantes neste Ranking</span>
        </div>
        <div className="pg-pk-leg">
          <div><i className="pg-los pg-los--on" /> Nível atual</div>
          <div><i className="pg-los pg-los--novo" /> Somado agora</div>
          <div><i className="pg-los" /> Vaga · <b>Limite {a.limite_pericia}</b></div>
          <div><span className="pg-rec">REC</span> Recomendada pela classe</div>
        </div>
        {recs.length > 0 && (
          <div className="pg-pk-recs"><span className="pg-mono pg-mono--am">Recomendadas</span>{recs.map(nomeDe).join(" · ")}</div>
        )}
      </aside>

      <section className="pg-pk-grade pg-rolagem">
        {catalogos.pericias.map((p) => {
          const base = etapa.base.pericias[p.id] ?? 0;
          const n = etapa.escolha.pericias[p.id] ?? 0;
          const pode = etapa.pericias_gastas < a.pontos_pericia && base + n < a.limite_pericia;
          const rec = recs.includes(p.id);
          const ajustar = (delta: number) => {
            const pericias = { ...etapa.escolha.pericias, [p.id]: Math.max(0, n + delta) };
            if (!pericias[p.id]) delete pericias[p.id];
            mudar({ pericias });
          };
          return (
            <div key={p.id} className={`pg-pk-carta ${rec ? "pg-pk-carta--rec" : base + n === 0 ? "pg-pk-carta--apagada" : ""}`}>
              <button type="button" disabled={!pode} onClick={() => ajustar(1)} className="pg-pk-carta__corpo"
                title={pode ? "+1 ponto" : base + n >= a.limite_pericia ? `No limite ${a.limite_pericia}` : "Sem pontos"}>
                {rec && <span className="pg-pk-carta__rec">REC</span>}
                <span className="pg-pk-carta__nome">{p.nome}</span>
                <span className="pg-pk-pips" aria-label={`${base + n} de ${a.limite_pericia}`}>
                  {Array.from({ length: a.limite_pericia }).map((_, i) => <i key={i} className={`pg-los ${i < base ? "pg-los--on" : i < base + n ? "pg-los--novo" : ""}`} />)}
                </span>
              </button>
              {n > 0 && <button type="button" onClick={() => ajustar(-1)} className="pg-pk-menos" aria-label={`Tirar ponto de ${p.nome}`}>−</button>}
            </div>
          );
        })}
      </section>
    </div>
  );
}

/* ════════════ ATRIBUTO ════════════ */

const ATRIBUTOS: Array<{ id: AttributeIdV12; nome: string; desc: string }> = [
  { id: "corpo", nome: "Corpo", desc: "Força, resistência e reflexo." },
  { id: "mente", nome: "Mente", desc: "Raciocínio, percepção e técnica." },
  { id: "animo", nome: "Ânimo", desc: "Vontade, presença e conexão." },
];

/** Recursos da Classe, na ordem da ficha. */
const RECURSOS: Array<{ id: string; nome: string }> = [
  { id: "pv", nome: "PV" },
  { id: "pe", nome: "PE" },
  { id: "mana", nome: "Mana" },
  { id: "integridade", nome: "Integridade" },
  { id: "reacoes", nome: "Reações" },
  { id: "andar", nome: "Andar" },
  { id: "correr", nome: "Correr" },
];

/** Atributo: foco no escolhido (valor, limite e os recursos da Classe que mudam) e os três à direita. */
export function PassoAtributo({ etapa, classe, mudar }: PropsPasso) {
  const base = etapa.base.atributos;
  const escolhido = etapa.escolha.atributo;
  const cheio = (id: AttributeIdV12) => base[id] + 1 > ATRIBUTO_MAXIMO_V12;
  const [vendo, setVendo] = useState<AttributeIdV12>(escolhido ?? ATRIBUTOS.find((a) => !cheio(a.id))?.id ?? "corpo");
  const t = ATRIBUTOS.find((a) => a.id === vendo) ?? ATRIBUTOS[0];
  const recursos = classe?.criacao.recursos ?? {};
  const afeta = (id: AttributeIdV12) => RECURSOS.filter((r) => recursos[r.id]?.atributo === id);
  const valor = (r: string, extra: number) => classe ? resolveClassResourceV12(classe, r, { ...base, [vendo]: base[vendo] + extra }) : undefined;
  // Clicar no escolhido desfaz (toda escolha tem volta).
  const escolher = (id: AttributeIdV12) => { setVendo(id); mudar({ atributo: escolhido === id ? undefined : id }); };
  const pips = (id: AttributeIdV12, cls: string) =>
    Array.from({ length: ATRIBUTO_MAXIMO_V12 }).map((_, i) => (
      <i key={i} className={`${cls} ${i < base[id] ? `${cls}--on` : i === base[id] && escolhido === id ? `${cls}--novo` : ""}`} />
    ));

  return (
    <div className="pg-corpo">
      <section className="pg-at-foco">
        <span className="pg-at-foco__kicker">Atributo</span>
        <h2 className="pg-at-foco__nome">{t.nome}</h2>
        <p className="pg-at-foco__desc">{t.desc}</p>
        <div className="pg-at-valor">
          <span className="pg-at-valor__n">{base[t.id]} <span className="pg-at-valor__seta">→</span> <span className="pg-at-valor__novo">{base[t.id] + 1}</span></span>
          <div>
            <span className="pg-at-valor__pips">{pips(t.id, "pg-at-pip")}</span>
            <span className="pg-mono">Limite {ATRIBUTO_MAXIMO_V12}</span>
          </div>
        </div>
        {afeta(t.id).length > 0 && (
          <div className="pg-at-muda">
            <span className="pg-mono pg-mono--am">O que muda</span>
            {afeta(t.id).map((r) => (
              <div key={r.id} className="pg-at-muda__linha">
                <span><span className="pg-at-muda__nome">{r.nome}</span><span className="pg-at-muda__formula">{recursos[r.id]?.texto}</span></span>
                <span className="pg-at-muda__valor">{valor(r.id, 0)} <em>→</em> <em>{valor(r.id, 1)}</em></span>
              </div>
            ))}
          </div>
        )}
      </section>

      <aside className="pg-at-lista">
        <span className="pg-mono pg-mono--cy">{ATRIBUTOS.length} Atributos</span>
        {ATRIBUTOS.map((a) => {
          const on = escolhido === a.id;
          const v = base[a.id];
          return (
            <button type="button" key={a.id} onClick={() => escolher(a.id)} aria-pressed={on} disabled={!on && cheio(a.id)}
              className={`pg-at-row ${on ? "pg-at-row--on" : ""}`}>
              <span className="pg-at-row__topo">
                <span className="pg-at-row__cab"><span className="pg-at-row__nome">{a.nome}</span><span className="pg-at-row__nivel">{v}→{v + 1}</span></span>
                <span className="pg-at-row__desc">{a.desc}</span>
                <span className="pg-at-row__pips">{pips(a.id, "pg-at-mini")}</span>
              </span>
              {afeta(a.id).length > 0 && (
                <span className="pg-at-afeta"><span className="pg-mono">Afeta</span>{afeta(a.id).map((r) => <span key={r.id} className="pg-at-chip">{r.nome}</span>)}</span>
              )}
            </button>
          );
        })}
      </aside>
    </div>
  );
}
