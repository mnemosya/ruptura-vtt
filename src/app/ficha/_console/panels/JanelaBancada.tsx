"use client";

/**
 * ABASTECER O ESPAÇO DE MUNIÇÃO (cartucheira/aljava).
 *
 * Uma grade de encaixes mostra a capacidade: cada munição pinta os
 * encaixes na cor dela, e as de peso 2 (precisão, escopeta, virote)
 * ocupam dois lado a lado. A grade só MOSTRA. Quem muda é a lista:
 * cada munição tem − quantidade + (a quantidade é o que vai DENTRO), e
 * o número abre um campo que aceita "12", "+5", "-3" ou "max".
 *
 * Passar o mouse numa linha destaca os encaixes dela; no "+", aparece o
 * encaixe tracejado onde a próxima unidade entra. Nada muda até
 * "Guardar"; a transferência é de `supportLoadout.ts`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Bancada } from "../../../../lib/character/supportLoadout";
import { AuxJanela } from "./AuxModals";

/** Cor de cada tipo — estável pela ordem das linhas. */
const CORES = ["#9fb2c8", "#ff5f74", "#ffc94a", "#00d4ff", "#8d62e8", "#22d3aa"];
const ROTULO_LOCAL = { acesso_rapido: "no acesso rápido", mochila: "na mochila" } as const;

