"use client";

/**
 * Faixa de estados ativa — checkpoint v0.35 (PRD 9.4). Primeira
 * versão: mostra de forma compacta o que já existe (condições ativas
 * + efeitos derivados delas, via `deriveActiveEffectsFromConditions`,
 * checkpoint v0.33 — NENHUMA lógica de efeito é recalculada aqui, só
 * reformatada para chip) e placeholders estruturados para o que o PRD
 * pede mas ainda não existe (posturas, Mirar, Fintar, talentos ativos,
 * vertinas, efeitos de item, cooldowns) — sem inventar regra para eles.
 *
 * Fica logo abaixo dos avisos de sessão/cura e antes das abas, visível
 * em `/ficha` e `/dev/character-sheet` (mesmo componente, sem
 * diferença de modo — ambos compartilham `character`/`activeEffects`).
 */

import type { ActiveCondition, ActiveEffect, Character } from "../../../../lib/character";
import type { ConditionOption } from "./ConditionsTab";

export type StateChipKind = "condicao" | "debuff" | "buff" | "aviso" | "fim_de_rodada" | "pendencia" | "placeholder";

export interface StateChip {
  id: string;
  nome: string;
  tipo: StateChipKind;
  origem?: string;
  duracao?: string;
  descricao?: string;
}

/**
 * Slugs com gatilho de fim de rodada garantido pelo PRD (tabela 9.2) —
 * piso mínimo, independente do que a Biblioteca tiver marcado hoje
 * (Insaturado/Saturado usam Vigor CD 7 "por cena" no conteúdo atual,
 * mas a mecânica do livro os resolve no mesmo ritmo de fim de rodada
 * das demais). Qualquer outra condição publicada com a tag
 * `"fim_de_rodada"` no payload da Biblioteca também é reconhecida
 * automaticamente (ver `isFimDeRodada`) — não é preciso adicionar
 * slug aqui para condições novas que já venham marcadas na Biblioteca.
 */
const FIM_DE_RODADA_SLUGS = new Set(["queimando", "sangrando", "envenenado", "insaturado", "saturado"]);

function isFimDeRodada(conditionId: string | null | undefined, condicoesDisponiveis: ConditionOption[]): boolean {
  if (!conditionId) return false;
  if (FIM_DE_RODADA_SLUGS.has(conditionId)) return true;
  const doc = condicoesDisponiveis.find((c) => c.slug === conditionId);
  return doc?.tags?.includes("fim_de_rodada") ?? false;
}

const TIPO_LABELS: Record<StateChipKind, string> = {
  condicao: "Condição",
  debuff: "Debuff",
  buff: "Buff",
  aviso: "Aviso",
  fim_de_rodada: "Fim de rodada",
  pendencia: "Pendência",
  placeholder: "Placeholder",
};

/** Símbolo textual por tipo — nunca só cor (acessibilidade, item 6 do pedido). */
const TIPO_SIMBOLOS: Record<StateChipKind, string> = {
  condicao: "◆",
  debuff: "▼",
  buff: "▲",
  aviso: "⚠",
  fim_de_rodada: "⟳",
  pendencia: "⏳",
  placeholder: "…",
};

const TIPO_CORES: Record<StateChipKind, string> = {
  condicao: "#ff9f6b",
  debuff: "#ff6b6b",
  buff: "#4caf50",
  aviso: "#f5a623",
  fim_de_rodada: "#c0392b",
  pendencia: "#5ec8ff",
  placeholder: "#555",
};

/** Categorias do PRD 9.4 ainda sem implementação nesta ficha — só citadas como "suporte preparado", nunca inventadas. */
const PLACEHOLDER_CATEGORIAS = [
  "Postura Ofensiva",
  "Postura Defensiva",
  "Mirar",
  "Fintar",
  "Talentos ativos",
  "Vertinas",
  "Efeitos de item",
  "Cooldowns",
];

/**
 * Monta os chips desta renderização a partir de dados JÁ derivados
 * (nunca recalcula regra de condição aqui). Função pura de
 * apresentação — não lê nem escreve estado.
 */
function buildChips(
  condicoesAtivas: ActiveCondition[],
  activeEffects: ActiveEffect[],
  condicoesDisponiveis: ConditionOption[],
): StateChip[] {
  const chipsCondicao: StateChip[] = condicoesAtivas.map((c) => ({
    id: `condicao:${c.id}`,
    nome: c.nome,
    tipo: isFimDeRodada(c.conditionId, condicoesDisponiveis) ? "fim_de_rodada" : "condicao",
    origem: c.origem,
    duracao: c.duracao,
    descricao: c.descricao,
  }));

  const chipsEfeito: StateChip[] = activeEffects.map((e) => ({
    id: `efeito:${e.id}`,
    nome: `${e.sourceName}${e.affectedTags.length > 0 ? ` [${e.affectedTags.join(", ")}]` : ""}`,
    tipo: e.kind === "modifier" ? (e.modifier < 0 ? "debuff" : "buff") : "aviso",
    descricao: e.explanation,
  }));

  return [...chipsCondicao, ...chipsEfeito];
}

