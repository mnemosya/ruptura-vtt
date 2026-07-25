/**
 * Guard central das 5 rotas `/dev` (`/dev/login`, `/dev/auth/status`,
 * `/dev/character-sheet`, `/dev/join/[campaignId]`, `/dev/table`) —
 * promoção de mesa/log para produção. Nenhuma delas tinha checagem de
 * ambiente (auditoria confirmou acesso público em produção só por
 * conhecer a URL, `/dev/table` em particular vê todas as mesas de
 * todos os narradores sem filtro por dono).
 *
 * Em desenvolvimento (`NODE_ENV !== "production"`) as rotas continuam
 * acessíveis sem mudança nenhuma. Fora disso, só ficam acessíveis com
 * a feature flag explícita `DEV_ROUTES_ENABLED=true` (uso: ambiente de
 * preview usado para validação) — nunca lida no client, nunca exposta
 * como segredo.
 *
 * Chame no topo de cada `page.tsx` de rota `/dev`, ANTES de qualquer
 * busca de dado — `notFound()` interrompe a renderização do Server
 * Component lançando, então nada depois desta chamada roda quando o
 * guard barra o acesso (sem UI parcial, sem dado exposto).
 */

import { notFound } from "next/navigation";

export function assertDevRouteAllowed(): void {
  const isDevelopment = process.env.NODE_ENV !== "production";
  const previewFlagEnabled = process.env.DEV_ROUTES_ENABLED === "true";
  if (!isDevelopment && !previewFlagEnabled) {
    notFound();
  }
}
