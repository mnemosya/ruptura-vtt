"use client";

import { useState } from "react";
import type { CatalogosCriacaoV12 } from "../../_acoes/criacaoV12Actions";
import {
  ATRIBUTO_MAXIMO_V12,
  NIVEL_MAXIMO_VERTENTE_V12,
  VERTENTES_V12,
  type AttributeIdV12,
  type DraftAvancoV12,
  type DraftV12,
  type EtapaProgressaoV12,
  type RankingV12,
} from "../../../../../../lib/rulesetV12";
import { VERTENTES_ACERVO } from "../acervo/vertentes";
import { Mono, Panel } from "../ui";
import { Cabecalho } from "./Trajetoria";
import { SemClasse } from "./Pericias";
import type { SetDraft } from "../tipos";

const ATRIBUTOS: Array<{ id: AttributeIdV12; nome: string }> = [
  { id: "corpo", nome: "Corpo" }, { id: "mente", nome: "Mente" }, { id: "animo", nome: "Ânimo" },
];
const nomeVertente = (id: string) => VERTENTES_ACERVO.find((v) => v.id === id)?.nome ?? id;

/** Primeira frase de uma descrição: o resumo do que a característica faz. */
const primeira = (t: string) => t.split(/(?<=[.!?])\s/)[0];

/** Resumo de uma etapa na trilha: o que foi escolhido, ou o que ela pede. */
function resumoEtapa(e: EtapaProgressaoV12, catalogos: CatalogosCriacaoV12): string {
  const a = e.avanco, x = e.escolha;
  if (!e.faltas.length) {
    const sub = a.escolhe_subclasse ? (catalogos.subclasses ?? []).find((s) => s.slug === x.subclasse_id)?.nome : undefined;
    const pers = Object.entries(x.pericias).map(([id, n]) => `+${catalogos.pericias.find((p) => p.id === id)?.nome ?? id}${n > 1 ? ` ×${n}` : ""}`);
    const atr = a.pontos_atributo > 0 && x.atributo ? `+${ATRIBUTOS.find((t) => t.id === x.atributo)?.nome}` : undefined;
    const ver = a.pontos_vertente > 0 && x.vertente ? `${nomeVertente(x.vertente)} ${(e.base.vertentes[x.vertente] ?? 0) + 1}` : undefined;
    return [sub, ...pers, atr, ver].filter(Boolean).join(" · ");
  }
  return [a.escolhe_subclasse && "Subclasse", a.pontos_pericia && `${a.pontos_pericia} perícias`, a.pontos_atributo && "+1 atributo", a.pontos_vertente && "+1 vertente"].filter(Boolean).join(" · ");
}

/**
 * PROGRESSÃO INICIAL — as escolhas de cada Ranking entre o F e o rank
 * inicial escolhido, feitas na própria Forja. À esquerda, a trilha dos
 * Rankings (cada um com o resumo do que pede ou do que já foi escolhido);
 * à direita, o Ranking aberto numa moldura de altura fixa: o que ele
 * concede (com o que cada característica faz) e o que ele pede.
 * Ao selar, os avanços são aplicados em sequência com estas escolhas.
 */