export function JanelaBancada({
  nome,
  bancada,
  onGuardar,
  onFechar,
}: {
  nome: string;
  bancada: Bancada;
  onGuardar: (alvo: Record<string, number>) => void;
  onFechar: () => void;
}) {
  const { linhas, capacidade } = bancada;
  const [qtd, setQtd] = useState<number[]>(() => linhas.map((l) => l.dentro));
  const [hover, setHover] = useState<{ k: number; mais?: boolean } | null>(null);
  const [negado, setNegado] = useState<{ k: number; seq: number } | null>(null);
  const [mudou, setMudou] = useState<{ k: number; seq: number } | null>(null);
  /* Encaixes que já estavam na tela: só os NOVOS entram animados. */
  const anterior = useRef<number[]>(linhas.map(() => 0));
  useEffect(() => { anterior.current = qtd; }, [qtd]);

  const ocupado = useMemo(() => linhas.reduce((t, l, i) => t + l.peso * qtd[i], 0), [linhas, qtd]);
  const maxDe = (k: number) => Math.min(linhas[k].dentro + linhas[k].fora, qtd[k] + Math.floor((capacidade - ocupado) / linhas[k].peso));
  const igual = linhas.every((l, i) => l.dentro === qtd[i]);
  const delta = qtd.reduce((t, v, i) => t + v - linhas[i].dentro, 0);

  function definir(k: number, valor: number) {
    const v = Math.max(0, Math.min(maxDe(k), Math.trunc(valor)));
    setQtd((q) => q.map((x, i) => (i === k ? v : x)));
    setMudou({ k, seq: Date.now() });
  }
  function mais(k: number) {
    if (maxDe(k) > qtd[k]) definir(k, qtd[k] + 1);
    else setNegado({ k, seq: Date.now() });
  }

  /* Encaixes: cada unidade vira um bloco de `peso` colunas. */
  const blocos: { k: number; novo: boolean; atraso: number }[] = [];
  let novos = 0;
  linhas.forEach((_, k) => {
    for (let i = 0; i < qtd[k]; i++) {
      const novo = i >= (anterior.current[k] ?? 0);
      blocos.push({ k, novo, atraso: novo ? Math.min(novos++ * 30, 500) : 0 });
    }
  });
  const fantasma = hover?.mais && maxDe(hover.k) > qtd[hover.k] ? linhas[hover.k].peso : 0;
  const livres = Math.max(0, capacidade - ocupado - fantasma);

  return (
    <AuxJanela
      titulo={`Abastecer ${nome}`}
      onFechar={onFechar}
      cabecalho={
        <div className="rc-banc-topo">
          <span className="rc-banc-nome">{nome}</span>
          <span className="rc-banc-cap" key={negado?.seq} data-cheio={negado ? "true" : undefined}>
            {ocupado}<span>/{capacidade}</span>
          </span>
          <button type="button" className="rc-banc-fechar" onClick={onFechar} aria-label="Fechar"><X size={16} /></button>
        </div>
      }
    >
      <div className="rc-banc">
        <div className="rc-banc-grade" data-foco={hover ? "true" : undefined} role="img" aria-label={`${ocupado} de ${capacidade} ocupados`}>
          {blocos.map((b, i) => (
            <i key={`${b.k}-${i}`} className="rc-banc-encaixe" data-novo={b.novo || undefined} data-mesmo={hover?.k === b.k || undefined}
              style={{ gridColumn: `span ${linhas[b.k].peso}`, background: CORES[b.k % CORES.length], borderColor: CORES[b.k % CORES.length], animationDelay: `${b.atraso}ms` }} />
          ))}
          {fantasma > 0 && hover && <i className="rc-banc-encaixe" data-fantasma style={{ gridColumn: `span ${fantasma}`, borderColor: CORES[hover.k % CORES.length] }} />}
          {Array.from({ length: livres }, (_, i) => <i key={`l${i}`} className="rc-banc-encaixe" data-livre />)}
        </div>

        {linhas.length === 0 ? (
          <p className="rc-vazio">Nenhuma munição compatível no acesso rápido ou na mochila.</p>
        ) : (
          <div className="rc-banc-lista">
            {linhas.map((l, k) => {
              const cor = CORES[k % CORES.length];
              const fora = l.dentro + l.fora - qtd[k];
              const onde = l.locais.length ? ROTULO_LOCAL[l.locais[l.locais.length - 1]] : "fora";
              return (
                <div key={`${l.contentSlug}${negado?.k === k ? `:${negado.seq}` : ""}`} className="rc-banc-linha" style={{ ["--k" as string]: cor }}
                  data-negado={negado?.k === k ? negado.seq : undefined}
                  // A linha inteira é "pôr uma": o hover já mostra onde ela entra.
                  onMouseEnter={() => setHover({ k, mais: true })} onMouseLeave={() => setHover(null)}
                  onClick={() => mais(k)}>
                  <span className="rc-banc-token" aria-hidden="true">{Array.from({ length: l.peso }, (_, i) => <i key={i} style={{ background: cor }} />)}</span>
                  <span className="rc-banc-txt">
                    <span className="rc-banc-item">{l.nome}</span>
                    <span className="rc-banc-sub">{fora} {onde}{l.peso > 1 ? ` · ocupa ${l.peso}` : ""}</span>
                  </span>
                  <span className="rc-banc-passo" onClick={(e) => e.stopPropagation()}
                    onMouseEnter={() => setHover({ k })} onMouseLeave={() => setHover({ k, mais: true })}>
                    <button type="button" disabled={qtd[k] <= 0} onClick={() => definir(k, qtd[k] - 1)} aria-label={`Tirar uma ${l.nome}`}>−</button>
                    <Quantidade valor={qtd[k]} rotulo={l.nome} pulso={mudou?.k === k ? mudou.seq : 0}
                      onDefinir={(texto) => {
                        const s = texto.trim().toLowerCase();
                        if (s === "max") { definir(k, maxDe(k)); return true; }
                        const m = /^([+-]?)(\d+)$/.exec(s);
                        if (!m) return false;
                        const n = Number(m[2]);
                        definir(k, m[1] === "+" ? qtd[k] + n : m[1] === "-" ? qtd[k] - n : n);
                        return true;
                      }} />
                    <button type="button" data-off={maxDe(k) <= qtd[k] || undefined} onClick={() => mais(k)}
                      onMouseEnter={(e) => { e.stopPropagation(); setHover({ k, mais: true }); }} onMouseLeave={() => setHover({ k })}
                      aria-label={`Pôr uma ${l.nome}`}>+</button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="rc-banc-rodape">
        <button type="button" className="rc-banc-esvaziar" disabled={qtd.every((v) => v === 0)} onClick={() => setQtd(qtd.map(() => 0))}>Esvaziar</button>
        <button type="button" className="rc-banc-guardar" disabled={igual} data-testid="console-bancada-guardar"
          onClick={() => onGuardar(Object.fromEntries(linhas.map((l, i) => [l.contentSlug, qtd[i]])))}>
          {igual ? "Guardar" : `Guardar · ${delta > 0 ? "+" : ""}${delta}`}
        </button>
      </div>
    </AuxJanela>
  );
}

/** Quantidade editável: clicar abre o campo ("12", "+5", "-3", "max"); Enter confirma, Esc cancela. */
function Quantidade({ valor, rotulo, pulso, onDefinir }: { valor: number; rotulo: string; pulso: number; onDefinir: (texto: string) => boolean }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editando) ref.current?.select(); }, [editando]);
  const confirmar = () => { if (onDefinir(texto)) { setEditando(false); setErro(false); } else setErro(true); };
  if (editando) {
    return (
      <span className="rc-banc-valor" data-erro={erro || undefined}>
        <input ref={ref} value={texto} aria-label={`${rotulo}: quantidade, +N, -N ou max`} aria-invalid={erro}
          onChange={(e) => { setTexto(e.target.value); setErro(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmar(); } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEditando(false); } }}
          onBlur={() => { if (!onDefinir(texto)) setEditando(false); else setEditando(false); }} />
      </span>
    );
  }
  return (
    <button type="button" className="rc-banc-valor" key={pulso} data-pulso={pulso ? "true" : undefined}
      onClick={() => { setTexto(String(valor)); setErro(false); setEditando(true); }} aria-label={`${rotulo}: ${valor} dentro. Editar`}>
      {valor}
    </button>
  );
}
