"use client";

import type { CatalogosCriacaoV12 } from "../../_acoes/criacaoV12Actions";
import { contagemPericiasV12, niveisPericiaV12, type ClassContentV12, type DraftV12 } from "../../../../../../lib/rulesetV12";
import { Mono, Panel } from "../ui";
import { Cabecalho } from "./Trajetoria";
import type { SetDraft } from "../tipos";

const NIVEIS = [0, 1, 2, 3] as const;

/** Sem Classe não há perfil nem listas: o passo só aponta o caminho. */
export function SemClasse({ irParaClasse, oque }: { irParaClasse: () => void; oque: string }) {
  return (
    <div className="fj-sem-classe">
      <Mono tom="am">Depende da Classe</Mono>
      <p>{oque} vêm do perfil da Classe. Escolha uma Classe primeiro.</p>
      <button type="button" onClick={irParaClasse} className="fj-ch fj-escolha">Escolher Classe</button>
    </div>
  );
}

function Contador({ valor, tem, quer }: { valor: 1 | 2 | 3; tem: number; quer: number }) {
  const ok = tem === quer;
  return (
    <div className={`fj-contador ${ok ? "fj-contador--ok" : tem > quer ? "fj-contador--excesso" : ""}`}>
      <Mono pequeno tom={ok ? "cy" : undefined}>Valor {valor}</Mono>
      <span className="fj-contador__n">{tem}<span>/{quer}</span></span>
    </div>
  );
}

export function Pericias({ d, set, catalogos, classe, irParaClasse }: {
  d: DraftV12;
  set: SetDraft;
  catalogos: CatalogosCriacaoV12;
  classe?: ClassContentV12;
  irParaClasse: () => void;
}) {
  if (!classe) return <div className="fj-passo"><Cabecalho kicker="Mecânica · 07" title="Perícias" /><SemClasse irParaClasse={irParaClasse} oque="As Perícias" /></div>;
  const perfil = classe.criacao.perfis_pericias.find((p) => p.slug === d.perfilPericias);
  const n = contagemPericiasV12(d.pericias);
  const especialidades = new Set(classe.criacao.pericias_valor_3);
  const definir = (id: string, v: 0 | 1 | 2 | 3) => {
    const proximo = { ...d.pericias };
    if (v === 0) delete proximo[id]; else proximo[id] = v;
    set({ pericias: proximo });
  };
  // Especialidades primeiro, depois as que aceitam valor 2, depois o resto.
  const peso = (id: string) => (especialidades.has(id) ? 0 : classe.criacao.pericias_valor_2.includes(id) ? 1 : 2);
  const lista = [...catalogos.pericias].sort((a, b) => peso(a.id) - peso(b.id) || a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <div className="fj-passo">
      <Cabecalho kicker="Mecânica · 07" title="Perícias" right={perfil && (
        <div className="fj-contadores">
          {([3, 2, 1] as const).map((v) => <Contador key={v} valor={v} tem={n[v]} quer={perfil.quantidades[`valor_${v}`]} />)}
        </div>
      )} />

      <div className="fj-pericias-bloco">
        <div className="fj-borda fj-ch fj-pericias">
          <div className="fj-ch fj-vidro fj-sem-barra fj-pericias__rolagem">
            {/* Os perfis ficam DENTRO do card, no topo, como uma faixa contínua. */}
            <div className="fj-perfis fj-perfis--faixa" role="radiogroup" aria-label="Perfil de Perícias">
              {classe.criacao.perfis_pericias.map((p) => {
                const on = p.slug === d.perfilPericias;
                return (
                  <button type="button" role="radio" aria-checked={on} key={p.slug} onClick={() => set({ perfilPericias: p.slug })} className={`fj-perfil ${on ? "fj-perfil--on" : ""}`}>
                    <span className="fj-perfil__nome">{p.nome}</span>
                    <span className="fj-perfil__valores">{p.quantidades.valor_3}×3 · {p.quantidades.valor_2}×2 · {p.quantidades.valor_1}×1</span>
                  </button>
                );
              })}
            </div>
            {!perfil && <p className="fj-pericias__aviso">Escolha um perfil acima para distribuir os valores.</p>}
            <div className="fj-pericias__grade">
              {lista.map((p) => {
                const atual = d.pericias[p.id] ?? 0;
                const permitidos = niveisPericiaV12(classe, p.id);
                return (
                  <div key={p.id} className={`fj-pericia ${atual ? "fj-pericia--on" : ""}`}>
                    <span className="fj-pericia__nome">
                      {especialidades.has(p.id) && <span className="fj-losango fj-losango--sm fj-losango--ambar" title="Especialidade da Classe" />}
                      {p.nome}
                    </span>
                    <span className="fj-pericia__niveis" role="radiogroup" aria-label={`Valor de ${p.nome}`}>
                      {NIVEIS.map((v) => {
                        const cota = v === 0 || !perfil ? Infinity : perfil.quantidades[`valor_${v}`];
                        const bloqueado = !perfil || !permitidos.includes(v) || (v !== atual && v !== 0 && n[v as 1 | 2 | 3] >= cota);
                        return (
                          <button type="button" role="radio" aria-checked={atual === v} key={v} disabled={bloqueado && atual !== v} onClick={() => definir(p.id, v)} className={`fj-nivel-btn ${atual === v ? "fj-nivel-btn--on" : ""}`}>{v}</button>
                        );
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Painel lateral das Perícias: o que a Classe oferece em cada valor. */
export function PericiasLateral({ classe, catalogos }: { classe?: ClassContentV12; catalogos: CatalogosCriacaoV12 }) {
  if (!classe) return null;
  const nome = (id: string) => catalogos.pericias.find((p) => p.id === id)?.nome ?? id;
  const c = classe.criacao;
  return (
    <Panel title={classe.nome} right={<Mono tom="cy">Perícias</Mono>}>
      <div className="fj-pericias-lado">
        <div>
          <Mono tom="am">Valor 3 · especialidades</Mono>
          <p>{c.pericias_valor_3.map(nome).join(" · ")}</p>
        </div>
        <div>
          <Mono tom="cy">Valor 2</Mono>
          <p>{c.pericias_valor_2.map(nome).join(" · ")}</p>
        </div>
        <div>
          <Mono>Valor 1</Mono>
          <p>{c.pericias_valor_1 === "qualquer_nao_escolhida" ? "Qualquer perícia ainda não escolhida." : c.pericias_valor_1.map(nome).join(" · ")}</p>
        </div>
        <p className="fj-pericias-lado__nota">Perícias que ficarem sem valor começam em 0.</p>
      </div>
    </Panel>
  );
}
