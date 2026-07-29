"use client";

/**
 * "Resolver Ataque" (Fase 3, divisão do antigo MesaDetailClient.tsx
 * monolítico) — ferramenta privilegiada exclusiva do narrador (PRD
 * §1.1 "ferramentas privilegiadas de mesa": rolagem oculta, aplicação
 * de dano/condição). Lógica idêntica à promoção pós-auditoria original
 * (reação defensiva, margem→região, MIT/PD) — só extraída para seu
 * próprio arquivo, nenhuma regra reimplementada.
 *
 * Escrita de personagem aqui usa `updateCharacter` (caminho
 * ADMINISTRATIVO, só autorizado pela RLS para o narrador dono da
 * campanha — migration 0052) — condizente com esta seção só ser
 * renderizada para o narrador.
 */
import { useState } from "react";
import {
  addLog,
} from "../../../../lib/table/storage";
import {
  updateCharacter,
} from "../../../../lib/character/storage";
import {
  normalizeCharacter,
  resolveContestedRoll,
  applyAttackDamage,
  deriveCriticalItemPropertySuggestions,
  getEquippedDefenseProfile,
  resolveMarginBand,
  rollDamageFormula,
  rollExtraMarginDie,
  computeDerivedStats,
  spendReactionForDefense,
  BODY_REGION_LABELS,
  type AttackCriticalRules,
  type CriticalItemPropertySuggestion,
  type ItemContent,
  type BodyRegion,
  type MarginBandRules,
  type ReactionRules,
} from "../../../../lib/character";
import type { TechnicalContentItem } from "../../../../lib/content";
import type { CharacterRecord, CharacterRulesPayload } from "../../../../lib/character";
import { btnPrimary, card, input, text } from "../_shell/theme";

type DefenseType = "esquivar" | "aparar" | "bloquear" | "resistir";
const DEFENSE_TYPE_LABELS: Record<DefenseType, string> = {
  esquivar: "Esquivar",
  aparar: "Aparar",
  bloquear: "Bloquear",
  resistir: "Resistir",
};

