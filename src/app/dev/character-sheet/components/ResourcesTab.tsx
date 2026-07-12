import { useState } from "react";
import { Section } from "./Section";
import { Stat } from "./Stat";
import { ResourceField } from "./ResourceField";
import { TurnCounters } from "./TurnCounters";
import { PendingRuptureChoices } from "./PendingRuptureChoices";
import { buttonStyle } from "./styles";
import {
  OVERLOAD_SURGE_TYPES,
  getOverloadMaxPerDay,
  getOverloadSurgeDamageDie,
  getOverloadWillTestRule,
  MAX_COLLAPSE_SEGMENTS,
  getIntegrityBand,
  type CharacterAttributes,
  type CharacterGameState,
  type CharacterResources,
  type CharacterRulesPayload,
  type Character,
  type DerivedDefinition,
  type DerivedStats,
  type PendingRuptureChoice,
} from "../../../../lib/character";

const RECURSO_MAXIMO_IDS = ["pv_max", "pe_max", "mana_max", "integridade_max"] as const;
const OUTROS_DERIVADOS_IDS = ["reacoes_por_rodada", "andar_m", "correr_m", "pa_max"] as const;

const RECURSO_ATUAL_FIELDS = [
  { id: "pv", label: "PV atual", maxId: "pv_max" },
  { id: "pe", label: "PE atual", maxId: "pe_max" },
  { id: "mana", label: "Mana atual", maxId: "mana_max" },
  { id: "integridade", label: "Integridade atual", maxId: "integridade_max" },
] as const satisfies readonly { id: keyof CharacterResources; label: string; maxId: keyof DerivedStats }[];

function derivedMetaById(regras: CharacterRulesPayload | null, id: string): DerivedDefinition | undefined {
  return regras?.derivados.find((d) => d.id === id);
}

