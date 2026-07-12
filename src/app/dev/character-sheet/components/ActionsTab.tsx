"use client";

/**
 * Aba "Ações" — checkpoint v0.42. Console de ação básico data-driven:
 * a lista vem inteiramente de `ActionConsoleItem[]` (já filtrado por
 * visibilidade em CharacterSheetClient via actionConsole.ts) — este
 * componente é só apresentação, sem catálogo próprio.
 *
 * Escopo explícito: sem mapa/token/alvo/adjacência/linha de visão/
 * linha de efeito/equipamento — ver aviso fixo abaixo do cabeçalho.
 */

import { useState } from "react";
import { Section } from "./Section";
import { buttonStyle } from "./styles";
import type { ActionConsoleItem } from "../../../../lib/character";

const CATEGORIAS = ["todos", "movimento", "ofensiva", "defensiva", "diversa", "livre"] as const;
type Categoria = (typeof CATEGORIAS)[number];

const CATEGORIA_LABELS: Record<Categoria, string> = {
  todos: "Todos",
  movimento: "Movimento",
  ofensiva: "Ofensiva",
  defensiva: "Defensiva",
  diversa: "Diversa",
  livre: "Livre",
};

/** Detecta o efeito "resolver_ataque" no payload — mesmo critério usado em CharacterSheetClient. */
function temEfeitoAtaque(action: ActionConsoleItem): boolean {
  const efeitos = (action.payloadAutomacao as Record<string, unknown> | undefined)?.efeitos;
  return (
    Array.isArray(efeitos) &&
    efeitos.some((e) => typeof e === "object" && e !== null && (e as Record<string, unknown>).tipo === "resolver_ataque")
  );
}

export interface AttackWeaponOption {
  instanceId: string | null;
  nome: string;
}

export interface AttackPreview {
  skill: string | null;
  attribute: string | null;
  danoBase: string | null;
  tipoDano: string | null;
  subtipoDano: string | null;
  danoEstruturado: boolean;
}

export function ActionsTab({
  actions,
  paAtual,
  paMax,
  reacaoAtual,
  reacaoMax,
  defesasSemReacao,
  penalidadeDefensivaAtual,
  catalogError,
  executingActionId,
  onExecute,
  onRoll,
  attackWeaponOptions,
  selectedAttackWeaponId,
  onSelectAttackWeapon,
  attackPreview,
  estocarAvailable = false,
  estocarUsedThisCombat = false,
  estocarAtivo = false,
  onToggleEstocar,
}: {
  actions: ActionConsoleItem[];
  paAtual: number;
  paMax: number;
  reacaoAtual: number;
  reacaoMax: number;
  defesasSemReacao: number;
  penalidadeDefensivaAtual: number;
  catalogError: string | null;
  executingActionId: string | null;
  onExecute: (actionId: string) => void;
  /** undefined para uma ação = sem rolagem simples integrada disponível (sem `teste.pericias`). */
  onRoll: (actionId: string) => void;
  /** Candidatos de arma para "Atacar" (armas empunhadas + "Ataque desarmado"). */
  attackWeaponOptions: AttackWeaponOption[];
  selectedAttackWeaponId: string | null;
  onSelectAttackWeapon: (instanceId: string | null) => void;
  /** Perícia/atributo/dano resolvidos da arma selecionada — só exibição, nunca aplica dano. */
  attackPreview: AttackPreview | null;
  /** Espadachim › Estocar (checkpoint talentos, Fase 4) — talento adquirido e ainda não usado neste combate. */
  estocarAvailable?: boolean;
  estocarUsedThisCombat?: boolean;
  estocarAtivo?: boolean;
  onToggleEstocar?: (value: boolean) => void;
}) {
  const [categoria, setCategoria] = useState<Categoria>("todos");

  const visiveis = categoria === "todos" ? actions : actions.filter((a) => a.categoria === categoria);
  const ordenadas = [...visiveis].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <Section title="Ações">
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 12 }}>
        <Stat label="PA" atual={paAtual} max={paMax} testId="acoes-pa" />
        <Stat label="Reações" atual={reacaoAtual} max={reacaoMax} testId="acoes-reacao" />
        <div data-testid="acoes-defesas-sem-reacao" style={{ fontSize: 13 }}>
          <span style={{ opacity: 0.6 }}>Defesas sem Reação: </span>
          <span style={{ fontWeight: 700 }}>{defesasSemReacao}</span>
        </div>
        {penalidadeDefensivaAtual < 0 && (
          <div data-testid="acoes-penalidade-defensiva" style={{ fontSize: 13, color: "#f5a623" }}>
            Penalidade defensiva atual: {penalidadeDefensivaAtual}
          </div>
        )}
      </div>

      <p
        data-testid="acoes-aviso-escopo"
        style={{ fontSize: 12, opacity: 0.6, background: "#1d1e24", borderRadius: 8, padding: "8px 12px", marginBottom: 16 }}
      >
        Mapa, alvo, distância, equipamento, linha de visão e linha de efeito ainda não são validados
        automaticamente.
      </p>

      {catalogError && (
        <p
          data-testid="acoes-catalogo-erro"
          style={{ fontSize: 13, color: "#ff6b6b", background: "#2a1717", borderRadius: 8, padding: "10px 12px" }}
        >
          Catálogo de ações indisponível. Nenhuma lista local foi usada.
        </p>
      )}

      {!catalogError && (
        <>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {CATEGORIAS.map((c) => (
          <button
            key={c}
            data-testid={`acoes-filtro-${c}`}
            onClick={() => setCategoria(c)}
            style={{
              ...buttonStyle,
              background: categoria === c ? "#2a3f2a" : buttonStyle.background,
              borderColor: categoria === c ? "#4caf50" : "#333",
            }}
          >
            {CATEGORIA_LABELS[c]}
          </button>
        ))}
      </div>

      {ordenadas.length === 0 && <p style={{ fontSize: 13, opacity: 0.6 }}>Nenhuma ação nesta categoria.</p>}

      <div data-testid="acoes-lista" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {ordenadas.map((action) => (
          <ActionCard
            key={action.id}
            action={action}
            executing={executingActionId === action.id}
            onExecute={() => onExecute(action.id)}
            onRoll={() => onRoll(action.id)}
            attackWeaponOptions={temEfeitoAtaque(action) ? attackWeaponOptions : null}
            selectedAttackWeaponId={selectedAttackWeaponId}
            onSelectAttackWeapon={onSelectAttackWeapon}
            attackPreview={temEfeitoAtaque(action) ? attackPreview : null}
            estocarAvailable={temEfeitoAtaque(action) && estocarAvailable}
            estocarUsedThisCombat={estocarUsedThisCombat}
            estocarAtivo={estocarAtivo}
            onToggleEstocar={onToggleEstocar}
          />
        ))}
      </div>
        </>
      )}
    </Section>
  );
}

