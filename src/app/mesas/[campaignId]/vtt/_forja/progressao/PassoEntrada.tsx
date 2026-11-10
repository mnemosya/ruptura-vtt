"use client";

import { Fragment, type CSSProperties, type ReactNode } from "react";
import { ChevronsUp, Gem, ListChecks, ShieldCheck, Sparkles } from "lucide-react";
import { RANKINGS_V12, type EtapaProgressaoV12 } from "../../../../../../lib/rulesetV12";
import { ArteSubclasse, Rodape, type Acao } from "./Partes";
import { passoResolvido, tiposDaEtapa, type TipoPasso } from "./fluxo";
import { rotuloGanho } from "./Passos";

const ICONE: Record<Exclude<TipoPasso, "entrada">, ReactNode> = {
  subclasse: <ShieldCheck size={22} strokeWidth={1.6} aria-hidden="true" />,
  ganhos: <Sparkles size={22} strokeWidth={1.6} aria-hidden="true" />,
  atributo: <ChevronsUp size={22} strokeWidth={1.6} aria-hidden="true" />,
  vertente: <Gem size={22} strokeWidth={1.6} aria-hidden="true" />,
  pericias: <ListChecks size={22} strokeWidth={1.6} aria-hidden="true" />,
};

/**
 * ENTRADA de um Ranking: a placa do personagem (classe, subclasse,
 * Sincronia), o Ranking alcançado e o que acontece nele — as
 * características novas (sem escolha) e as escolhas, cada uma levando à sua
 * sub-etapa. A trilha F→S fica no cabeçalho.
 */
export function PassoEntrada({ etapa, migalha, personagem, subclasses, classeSlug, onIr, nota, voltar, avancar, fecho, erro }: {
  etapa: EtapaProgressaoV12;
  migalha: string;
  personagem: { classe: string; sincronia?: number };
  subclasses: Array<{ slug: string; nome: string }>;
  classeSlug: string;
  onIr: (tipo: TipoPasso) => void;
  nota?: ReactNode;
  voltar?: Acao;
  avancar?: Acao;
  /** O avançar desta Entrada fecha a Progressão (Selar, na evolução). */
  fecho?: boolean;
  erro?: string | null;
}) {
  const subSlug = etapa.escolha.subclasse_id ?? etapa.base.subclasse_id;
  const sub = subclasses.find((s) => s.slug === subSlug);
  const definindo = etapa.avanco.escolhe_subclasse && !etapa.escolha.subclasse_id;
  const i = RANKINGS_V12.indexOf(etapa.para);
  const itens = tiposDaEtapa(etapa).filter((t): t is Exclude<TipoPasso, "entrada"> => t !== "entrada");
  const a = etapa.avanco;
  const sinc = personagem.sincronia;

  const texto = (t: Exclude<TipoPasso, "entrada">): [string, string] => {
    switch (t) {
      case "subclasse": return ["Subclasse", sub && !definindo ? sub.nome : `Escolha 1 de ${subclasses.length} · ${subclasses.map((s) => s.nome).join(" · ")}`];
      case "ganhos": return ["Características novas", rotuloGanho(etapa)];
      case "atributo": return ["Atributo", "+1 em Corpo, Mente ou Ânimo"];
      case "vertente": return ["Vertente", "+1 ponto em uma das 6 Vertentes"];
      case "pericias": return ["Perícias", `+${a.pontos_pericia} pontos · limite ${a.limite_pericia} por perícia`];
    }
  };

  return (
    <section className="fj-pg fj-pg--entrada">
      <header className="pg-cab">
        <div className="pg-cab__esq"><span className="pg-mono">{migalha} › <span className="pg-mono--gelo">Progressão</span></span></div>
        <div className="pg-cab__dir">
          <div className="pg-trilha" aria-label="Rankings">
            {/* F a S; o S+ só entra quando é ele o Ranking alcançado. */}
            {RANKINGS_V12.filter((r) => r !== "S+" || etapa.para === "S+").map((r, k) => (
              <Fragment key={r}>
                {k > 0 && <span className="pg-rk-fio" />}
                <span className={`pg-rk ${k < i ? "pg-rk--feito" : k === i ? "pg-rk--atual" : ""}`} style={{ "--i": k } as CSSProperties}>{r}</span>
              </Fragment>
            ))}
          </div>
        </div>
      </header>

      <div className="pg-corpo">
        <aside className="pg-en-id pg-vidro">
          {sub && !definindo
            ? <ArteSubclasse slug={sub.slug} classeSlug={classeSlug} />
            // eslint-disable-next-line @next/next/no-img-element
            : <img src={`/forja/classes/${classeSlug}.webp`} alt="" className="pg-arte" style={{ objectPosition: "50% 22%" }} />}
          <span className="pg-en-id__veu" />
          <div className="pg-en-id__placa">
            <span className="pg-mono pg-mono--cy">Classe</span>
            <span className="pg-en-id__nome">{personagem.classe}</span>
            {/* Tarja âmbar (a cor da subclasse na escolha), inclinada como os segmentos da Sincronia. */}
            <span className={`pg-en-sub ${definindo || !sub ? "pg-en-sub--aberta" : ""}`}>
              <span className="pg-mono">Subclasse</span>
              <b>{definindo || !sub ? "A definir neste Ranking" : sub.nome}</b>
            </span>
            {sinc != null && (
              <div className="pg-en-sinc">
                <div className="pg-en-sinc__linha"><span className="pg-mono">Sincronia</span><span className="pg-mono pg-mono--am">{sinc}%</span></div>
                <div className="pg-seg">{Array.from({ length: 10 }).map((_, k) => <i key={k} className={k < Math.round(sinc / 10) ? "pg-on" : ""} style={{ "--i": k } as CSSProperties} />)}</div>
              </div>
            )}
          </div>
        </aside>

        <div className="pg-en-main">
          <div className="pg-en-rank">
            <span className="pg-en-rank__hex">{etapa.para}</span>
            <div><span className="pg-mono pg-mono--am">Ranking alcançado</span><h1 className="pg-en-rank__titulo">Rank {etapa.para}</h1></div>
          </div>
          <span className="pg-mono pg-en-secao">Neste Ranking</span>
          <div className="pg-en-lista">
            {itens.map((t, n) => {
              const [nome, subt] = texto(t);
              const auto = t === "ganhos";
              const feito = passoResolvido(etapa, t);
              return (
                <button type="button" key={t} onClick={() => onIr(t)} className={`pg-en-item ${auto ? "pg-en-item--auto" : ""}`} style={{ "--i": n } as CSSProperties}>
                  <span className={`pg-en-ic ${auto ? "pg-en-ic--auto" : ""}`}>{ICONE[t]}</span>
                  <span className="pg-en-item__texto"><span className="pg-en-item__nome">{nome}</span><span className="pg-en-item__sub">{subt}</span></span>
                  {!auto && <span className={`pg-tag ${feito ? "pg-tag--feito" : ""}`}>{feito ? "Feito" : "Pendente"}</span>}
                  <span className="pg-seta">›</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <Rodape voltar={voltar} avancar={avancar} fecho={fecho} nota={nota} erro={erro} />
    </section>
  );
}
