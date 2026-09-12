"use server";

/**
 * Resolução interativa de COMBATE a partir do card do feed.
 *
 * Hoje um passo: **aplicar dano**. É a operação que estava presa dentro
 * do componente `/dev/table` (`handleGmDamage`, estado local, sem
 * proteção contra repetição) e que o painel precisa chamar de um jeito
 * que aguente o mundo real.
 *
 * Cinco garantias, todas do lado do servidor:
 *
 *  1. AUTORIZADA  — `exigirNarradorPainel`, e a RLS de `characters` só
 *     autoriza o dono da campanha a escrever PV alheio de qualquer
 *     forma.
 *  2. CANÔNICA    — a regra de dano é `applyGmDamage`
 *     (`lib/character/gmActions.ts`), a mesma do resto do produto.
 *     Nada de aritmética nova aqui.
 *  3. PERSISTENTE — grava no personagem e registra o evento no log.
 *  4. IDEMPOTENTE — a trava é a PK `(workflow_id, step)` de
 *     `campaign_workflow_steps` (migration 0091). O segundo envio do
 *     MESMO passo é recusado pelo BANCO, não por um booleano de
 *     interface: duplo clique, retry de rede e duas sessões
 *     simultâneas convergem para uma aplicação só.
 *  5. ORDEM SEGURA — a trava é inserida ANTES de mexer no personagem.
 *     Se a inserção falha por conflito, ninguém tomou dano; se ela
 *     passa e a escrita seguinte falha, o passo fica marcado e a
 *     mensagem diz o que aconteceu — nunca dano dobrado.
 */

import { getScopedTableClient } from "../../../../../../lib/auth/scopedClient";
import { getCurrentUser } from "../../../../../../lib/auth/session";
import { getCharacter, updateCharacter } from "../../../../../../lib/character/storage";
import { applyGmDamage, normalizeCharacter } from "../../../../../../lib/character";
import { addLog } from "../../../../../../lib/table/storage";
import type { TableLogEntry } from "../../../../../../lib/table";
import { exigirNarradorPainel, mensagemDeErro, type ResultadoPainel } from "./comum";

const TABELA_PASSOS = "campaign_workflow_steps";
const PASSO_DANO = "aplicar_dano";

export interface ResultadoAplicacaoDano {
  /** `true` quando ESTA chamada foi a que aplicou; `false` quando o passo já estava aplicado. */
  aplicadoAgora: boolean;
  pvAntes: number;
  pvDepois: number;
  alvoNome: string;
}

/** Lê a entrada de log do ataque, pelo id, já filtrada por visibilidade no servidor. */
async function lerEntrada(campaignId: string, logId: string): Promise<TableLogEntry | null> {
  const client = await getScopedTableClient();
  const { data, error } = await client
    .from("table_logs")
    .select()
    .eq("id", logId)
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TableLogEntry | null) ?? null;
}

/**
 * Aplica o dano de um ataque já resolvido ao personagem alvo.
 *
 * O cliente manda só o ID DA LINHA de log do ataque — nunca o valor do
 * dano nem o alvo. Os dois são relidos do payload gravado, então um
 * browser adulterado não consegue aplicar 999 de dano em quem quiser.
 */
