"use client";

/**
 * Modais auxiliares do Console. Todos são PLACEHOLDERS FUNCIONAIS: a
 * interface definitiva de cada um está fora deste escopo, mas nenhum
 * inventa dado — todos operam sobre o conteúdo real e chamam o fluxo
 * existente. Podem ser trocados sem alterar a lógica que os alimenta.
 */

import { useState, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
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

/**
 * Resultado de rolagem — mostra atributo, quantidade de dados e
 * resultados. `defesa`, quando informado (só rolagens vindas de
 * "Rolar defesa"), mostra um aviso pra explicar de onde veio o
 * modificador negativo — regra "Reação": defender sem Reação disponível
 * ainda é permitido, mas cada defesa nessas condições na MESMA rodada
 * soma -1 cumulativo.
 */
export function RollResultModal({
  resultado,
  defesa,
  onFechar,
}: {
  resultado: RupturaRollResult;
  defesa?: { usouReacao: boolean; penalidade: number; defesasSemReacao: number };
  onFechar: () => void;
}) {
  return (
    <Aux titulo="Rolagem" onFechar={onFechar}>
      {defesa && !defesa.usouReacao && (
        <div className="rc-aux-defesa-aviso" role="status">
          <TriangleAlert size={15} aria-hidden="true" />
          <span>
            Sem Reação disponível — {defesa.defesasSemReacao}ª defesa sem Reação nesta rodada, penalidade cumulativa de{" "}
            <strong>{defesa.penalidade}</strong> já aplicada abaixo.
          </span>
        </div>
      )}
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

export const TIPOS_DEFESA = ["esquivar", "bloquear", "aparar", "resistir"] as const;
export type TipoDefesa = (typeof TIPOS_DEFESA)[number];
const LABEL_DEFESA: Record<TipoDefesa, string> = {
  esquivar: "Esquivar",
  bloquear: "Bloquear",
  aparar: "Aparar",
  resistir: "Resistir",
};

/**
 * Escolha de defesa (botão "Rolar defesa" de Reações) — regra "AÇÕES
 * DEFENSIVAS": Esquivar e Bloquear testam Reflexos, Aparar testa
 * Luta, todas perícias reais em `regras_personagem` (id "reflexos"/
 * "luta"). "Resistir" não tem perícia fixa — a regra deixa a critério
 * do narrador entre Vigor (força) e Mobilidade (agilidade) —, então
 * escolher "Resistir" aqui abre um segundo passo (`ResistirAtributoModal`)
 * em vez de rolar direto.
 */
export function DefensePickerModal({ onEscolher, onFechar }: { onEscolher: (tipo: TipoDefesa) => void; onFechar: () => void }) {
  return (
    <Aux titulo="Rolar defesa" onFechar={onFechar}>
      <p className="rc-vazio">Escolha a defesa usada nesta reação.</p>
      <div className="rc-aux-lista">
        {TIPOS_DEFESA.map((tipo) => (
          <button key={tipo} type="button" className="rc-aux-item" onClick={() => onEscolher(tipo)}>
            <span>{LABEL_DEFESA[tipo]}</span>
          </button>
        ))}
      </div>
      <div className="rc-aux-acoes">
        <button type="button" className="rc-ghost" onClick={onFechar}>
          Cancelar
        </button>
      </div>
    </Aux>
  );
}

/**
 * Segundo passo só de "Resistir": a regra deixa a critério do
 * narrador qual perícia se aplica ("firmeza muscular" = Vigor,
 * "agilidade" = Mobilidade) — sem isso não dá pra saber qual rolar.
 */
export function ResistirAtributoModal({
  onEscolher,
  onFechar,
}: {
  onEscolher: (periciaId: "vigor" | "mobilidade") => void;
  onFechar: () => void;
}) {
  return (
    <Aux titulo="Resistir" onFechar={onFechar}>
      <p className="rc-vazio">O narrador indica qual das duas opções se aplica nesta situação.</p>
      <div className="rc-aux-lista">
        <button type="button" className="rc-aux-item" onClick={() => onEscolher("vigor")}>
          <span>Vigor — robustez, suportar impacto ou pressão física</span>
        </button>
        <button type="button" className="rc-aux-item" onClick={() => onEscolher("mobilidade")}>
          <span>Mobilidade — maleabilidade, evitar o efeito com agilidade</span>
        </button>
      </div>
      <div className="rc-aux-acoes">
        <button type="button" className="rc-ghost" onClick={onFechar}>
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
