"use client";

/**
 * Recarga com ESCOLHA de fonte (opção C) e o aviso da recarga direta
 * (opção B).
 *
 * A janela só abre quando há decisão real — mais de uma fonte. Cada linha é uma pilha de munição: onde está,
 * quanto tem, quanto sobra e o custo (1 PA no espaço de munição e no
 * acesso rápido, 2 PA na mochila).
 */

import { useEffect, useState } from "react";
import { X, Check } from "lucide-react";
import type { FonteRecarga } from "../../../../lib/character/reloadSources";
import { AuxJanela } from "./AuxModals";

const ROTULO_LOCAL: Record<FonteRecarga["local"], string> = {
  suporte: "Espaço de munição",
  acesso_rapido: "Acesso rápido",
  mochila: "Mochila",
};

export function JanelaRecarga({
  arma,
  municao,
  fontes,
  onRecarregar,
  onFechar,
}: {
  arma: string;
  municao: { atual: number; max: number };
  fontes: FonteRecarga[];
  onRecarregar: (fonte: FonteRecarga) => void;
  onFechar: () => void;
}) {
  const [escolhida, setEscolhida] = useState(fontes[0]?.id ?? null);
  const sel = fontes.find((f) => f.id === escolhida) ?? null;
  // Cheia: recarregar TROCA a munição — a carregada volta ao estoque e a arma enche da nova.
  const troca = municao.atual >= municao.max;
  const falta = troca ? municao.max : Math.max(0, municao.max - municao.atual);
  const carrega = sel ? Math.min(falta, sel.quantidade) : 0;
  const [titulo, tipo] = (() => {
    const m = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(arma);
    return m ? [m[1], m[2]] : [arma, null];
  })();

  return (
    <AuxJanela titulo="Recarregar" onFechar={onFechar}>
      <div className="rc-rec">
        <div className="rc-rec-arma">
          <div>
            <div className="rc-rec-nome">{titulo}</div>
            {tipo && <div className="rc-rec-tipo">{tipo}</div>}
          </div>
          <span className="rc-rec-mun">{municao.atual}<span>/{municao.max}</span></span>
        </div>

        <div className="rc-rec-lista" role="radiogroup" aria-label="Fonte de munição">
          {fontes.map((f) => {
            const on = f.id === escolhida;
            return (
              <div key={f.id} className="rc-rec-op" data-on={on || undefined} role="radio" aria-checked={on} tabIndex={0}
                onClick={() => setEscolhida(f.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEscolhida(f.id); } }}>
                <span className="rc-rec-dot" aria-hidden="true" />
                <span className="rc-rec-txt">
                  <span className="rc-rec-op-nome">{f.nome}</span>
                  <span className="rc-rec-op-local">{ROTULO_LOCAL[f.local]}</span>
                </span>
                <span className="rc-rec-qtd" title="Tem → sobra depois de carregar">
                  {f.quantidade}<span aria-hidden="true">→</span><b>{f.quantidade - Math.min(falta, f.quantidade)}</b>
                </span>
                <span className="rc-rec-pa" data-caro={f.custoPa > 1 || undefined}>{f.custoPa} PA</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="rc-aux-acoes rc-rec-acoes">
        <button type="button" className="rc-banc-esvaziar" onClick={onFechar}>Cancelar</button>
        <button type="button" className="rc-banc-guardar" disabled={!sel || carrega <= 0} onClick={() => sel && onRecarregar(sel)} data-testid="console-recarregar-confirmar">
          {sel ? `${troca ? "Trocar" : "Carregar"} ${carrega} · ${sel.custoPa} PA` : "Escolha a munição"}
        </button>
      </div>
    </AuxJanela>
  );
}

/** Aviso da recarga direta: o que entrou, de onde saiu, o custo — e Desfazer. Some em 5 s. */
export function AvisoRecarga({ aviso, onFechar }: { aviso: { ok: boolean; mensagem: string; desfazer?: () => void; seq: number }; onFechar: () => void }) {
  useEffect(() => {
    const t = setTimeout(onFechar, 5000);
    return () => clearTimeout(t);
  }, [aviso.seq, onFechar]);
  return (
    <div className="rc-rec-aviso" data-ok={aviso.ok || undefined} role="status" aria-live="polite">
      {aviso.ok ? <Check size={15} strokeWidth={2.2} aria-hidden="true" /> : <X size={15} strokeWidth={2.2} aria-hidden="true" />}
      <span className="rc-rec-aviso-txt">{aviso.mensagem}</span>
      {aviso.desfazer && (
        <button type="button" className="rc-rec-desfazer" onClick={() => { aviso.desfazer?.(); onFechar(); }}>Desfazer</button>
      )}
    </div>
  );
}