export function Progressao({ d, set, catalogos, etapas, irParaClasse }: {
  d: DraftV12;
  set: SetDraft;
  catalogos: CatalogosCriacaoV12;
  etapas: EtapaProgressaoV12[];
  irParaClasse: () => void;
}) {
  const [aberto, setAberto] = useState<RankingV12 | null>(null);
  const cabecalho = <Cabecalho kicker="Mecânica · 09" title="Progressão" right={etapas.length ? <Mono tom="cy">F → {etapas[etapas.length - 1].para}</Mono> : undefined} />;
  if (!d.classeSlug) return <div className="fj-passo">{cabecalho}<SemClasse irParaClasse={irParaClasse} oque="As escolhas de cada Ranking" /></div>;
  if (!etapas.length) return <div className="fj-passo">{cabecalho}<p className="fj-vazio">Com o rank inicial F não há progressão a escolher.</p></div>;

  // Abre no primeiro Ranking incompleto (ou no primeiro, se tudo está pronto).
  const atual = etapas.find((e) => e.para === aberto) ?? etapas.find((e) => e.faltas.length) ?? etapas[0];
  const mudar = (p: Partial<DraftAvancoV12>) => set({ avancos: { ...d.avancos, [atual.para]: { ...atual.escolha, ...p } } });
  const ganhos = [...atual.caracteristicas_classe, ...atual.caracteristicas_subclasse];
  const a = atual.avanco;

  return (
    <div className="fj-passo">
      {cabecalho}
      <div className="fj-prog">
        <ol className="fj-prog-trilha" aria-label="Rankings da progressão">
          {etapas.map((e) => {
            const feito = !e.faltas.length;
            return (
              <li key={e.para}>
                {/* Só o hexágono; o resumo (pedido ou escolhido) fica na dica e no leitor de tela. */}
                <button type="button" onClick={() => setAberto(e.para)} aria-current={e.para === atual.para ? "step" : undefined}
                  title={resumoEtapa(e, catalogos)} aria-label={`Ranking ${e.para}: ${resumoEtapa(e, catalogos)}`}
                  className={`fj-prog-trilha__no ${e.para === atual.para ? "fj-prog-trilha__no--on" : ""} ${feito ? "fj-prog-trilha__no--feito" : ""}`}>
                  <span className="fj-prog-hex"><span className="fj-prog-hex__miolo">{e.para}</span></span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="fj-borda fj-ch fj-prog__moldura">
          <div key={atual.para} className="fj-ch fj-vidro fj-sem-barra fj-boot fj-prog__corpo">
            <div className="fj-prog__cab">
              <span className="fj-prog__rank fj-glow">Ranking {atual.para}</span>
              <Mono>PA {a.pa} · limite de perícia {a.limite_pericia}</Mono>
            </div>

            <Mono tom="am">Você ganha</Mono>
            <ul className="fj-prog__ganhos">
              {ganhos.map((f) => <li key={f.slug}><strong>{f.nome}</strong><span>{primeira(f.descricao)}</span></li>)}
              {a.magias_adicionais > 0 && <li className="fj-prog__ganho-magia"><strong>+{a.magias_adicionais} magia{a.magias_adicionais > 1 ? "s" : ""}</strong><span>Escolhida depois, na ficha.</span></li>}
              {!ganhos.length && !a.magias_adicionais && <li className="fj-prog__ganho-nada"><span>{a.escolhe_subclasse ? "As características chegam com a Subclasse escolhida abaixo." : "Sem característica nova neste Ranking."}</span></li>}
            </ul>

            {a.escolhe_subclasse && (
              <section className="fj-prog__escolha">
                <Mono tom="cy">Subclasse</Mono>
                <div className="fj-prog__subclasses">
                  {(catalogos.subclasses ?? []).filter((s) => s.classe_slug === d.classeSlug).map((s) => {
                    const on = atual.escolha.subclasse_id === s.slug;
                    return (
                      <button type="button" key={s.slug} aria-pressed={on} onClick={() => mudar({ subclasse_id: s.slug })} className={`fj-prog__cartao fj-prog__subclasse ${on ? "fj-prog__cartao--on" : ""}`}>
                        <span className="fj-prog__cartao-nome">{s.nome}</span>
                        <span className="fj-prog__subclasse-desc">{primeira(s.descricao)}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {a.pontos_atributo > 0 && (
              <section className="fj-prog__escolha">
                <Mono tom="cy">Atributo · +1</Mono>
                <div className="fj-prog__atributos">
                  {ATRIBUTOS.map((t) => {
                    const v = atual.base.atributos[t.id];
                    const on = atual.escolha.atributo === t.id;
                    return (
                      <button type="button" key={t.id} aria-pressed={on} disabled={!on && v + 1 > ATRIBUTO_MAXIMO_V12} onClick={() => mudar({ atributo: t.id })} className={`fj-prog__cartao fj-prog__atributo ${on ? "fj-prog__cartao--on" : ""}`}>
                        <span className="fj-prog__cartao-nome">{t.nome}</span>
                        <span className="fj-prog__atributo-valor">{v}<em>→</em>{v + 1}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {a.pontos_vertente > 0 && (
              <section className="fj-prog__escolha">
                <Mono tom="cy">Vertente · +1 nível</Mono>
                <div className="fj-prog__vertentes">
                  {VERTENTES_V12.map((id) => {
                    const v = VERTENTES_ACERVO.find((x) => x.id === id);
                    const n = atual.base.vertentes[id] ?? 0;
                    const on = atual.escolha.vertente === id;
                    return (
                      <button type="button" key={id} aria-pressed={on} disabled={!on && n + 1 > NIVEL_MAXIMO_VERTENTE_V12} onClick={() => mudar({ vertente: id })}
                        className={`fj-prog__vertente ${on ? "fj-prog__vertente--on" : ""}`} style={{ ["--vx" as string]: v?.cor }}>
                        <span className="fj-prog-hex fj-prog-hex--arte"><span className="fj-prog-hex__miolo">{/* eslint-disable-next-line @next/next/no-img-element */}{v && <img src={v.arte} alt="" />}</span></span>
                        <span className="fj-prog__vertente-texto">
                          <span className="fj-prog__cartao-nome">{nomeVertente(id)}</span>
                          <span className="fj-prog__vertente-nivel">Nível {n}<em>→</em>{n + 1}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {a.pontos_pericia > 0 && (
              <section className="fj-prog__escolha">
                <div className="fj-prog__escolha-cab">
                  <Mono tom="cy">Perícias · limite {a.limite_pericia}</Mono>
                  <span className={`fj-prog__saldo ${atual.pericias_gastas === a.pontos_pericia ? "fj-prog__saldo--ok" : ""}`}>
                    {Array.from({ length: a.pontos_pericia }).map((_, i) => <span key={i} className={i < atual.pericias_gastas ? "fj-prog__saldo-on" : ""} />)}
                    {atual.pericias_gastas}/{a.pontos_pericia}
                  </span>
                </div>
                <div className="fj-prog__pericias">
                  {catalogos.pericias.map((p) => {
                    const base = atual.base.pericias[p.id] ?? 0;
                    const n = atual.escolha.pericias[p.id] ?? 0;
                    const pode = atual.pericias_gastas < a.pontos_pericia && base + n < a.limite_pericia;
                    const ajustar = (delta: number) => {
                      const pericias = { ...atual.escolha.pericias, [p.id]: Math.max(0, n + delta) };
                      if (!pericias[p.id]) delete pericias[p.id];
                      mudar({ pericias });
                    };
                    return (
                      <div key={p.id} className={`fj-prog__pericia ${n ? "fj-prog__pericia--on" : ""} ${!pode && !n ? "fj-prog__pericia--fora" : ""}`}>
                        <button type="button" disabled={!pode} onClick={() => ajustar(1)} className="fj-prog__pericia-corpo"
                          title={pode ? "+1 ponto" : base + n >= a.limite_pericia ? `No limite ${a.limite_pericia}` : "Sem pontos"}>
                          <span className="fj-prog__pericia-nome">{p.nome}</span>
                          <span className="fj-prog__pips" aria-label={`${base + n} de ${a.limite_pericia}`}>
                            {Array.from({ length: a.limite_pericia }).map((_, i) => <span key={i} className={i < base ? "fj-prog__pip--base" : i < base + n ? "fj-prog__pip--novo" : ""} />)}
                          </span>
                        </button>
                        {n > 0 && <button type="button" onClick={() => ajustar(-1)} className="fj-prog__menos" aria-label={`Tirar ponto de ${p.nome}`} />}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Painel lateral: o estado de cada Ranking da progressão. */
export function ProgressaoLateral({ etapas }: { etapas: EtapaProgressaoV12[] }) {
  if (!etapas.length) return null;
  const faltam = etapas.filter((e) => e.faltas.length).length;
  return (
    <Panel title="Progressão" ambar={faltam === 0} right={<Mono tom={faltam ? "cy" : undefined}>{faltam ? `${faltam} pendente${faltam > 1 ? "s" : ""}` : "Completa"}</Mono>}>
      <ul className="fj-prog-lado">
        {etapas.map((e) => (
          <li key={e.para} className="fj-prog-lado__linha">
            <span className="fj-prog-lado__rank">{e.para}</span>
            <span className={e.faltas.length ? "fj-prog-lado__falta" : "fj-prog-lado__ok"}>{e.faltas.length ? e.faltas.join(" · ") : "✓ Pronto"}</span>
          </li>
        ))}
      </ul>
      <p className="fj-prog-lado__nota">Ao selar, o personagem nasce no F e sobe Ranking a Ranking com estas escolhas. Magias adicionais ficam pendentes na ficha.</p>
    </Panel>
  );
}
