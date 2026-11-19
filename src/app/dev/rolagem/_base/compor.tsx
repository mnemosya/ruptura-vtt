"use client";

/**
 * PEÇAS DE COMPOSIÇÃO — usadas pelas propostas que desenham a própria
 * superfície (D e E), sem a janela "Rolar Dados".
 *
 *   · `useComposicao` — o teste montado agora e a leitura de CADA face
 *     do d10 contra o alvo (a régua da D, a faixa provável da E);
 *   · `precoDaTroca` / `consequenciaDaTroca` — o texto do preço antes e
 *     do que aconteceu depois, sempre pela regra de `regra.ts`;
 *   · `Escolha` — lista suspensa acessível (setas, Esc, clique fora).
 */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ordinal, ordinalF, resolverTeste, type Alvo, type CustoTroca, type Resolucao, type TrocaAplicada } from "./regra";
import { useProto, type ProtoApi } from "./estado";

export function alvoDoTeste(t: ProtoApi["teste"]): Alvo {
  const cd = Number.parseInt(t.cd, 10);
  const op = Number.parseInt(t.oponente, 10);
  if (t.alvoTipo === "contestado" && Number.isFinite(op)) return { tipo: "contestado", oponente: op, iniciou: t.iniciou };
  if (t.alvoTipo === "cd" && Number.isFinite(cd)) return { tipo: "cd", cd };
  return { tipo: "livre" };
}

export function useComposicao() {
  const s = useProto();
  const atributo = s.personagem.atributos.find((a) => a.id === s.teste.atributoId) ?? s.personagem.atributos[0];
  const pericia = s.personagem.pericias.find((p) => p.id === s.teste.periciaId) ?? null;
  const parcelas = { atributo: atributo.valor, pericia: pericia?.valor ?? 0, modificador: s.teste.modificador };
  const alvo = alvoDoTeste(s.teste);
  const faces: Resolucao[] = Array.from({ length: 10 }, (_, i) => resolverTeste(parcelas, alvo, i + 1));
  const base = parcelas.atributo + parcelas.pericia + parcelas.modificador;
  return { atributo, pericia, parcelas, alvo, faces, base, passam: faces.filter((f) => f.sucesso).length };
}

/** Tom do preço: o ponto, a Ruptura, a Integridade (excedentes), a Última Vontade. */
export type TomPreco = "ponto" | "ruptura" | "integridade" | "ultima";

export function tomDoCusto(c: CustoTroca): TomPreco {
  if (c.faixa === "abaixo") return "ponto";
  if (c.faixa === "alcanca") return c.ultimaVontade ? "ultima" : "ruptura";
  return c.ultimaVontade === "certa" ? "ultima" : "integridade";
}

export function precoDaTroca(c: CustoTroca): { tom: TomPreco; titulo: string; detalhe: string } {
  const tom = tomDoCusto(c);
  if (c.faixa === "abaixo") return { tom, titulo: "+1 Sobrecarga", detalhe: `fica ${c.sobrecargaDepois} de ${c.limite}` };
  if (c.faixa === "alcanca") {
    return {
      tom,
      titulo: `${ordinalF(c.ruptura)} Ruptura`,
      detalhe: `Integridade −${c.perdaIntegridade}${c.ultimaVontade ? " · Última Vontade" : ""}`,
    };
  }
  const fim = c.ultimaVontade === "certa" ? " · Última Vontade" : c.ultimaVontade === "pode" ? ` · zera com ${c.perdaQueZera}+` : "";
  return { tom, titulo: `${c.d4}d4 de Integridade`, detalhe: `${ordinal(c.excedente)} excedente${fim}` };
}

export function consequenciaDaTroca(t: TrocaAplicada): { tom: TomPreco; titulo: string; detalhe: string } {
  const c = t.custo;
  const tom: TomPreco = t.ultimaVontade ? "ultima" : c.faixa === "abaixo" ? "ponto" : c.faixa === "alcanca" ? "ruptura" : "integridade";
  const fim = t.ultimaVontade ? " · Última Vontade" : "";
  if (c.faixa === "abaixo") return { tom, titulo: "+1 Sobrecarga", detalhe: `${t.depois.sobrecarga} de ${c.limite}` };
  if (c.faixa === "alcanca") {
    return { tom, titulo: `${ordinalF(c.ruptura)} Ruptura`, detalhe: `Integridade ${t.antes.integridade} → ${t.depois.integridade}${fim}` };
  }
  return { tom, titulo: `${c.d4}d4 (${t.d4.join(" + ")})`, detalhe: `Integridade ${t.antes.integridade} → ${t.depois.integridade}${fim}` };
}

/* ── lista suspensa ─────────────────────────────────────────────────── */

export interface OpcaoEscolha { id: string; rotulo: string; valor?: string; detalhe?: string }