export async function aplicarDanoDoAtaqueAction(params: {
  campaignId: string;
  /** `table_logs.id` do evento de ataque. */
  logId: string;
}): Promise<ResultadoPainel<ResultadoAplicacaoDano>> {
  const v = await exigirNarradorPainel(params.campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };

  try {
    const entrada = await lerEntrada(params.campaignId, params.logId);
    if (!entrada) return { ok: false, erro: "Este ataque não está mais disponível." };

    const p = entrada.payload as Record<string, unknown>;
    const workflowId = typeof p.workflowId === "string" && p.workflowId ? p.workflowId : entrada.id;
    const dano = typeof p.dano === "number" ? p.dano : typeof p.danoTotal === "number" ? p.danoTotal : null;
    const alvoId =
      typeof p.alvoCharacterId === "string"
        ? p.alvoCharacterId
        : typeof p.defensorCharacterId === "string"
          ? p.defensorCharacterId
          : typeof p.targetCharacterId === "string"
            ? p.targetCharacterId
            : null;

    if (dano == null || dano <= 0) return { ok: false, erro: "Este ataque não registrou dano a aplicar." };
    if (!alvoId) return { ok: false, erro: "Este ataque não registrou um personagem alvo." };

    const alvo = await getCharacter(alvoId);
    if (!alvo) return { ok: false, erro: "Personagem alvo não encontrado." };
    if (alvo.campaign_id !== params.campaignId) return { ok: false, erro: "O alvo não é desta campanha." };

    const client = await getScopedTableClient();
    const usuario = await getCurrentUser();

    // ── A TRAVA. Antes de qualquer escrita no personagem. ──
    const { error: erroPasso } = await client.from(TABELA_PASSOS).insert({
      campaign_id: params.campaignId,
      workflow_id: workflowId,
      step: PASSO_DANO,
      log_id: entrada.id,
      resultado: { dano, alvoId },
      applied_by: usuario?.id ?? null,
    });
    if (erroPasso) {
      // 23505 = unique_violation: o passo JÁ foi aplicado. Não é erro
      // para quem clicou — é a resposta certa, e devolve o estado atual.
      if (erroPasso.code === "23505") {
        const atual = normalizeCharacter(alvo.payload);
        const pv = atual.recursos_atuais?.pv ?? 0;
        return {
          ok: true,
          dados: { aplicadoAgora: false, pvAntes: pv, pvDepois: pv, alvoNome: alvo.name },
        };
      }
      throw new Error(erroPasso.message);
    }

    // ── Regra canônica de dano. ──
    const personagem = normalizeCharacter(alvo.payload);
    const agoraIso = new Date().toISOString();
    const resultado = applyGmDamage(personagem, "pv", dano, agoraIso);
    const salvo = await updateCharacter(alvoId, resultado.character);

    try {
      await addLog({
        campaignId: params.campaignId,
        characterId: alvoId,
        type: "attack_damage_applied",
        visibility: entrada.visibility,
        payload: {
          // Snapshot completo do ataque, para o card se redesenhar sem
          // depender de reler o evento original.
          ...p,
          workflowId,
          ataqueLogId: entrada.id,
          characterNome: salvo.name,
          alvoNome: salvo.name,
          alvoCharacterId: alvoId,
          dano,
          pvAntes: resultado.before,
          pvDepois: resultado.after,
          source: "vtt_painel_combate",
        },
      });
    } catch {
      // O dano já foi aplicado e a trava já está gravada; falhar o log
      // não pode desfazer nem repetir a aplicação.
    }

    return {
      ok: true,
      dados: { aplicadoAgora: true, pvAntes: resultado.before, pvDepois: resultado.after, alvoNome: salvo.name },
    };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao aplicar o dano.") };
  }
}

/**
 * Passos já aplicados desta campanha — o card usa para nascer no estado
 * certo depois de um reload, sem inferir nada da interface.
 */
export async function lerPassosAplicadosAction(campaignId: string): Promise<ResultadoPainel<Record<string, string[]>>> {
  const v = await exigirNarradorPainel(campaignId);
  if (!v.ok) return { ok: true, dados: {} }; // jogador não precisa da trava; o card já não oferece a ação
  try {
    const client = await getScopedTableClient();
    const { data, error } = await client
      .from(TABELA_PASSOS)
      .select("workflow_id, step")
      .eq("campaign_id", campaignId)
      .order("applied_at", { ascending: false })
      .limit(400);
    if (error) throw new Error(error.message);
    const mapa: Record<string, string[]> = {};
    for (const r of (data ?? []) as { workflow_id: string; step: string }[]) {
      (mapa[r.workflow_id] ??= []).push(r.step);
    }
    return { ok: true, dados: mapa };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao ler o estado dos workflows.") };
  }
}
