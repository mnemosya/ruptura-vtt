"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CatalogosCriacaoV12 } from "../../_acoes/criacaoV12Actions";
import type { ClassContentV12, DraftAvancoV12, DraftV12, EtapaProgressaoV12 } from "../../../../../../lib/rulesetV12";
import { Cabecalho, HexRanking, Rodape, Stepper, type Acao, type ItemStepper } from "./Partes";
import { PassoAtributo, PassoGanhos, PassoPericias, PassoSubclasse, PassoVertente, type PropsPasso } from "./Passos";
import { PassoEntrada } from "./PassoEntrada";
import { ROTULO_PASSO, passoResolvido, passosDaProgressao, type TipoPasso } from "./fluxo";
import "./progressao.css";

/**
 * PROGRESSÃO EM SUB-ETAPAS — a mesma tela na criação (passo 09 da Forja)
 * e na evolução (por cima da ficha). Cada Ranking abre na Entrada e segue
 * pelas sub-etapas que ele concede; ao fim do último, `concluir`.
 *
 * As escolhas continuam no rascunho (`avancos`) e as regras em
 * `etapasProgressaoV12`: esta camada só decide QUAL tela mostrar.
 */
export function ProgressaoFluxo({ contexto, d, set, catalogos, etapas, classe, sincronia, primaria, voltarForja, concluir, onFechar, nota, inicio }: {
  contexto: "criacao" | "evolucao";
  /** Rótulo do contexto ("Etapa 09", "Evolução"); o cabeçalho do console mostra o Ranking. */
  kicker?: string;
  d: Pick<DraftV12, "classeSlug" | "avancos">;
  set: (p: Pick<DraftV12, "avancos">) => void;
  catalogos: Pick<CatalogosCriacaoV12, "subclasses" | "pericias">;
  etapas: EtapaProgressaoV12[];
  classe?: ClassContentV12;
  /** Sincronia da Forja (criação), no subtítulo da Entrada. */
  sincronia?: number;
  /** Vertente primária do personagem (rótulo no foco da Vertente). */
  primaria?: string;
  /** Antes da primeira tela: o passo anterior da Forja (criação). */
  voltarForja?: Acao;
  /** Depois da última tela: Revisão (criação) ou Selar (evolução). */
  concluir: Acao & { erro?: string | null };
  /** Fechar a Progressão (evolução). */
  onFechar?: () => void;
  /** Nota do rodapé da Entrada. */
  nota?: string;
  /** Sub-etapa inicial (`"E:vertente"`), para a prévia de dev. */
  inicio?: string;
}) {
  const passos = useMemo(() => passosDaProgressao(etapas), [etapas]);
  const [chave, setChave] = useState<string | null>(inicio ?? null);
  const atalhoAvancar = useRef<(() => void) | null>(null);
  const idx = Math.max(0, passos.findIndex((p) => p.chave === chave));
  const passo = passos[idx];
  const etapa = etapas.find((e) => e.para === passo?.para);

  const ir = (i: number) => setChave(passos[Math.max(0, Math.min(passos.length - 1, i))]?.chave ?? null);
  const irPara = (para: string, tipo: TipoPasso) => setChave(`${para}:${tipo}`);
  const anterior = idx > 0 ? () => ir(idx - 1) : voltarForja?.onClick;
  const ultimo = idx === passos.length - 1;

  // Q volta, E avança — os mesmos atalhos da doca da Forja, que some nesta tela.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const tecla = e.key.toLowerCase();
      if (tecla === "q" && anterior) anterior();
      else if (tecla === "e" && atalhoAvancar.current) atalhoAvancar.current();
      else if (e.key === "Escape" && onFechar) onFechar();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  if (!passo || !etapa || !d.classeSlug) return null;

  const mudar = (p: Partial<DraftAvancoV12>) => set({ avancos: { ...d.avancos, [etapa.para]: { ...etapa.escolha, ...p } } });
  const props: PropsPasso = { etapa, catalogos, classe, classeSlug: d.classeSlug, mudar };
  const subclasses = (catalogos.subclasses ?? []).filter((s) => s.classe_slug === d.classeSlug);

  const doRanking = passos.filter((p) => p.para === etapa.para && p.tipo !== "entrada");
  const posNoRanking = doRanking.findIndex((p) => p.chave === passo.chave);
  const stepper = (
    <Stepper itens={doRanking.map((p, i): ItemStepper => ({
      tipo: p.tipo,
      rotulo: ROTULO_PASSO[p.tipo],
      estado: i === posNoRanking ? "atual" : i < posNoRanking && passoResolvido(etapa, p.tipo) ? "feito" : "pendente",
      onIr: () => setChave(p.chave),
    }))} />
  );

  const rotuloDe = (i: number) => {
    const p = passos[i];
    return p.tipo === "entrada" ? (p.para === etapa.para ? "Entrada" : `Rank ${p.para}`) : ROTULO_PASSO[p.tipo];
  };
  const fimDoRanking = ultimo || passos[idx + 1]?.para !== etapa.para;
  const voltar: Acao | undefined = idx > 0 ? { rotulo: rotuloDe(idx - 1), onClick: () => ir(idx - 1) } : voltarForja;
  // No fim do último Ranking: a criação segue para a Revisão; a evolução volta à Entrada, onde fica o Selar.
  const entradaDoRanking = passos.findIndex((p) => p.para === etapa.para && p.tipo === "entrada");
  const avancar: Acao | undefined = {
    rotulo: fimDoRanking ? `Concluir Ranking ${etapa.para}` : rotuloDe(idx + 1),
    onClick: !ultimo ? () => ir(idx + 1) : contexto === "evolucao" ? () => ir(entradaDoRanking) : concluir.onClick,
  };

  if (passo.tipo === "entrada") {
    const escolhas = doRanking.filter((p) => p.tipo !== "ganhos");
    const feitas = escolhas.filter((p) => passoResolvido(etapa, p.tipo)).length;
    const primeiro = passos[idx + 1];
    const evolucao = contexto === "evolucao";
    const seguir: Acao = evolucao
      ? { rotulo: concluir.rotulo, onClick: concluir.onClick, desabilitado: concluir.desabilitado }
      : primeiro?.para === etapa.para ? { rotulo: ROTULO_PASSO[primeiro.tipo], onClick: () => ir(idx + 1) } : avancar;
    atalhoAvancar.current = seguir.desabilitado ? null : seguir.onClick;
    return (
      <PassoEntrada
        etapa={etapa}
        migalha={evolucao ? "Ficha" : "Forja"}
        personagem={{ classe: classe?.nome ?? d.classeSlug, sincronia }}
        subclasses={subclasses}
        classeSlug={d.classeSlug}
        onIr={(t) => irPara(etapa.para, t)}
        nota={nota ?? `${feitas} de ${escolhas.length} escolha${escolhas.length === 1 ? "" : "s"} feita${escolhas.length === 1 ? "" : "s"} · ${evolucao ? "selar aplica os avanços na ficha." : "ao concluir, segue para a Revisão."}`}
        erro={concluir.erro}
        voltar={evolucao ? (onFechar ? { rotulo: "Cancelar", onClick: onFechar } : undefined) : voltar}
        avancar={seguir}
        fecho={evolucao || seguir === avancar}
      />
    );
  }

  const cab = (titulo: string, direita: ReactNode) => (
    <Cabecalho ranking={`Rank ${etapa.para}`} titulo={titulo} stepper={stepper} direita={<>{direita}<HexRanking r={etapa.para} /></>} />
  );
  const erro = ultimo ? concluir.erro : undefined;

  if (passo.tipo === "subclasse") {
    // O "Confirmar" escolhe a subclasse à vista e segue; o E faz o mesmo.
    return (
      <section className="fj-pg fj-pg--subclasse">
        {cab("Selecionar Subclasse", classe?.nome && <span className="pg-mono pg-mono--am">{classe.nome}</span>)}
        <PassoSubclasse key={etapa.para} {...props} rodape={(confirmar) => {
          const seguir = confirmar && { ...confirmar, onClick: () => { confirmar.onClick(); ir(idx + 1); } };
          atalhoAvancar.current = seguir?.onClick ?? null;
          return <Rodape voltar={voltar} avancar={seguir} erro={erro} />;
        }} />
      </section>
    );
  }

  atalhoAvancar.current = avancar.onClick;
  const pontos = etapa.avanco.pontos_pericia;
  const [corpo, nota_] = {
    ganhos: [<PassoGanhos key="g" {...props} />, null],
    atributo: [<PassoAtributo key="a" {...props} />, "+1 ponto de Atributo"],
    vertente: [<PassoVertente key={etapa.para} {...props} primaria={primaria} />, "+1 ponto de Vertente"],
    pericias: [<PassoPericias key="p" {...props} />, `+${pontos} ponto${pontos === 1 ? "" : "s"} de Perícia`],
  }[passo.tipo] as [ReactNode, string | null];

  return (
    <section className={`fj-pg fj-pg--${passo.tipo}`}>
      {cab(ROTULO_PASSO[passo.tipo], nota_ && <span className="pg-mono pg-mono--am">{nota_}</span>)}
      {corpo}
      <Rodape voltar={voltar} avancar={avancar} fecho={fimDoRanking} erro={erro} />
    </section>
  );
}