export function Escolha({ titulo, valor, opcoes, onEscolher, children, classe, desabilitado = false, lado = "cima", alinhar = "inicio", testId }: {
  titulo: string;
  valor: string;
  opcoes: OpcaoEscolha[];
  onEscolher: (id: string) => void;
  /** Conteúdo do gatilho. */
  children: ReactNode;
  classe?: string;
  desabilitado?: boolean;
  lado?: "cima" | "baixo";
  alinhar?: "inicio" | "fim";
  testId?: string;
}) {
  const [aberta, setAberta] = useState(false);
  const gatilho = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const id = useId();
  const fechar = useCallback((foco = false) => { setAberta(false); if (foco) gatilho.current?.focus(); }, []);

  useEffect(() => {
    if (!aberta) return;
    requestAnimationFrame(() => lista.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus({ preventScroll: true }));
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node;
      if (!lista.current?.contains(alvo) && !gatilho.current?.contains(alvo)) fechar();
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fechar(true); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
      e.preventDefault();
      const itens = Array.from(lista.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
      const i = itens.indexOf(document.activeElement as HTMLButtonElement);
      const proximo = e.key === "Home" ? 0 : e.key === "End" ? itens.length - 1
        : e.key === "ArrowDown" ? Math.min(itens.length - 1, i + 1) : Math.max(0, i - 1);
      itens[proximo]?.focus();
    };
    window.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", tecla, true);
    return () => { window.removeEventListener("pointerdown", fora); window.removeEventListener("keydown", tecla, true); };
  }, [aberta, fechar]);
  useEffect(() => { if (desabilitado) setAberta(false); }, [desabilitado]);

  return (
    <span className={`rp-esc${classe ? ` ${classe}` : ""}`} data-aberta={aberta || undefined}>
      <button ref={gatilho} type="button" className="rp-esc-gatilho" aria-haspopup="listbox" aria-expanded={aberta}
        aria-controls={aberta ? id : undefined} disabled={desabilitado} onClick={() => setAberta((a) => !a)} data-testid={testId}>
        <span className="rv-sr-only">{titulo}: </span>
        {children}
      </button>
      {aberta && (
        <div ref={lista} id={id} role="listbox" aria-label={titulo} className="rp-esc-lista" data-lado={lado} data-alinhar={alinhar}>
          <span className="rp-esc-titulo" aria-hidden="true">{titulo}</span>
          {opcoes.map((o) => (
            <button key={o.id} type="button" role="option" aria-selected={o.id === valor} className="rp-esc-opcao"
              onClick={() => { onEscolher(o.id); fechar(true); }}>
              <span className="rp-esc-opcao-nome">{o.rotulo}</span>
              {o.detalhe && <span className="rp-esc-opcao-det">{o.detalhe}</span>}
              {o.valor && <span className="rp-esc-opcao-v">{o.valor}</span>}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/** Número com − / + e campo editável (CD, oponente, modificador). */
export function Passo({ rotulo, valor, onChange, min, max, vazioPermitido = false, sinal = false, classe, testId }: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  /** CD vazia = sem CD. */
  vazioPermitido?: boolean;
  /** Mostra +N (modificador). */
  sinal?: boolean;
  classe?: string;
  testId?: string;
}) {
  const n = Number.parseInt(valor, 10);
  const vazio = !Number.isFinite(n);
  const [rascunho, setRascunho] = useState<string | null>(null);
  const mostrado = rascunho ?? (vazio ? "" : sinal && n > 0 ? `+${n}` : sinal && n < 0 ? `−${Math.abs(n)}` : String(n));
  const definir = (v: number) => onChange(String(Math.min(max, Math.max(min, v))));
  return (
    <span className={`rp-passo${classe ? ` ${classe}` : ""}`}>
      <button type="button" className="rp-passo-b" aria-label={`Diminuir ${rotulo}`}
        disabled={vazio ? true : !vazioPermitido && n <= min}
        onClick={() => (vazioPermitido && n <= min ? onChange("") : definir(n - 1))}>−</button>
      <input className="rp-passo-v" type="text" inputMode="numeric" aria-label={rotulo} value={mostrado} placeholder="—"
        data-testid={testId}
        onFocus={(e) => { setRascunho(mostrado); e.currentTarget.select(); }}
        onChange={(e) => {
          const t = e.target.value.replace(/[^0-9+−-]/g, "").replace("−", "-").slice(0, 3);
          setRascunho(t);
          if (t === "" && vazioPermitido) onChange("");
          else if (/^[+-]?\d+$/.test(t)) definir(Number(t));
        }}
        onBlur={() => setRascunho(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "ArrowUp") { e.preventDefault(); setRascunho(null); definir((vazio ? min - 1 : n) + 1); }
          if (e.key === "ArrowDown" && !vazio) { e.preventDefault(); setRascunho(null); if (vazioPermitido && n <= min) onChange(""); else definir(n - 1); }
        }} />
      <button type="button" className="rp-passo-b" aria-label={`Aumentar ${rotulo}`} disabled={!vazio && n >= max}
        onClick={() => definir((vazio ? min - 1 : n) + 1)}>+</button>
    </span>
  );
}
