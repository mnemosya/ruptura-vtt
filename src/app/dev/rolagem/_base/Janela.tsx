"use client";

/**
 * JANELA "ROLAR DADOS" DOS PROTÓTIPOS — a pele F do VTT.
 *
 * Reais, importados sem mudança: `JanelaFerramenta` (moldura, arrasto,
 * posição), `RollButton` (carga de 0 a 100% em 2 s, anéis, tremor,
 * teclado, `prefers-reduced-motion`, piso `FORCA_MINIMA`) e as folhas
 * `janelas-f.css` + `janela-dados.css`.
 *
 * Copiados de `RoladorDados.tsx` (lá não são exportados), sem mudança de
 * desenho: `SeletorToken`, `AjusteMod`, `QuemVe`, `estiloTremor`.
 *
 * Alterados: `AjusteAlvo` é o `AjusteCD` com um segundo modo — teste
 * contestado (total do oponente + quem iniciou). É a única peça nova da
 * janela base; o resto do que muda é de cada proposta (`Pool`,
 * `Resultado`, rótulo do botão).
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeftRight, Dices, Eye, Lock, Minus, Plus, Swords, Users } from "lucide-react";
import { JanelaFerramenta } from "../../../mesas/[campaignId]/vtt/_shell/JanelaFerramenta";
import { RollButton } from "../../../mesas/[campaignId]/vtt/_dados3d/ResultadoRolagem";
import { Chevron } from "../../../mesas/[campaignId]/vtt/_dados3d/icones";
import { useProto, type Visibilidade } from "./estado";

/* ── cópias de RoladorDados.tsx ─────────────────────────────────────── */

type OpcaoLista = { id: string; rotulo: string; valor?: string; lado?: "pj" | "pn"; frente?: ReactNode };

