"use client";

/**
 * Escolha EXPLÍCITA de destino de uma transferência do Bando.
 *
 * Existe porque o painel não pode adivinhar para quem vai um item: um
 * arrasto que caiu numa linha de personagem já traz o destino pronto,
 * mas "Enviar para…" (e qualquer caso em que o alvo não é óbvio) abre
 * este diálogo. A quantidade também é explícita — e a operação
 * canônica recusa divisão parcial de instância com estado individual,
 * então o erro que aparece aqui é o erro REAL do domínio, não uma
 * validação paralela.
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { lerDiretorioPersonagensAction } from "./acoes/personagensPainel";
import { transferirItemBandoAction } from "./acoes/bandoPainel";
import type { ItemTransferivel } from "./bandoModelo";
import { EstadoCarregando, EstadoErro } from "./Estados";

export interface AlvoTransferencia {
  /** Só o essencial da linha — a instância inteira nunca precisa atravessar o cliente: o servidor a relê pelo id. */
  item: ItemTransferivel;
  /** Já resolvido quando o item foi solto sobre uma linha de personagem. */
  personagem: { id: string; nome: string } | null;
}

export function TransferenciaBando({
  campaignId,
  alvo,
  onFechar,
  onConcluido,
}: {
  campaignId: string;
  alvo: AlvoTransferencia;
  onFechar: () => void;
  onConcluido: () => void;
}) {
  const [personagens, setPersonagens] = useState<{ id: string; nome: string }[] | null>(null);
  const [escolhido, setEscolhido] = useState<string>(alvo.personagem?.id ?? "");
  const [quantidade, setQuantidade] = useState<number>(alvo.item.quantidade);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    lerDiretorioPersonagensAction(campaignId).then((r) => {
      if (cancelado) return;
      if (r.ok && r.dados) {
        setPersonagens(
          r.dados.entradas
            .filter((e) => !e.arquivado)
            .map((e) => ({ id: e.characterId, nome: e.nome }))
            .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })),
        );
      } else {
        setErro(r.erro ?? "Falha ao listar personagens autorizados.");
      }
    });
    return () => {
      cancelado = true;
    };
  }, [campaignId]);

  async function confirmar() {
    if (!escolhido) {
      setErro("Escolha um personagem de destino.");
      return;
    }
    setEnviando(true);
    setErro(null);
    const r = await transferirItemBandoAction({
      campaignId,
      rowId: alvo.item.id,
      characterId: escolhido,
      quantidade,
    });
    setEnviando(false);
    if (!r.ok) {
      setErro(r.erro ?? "Transferência recusada.");
      return;
    }
    onConcluido();
  }

  return (
    <div
      className="rv-modal-fundo"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !enviando) onFechar();
      }}
    >
      <div className="rv-modal rv-modal--confirmar" role="dialog" aria-modal="true" aria-label={`Transferir ${alvo.item.nome}`} data-testid="painel-bando-transferencia">
        <header className="rv-modal-cab">
          <h2>Transferir do bando</h2>
          <button type="button" className="rv-modal-fechar" aria-label="Fechar" onClick={onFechar} disabled={enviando}>×</button>
        </header>
        <div className="rv-modal-corpo">
          <p>
            <strong>{alvo.item.nome}</strong>
            {alvo.item.quantidade > 1 ? ` (disponível: ${alvo.item.quantidade})` : ""}
          </p>

          <label className="rv-pn-campo">
            <span>Para</span>
            {personagens === null ? (
              <EstadoCarregando rotulo="Carregando personagens…" />
            ) : (
              <select
                className="rv-pn-select"
                value={escolhido}
                onChange={(e) => setEscolhido(e.target.value)}
                data-testid="painel-bando-transferencia-personagem"
              >
                <option value="">Escolha um personagem…</option>
                {personagens.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            )}
          </label>

          <label className="rv-pn-campo">
            <span>Quantidade</span>
            <input
              type="number"
              className="rv-pn-input"
              min={1}
              max={alvo.item.quantidade}
              value={quantidade}
              onChange={(e) => setQuantidade(Math.max(1, Math.min(alvo.item.quantidade, Number(e.target.value) || 1)))}
              data-testid="painel-bando-transferencia-quantidade"
            />
          </label>

          {erro && <EstadoErro mensagem={erro} testId="painel-bando-transferencia-erro" />}
        </div>
        <footer className="rv-modal-rodape">
          <button type="button" className="rv-btn rv-btn--ghost" onClick={onFechar} disabled={enviando}>Cancelar</button>
          <button
            type="button"
            className="rv-btn"
            onClick={confirmar}
            disabled={enviando || !escolhido}
            data-testid="painel-bando-transferencia-confirmar"
          >
            {enviando ? <Loader2 size={14} className="rv-spin" /> : null} Transferir
          </button>
        </footer>
      </div>
    </div>
  );
}
