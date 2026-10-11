"use client";

/**
 * Recarga com ESCOLHA de fonte (opção C) e o aviso da recarga direta
 * (opção B).
 *
 * A janela só abre quando há decisão real — mais de uma fonte e nenhuma
 * marcada como padrão. Cada linha é uma pilha de munição: onde está,
 * quanto tem, quanto sobra e o custo (1 PA no espaço de munição e no
 * acesso rápido, 2 PA na mochila). A estrela marca a fonte como PADRÃO
 * da arma: da próxima vez, a recarga sai dela direto, sem perguntar.
 */

import { useEffect, useState } from "react";
import { Star, X, Check } from "lucide-react";
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
  padraoId,
  onRecarregar,
  onDefinirPadrao,
  onFechar,
}: {
  arma: string;
  municao: { atual: number; max: number };
  fontes: FonteRecarga[];
  padraoId: string | null;
  onRecarregar: (fonte: FonteRecarga) => void;
  onDefinirPadrao: (fonte: FonteRecarga | null) => void;
  onFechar: () => void;
}) {
  const [escolhida, setEscolhida] = useState(padraoId ?? fontes[0]?.id ?? null);
  const [padrao, setPadrao] = useState(padraoId);
  const sel = fontes.find((f) => f.id === escolhida) ?? null;
  const falta = Math.max(0, municao.max - municao.atual);
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
          <div className="rc-rec-cab" aria-hidden="true">
            <span /><span>Munição</span><span>Tem</span><span>Sobra</span><span>PA</span><span />
          </div>
          {fontes.map((f) => {
            const on = f.id === escolhida;
            const ehPadrao = f.id === padrao;
            return (
              <div key={f.id} className="rc-rec-op" data-on={on || undefined} role="radio" aria-checked={on} tabIndex={0}
                onClick={() => setEscolhida(f.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEscolhida(f.id); } }}>
                <span className="rc-rec-dot" aria-hidden="true" />
                <span className="rc-rec-txt">
                  <span className="rc-rec-op-nome">{f.nome}</span>
                  <span className="rc-rec-op-local">{ROTULO_LOCAL[f.local]}</span>
                </span>
                <span className="rc-rec-num">{f.quantidade}</span>
                <span className="rc-rec-num">{f.quantidade - Math.min(falta, f.quantidade)}</span>
                <span className="rc-rec-num" data-caro={f.custoPa > 1 || undefined}>{f.custoPa}</span>
                <button type="button" className="rc-rec-estrela" data-on={ehPadrao || undefined}
                  aria-pressed={ehPadrao} aria-label={ehPadrao ? `Deixar de usar ${f.nome} (${ROTULO_LOCAL[f.local]}) como padrão` : `Usar ${f.nome} (${ROTULO_LOCAL[f.local]}) como padrão`}
                  title={ehPadrao ? "Padrão desta arma" : "Marcar como padrão"}
                  onClick={(e) => { e.stopPropagation(); const novo = ehPadrao ? null : f; setPadrao(novo?.id ?? null); onDefinirPadrao(novo); }}>
                  <Star size={14} strokeWidth={1.8} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
        {padrao && <p className="rc-rec-nota">A fonte com estrela é usada direto nas próximas recargas desta arma.</p>}
      </div>
      <div className="rc-aux-acoes">
        <button type="button" className="rc-ghost" onClick={onFechar}>Cancelar</button>
        <button type="button" className="rc-ghost rc-rec-cta" disabled={!sel || carrega <= 0} onClick={() => sel && onRecarregar(sel)} data-testid="console-recarregar-confirmar">
          {sel ? `Carregar ${carrega} · ${sel.custoPa} PA` : "Escolha a munição"}
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