export function SeletorToken({ titulo, valor, opcoes, onEscolher, desabilitado = false, preferirCima = false, direita = false, frente, tag, classe, testId }: {
  titulo: string; valor: string; opcoes: OpcaoLista[]; onEscolher: (id: string) => void;
  desabilitado?: boolean; preferirCima?: boolean; direita?: boolean; frente?: ReactNode; tag?: string; classe?: string; testId?: string;
}) {
  const gatilho = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const [aberta, setAberta] = useState<null | { cima: boolean }>(null);
  const atual = opcoes.find((o) => o.id === valor) ?? opcoes[0];
  const fechar = useCallback((devolverFoco = false) => { setAberta(null); if (devolverFoco) gatilho.current?.focus(); }, []);
  const alternar = () => {
    if (aberta) { fechar(); return; }
    const r = gatilho.current?.getBoundingClientRect();
    const caixa = gatilho.current?.closest(".rup-scroll")?.getBoundingClientRect();
    const altura = Math.min(opcoes.length * 36 + 34, 220);
    const topo = caixa?.top ?? 0;
    const fundo = caixa?.bottom ?? (typeof window !== "undefined" ? window.innerHeight : 0);
    const cabeCima = !!r && r.top - topo >= altura + 8;
    const cabeBaixo = !r || fundo - r.bottom >= altura + 8;
    setAberta({ cima: preferirCima ? cabeCima || !cabeBaixo : !cabeBaixo && cabeCima });
  };
  useEffect(() => {
    if (!aberta) return;
    requestAnimationFrame(() => lista.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus({ preventScroll: true }));
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node;
      if (!lista.current?.contains(alvo) && !gatilho.current?.contains(alvo)) fechar();
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fechar(true); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const itens = Array.from(lista.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
      const i = itens.indexOf(document.activeElement as HTMLButtonElement);
      itens[e.key === "ArrowDown" ? Math.min(itens.length - 1, i + 1) : Math.max(0, i - 1)]?.focus();
    };
    window.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", tecla, true);
    return () => { window.removeEventListener("pointerdown", fora); window.removeEventListener("keydown", tecla, true); };
  }, [aberta, fechar]);
  useEffect(() => { if (desabilitado) setAberta(null); }, [desabilitado]);
  if (!atual) return null;
  return (
    <span className="rv-rf-sel">
      <button ref={gatilho} type="button" className={`rv-rf-token${classe ? ` ${classe}` : ""}`} aria-haspopup="listbox"
        aria-expanded={aberta !== null} disabled={desabilitado} onClick={alternar} data-testid={testId}>
        <span className="rv-sr-only">{titulo}: </span>
        {frente}
        <span className="rv-rf-token-nome">{atual.rotulo}</span>
        {tag && <span className="rv-rf-tag">{tag}</span>}
        <Chevron width={14} height={14} strokeWidth={2} />
      </button>
      {aberta && (
        <div ref={lista} role="listbox" aria-label={titulo}
          className={`rv-rf-pop${aberta.cima ? " is-cima" : ""}${direita ? " is-direita" : ""}`}>
          <span className="rv-rf-pop-rot" aria-hidden="true">{titulo}</span>
          {opcoes.map((o) => (
            <button key={o.id} type="button" role="option" aria-selected={o.id === atual.id}
              className="rv-rf-opt" data-lado={o.lado} onClick={() => { onEscolher(o.id); fechar(true); }}>
              {o.frente}
              <span className="rv-rf-opt-nome">{o.rotulo}</span>
              {o.valor && <span className="rv-rf-opt-v">{o.valor}</span>}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function AvatarSigla({ sigla, lado = "pj" }: { sigla: string; lado?: "pj" | "pn" }) {
  return <span className="rv-rf-av" data-lado={lado} aria-hidden="true">{sigla}</span>;
}

function AjusteMod({ valor, onChange }: { valor: number; onChange: (n: number) => void }) {
  const fmt = valor > 0 ? `+${valor}` : `${valor}`;
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(fmt);
  useEffect(() => { if (!editando) setRascunho(fmt); }, [editando, fmt]);
  return (
    <div className="jf-ajuste">
      <span className="jf-l">Mod.</span>
      <span className="jf-ajuste-ctl">
        <button type="button" aria-label="Diminuir modificador" onClick={() => onChange(valor - 1)}><Minus size={11} strokeWidth={2.8} /></button>
        <input className="jf-ajuste-v rv-rf-num" type="text" inputMode="numeric" aria-label="Modificador"
          value={editando ? rascunho : fmt}
          onFocus={(e) => { setEditando(true); setRascunho(fmt); e.currentTarget.select(); }}
          onChange={(e) => {
            const proximo = e.target.value.replace(/[^0-9+-]/g, "");
            if (!/^[+-]?\d*$/.test(proximo)) return;
            setRascunho(proximo);
            if (/^[+-]?\d+$/.test(proximo)) onChange(Number(proximo));
          }}
          onBlur={() => setEditando(false)}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
        <button type="button" aria-label="Aumentar modificador" onClick={() => onChange(valor + 1)}><Plus size={11} strokeWidth={2.8} /></button>
      </span>
    </div>
  );
}

/**
 * CD ou OPONENTE — o `AjusteCD` da pele F com um segundo modo. O rótulo
 * vira a chave: "CD" (vazio = sem CD, como hoje) ⇄ "VS" (total do
 * oponente num teste contestado). Mesmos limites, 1–99.
 */
function AjusteAlvo({ modo, valor, onModo, onChange }: {
  modo: "cd" | "contestado"; valor: string; onModo: (m: "cd" | "contestado") => void; onChange: (v: string) => void;
}) {
  const contestado = modo === "contestado";
  const vazia = valor.trim() === "";
  const atual = Number.parseInt(valor, 10);
  return (
    <div className="jf-ajuste rp-ajuste-alvo">
      <button type="button" className="rp-alvo-modo" aria-pressed={contestado}
        title={contestado ? "Voltar para CD" : "Teste contestado: comparar com o total do oponente"}
        aria-label={contestado ? "Teste contestado ligado. Voltar para CD" : "Trocar CD por teste contestado"}
        onClick={() => onModo(contestado ? "cd" : "contestado")}>
        <span className="jf-l">{contestado ? "VS" : "CD"}</span>
        <ArrowLeftRight size={11} strokeWidth={2.2} aria-hidden="true" />
      </button>
      <span className="jf-ajuste-ctl">
        <button type="button" aria-label={contestado ? "Diminuir total do oponente" : !vazia && atual <= 1 ? "Remover CD" : "Diminuir CD"} disabled={vazia}
          onClick={() => onChange(!Number.isFinite(atual) || atual <= 1 ? "" : String(Math.min(99, atual - 1)))}>
          <Minus size={11} strokeWidth={2.8} />
        </button>
        <input className={`jf-ajuste-v rv-rf-num${vazia ? " is-vazio" : ""}`} type="text" inputMode="numeric" pattern="[0-9]*"
          placeholder="—" aria-label={contestado ? "Total do oponente" : "Classe de dificuldade"} value={valor}
          onChange={(e) => {
            const digitos = e.target.value.replace(/\D/g, "").slice(0, 2);
            onChange(digitos === "" ? "" : String(Math.min(99, Math.max(1, Number(digitos)))));
          }} />
        <button type="button" aria-label={contestado ? "Aumentar total do oponente" : "Aumentar CD"}
          onClick={() => onChange(String(Math.min(99, Math.max(1, (Number.isFinite(atual) ? atual : 0) + 1))))}>
          <Plus size={11} strokeWidth={2.8} />
        </button>
      </span>
    </div>
  );
}

const VISIBILIDADES: { v: Visibilidade; label: string; dica: string; icone: ReactNode }[] = [
  { v: "public", label: "Mesa", dica: "todo mundo vê", icone: <Users size={15} strokeWidth={1.8} /> },
  { v: "private", label: "Privada", dica: "só você", icone: <Lock size={15} strokeWidth={1.8} /> },
  { v: "gm", label: "Narrador", dica: "só o narrador", icone: <Eye size={15} strokeWidth={1.8} /> },
];

function QuemVe({ valor, onChange }: { valor: Visibilidade; onChange: (v: Visibilidade) => void }) {
  const opcoes = VISIBILIDADES.filter((o) => o.v !== "gm");
  return (
    <div className="jf-grupo">
      <span className="jf-rot">Quem vê</span>
      <div className="jf-tiles rv-rf-visib" role="group" aria-label="Quem vê esta rolagem" style={{ ["--jf-n" as string]: opcoes.length }}>
        {opcoes.map((o) => (
          <button key={o.v} type="button" className="jf-tile" aria-pressed={o.v === valor} title={o.dica} onClick={() => onChange(o.v)}>
            {o.icone}<span>{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Tremor da carga — mesma curva do `TestPool`/`FreePool`. */
export function estiloTremor(carga: number, i: number): CSSProperties {
  return {
    animation: `rup-charge-shake ${(0.15 - carga * 0.08).toFixed(3)}s ${i * 0.022}s linear infinite`,
    opacity: 0.55 + carga * 0.45,
    ["--shake-x" as string]: `${(0.5 + carga * 3.5).toFixed(1)}px`,
    ["--shake-r" as string]: `${(0.2 + carga * 1.4).toFixed(2)}deg`,
  };
}

/* ── a janela ───────────────────────────────────────────────────────── */

export function JanelaRolar() {
  const s = useProto();
  const { proposta, personagem, teste, setTeste, rolando, atual, magista } = s;
  const travado = rolando;
  const atributo = personagem.atributos.find((a) => a.id === teste.atributoId) ?? personagem.atributos[0];
  const pericia = personagem.pericias.find((p) => p.id === teste.periciaId) ?? null;

  const opcoesIdent: OpcaoLista[] = s.personagens.map((p) => ({
    id: p.id, rotulo: s.nomeLongo && p.id === personagem.id ? p.nomeLongo : p.nome, lado: "pj",
    valor: (p.id === personagem.id ? magista : p.magista) ? "Magista" : "PJ",
    frente: <AvatarSigla sigla={p.sigla} />,
  }));
  const opcoesAtributo: OpcaoLista[] = personagem.atributos.map((a) => ({ id: a.id, rotulo: a.nome, valor: `+${a.valor}` }));
  const opcoesPericia: OpcaoLista[] = [
    { id: "", rotulo: "Sem perícia" },
    ...personagem.pericias.map((p) => ({ id: p.id, rotulo: p.nome, valor: `+${p.valor}` })),
  ];

  const ultimaDaPersonagem = atual && atual.teste.personagemId === personagem.id ? atual : null;
  const rotulo = proposta.rotuloBotao
    ? proposta.rotuloBotao(ultimaDaPersonagem, rolando, magista)
    : rolando ? "Rolando…" : ultimaDaPersonagem ? "Rolar de novo" : "Rolar 1d10";
  const nota = s.carga > 0
    ? `Força ${Math.round(s.carga * 100)}%${s.carga >= 0.995 ? " · máxima" : ""}`
    : "Segure pra carregar força";

  return (
    <JanelaFerramenta
      id="dados"
      icone={<Dices size={16} />}
      titulo="Rolar Dados"
      tecla={null}
      rotulo="Ferramenta Rolar Dados"
      rotuloFechar="Fechar ferramenta Rolar Dados"
      aoFechar={() => s.setJanelaAberta(false)}
      className="rv-dados-painel rp-janela"
      testId="painel-dados"
    >
      <div className="rv-dados-corpo jf-corpo rup-scroll">
        <div className="rv-rf">
          <div className="jf-hero rv-rf-hero">
            <SeletorToken titulo="Rolando como" valor={personagem.id} opcoes={opcoesIdent} onEscolher={s.escolherPersonagem}
              desabilitado={travado} classe="rv-rf-ident" testId="rolador-identidade"
              frente={<AvatarSigla sigla={personagem.sigla} />} />
            <proposta.Pool />
            <div className="rv-rf-frase">
              <SeletorToken titulo="Atributo" valor={atributo.id} opcoes={opcoesAtributo} onEscolher={(id) => setTeste({ atributoId: id })}
                desabilitado={travado} preferirCima tag={`+${atributo.valor}`} />
              <span className="rv-rf-mais" aria-hidden="true">+</span>
              <SeletorToken titulo="Perícia" valor={pericia?.id ?? ""} opcoes={opcoesPericia} onEscolher={(id) => setTeste({ periciaId: id })}
                desabilitado={travado} preferirCima direita tag={pericia ? `+${pericia.valor}` : undefined} />
            </div>
            <proposta.Resultado />
          </div>

          <div className="jf-ajustes rv-rf-ajustes">
            <AjusteMod valor={teste.modificador} onChange={(n) => setTeste({ modificador: n })} />
            <AjusteAlvo modo={teste.alvoTipo}
              valor={teste.alvoTipo === "contestado" ? teste.oponente : teste.cd}
              onModo={(m) => setTeste({ alvoTipo: m })}
              onChange={(v) => setTeste(teste.alvoTipo === "contestado" ? { oponente: v } : { cd: v })} />
            {/* Contestado: quem iniciou decide o empate. Uma célula de ajuste
                a mais (não um grupo novo): a janela real tem teto de 660 px. */}
            {teste.alvoTipo === "contestado" && (
              <div className="jf-ajuste rp-iniciou" role="group" aria-label="Quem iniciou a ação (empate vence quem iniciou)"
                title="Empate: vence quem iniciou a ação">
                <span className="jf-l">Iniciou</span>
                <span className="rp-iniciou-seg">
                  <button type="button" aria-pressed={teste.iniciou === "eu"} onClick={() => setTeste({ iniciou: "eu" })}>
                    <Swords size={12} strokeWidth={2} aria-hidden="true" /><span>{s.nomeVisivel}</span>
                  </button>
                  <button type="button" aria-pressed={teste.iniciou === "oponente"} onClick={() => setTeste({ iniciou: "oponente" })}>
                    <span>Oponente</span>
                  </button>
                </span>
              </div>
            )}
          </div>

          <QuemVe valor={teste.visibilidade} onChange={(v) => setTeste({ visibilidade: v })} />

          {/* Rodapé fixo: se o corpo rolar (contestado, nome longo), a ação
              não some debaixo da dobra — a janela real tem teto de 660 px. */}
          <div className="rp-rolar-fixo">
            <RollButton variante="f" label={rotulo} disabled={rolando} onRoll={s.rolar} onChargeChange={s.setCarga} />
            <p className="jf-nota">{nota}</p>
          </div>
        </div>
      </div>
    </JanelaFerramenta>
  );
}
