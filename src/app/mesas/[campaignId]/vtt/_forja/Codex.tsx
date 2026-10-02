"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Key, Mono } from "./ui";
import { oxanium } from "./fonte";

/** Teclado de leitura: "I" abre o Códex quando o foco não está num campo de texto. */
export function useAtalhoCodex(abrir: () => void) {
  const ref = useRef(abrir);
  useEffect(() => { ref.current = abrir; });
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.key === "i" || e.key === "I") && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) ref.current();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
}

/** Moldura do modal de Códex: véu, varredura e Esc para fechar. Vai num portal no body. */
export function Shell({ children, onClose, rotulo }: { children: ReactNode; onClose: () => void; rotulo: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className={`fj-root ${oxanium.variable} fj-shell`} role="dialog" aria-modal="true" aria-label={rotulo}>
      <div className="fj-shell__veu" onClick={onClose} />
      <div className="fj-scan fj-cobre fj-shell__scan" />
      <div className="fj-boot fj-shell__caixa">{children}</div>
    </div>
  );
}

/** Título de seção numerada dentro do Códex. */
export function SecHead({ n, t }: { n: string; t: string }) {
  return (
    <div className="fj-sec-head">
      <span className="fj-sec-head__n">{n}</span>
      <h3 className="fj-sec-head__t">{t}</h3>
      <span className="fj-sec-head__fio" />
    </div>
  );
}

/** Texto de regra: parágrafos, linhas com "›" viram lista e **destaques** ficam âmbar. */
export function RuleText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`fj-regra ${className}`}>
      {text.split("\n\n").map((p, i) => {
        const marked = p.includes("›"), multi = p.includes("\n");
        return (
          <div key={i} className={multi ? "fj-regra__bloco" : ""}>
            {p.split("\n").map((raw, j) => {
              const item = marked ? raw.startsWith("›") : multi;
              const line = raw.replace(/^›\s*/, "");
              return (
                <p key={j} className={item ? "fj-regra__item" : ""}>
                  {item && <span className="fj-regra__marca" />}
                  {line.split(/(\*\*[^*]+\*\*)/).map((t, k) => (t.startsWith("**") ? <strong key={k} className="fj-destaque">{t.slice(2, -2)}</strong> : t))}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export type ItemIndice = { k: string; label: string; kids?: { k: string; label: string }[] };

/** Acompanha qual seção do Códex está no topo da leitura. */
export function useIndiceAtivo(dep: unknown): { scroller: RefObject<HTMLDivElement | null>; active: string; go: (k: string) => void } {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState("visao");
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver((es) => {
      const x = es.filter((e) => e.isIntersecting).sort((a, z) => a.boundingClientRect.top - z.boundingClientRect.top)[0];
      if (x) setActive(x.target.id);
    }, { root, rootMargin: "0px 0px -70% 0px" });
    root.querySelectorAll("[data-sec]").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [dep]);
  const go = (k: string) => scroller.current?.querySelector(`[id="${k}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  return { scroller, active, go };
}

/** Índice lateral do Códex. */
export function IndiceCodex({ toc, active, go }: { toc: ItemIndice[]; active: string; go: (k: string) => void }) {
  return (
    <nav className="fj-sem-barra fj-indice" aria-label="Índice">
      {toc.map((t, i) => (
        <div key={t.k} className="fj-indice__grupo">
          <button type="button" onClick={() => go(t.k)} className={`fj-indice__item ${active === t.k ? "fj-indice__item--ativo" : ""}`}>
            <span className="fj-indice__n">0{i + 1}</span>
            <span className="fj-indice__rotulo">{t.label}</span>
          </button>
          {t.kids?.map((k) => (
            <button type="button" key={k.k} onClick={() => go(k.k)} className={`fj-indice__sub ${active === k.k ? "fj-indice__sub--ativo" : ""}`}>{k.label}</button>
          ))}
        </div>
      ))}
    </nav>
  );
}

/** Botão de abrir o Códex, com varredura no hover. */
export function BotaoCodex({ arte, kicker, titulo, legenda, onOpen, hexCor, posicaoArte }: {
  arte: string;
  kicker: string;
  titulo: string;
  legenda?: string;
  onOpen: () => void;
  hexCor?: string;
  posicaoArte?: "topo";
}) {
  return (
    <button type="button" onClick={onOpen} className="fj-codex-botao">
      <span className="fj-borda fj-ch fj-codex-botao__borda">
        <span className="fj-ch fj-codex-botao__corpo">
          <span className="fj-codex-botao__varredura" />
          <span className="fj-ch-hex fj-codex-botao__hex" style={hexCor ? { background: hexCor } : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={arte} alt="" className={`fj-ch-hex fj-codex-botao__arte ${posicaoArte === "topo" ? "fj-codex-botao__arte--topo" : ""}`} />
          </span>
          <span className="fj-codex-botao__texto">
            <Mono pequeno tom="am">{kicker}</Mono>
            <span className="fj-codex-botao__titulo">{titulo}</span>
          </span>
          <span className="fj-codex-botao__setas" aria-hidden="true">
            <span>›</span>
            <span>›</span>
          </span>
        </span>
      </span>
      <span className="fj-codex-botao__rodape">
        {legenda ? <Mono pequeno>{legenda}</Mono> : <span />}
        <Key k="I" />
      </span>
    </button>
  );
}

/** Faixa no topo dos painéis laterais: "visualizando" ou "confirmado". */
export function FaixaEstado({ on, confirmado, pendente, colada }: { on: boolean; confirmado: string; pendente: string; colada?: boolean }) {
  return (
    <div className={`fj-faixa ${on ? "fj-faixa--on" : ""} ${colada ? "fj-faixa--colada" : ""}`}>
      <span className="fj-faixa__texto">{on ? `✓ ${confirmado}` : pendente}</span>
      {!on && <span className="fj-faixa__pulso" />}
    </div>
  );
}

/** Cabeçalho de modal do Códex: ícone, kicker, título, ações e fechar. */
export function CabecalhoCodex({ icone, kicker, titulo, onClose, children }: { icone: ReactNode; kicker: string; titulo: string; onClose: () => void; children?: ReactNode }) {
  return (
    <header className="fj-codex-cab">
      {icone}
      <div className="fj-codex-cab__titulos">
        <Mono pequeno tom="cy">{kicker}</Mono>
        <div className="fj-codex-cab__titulo">{titulo}</div>
      </div>
      <div className="fj-codex-cab__acoes">
        {children}
        <button type="button" onClick={onClose} className="fj-fechar"><Key k="ESC" /> Fechar</button>
      </div>
    </header>
  );
}

/** Botão de escolha dentro do Códex (Fixar origem, Assumir classe, Sintonizar). */
export function BotaoEscolha({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`fj-ch fj-escolha ${on ? "fj-escolha--on" : ""}`}>{children}</button>
  );
}
