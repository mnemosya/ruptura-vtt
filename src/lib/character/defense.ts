/**
 * Resolução pura de MIT (armadura) / PD (escudo) contra dano recebido
 * — checkpoint v0.58, fase 2 (PRD 13.5/13.6/8.6). Função pura: só
 * calcula números a partir do estado defensivo ATUAL (equipado na
 * Fase 1, `getEquippedDefenseProfile`) — não muta o personagem, não
 * decide qual reação foi usada, não aplica ao PV/PE (isso é a Fase 3
 * deste checkpoint).
 *
 * Regra canônica confirmada em `db_equipamentos_normalizado_v1_2.json`
 * (enums) e PRD 13.5/13.6/8.6, ANTES da implementação:
 *   - MIT (armadura) resolve num "Acerto" normal (sem Bloquear); PD
 *     (escudo/proteção) resolve especificamente quando o defensor
 *     escolhe "Bloquear" — nunca os dois na mesma resolução (não há
 *     região corporal/sobreposição modelada ainda, PRD 13.5).
 *   - `tipo_protecao` (enum: "fisica"/"energetica"/"hibrida") só
 *     absorve dano do `tipo_dano` correspondente ("fisico"/
 *     "energetico"); "hibrida" absorve os dois. Sem dado de tipo (nem
 *     do dano nem da proteção), NÃO aplica — nunca inventa uma
 *     correspondência.
 *   - `subtipo_dano` (mesmo enum que já lista "perfurante"/"acido"
 *     lado a lado com "cortante"/"contundente" — ambos SUBTIPOS de
 *     dano físico, não categorias de proteção próprias): "perfurante"
 *     ignora 1 MIT NESTE golpe (`Perfuração ignora 1 MIT`); "acido"
 *     dobra a redução de MIT (em vez de descer 1 ponto, desce 2)
 *     (`Ácido corrói MIT com penalidade dobrada`) — só quando o tipo
 *     de proteção já absorveria o dano físico (não se aplica se a
 *     armadura for só "energetica").
 *   - Bloquear: PD absorve, excesso passa ao defensor (`PD atual/
 *     máximo`, `Bloquear desconta PD`, `Excesso passa ao defensor`).
 *   - MIT/PD nunca ficam negativos; dano 0 não altera nada.
 *   - Sem armadura/escudo equipado (ou sem o equipamento certo para a
 *     reação usada): dano passa integralmente — comportamento antigo
 *     preservado (`applyAttackDamage` continua igual sem MIT/PD).
 */

export interface DefenseSourceInput {
  /** MIT ou PD atual antes desta resolução. */
  atual: number;
  max: number;
  /** `estatisticas.tipo_protecao` do modelo — `null` = dado ausente, nunca inventado. */
  tipoProtecao: string | null;
}

export interface ResolveDamageWithMitPdParams {
  damageAmount: number;
  /** `tipo_dano` do ataque (ex.: "fisico"/"energetico") — ausente = MIT/PD não é aplicado (sem dado para confirmar o tipo). */
  damageType?: string;
  /** `subtipo_dano` do ataque (ex.: "perfurante"/"acido"/"cortante") — usado só para os modificadores de MIT do PRD 13.5. */
  damageSubtype?: string;
  /** true quando o defensor usou a reação Bloquear (PRD 8.6) — nesse caso resolve contra PD, nunca MIT. */
  wasBlocked: boolean;
  /** Armadura equipada (fonte de MIT) — ausente = sem armadura ativa. */
  armor?: DefenseSourceInput;
  /** Escudo/proteção equipado (fonte de PD) — ausente = sem escudo ativo. */
  shield?: DefenseSourceInput;
}

export interface ResolveDamageWithMitPdResult {
  damageAmount: number;
  wasBlocked: boolean;
  mitigatedByMit: number;
  mitigatedByPd: number;
  mitBefore: number | null;
  mitAfter: number | null;
  pdBefore: number | null;
  pdAfter: number | null;
  /** Dano que efetivamente passa para PV/PE do defensor. */
  finalDamage: number;
  /** Resumo textual pronto para log/table_log — nunca JSON cru. */
  summary: string;
}

/** `tipo_protecao` só absorve o `tipo_dano` correspondente; "hibrida" absorve físico e energético. Sem dado suficiente, não confirma (fallback seguro: não aplica). */
function protectionMatchesDamageType(tipoProtecao: string | null, damageType: string | undefined): boolean {
  if (!tipoProtecao || !damageType) return false;
  if (tipoProtecao === "hibrida") return damageType === "fisico" || damageType === "energetico";
  if (tipoProtecao === "fisica") return damageType === "fisico";
  if (tipoProtecao === "energetica") return damageType === "energetico";
  return false;
}

