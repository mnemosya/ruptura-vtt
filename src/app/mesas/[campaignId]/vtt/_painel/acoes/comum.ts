import "server-only";

/**
 * Peças compartilhadas pelas Server Actions do painel lateral da Mesa.
 *
 * Módulo `server-only` SEM `"use server"` de propósito: um arquivo de
 * Server Actions só pode exportar funções assíncronas, então
 * `ResultadoPainel` (tipo) e `exigirAcessoPainel`/`exigirNarrador`
 * (helpers síncronos na assinatura pública que outros arquivos
 * importam, não expostos como ação chamável pelo cliente) precisam
 * morar fora deles. Mesma separação que `lib/campaign/session.ts` faz
 * em relação a `sessionActions.ts`.
 *
 * Toda ação do painel começa por aqui: `resolveCampaignAccess` —
 * NUNCA confia que o `campaignId` que chegou do browser é onde a conta
 * de fato tem acesso. A RLS continua sendo a garantia forte; isto é a
 * garantia de UX (erro cedo, em português, sem ida ao Postgres pra
 * descobrir "você não é membro desta campanha").
 */

import { resolveCampaignAccess, type CampaignAccess } from "../../../../../../lib/campaign/access";

export interface ResultadoPainel<T = undefined> {
  ok: boolean;
  erro?: string;
  dados?: T;
}

type AcessoOk = Extract<CampaignAccess, { kind: "ok" }>;

/**
 * Discriminada por `ok` (não por "tem `erro`?"): uma checagem de
 * verdade em `erro: string` deixaria a string VAZIA passar como
 * sucesso, e o TypeScript, com razão, não estreita `acesso` nesse
 * caso.
 */
export type AcessoPainel = { ok: false; erro: string } | { ok: true; acesso: AcessoOk };

export async function exigirAcessoPainel(campaignId: string): Promise<AcessoPainel> {
  const acesso = await resolveCampaignAccess(campaignId);
  if (acesso.kind !== "ok") {
    return { ok: false, erro: acesso.kind === "no_session" ? "Sessão expirada." : "Você não tem acesso a esta campanha." };
  }
  return { ok: true, acesso };
}

/** Variante estrita para as ações administrativas do diretório (criar/mover/arquivar/pastas). */
export async function exigirNarradorPainel(campaignId: string): Promise<AcessoPainel> {
  const v = await exigirAcessoPainel(campaignId);
  if (!v.ok) return v;
  if (v.acesso.role !== "narrator") return { ok: false, erro: "Só o narrador pode fazer isso nesta campanha." };
  return v;
}

/** Mensagem de erro legível a partir de qualquer coisa lançada — nunca `[object Object]` na tela. */
export function mensagemDeErro(e: unknown, padrao: string): string {
  return e instanceof Error && e.message ? e.message : padrao;
}
