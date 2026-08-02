"use client";

/**
 * Modais auxiliares do Console. Todos são PLACEHOLDERS FUNCIONAIS: a
 * interface definitiva de cada um está fora deste escopo, mas nenhum
 * inventa dado — todos operam sobre o conteúdo real e chamam o fluxo
 * existente. Podem ser trocados sem alterar a lógica que os alimenta.
 */

import { useState, type ReactNode } from "react";
import type { RupturaRollResult } from "../../../../lib/dice/types";
import type { InventoryItemInstance, ItemContent } from "../../../../lib/character";
import { BODY_SLOT_LABELS, type BodySlotId } from "../slots";

function Aux({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: ReactNode }) {
  return (
    <div
      className="rc-aux-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div className="rc-aux" role="dialog" aria-modal="true" aria-label={titulo}>
        <h2>{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

/** Resultado de rolagem — mostra atributo, quantidade de dados e resultados. */
export function RollResultModal({ resultado, onFechar }: { resultado: RupturaRollResult; onFechar: () => void }) {
  return (
    <Aux titulo="Rolagem" onFechar={onFechar}>
      <p className="rc-vazio" style={{ marginBottom: 8 }}>
        {resultado.periciaNome ? `${resultado.periciaNome} · ` : ""}
        {resultado.atributoNome} — {resultado.atributoValor}d8
      </p>
      <div className="rc-aux-dados" data-testid="console-roll-dados">
        {resultado.dados.map((d, i) => (
          <span key={i} className="rc-aux-dado" data-maior={d === resultado.maiorDado}>
            {d}
          </span>
        ))}
      </div>
      <p className="rc-vazio">
        maior dado {resultado.maiorDado}
        {resultado.periciaValor ? ` + perícia ${resultado.periciaValor}` : ""}
        {resultado.modificador ? ` + mod ${resultado.modificador}` : ""}
      </p>
      <p className="rc-aux-total" data-testid="console-roll-total">
        {resultado.total}
      </p>
      <div className="rc-aux-acoes">
        <button type="button" className="rc-ghost" onClick={onFechar}>
          Fechar
        </button>
      </div>
    </Aux>
  );
}

/** Seleção de surto de Sobrecarga — os rótulos vêm das regras publicadas. */
export function SurgePickerModal({
  tipos,
  onEscolher,
  onFechar,
}: {
  tipos: readonly string[];
  onEscolher: (tipo: string) => void;
  onFechar: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  return (
    <Aux titulo="Surto de Sobrecarga" onFechar={onFechar}>
      <p className="rc-vazio">Escolha o tipo de surto. O terceiro surto do dia dispara Ruptura.</p>
      <div className="rc-aux-lista">
        {tipos.map((t) => (
          <button
            key={t}
            type="button"
            className="rc-aux-item"
            disabled={enviando}
            // Trava contra clique repetido aplicando o mesmo surto 2×.
            onClick={() => {
              if (enviando) return;
              setEnviando(true);
              onEscolher(t);
            }}
          >
            <span>{t.replace(/_/g, " ")}</span>
          </button>
        ))}
      </div>
      <div className="rc-aux-acoes">
        <button type="button" className="rc-ghost" onClick={onFechar} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </Aux>
  );
}

/** Mochila filtrada por slot — só itens compatíveis, nunca lista genérica. */
export function BackpackPickerModal({
  slot,
  itens,
  catalogo,
  onEquipar,
  onFechar,
}: {
  slot: BodySlotId;
  itens: InventoryItemInstance[];
  catalogo: Map<string, ItemContent>;
  onEquipar: (instanceId: string) => void;
  onFechar: () => void;
}) {
  return (
    <Aux titulo={`Mochila — ${BODY_SLOT_LABELS[slot]}`} onFechar={onFechar}>
      {itens.length === 0 ? (
        <p className="rc-vazio">Nenhum item compatível com este slot na mochila.</p>
      ) : (
        <div className="rc-aux-lista">
          {itens.map((i) => {
            const m = catalogo.get(i.itemSlug);
            return (
              <button key={i.id} type="button" className="rc-aux-item" onClick={() => onEquipar(i.id)}>
                <span>{i.itemNome}</span>
                <span className="rc-num">
                  {m?.danoBase ?? (m?.mitMax != null ? `MIT ${m.mitMax}` : m?.pdMax != null ? `PD ${m.pdMax}` : "")}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div className="rc-aux-acoes">
        <button type="button" className="rc-ghost" onClick={onFechar}>
          Fechar
        </button>
      </div>
    </Aux>
  );
}

/** Janela de ataque — placeholder ligado aos dados reais da arma. */
export function AttackModal({
  instancia,
  modelo,
  onFechar,
}: {
  instancia: InventoryItemInstance;
  modelo: ItemContent;
  onFechar: () => void;
}) {
  return (
    <Aux titulo={`Ataque — ${instancia.itemNome}`} onFechar={onFechar}>
      <div className="rc-aux-lista">
        {modelo.danoBase && (
          <span className="rc-aux-item">
            <span>Dano</span>
            <span className="rc-num">
              {modelo.danoBase} {modelo.tipoDano ?? ""}
            </span>
          </span>
        )}
        {modelo.periciaAtaque && (
          <span className="rc-aux-item">
            <span>Perícia de ataque</span>
            <span className="rc-num">{modelo.periciaAtaque}</span>
          </span>
        )}
        {modelo.propertySlugs.length > 0 && (
          <span className="rc-aux-item">
            <span>Propriedades</span>
            <span className="rc-num">{modelo.propertySlugs.join(", ")}</span>
          </span>
        )}
      </div>
      <p className="rc-vazio">A janela de ataque definitiva entra no lugar deste painel.</p>
      <div className="rc-aux-acoes">
        <button type="button" className="rc-ghost" onClick={onFechar}>
          Fechar
        </button>
      </div>
    </Aux>
  );
}

/** Confirmação de recarga. */
export function ConfirmModal({
  titulo,
  mensagem,
  onConfirmar,
  onFechar,
}: {
  titulo: string;
  mensagem: string;
  onConfirmar: () => void;
  onFechar: () => void;
}) {
  return (
    <Aux titulo={titulo} onFechar={onFechar}>
      <p className="rc-vazio">{mensagem}</p>
      <div className="rc-aux-acoes">
        <button type="button" className="rc-ghost" onClick={onFechar}>
          Cancelar
        </button>
        <button type="button" className="rc-ghost" onClick={onConfirmar} data-testid="console-confirmar">
          Confirmar
        </button>
      </div>
    </Aux>
  );
}

/** Seleção de condição — lista as publicadas na Biblioteca. */
export function ConditionPickerModal({
  disponiveis,
  onAplicar,
  onFechar,
}: {
  disponiveis: { slug: string; nome: string; descricao_curta?: string }[];
  onAplicar: (c: { slug: string; nome: string }) => void;
  onFechar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const filtradas = disponiveis.filter((c) => c.nome.toLowerCase().includes(busca.trim().toLowerCase()));

  return (
    <Aux titulo="Adicionar condição" onFechar={onFechar}>
      <input
        className="rc-aux-item"
        placeholder="Buscar condição…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        aria-label="Buscar condição"
      />
      {filtradas.length === 0 ? (
        <p className="rc-vazio" style={{ marginTop: 10 }}>
          {disponiveis.length === 0
            ? "A Biblioteca de condições não está disponível — nenhuma lista local é usada no lugar."
            : "Nenhuma condição corresponde à busca."}
        </p>
      ) : (
        <div className="rc-aux-lista">
          {filtradas.slice(0, 40).map((c) => (
            <button key={c.slug} type="button" className="rc-aux-item" onClick={() => onAplicar(c)}>
              <span>{c.nome}</span>
            </button>
          ))}
        </div>
      )}
      <div className="rc-aux-acoes">
        <button type="button" className="rc-ghost" onClick={onFechar}>
          Fechar
        </button>
      </div>
    </Aux>
  );
}