function emptyMitPd(armor: DefenseSourceInput | undefined, shield: DefenseSourceInput | undefined) {
  return {
    mitBefore: armor?.atual ?? null,
    mitAfter: armor?.atual ?? null,
    pdBefore: shield?.atual ?? null,
    pdAfter: shield?.atual ?? null,
  };
}

/**
 * Resolve dano recebido contra MIT (sem Bloquear) ou PD (com
 * Bloquear). Puro — devolve os números novos, quem chama decide
 * aplicar ao personagem (Fase 3).
 */
export function resolveDamageWithMitPd(params: ResolveDamageWithMitPdParams): ResolveDamageWithMitPdResult {
  const { damageAmount, damageType, damageSubtype, wasBlocked, armor, shield } = params;

  if (damageAmount <= 0) {
    return {
      damageAmount,
      wasBlocked,
      mitigatedByMit: 0,
      mitigatedByPd: 0,
      ...emptyMitPd(armor, shield),
      finalDamage: 0,
      summary: "Sem dano a resolver.",
    };
  }

  if (wasBlocked) {
    if (!shield) {
      return {
        damageAmount,
        wasBlocked,
        mitigatedByMit: 0,
        mitigatedByPd: 0,
        ...emptyMitPd(armor, shield),
        finalDamage: damageAmount,
        summary: "Bloqueio sem escudo/proteção equipado — dano passa integralmente.",
      };
    }
    const matches = protectionMatchesDamageType(shield.tipoProtecao, damageType);
    const pdAbsorbed = matches ? Math.min(shield.atual, damageAmount) : 0;
    const pdAfter = Math.max(0, shield.atual - pdAbsorbed);
    const finalDamage = damageAmount - pdAbsorbed;
    return {
      damageAmount,
      wasBlocked,
      mitigatedByMit: 0,
      mitigatedByPd: pdAbsorbed,
      mitBefore: armor?.atual ?? null,
      mitAfter: armor?.atual ?? null,
      pdBefore: shield.atual,
      pdAfter,
      finalDamage,
      summary: matches
        ? `Bloqueio: PD absorveu ${pdAbsorbed} (PD ${shield.atual} → ${pdAfter}); ${finalDamage} de dano passou ao defensor.`
        : `Bloqueio: proteção não cobre o tipo de dano — PD não absorveu; ${finalDamage} de dano passou ao defensor.`,
    };
  }

  // Sem Bloquear — resolve contra MIT da armadura.
  if (!armor) {
    return {
      damageAmount,
      wasBlocked,
      mitigatedByMit: 0,
      mitigatedByPd: 0,
      ...emptyMitPd(armor, shield),
      finalDamage: damageAmount,
      summary: "Sem armadura equipada — dano passa integralmente.",
    };
  }
  const matches = protectionMatchesDamageType(armor.tipoProtecao, damageType);
  const perfurante = matches && damageSubtype === "perfurante";
  const acido = matches && damageSubtype === "acido";
  const mitEfetivo = matches ? Math.max(0, armor.atual - (perfurante ? 1 : 0)) : 0;
  const mitAbsorbed = matches ? Math.min(mitEfetivo, damageAmount) : 0;
  const acidoMultiplier = acido ? 2 : 1;
  const mitAfter = Math.max(0, armor.atual - mitAbsorbed * acidoMultiplier);
  const finalDamage = damageAmount - mitAbsorbed;

  const detalhes = [
    perfurante && "perfuração ignora 1 MIT neste golpe",
    acido && "ácido dobra a redução de MIT",
  ].filter((d): d is string => Boolean(d));

  return {
    damageAmount,
    wasBlocked,
    mitigatedByMit: mitAbsorbed,
    mitigatedByPd: 0,
    mitBefore: armor.atual,
    mitAfter,
    pdBefore: shield?.atual ?? null,
    pdAfter: shield?.atual ?? null,
    finalDamage,
    summary: matches
      ? `MIT absorveu ${mitAbsorbed} (MIT ${armor.atual} → ${mitAfter}${detalhes.length > 0 ? `, ${detalhes.join(", ")}` : ""}); ${finalDamage} de dano passou ao defensor.`
      : `Armadura não cobre o tipo de dano — MIT não absorveu; ${finalDamage} de dano passou ao defensor.`,
  };
}