export function AttackResolutionSection({
  campaignId,
  personagensAtivos,
  regras,
  criticalRules,
  items,
  properties,
  runes,
  reactionRules,
  onAfterResolve,
}: {
  campaignId: string;
  personagensAtivos: CharacterRecord[];
  regras: CharacterRulesPayload | null;
  criticalRules: AttackCriticalRules;
  items: ItemContent[];
  properties: TechnicalContentItem[];
  runes: TechnicalContentItem[];
  reactionRules: ReactionRules;
  onAfterResolve: () => unknown;
}) {
  const [error, setError] = useState<string | null>(null);
  const [ataqueAtacanteId, setAtaqueAtacanteId] = useState("");
  const [ataqueAlvoId, setAtaqueAlvoId] = useState("");
  const [ataqueItemInstanceId, setAtaqueItemInstanceId] = useState("");
  const [ataqueTotalAtaque, setAtaqueTotalAtaque] = useState("");
  const [ataqueTotalDefesa, setAtaqueTotalDefesa] = useState("");
  const [ataqueFormulaDano, setAtaqueFormulaDano] = useState("1d6");
  const [ataqueTipoDano, setAtaqueTipoDano] = useState("fisico");
  const [ataqueSubtipoDano, setAtaqueSubtipoDano] = useState("");
  const [ataqueDefesaTipo, setAtaqueDefesaTipo] = useState<DefenseType | "nenhuma">("nenhuma");
  const [ataqueReacaoAviso, setAtaqueReacaoAviso] = useState<string | null>(null);
  const [ataqueProcessing, setAtaqueProcessing] = useState(false);
  const [ataqueResultado, setAtaqueResultado] = useState<string | null>(null);
  const [ataqueSugestoesCriticas, setAtaqueSugestoesCriticas] = useState<CriticalItemPropertySuggestion[]>([]);
  const [ataqueMargemPendente, setAtaqueMargemPendente] = useState<{ margin: number; band: MarginBandRules; alvoId: string } | null>(null);
  const [ataqueRegiaoEscolhida, setAtaqueRegiaoEscolhida] = useState<BodyRegion | "">("");

  const ataqueAtacante = personagensAtivos.find((c) => c.id === ataqueAtacanteId);
  const ataqueArmas = ataqueAtacante
    ? normalizeCharacter(ataqueAtacante.payload).inventario?.filter((item) => item.categoria === "arma") ?? []
    : [];

  async function handleCalcularMargem() {
    setError(null);
    setAtaqueResultado(null);
    setAtaqueSugestoesCriticas([]);
    setAtaqueReacaoAviso(null);
    setAtaqueMargemPendente(null);
    setAtaqueRegiaoEscolhida("");
    const atacante = personagensAtivos.find((c) => c.id === ataqueAtacanteId);
    const alvo = personagensAtivos.find((c) => c.id === ataqueAlvoId);
    const totalAtaque = Number(ataqueTotalAtaque);
    const totalDefesa = Number(ataqueTotalDefesa);
    if (!atacante || !alvo || !Number.isFinite(totalAtaque) || !Number.isFinite(totalDefesa)) {
      setError("Selecione atacante, alvo e informe os totais de ataque/defesa.");
      return;
    }

    setAtaqueProcessing(true);
    try {
      let alvoNormalizado = normalizeCharacter(alvo.payload);

      if (ataqueDefesaTipo !== "nenhuma") {
        const reactionMax = computeDerivedStats(alvoNormalizado.atributos, regras, alvoNormalizado.mana_bonus_ruptura ?? 0).reacoes_por_rodada;
        const reactionResult = spendReactionForDefense(alvoNormalizado, reactionMax, reactionRules, 1);
        alvoNormalizado = reactionResult.character;
        await updateCharacter(alvo.id, alvoNormalizado);
        const avisos: string[] = [...reactionResult.warnings];
        if (reactionResult.defenseWithoutReaction) {
          avisos.push(`Defesa sem Reação disponível — penalidade cumulativa de ${reactionResult.penaltyApplied} nesta rodada.`);
        }
        setAtaqueReacaoAviso(avisos.length > 0 ? avisos.join(" ") : null);
        try {
          await addLog({
            campaignId,
            characterId: alvo.id,
            type: "defense_reaction_used",
            visibility: "public",
            payload: {
              targetName: alvo.name,
              defenseName: DEFENSE_TYPE_LABELS[ataqueDefesaTipo],
              total: totalDefesa,
              reactionsBefore: reactionResult.reactionBefore,
              reactionsAfter: reactionResult.reactionAfter,
              source: "mesa_dashboard",
            },
          });
        } catch {
          // Best-effort — a Reação já foi persistida no personagem.
        }
        await onAfterResolve();
      }

      const contested = resolveContestedRoll(totalAtaque, totalDefesa);
      let resumo = `${atacante.name} (${totalAtaque}) vs ${alvo.name} (${totalDefesa}) — margem ${contested.margin}.`;
      const atacanteNormalizado = normalizeCharacter(atacante.payload);
      const itemInstance = atacanteNormalizado.inventario?.find((item) => item.id === ataqueItemInstanceId);
      const itemContent = itemInstance ? items.find((item) => item.slug === itemInstance.itemSlug) : undefined;
      const criticalSuggestions = deriveCriticalItemPropertySuggestions({
        margin: contested.margin,
        rules: criticalRules,
        itemInstance,
        itemContent,
        properties,
        runes,
      });
      if (criticalSuggestions.length > 0) setAtaqueSugestoesCriticas(criticalSuggestions);

      if (contested.attackerWins) {
        const band = resolveMarginBand(contested.margin);
        resumo += ` Acerto — região liberada: ${band.allowedRegions.map((r) => BODY_REGION_LABELS[r]).join(", ")}. Escolha a região para aplicar o dano.`;
        setAtaqueMargemPendente({ margin: contested.margin, band, alvoId: alvo.id });
        if (band.allowedRegions.length === 1) setAtaqueRegiaoEscolhida(band.allowedRegions[0]);
      } else {
        resumo += " Defesa bem-sucedida — nenhum dano aplicado.";
        try {
          await addLog({
            campaignId,
            characterId: alvo.id,
            type: "attack_resolved",
            visibility: "public",
            payload: {
              attackerId: atacante.id,
              attackerNome: atacante.name,
              characterId: alvo.id,
              characterNome: alvo.name,
              attackerTotal: totalAtaque,
              defenderTotal: totalDefesa,
              margin: contested.margin,
              attackerWins: false,
              defenseType: ataqueDefesaTipo !== "nenhuma" ? ataqueDefesaTipo : null,
              source: "mesa_dashboard",
            },
          });
        } catch {
          // Best-effort.
        }
        await onAfterResolve();
      }

      setAtaqueResultado(resumo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao calcular margem do ataque.");
    } finally {
      setAtaqueProcessing(false);
    }
  }

  async function handleAplicarDano() {
    if (!ataqueMargemPendente || !ataqueRegiaoEscolhida) {
      setError("Escolha a região atingida antes de aplicar o dano.");
      return;
    }
    setError(null);
    const atacante = personagensAtivos.find((c) => c.id === ataqueAtacanteId);
    const alvo = personagensAtivos.find((c) => c.id === ataqueMargemPendente.alvoId);
    if (!atacante || !alvo) {
      setError("Atacante ou alvo não encontrado — recarregue os personagens da mesa.");
      return;
    }

    setAtaqueProcessing(true);
    try {
      const nowIso = new Date().toISOString();
      const { margin, band } = ataqueMargemPendente;
      const atacanteNormalizado = normalizeCharacter(atacante.payload);
      const itemInstance = atacanteNormalizado.inventario?.find((item) => item.id === ataqueItemInstanceId);
      const alvoNormalizado = normalizeCharacter(alvo.payload);
      const defesaAlvo = getEquippedDefenseProfile(alvoNormalizado, items);
      const wasBlocked = ataqueDefesaTipo === "bloquear";

      const rawRoll = rollDamageFormula(ataqueFormulaDano);
      const adjustedRaw =
        band.modifierType === "flat"
          ? Math.max(0, rawRoll + band.flatModifier)
          : band.modifierType === "extraDie"
            ? rawRoll + (rollExtraMarginDie(ataqueFormulaDano) ?? 0)
            : rawRoll;

      const dano = applyAttackDamage({
        character: alvoNormalizado,
        formula: `0d4+${adjustedRaw}`,
        damageType: ataqueTipoDano,
        damageSubtype: ataqueSubtipoDano.trim() || undefined,
        wasBlocked,
        defense: defesaAlvo,
        nowIso,
        collapseRules: regras?.colapso,
        round: alvoNormalizado.current_round,
        scene: alvoNormalizado.current_scene,
      });
      await updateCharacter(alvo.id, dano.character);

      let resumo = `${atacante.name} → ${alvo.name} — margem ${margin} (${band.band}), região ${BODY_REGION_LABELS[ataqueRegiaoEscolhida]}: ${dano.rollResult} de dano ${ataqueTipoDano} (PV ${dano.pvBefore} → ${dano.pvAfter}).`;
      if (dano.mitigatedByMit > 0 || dano.mitigatedByPd > 0) resumo += ` ${dano.defenseSummary}`;
      if (dano.collapseStarted) resumo += ` Colapso (${dano.collapseTipo}) iniciado.`;
      if (dano.collapseAdvanceLogs.length > 0) resumo += ` ${dano.collapseAdvanceLogs.join(" ")}`;

      try {
        await addLog({
          campaignId,
          characterId: alvo.id,
          type: "attack_resolved",
          visibility: "public",
          payload: {
            attackerName: atacante.name,
            targetName: alvo.name,
            weaponName: itemInstance?.itemNome ?? null,
            margin,
            marginBand: band.band,
            selectedRegion: ataqueRegiaoEscolhida,
            rawDamage: adjustedRaw,
            damageType: ataqueTipoDano,
            mitApplied: dano.mitigatedByMit + dano.mitigatedByPd,
            finalDamage: dano.finalDamage,
            targetPvBefore: dano.pvBefore,
            targetPvAfter: dano.pvAfter,
            defenseType: ataqueDefesaTipo !== "nenhuma" ? ataqueDefesaTipo : null,
            wasBlocked,
            override: false,
            criticalPropertySuggestions: ataqueSugestoesCriticas,
            source: "mesa_dashboard",
          },
        });
        for (const entry of dano.collapseAdvanceTableLogs) {
          await addLog({
            campaignId,
            characterId: alvo.id,
            type: entry.type,
            visibility: "public",
            payload: { ...entry.payload, characterId: alvo.id, characterNome: alvo.name, source: "mesa_dashboard" },
          });
        }
      } catch {
        // Best-effort — o dano já foi persistido no personagem.
      }

      setAtaqueResultado(resumo);
      setAtaqueMargemPendente(null);
      setAtaqueRegiaoEscolhida("");
      await onAfterResolve();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao aplicar dano do ataque.");
    } finally {
      setAtaqueProcessing(false);
    }
  }

  function handleCancelarAtaquePendente() {
    setAtaqueMargemPendente(null);
    setAtaqueRegiaoEscolhida("");
    setAtaqueResultado(null);
  }

  return (
    <section aria-labelledby="mesa-ataque-heading" style={{ marginBottom: 32 }}>
      <h2 id="mesa-ataque-heading" style={{ ...text.h2, marginBottom: 10 }}>Resolver Ataque</h2>
      <p style={{ ...text.faint, marginBottom: 12 }}>
        Informe os totais JÁ ROLADOS de ataque e defesa — maior total vence, empate favorece o defensor. Em caso de
        acerto, escolha a região liberada pela margem para aplicar MIT/PD e dano.
      </p>
      {error && <p role="alert" style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 12 }}>Erro: {error}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <select data-testid="det-ataque-atacante-select" value={ataqueAtacanteId} onChange={(e) => { setAtaqueAtacanteId(e.target.value); setAtaqueItemInstanceId(""); }} className="rv-focusable" style={input}>
          <option value="">— atacante —</option>
          {personagensAtivos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select data-testid="det-ataque-item-select" value={ataqueItemInstanceId} onChange={(e) => setAtaqueItemInstanceId(e.target.value)} className="rv-focusable" style={input}>
          <option value="">— arma usada (opcional) —</option>
          {ataqueArmas.map((item) => <option key={item.id} value={item.id}>{item.itemNome}</option>)}
        </select>
        <select data-testid="det-ataque-alvo-select" value={ataqueAlvoId} onChange={(e) => setAtaqueAlvoId(e.target.value)} className="rv-focusable" style={input}>
          <option value="">— alvo —</option>
          {personagensAtivos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <input data-testid="det-ataque-total-ataque" type="number" placeholder="Total do ataque" value={ataqueTotalAtaque} onChange={(e) => setAtaqueTotalAtaque(e.target.value)} className="rv-focusable" style={{ ...input, width: 140 }} />
        <input data-testid="det-ataque-total-defesa" type="number" placeholder="Total da defesa" value={ataqueTotalDefesa} onChange={(e) => setAtaqueTotalDefesa(e.target.value)} className="rv-focusable" style={{ ...input, width: 140 }} />
        <select data-testid="det-ataque-defesa-tipo" value={ataqueDefesaTipo} onChange={(e) => setAtaqueDefesaTipo(e.target.value as DefenseType | "nenhuma")} className="rv-focusable" style={input}>
          <option value="nenhuma">Sem reação declarada</option>
          {(["esquivar", "aparar", "bloquear", "resistir"] as DefenseType[]).map((tipo) => <option key={tipo} value={tipo}>{DEFENSE_TYPE_LABELS[tipo]}</option>)}
        </select>
        <input data-testid="det-ataque-formula-dano" type="text" placeholder="Fórmula de dano (ex.: 1d6+2)" value={ataqueFormulaDano} onChange={(e) => setAtaqueFormulaDano(e.target.value)} className="rv-focusable" style={{ ...input, width: 180 }} />
        <input data-testid="det-ataque-tipo-dano" type="text" placeholder="Tipo de dano" value={ataqueTipoDano} onChange={(e) => setAtaqueTipoDano(e.target.value)} className="rv-focusable" style={{ ...input, width: 120 }} />
        <input data-testid="det-ataque-subtipo-dano" type="text" placeholder="Subtipo de dano (opcional)" value={ataqueSubtipoDano} onChange={(e) => setAtaqueSubtipoDano(e.target.value)} className="rv-focusable" style={{ ...input, width: 220 }} />
      </div>
      <button data-testid="det-calcular-margem" onClick={handleCalcularMargem} disabled={ataqueProcessing} className="rv-btn rv-focusable" style={{ ...btnPrimary, opacity: ataqueProcessing ? 0.6 : 1 }}>
        {ataqueProcessing ? "Calculando…" : "Calcular Margem"}
      </button>
      {ataqueReacaoAviso && <p data-testid="det-ataque-reacao-aviso" style={{ fontSize: 12, color: "#e0b95c", marginTop: 8 }}>{ataqueReacaoAviso}</p>}
      {ataqueResultado && <p data-testid="det-ataque-resultado" style={{ fontSize: 12, opacity: 0.85, marginTop: 10 }}>{ataqueResultado}</p>}
      {ataqueMargemPendente && (
        <div data-testid="det-ataque-margem-pendente" style={{ ...card, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          <strong>Margem {ataqueMargemPendente.margin} ({ataqueMargemPendente.band.band}) — escolha a região atingida</strong>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select data-testid="det-ataque-regiao-select" value={ataqueRegiaoEscolhida} onChange={(e) => setAtaqueRegiaoEscolhida(e.target.value as BodyRegion)} className="rv-focusable" style={input}>
              <option value="">— região —</option>
              {ataqueMargemPendente.band.allowedRegions.map((regiao) => <option key={regiao} value={regiao}>{BODY_REGION_LABELS[regiao]}</option>)}
            </select>
            <button data-testid="det-aplicar-dano" onClick={handleAplicarDano} disabled={ataqueProcessing || !ataqueRegiaoEscolhida} className="rv-btn rv-focusable" style={{ ...btnPrimary, opacity: ataqueProcessing || !ataqueRegiaoEscolhida ? 0.6 : 1 }}>
              {ataqueProcessing ? "Aplicando…" : "Aplicar Dano"}
            </button>
            <button data-testid="det-cancelar-ataque-pendente" onClick={handleCancelarAtaquePendente} disabled={ataqueProcessing} className="rv-btn rv-focusable" style={{ background: "transparent", border: "1px solid #333", borderRadius: 6, padding: "7px 14px", fontSize: 13, cursor: "pointer" }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {ataqueSugestoesCriticas.length > 0 && (
        <div data-testid="det-ataque-propriedades-criticas" style={{ ...card, marginTop: 8 }}>
          <strong>Propriedades críticas — lembretes manuais</strong>
          {ataqueSugestoesCriticas.map((suggestion) => (
            <p key={suggestion.id} style={{ margin: "4px 0 0", fontSize: 12 }}>
              {suggestion.name}: {suggestion.text} Origem: {suggestion.origins.join(", ")}.
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