export function ResourcesTab({
  regras,
  derivados,
  recursosAtuais,
  onChangeRecursoAtual,
  onRestoreMax,
  estadoJogo,
  penalidadeDefensivaAtual,
  onGastarPA,
  onDesfazerPA,
  onResetarPA,
  onUsarReacao,
  onDesfazerReacao,
  onResetarReacoes,
  atributos,
  onApplyShortRest,
  onApplyLongRest,
  sobrecargaUsadaDia,
  overloadMaxOverride = null,
  rupturaEspecialAscensao = null,
  rupturaPendente,
  overloadWillRollPending,
  onUseOverloadSurge,
  onRollOverloadWillTest,
  colapso,
  onStabilizeCollapse,
  onAdvanceCollapseSegment,
  onRollCollapseTest,
  currentRound,
  onEndRound,
  endRoundSummary,
  ultimaVontadePendente,
  ruptureChoices,
  onResolveRuptureChoice,
}: {
  regras: CharacterRulesPayload | null;
  derivados: DerivedStats;
  recursosAtuais: CharacterResources | undefined;
  onChangeRecursoAtual: (id: keyof CharacterResources, value: number) => void;
  onRestoreMax: () => void;
  estadoJogo: CharacterGameState | undefined;
  penalidadeDefensivaAtual: number;
  onGastarPA: () => void;
  onDesfazerPA: () => void;
  onResetarPA: () => void;
  onUsarReacao: () => void;
  onDesfazerReacao: () => void;
  onResetarReacoes: () => void;
  /** Checkpoint v0.36 — só para calcular a prévia (a aplicação de verdade usa applyShortRest/applyLongRest, com o Character completo). */
  atributos: CharacterAttributes;
  onApplyShortRest: () => void;
  onApplyLongRest: () => void;
  /** Checkpoint v0.37 — Sobrecarga/Ruptura pendente. */
  sobrecargaUsadaDia: number;
  /** Limite diário de Surtos elevado por talento (Mago › Ascensão → 5). null = usa o limite canônico. */
  overloadMaxOverride?: number | null;
  /** Ruptura especial de Ascensão (Mago N3) — exibida à parte, não reduz Integridade. null = nenhuma. */
  rupturaEspecialAscensao?: Character["ruptura_especial_ascensao"] | null;
  rupturaPendente: boolean;
  overloadWillRollPending: boolean;
  onUseOverloadSurge: (tipo: string) => void;
  onRollOverloadWillTest: () => void;
  /** Checkpoint v0.38 — Colapso por PV/PE 0. */
  colapso: Character["colapso"];
  onStabilizeCollapse: () => void;
  onAdvanceCollapseSegment: () => void;
  onRollCollapseTest: (atributoId: "corpo" | "mente") => void;
  /** Checkpoint v0.44 — rodada LOCAL do personagem (não a rodada da mesa, ver pendência do relatório). */
  currentRound: number;
  onEndRound: () => void;
  endRoundSummary: { logs: string[]; warnings: string[] } | null;
  /** Checkpoint v0.45 — Ruptura resolvida no fim de cena (mesa canônica). */
  ultimaVontadePendente: boolean;
  ruptureChoices: PendingRuptureChoice[];
  onResolveRuptureChoice: (choiceId: string, marca: string, traco: string) => void;
}) {
  const [tipoSurto, setTipoSurto] = useState<string>(OVERLOAD_SURGE_TYPES[0]);
  // Limite efetivo de Surtos: canônico, ou elevado por talento (Ascensão → 5).
  const overloadMaxCanonico = getOverloadMaxPerDay(regras?.sobrecarga);
  const overloadMax = overloadMaxOverride != null && overloadMaxOverride > overloadMaxCanonico ? overloadMaxOverride : overloadMaxCanonico;
  const pvAtual = recursosAtuais?.pv ?? 0;
  const peAtual = recursosAtuais?.pe ?? 0;
  const manaAtual = recursosAtuais?.mana ?? 0;
  const ganhoManaCurto = Math.floor(derivados.mana_max / 2);
  const previewManaCurto = Math.min(derivados.mana_max, manaAtual + ganhoManaCurto);
  const ganhoPvLongo = atributos.corpo + 2;
  const ganhoPeLongo = atributos.mente + 2;
  const previewPvLongo = Math.min(derivados.pv_max, pvAtual + ganhoPvLongo);
  const previewPeLongo = Math.min(derivados.pe_max, peAtual + ganhoPeLongo);
  return (
    <>
      <Section title="Derivados (máximos)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          {RECURSO_MAXIMO_IDS.map((id) => {
            const meta = derivedMetaById(regras, id);
            return (
              <Stat
                key={id}
                testId={`derivado-${id}`}
                label={meta?.nome ?? id}
                value={derivados[id]}
                hint={meta?.formula_label}
              />
            );
          })}
          {OUTROS_DERIVADOS_IDS.map((id) => {
            const meta = derivedMetaById(regras, id);
            const unidade = meta?.unidade ? ` ${meta.unidade}` : "";
            return (
              <Stat
                key={id}
                testId={`derivado-${id}`}
                label={meta?.nome ?? id}
                value={`${derivados[id]}${unidade}`}
                hint={meta?.formula_label}
              />
            );
          })}
        </div>
      </Section>

      <Section title="Recursos atuais">
        <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>
          Edição manual (inteiro, sem negativo). Sem regra de dano/cura/gasto ainda — isso
          fica para a etapa de combate.
        </p>
        <button onClick={onRestoreMax} style={{ ...buttonStyle, marginBottom: 12 }}>
          Restaurar recursos ao máximo
        </button>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          {RECURSO_ATUAL_FIELDS.map(({ id, label, maxId }) => (
            <ResourceField
              key={id}
              testId={`recurso-atual-${id}`}
              label={label}
              value={recursosAtuais?.[id] ?? 0}
              max={derivados[maxId]}
              onChange={(v) => onChangeRecursoAtual(id, v)}
            />
          ))}
        </div>
      </Section>

      <Section title="Descanso">
        <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 12 }}>
          Regras do PRD, ao pé da letra — <strong>Integridade não recupera por descanso</strong>{" "}
          (nem curto, nem longo).
        </p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ background: "#15161b", border: "1px solid #2a2b33", borderRadius: 8, padding: 12, flex: "1 1 220px" }}>
            <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Descanso curto (30 min)</p>
            <p style={{ fontSize: 11, opacity: 0.6, marginBottom: 8 }}>
              +floor(Mana máxima / 2) Mana. Não altera PV, PE ou Integridade.
            </p>
            <p data-testid="descanso-curto-previa" style={{ fontSize: 11, opacity: 0.7, marginBottom: 8 }}>
              Prévia: Mana {manaAtual} → {previewManaCurto} (+{previewManaCurto - manaAtual})
            </p>
            <button data-testid="descanso-curto-button" onClick={onApplyShortRest} style={buttonStyle}>
              Aplicar descanso curto
            </button>
          </div>
          <div style={{ background: "#15161b", border: "1px solid #2a2b33", borderRadius: 8, padding: 12, flex: "1 1 220px" }}>
            <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Descanso longo (8h)</p>
            <p style={{ fontSize: 11, opacity: 0.6, marginBottom: 8 }}>
              +Corpo+2 PV, +Mente+2 PE, Mana ao máximo. Remove PV/Mana temporários e reseta
              Sobrecarga.
            </p>
            <p data-testid="descanso-longo-previa" style={{ fontSize: 11, opacity: 0.7, marginBottom: 8 }}>
              Prévia: PV {pvAtual} → {previewPvLongo} (+{previewPvLongo - pvAtual}) · PE {peAtual} →{" "}
              {previewPeLongo} (+{previewPeLongo - peAtual}) · Mana → {derivados.mana_max} (máximo)
            </p>
            <button data-testid="descanso-longo-button" onClick={onApplyLongRest} style={buttonStyle}>
              Aplicar descanso longo
            </button>
          </div>
        </div>
      </Section>

      <Section title="Sobrecarga">
        {rupturaEspecialAscensao && (
          <p
            data-testid="ruptura-especial-ascensao"
            style={{ fontSize: 12, color: "#c78bff", background: "#221a2e", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}
          >
            ✦ Ruptura especial de Ascensão ativa — {rupturaEspecialAscensao.nota}
          </p>
        )}
        <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>
          Até {overloadMax} surtos por dia — só descanso longo recupera.
          Cada surto causa {getOverloadSurgeDamageDie(regras?.sobrecarga)} de dano psíquico (ajuste PE
          manualmente — o conteúdo não estrutura o recurso-alvo). O último surto do dia marca Ruptura
          pendente e exige teste de {getOverloadWillTestRule(regras?.sobrecarga).pericia} CD{" "}
          {getOverloadWillTestRule(regras?.sobrecarga).cd}. Valores vêm da regra canônica{" "}
          <code>regras_personagem.sobrecarga</code>.
        </p>
        <div data-testid="sobrecarga-cargas" style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {Array.from({ length: overloadMax }, (_, i) => i < sobrecargaUsadaDia).map((usada, i) => (
            <span
              key={i}
              data-testid={`sobrecarga-carga-${i}`}
              data-usada={usada}
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                border: `2px solid ${usada ? "#c0392b" : "#444"}`,
                background: usada ? "#c0392b" : "transparent",
              }}
              title={usada ? "Surto usado" : "Surto disponível"}
            />
          ))}
          <span style={{ fontSize: 12, opacity: 0.6, marginLeft: 8 }}>
            {sobrecargaUsadaDia}/{overloadMax} usados
          </span>
        </div>
        {rupturaPendente && (
          <p data-testid="ruptura-pendente-aviso" style={{ fontSize: 12, color: "#c0392b", marginBottom: 10 }}>
            ⚠ Ruptura pendente — resolvida quando o narrador encerrar a cena pela mesa (checkpoint
            v0.45): reduz Integridade, aumenta Mana máxima e cria pendência de Marca/Traço abaixo.
          </p>
        )}
        {overloadWillRollPending && (
          <div style={{ marginBottom: 10 }}>
            <button data-testid="overload-vontade-button" onClick={onRollOverloadWillTest} style={buttonStyle}>
              Rolar {getOverloadWillTestRule(regras?.sobrecarga).pericia} CD {getOverloadWillTestRule(regras?.sobrecarga).cd} (último surto)
            </button>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            data-testid="sobrecarga-tipo-select"
            value={tipoSurto}
            onChange={(e) => setTipoSurto(e.target.value)}
            style={{
              background: "#0f1014",
              color: "inherit",
              border: "1px solid #333",
              borderRadius: 4,
              padding: "6px 8px",
              fontSize: 13,
            }}
          >
            {OVERLOAD_SURGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            data-testid="sobrecarga-usar-button"
            onClick={() => onUseOverloadSurge(tipoSurto)}
            disabled={sobrecargaUsadaDia >= overloadMax}
            style={{ ...buttonStyle, opacity: sobrecargaUsadaDia >= overloadMax ? 0.5 : 1 }}
          >
            Usar surto
          </button>
        </div>
      </Section>

      {(colapso?.ativo || colapso?.cicatrizPendente) && (
        <Section title="Colapso">
          {colapso.ativo ? (
            <>
              <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
                Tipo: <strong>{colapso.tipo === "pv" ? "PV" : "PE"}</strong> · Segmentos:{" "}
                <strong data-testid="colapso-segmentos">{colapso.segmentos}/{MAX_COLLAPSE_SEGMENTS}</strong> ·{" "}
                {colapso.estabilizado ? "Estabilizado" : "Não estabilizado"}
              </p>
              <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 10 }}>
                {colapso.tipo === "pv"
                  ? "3º segmento: risco de morte."
                  : "3º segmento: risco de coma/fora de jogo."}{" "}
                Estabilizar interrompe o avanço, mas não cura. Cura de 1+ do recurso colapsado
                encerra o colapso automaticamente.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  data-testid="colapso-teste-corpo-button"
                  onClick={() => onRollCollapseTest("corpo")}
                  style={buttonStyle}
                >
                  Teste de Colapso — Corpo CD 7
                </button>
                <button
                  data-testid="colapso-teste-mente-button"
                  onClick={() => onRollCollapseTest("mente")}
                  style={buttonStyle}
                >
                  Teste de Colapso — Mente CD 7
                </button>
                <button data-testid="colapso-avancar-button" onClick={onAdvanceCollapseSegment} style={buttonStyle}>
                  Avançar segmento manualmente
                </button>
                <button
                  data-testid="colapso-estabilizar-button"
                  onClick={onStabilizeCollapse}
                  disabled={colapso.estabilizado}
                  style={{ ...buttonStyle, opacity: colapso.estabilizado ? 0.5 : 1 }}
                >
                  Estabilizar Colapso
                </button>
              </div>
            </>
          ) : (
            <p data-testid="colapso-cicatriz-pendente-aviso" style={{ fontSize: 12, color: "#f5a623" }}>
              ⚠ Cicatriz pendente — o personagem sobreviveu a um colapso; preenchimento de cicatriz
              ainda não implementado.
            </p>
          )}
        </Section>
      )}

      <Section title="Turno">
        <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>
          Controle manual de PA gastos e Reações usadas — editável em Modo Jogo e Modo
          Evolução. Sem rodada, janela rápida/lenta ou ações automatizadas ainda.
        </p>
        <TurnCounters
          paGastos={estadoJogo?.pa_gastos ?? 0}
          paMax={derivados.pa_max}
          reacoesUsadas={estadoJogo?.reacoes_usadas ?? 0}
          reacoesMax={derivados.reacoes_por_rodada}
          defesasSemReacao={estadoJogo?.defesas_sem_reacao ?? 0}
          penalidadeDefensivaAtual={penalidadeDefensivaAtual}
          onGastarPA={onGastarPA}
          onDesfazerPA={onDesfazerPA}
          onResetarPA={onResetarPA}
          onUsarReacao={onUsarReacao}
          onDesfazerReacao={onDesfazerReacao}
          onResetarReacoes={onResetarReacoes}
        />
      </Section>

      <Section title="Rodada (manual)">
        <p data-testid="ficha-rodada-aviso-canonico" style={{ fontSize: 12, color: "#f5a623", marginBottom: 8 }}>
          Em campanha, a rodada OFICIAL é encerrada pela mesa (dashboard do narrador, "Encerrar
          Rodada") — ela processa todos os personagens da campanha de uma vez. Use o botão abaixo só
          como ferramenta manual/dev para este personagem isoladamente.
        </p>
        <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>
          "Encerrar Rodada Manual" resolve dano/testes de fim de rodada das condições ativas
          (Queimando, Sangrando, Envenenado, Saturado, Insaturado — checkpoint v0.44), depois renova
          PA/Reações e aplica redução de PA por condição (Envenenado). Rodada local desta ficha.
        </p>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
          <span data-testid="ficha-rodada-atual" style={{ fontSize: 13 }}>
            Rodada <strong>{currentRound}</strong>
          </span>
          <button data-testid="ficha-encerrar-rodada" onClick={onEndRound} style={buttonStyle}>
            Encerrar Rodada Manual
          </button>
        </div>
        {endRoundSummary && (
          <div data-testid="ficha-encerrar-rodada-resumo" style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
            {endRoundSummary.logs.length === 0 && endRoundSummary.warnings.length === 0 && (
              <p style={{ opacity: 0.6 }}>Nenhum efeito de condição resolvido nesta rodada.</p>
            )}
            {endRoundSummary.logs.map((line, i) => (
              <p key={`log-${i}`} style={{ opacity: 0.8, margin: 0 }}>
                {line}
              </p>
            ))}
            {endRoundSummary.warnings.map((line, i) => (
              <p key={`warn-${i}`} style={{ color: "#f5a623", margin: 0 }}>
                ⚠ {line}
              </p>
            ))}
          </div>
        )}
      </Section>

      <Section title="Ruptura">
        <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>
          Resolvida pelo narrador ao encerrar a cena pela mesa (checkpoint v0.45, PRD 10.6) — reduz
          Integridade, aumenta Mana máxima em Ânimo + 2 (já refletido acima) e cria a pendência de
          Marca/Traço abaixo.
        </p>
        <p data-testid="integridade-banda" style={{ fontSize: 13, marginBottom: 10 }}>
          {/* Checkpoint v0.45.1: ausência de `integridade` nunca deve virar 0/"fim da ficha" —
              cai no máximo derivado (já deveria estar preenchido por normalizeCharacter/
              createInitialCharacter; este é só um último fallback defensivo). */}
          Faixa de Integridade: <strong>{getIntegrityBand(recursosAtuais?.integridade ?? derivados.integridade_max).texto}</strong>
        </p>
        {ultimaVontadePendente && (
          <p data-testid="ultima-vontade-pendente-aviso" style={{ fontSize: 12, color: "#c0392b", marginBottom: 10 }}>
            ☠ Integridade zerada por Ruptura — Última Vontade pendente. Nenhuma narrativa automática;
            registre com o narrador quando estiver pronto.
          </p>
        )}
      </Section>

      <PendingRuptureChoices choices={ruptureChoices} onResolve={onResolveRuptureChoice} />
    </>
  );
}