function Stat({ label, atual, max, testId }: { label: string; atual: number; max: number; testId: string }) {
  return (
    <div data-testid={testId} style={{ fontSize: 13 }}>
      <span style={{ opacity: 0.6 }}>{label}: </span>
      <span style={{ fontWeight: 700 }}>
        {atual}/{max}
      </span>
    </div>
  );
}

function ActionCard({
  action,
  executing,
  onExecute,
  onRoll,
  attackWeaponOptions,
  selectedAttackWeaponId,
  onSelectAttackWeapon,
  attackPreview,
  estocarAvailable = false,
  estocarUsedThisCombat = false,
  estocarAtivo = false,
  onToggleEstocar,
}: {
  action: ActionConsoleItem;
  executing: boolean;
  onExecute: () => void;
  onRoll: () => void;
  attackWeaponOptions: AttackWeaponOption[] | null;
  selectedAttackWeaponId: string | null;
  onSelectAttackWeapon: (instanceId: string | null) => void;
  attackPreview: AttackPreview | null;
  estocarAvailable?: boolean;
  estocarUsedThisCombat?: boolean;
  estocarAtivo?: boolean;
  onToggleEstocar?: (value: boolean) => void;
}) {
  const podeRolar = action.rollSkillId != null || (attackWeaponOptions != null && attackPreview?.skill != null);
  const executeEnabled = action.enabled && !executing;
  return (
    <div
      data-testid={`acao-item-${action.slug}`}
      style={{
        background: "#1d1e24",
        borderRadius: 8,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        borderLeft: action.enabled ? "3px solid #4caf50" : "3px solid #555",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span data-testid="acao-nome" style={{ fontWeight: 700, fontSize: 14 }}>
            {action.nome}
          </span>
          <span style={{ fontSize: 11, opacity: 0.5 }}>[{action.categoria} · {action.tipo}]</span>
          {action.custoReacao != null && <Badge cor="#f5a623">Reação</Badge>}
          {action.defenseWithoutReaction && <Badge cor="#ff6b6b">Sem Reação</Badge>}
          {action.custoLivre && <Badge cor="#4caf50">Livre</Badge>}
          {action.custoComposto && <Badge cor="#c0392b">Composto</Badge>}
          {action.isConditionEnabled && <Badge cor="#ff9f6b">Condição</Badge>}
          {action.pendingEffects.length > 0 && <Badge cor="#5ec8ff">Parcial</Badge>}
        </div>
        <span data-testid="acao-custo" style={{ fontSize: 12, opacity: 0.8 }}>
          {action.custoLabel}
        </span>
      </div>

      {action.descricaoCurta && <p style={{ fontSize: 12, opacity: 0.8, margin: 0 }}>{action.descricaoCurta}</p>}
      {action.reactionWarning && (
        <p data-testid="acao-aviso-sem-reacao" style={{ fontSize: 11, color: "#f5a623", margin: 0 }}>
          {action.reactionWarning}
        </p>
      )}
      {action.requisitoTexto && (
        <p style={{ fontSize: 11, opacity: 0.55, margin: 0 }}>Requisito: {action.requisitoTexto}</p>
      )}
      {action.itemRequirements.map((requirement) => (
        <p
          key={`${requirement.type}:${requirement.key}`}
          data-testid={`acao-requisito-item-${action.slug}-${requirement.key}`}
          style={{ fontSize: 11, color: requirement.satisfied ? "#4caf50" : "#f5a623", margin: 0 }}
        >
          {requirement.explanation}
        </p>
      ))}
      {attackWeaponOptions && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <label style={{ fontSize: 11, opacity: 0.7 }}>Arma:</label>
          <select
            data-testid={`acao-arma-${action.slug}`}
            value={selectedAttackWeaponId ?? "__desarmado__"}
            onChange={(e) => onSelectAttackWeapon(e.target.value === "__desarmado__" ? null : e.target.value)}
            style={{ fontSize: 12, background: "#111217", color: "#eee", border: "1px solid #333", borderRadius: 6, padding: "3px 6px" }}
          >
            {attackWeaponOptions.map((opt) => (
              <option key={opt.instanceId ?? "__desarmado__"} value={opt.instanceId ?? "__desarmado__"}>
                {opt.nome}
              </option>
            ))}
          </select>
        </div>
      )}
      {estocarAvailable && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
          <input
            data-testid={`acao-estocar-${action.slug}`}
            type="checkbox"
            checked={estocarAtivo}
            disabled={estocarUsedThisCombat}
            onChange={(e) => onToggleEstocar?.(e.target.checked)}
          />
          Usar Estocar: -1 PA neste ataque (requer arma corpo a corpo com lâmina, 1/combate)
          {estocarUsedThisCombat && <span style={{ color: "#888" }}> — já usado neste combate</span>}
        </label>
      )}
      {attackPreview && (
        <p data-testid={`acao-ataque-resumo-${action.slug}`} style={{ fontSize: 11, opacity: 0.7, margin: 0 }}>
          Perícia: {attackPreview.skill ?? "?"}
          {attackPreview.attribute ? ` (+${attackPreview.attribute})` : ""} · Dano-base:{" "}
          {attackPreview.danoEstruturado
            ? `${attackPreview.danoBase} ${attackPreview.tipoDano ? `(${attackPreview.tipoDano}${attackPreview.subtipoDano ? `/${attackPreview.subtipoDano}` : ""})` : ""}`
            : "dano não estruturado"}
        </p>
      )}
      {action.testeTexto && <p style={{ fontSize: 11, opacity: 0.55, margin: 0 }}>Teste: {action.testeTexto}</p>}
      {action.testeTexto && action.rollDisabledReason && (
        <p style={{ fontSize: 11, opacity: 0.55, margin: 0 }}>{action.rollDisabledReason}</p>
      )}
      {action.automatedEffects.length > 0 && (
        <p style={{ fontSize: 11, color: "#4caf50", margin: 0 }}>
          Automatizado: {action.automatedEffects.join(" · ")}
        </p>
      )}
      {action.pendingEffects.length > 0 && (
        <>
          <p style={{ fontSize: 11, color: "#5ec8ff", margin: 0 }}>Pendente: {action.pendingEffects.join(" · ")}</p>
          <p style={{ fontSize: 11, color: "#ffcf70", margin: 0 }}>
            Uso registrado; efeitos pendentes exigem resolução manual.
          </p>
        </>
      )}
      {action.isConditionEnabled && (
        <p style={{ fontSize: 11, opacity: 0.55, margin: 0 }}>
          Habilitada por: {action.enabledByConditions.join(", ")}
        </p>
      )}
      {!action.enabled && action.disabledReason && (
        <p data-testid="acao-motivo-desabilitada" style={{ fontSize: 11, color: "#ff6b6b", margin: 0 }}>
          {action.disabledReason}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button
          data-testid={`acao-executar-${action.slug}`}
          onClick={onExecute}
          disabled={!executeEnabled}
          style={{ ...buttonStyle, opacity: executeEnabled ? 1 : 0.4, cursor: executeEnabled ? "pointer" : "not-allowed" }}
        >
          {executing ? "Registrando…" : "Executar"}
        </button>
        {podeRolar && (
          <button data-testid={`acao-rolar-${action.slug}`} onClick={onRoll} style={{ ...buttonStyle, opacity: 0.8 }}>
            Rolar
          </button>
        )}
      </div>
    </div>
  );
}

function Badge({ children, cor }: { children: string; cor: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        color: cor,
        border: `1px solid ${cor}`,
        borderRadius: 999,
        padding: "1px 8px",
      }}
    >
      {children}
    </span>
  );
}