export function ActiveStateStrip({
  condicoes,
  activeEffects,
  condicoesDisponiveis,
  onVerCondicoes,
  pvTemporario = 0,
  manaTemporaria = 0,
  sobrecargaUsadaDia = 0,
  rupturaPendente = false,
  colapso,
}: {
  /** `character.condicoes_ativas` completo (ativas e removidas) — o componente filtra `ativa:true` internamente. */
  condicoes: ActiveCondition[];
  /** Efeitos já derivados (checkpoint v0.33) — reaproveitados como-são, nenhuma lógica de efeito é recalculada aqui. */
  activeEffects: ActiveEffect[];
  condicoesDisponiveis: ConditionOption[];
  onVerCondicoes: () => void;
  /** checkpoint v0.36 — exibidos como pendência quando > 0, sem refator de layout. */
  pvTemporario?: number;
  manaTemporaria?: number;
  sobrecargaUsadaDia?: number;
  /** checkpoint v0.37 — Ruptura pendente (PRD 10.6), resolvida só no fim de cena (fora de escopo ainda). */
  rupturaPendente?: boolean;
  /** checkpoint v0.38 — Colapso ativo/cicatriz pendente. */
  colapso?: Character["colapso"];
}) {
  const condicoesAtivas = condicoes.filter((c) => c.ativa);
  const chips = buildChips(condicoesAtivas, activeEffects, condicoesDisponiveis);
  // "Estados pendentes" (item 2 do pedido): sem sistema de Ruptura/Marca/Traço
  // pendente implementado ainda (PRD 10.6) — nunca inventado. Checkpoint
  // v0.36 populou este array pela primeira vez, mas só com os 3 campos
  // mínimos que já existem de verdade (pv_temporario/mana_temporaria/
  // sobrecarga_usada_dia) — nunca clicáveis (evita inflar escopo com
  // navegação/edição pela faixa, como pedido).
  const pendencias: StateChip[] = [];
  if (pvTemporario > 0) {
    pendencias.push({
      id: "pendencia:pv_temporario",
      nome: `PV temporário: ${pvTemporario}`,
      tipo: "pendencia",
      descricao: "Removido automaticamente no próximo descanso longo.",
    });
  }
  if (manaTemporaria > 0) {
    pendencias.push({
      id: "pendencia:mana_temporaria",
      nome: `Mana temporária: ${manaTemporaria}`,
      tipo: "pendencia",
      descricao: "Removida automaticamente no próximo descanso longo.",
    });
  }
  if (sobrecargaUsadaDia > 0) {
    pendencias.push({
      id: "pendencia:sobrecarga",
      nome: `Sobrecarga: ${sobrecargaUsadaDia}/3`,
      tipo: "pendencia",
      descricao: "Resetada automaticamente no próximo descanso longo.",
    });
  }
  if (rupturaPendente) {
    pendencias.push({
      id: "pendencia:ruptura",
      nome: "Ruptura pendente",
      tipo: "pendencia",
      descricao: "Resolvida no fim da cena (Marca/Traço) — ainda não automatizado; descanso não limpa isso.",
    });
  }
  if (colapso?.ativo) {
    pendencias.push({
      id: "pendencia:colapso",
      nome: `Colapso (${colapso.tipo === "pv" ? "PV" : "PE"}) ${colapso.segmentos}/3${colapso.estabilizado ? " · estabilizado" : ""}`,
      tipo: "pendencia",
      descricao: "Inconsciente. Ver aba Recursos para testes/estabilizar. Cura de 1+ do recurso colapsado encerra automaticamente.",
    });
  }
  if (!colapso?.ativo && colapso?.cicatrizPendente) {
    pendencias.push({
      id: "pendencia:cicatriz",
      nome: "Cicatriz pendente",
      tipo: "pendencia",
      descricao: "Personagem sobreviveu a um colapso — preenchimento de cicatriz ainda não implementado.",
    });
  }
  const todosChips = [...chips, ...pendencias];

  return (
    <div data-testid="active-state-strip" style={{ marginBottom: 16 }}>
      {todosChips.length === 0 ? (
        <p data-testid="active-state-strip-vazio" style={{ fontSize: 12, opacity: 0.5, margin: 0 }}>
          Sem estados ativos.
        </p>
      ) : (
        <div data-testid="active-state-strip-chips" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {todosChips.map((chip) => {
            const clicavel = chip.tipo === "condicao" || chip.tipo === "fim_de_rodada";
            const pulsante = chip.tipo === "fim_de_rodada";
            return (
              <button
                key={chip.id}
                data-testid={`state-chip-${chip.id}`}
                data-chip-tipo={chip.tipo}
                onClick={clicavel ? onVerCondicoes : undefined}
                title={[
                  TIPO_LABELS[chip.tipo],
                  chip.origem ? `Origem: ${chip.origem}` : null,
                  chip.duracao ? `Duração: ${chip.duracao}` : null,
                  chip.descricao ?? null,
                ]
                  .filter(Boolean)
                  .join(" — ")}
                className={pulsante ? "ruptura-pulse" : undefined}
                style={{
                  background: "#1d1e24",
                  color: TIPO_CORES[chip.tipo],
                  border: `1px solid ${TIPO_CORES[chip.tipo]}`,
                  borderRadius: 999,
                  padding: "3px 10px",
                  fontSize: 11,
                  cursor: clicavel ? "pointer" : "default",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <span aria-hidden="true">{TIPO_SIMBOLOS[chip.tipo]}</span>
                <span>{chip.nome}</span>
                <span style={{ opacity: 0.6, fontSize: 10 }}>[{TIPO_LABELS[chip.tipo]}]</span>
                {clicavel && <span style={{ opacity: 0.5, fontSize: 10 }}>· Ver</span>}
              </button>
            );
          })}
        </div>
      )}
      <p style={{ fontSize: 10, opacity: 0.35, margin: "6px 0 0" }}>
        Suporte preparado (ainda vazio): {PLACEHOLDER_CATEGORIAS.join(" · ")}.
      </p>
    </div>
  );
}
