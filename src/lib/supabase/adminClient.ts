import "server-only";

/**
 * Cliente Supabase com SERVICE ROLE — a ÚNICA exceção à regra que o
 * resto do projeto segue.
 *
 * `auth/scopedClient.ts` diz, com todas as letras, que sempre usa a
 * chave anon e "nunca a service role key". Isso continua verdade para
 * todo o domínio: ficha, mesa, log, conteúdo, VTT. A exceção existe
 * porque UMA operação não tem como ser feita com a chave anon sem
 * abrir um buraco:
 *
 *   Assinar uma URL do Storage exige permissão de leitura sobre o
 *   objeto. Se déssemos essa permissão ao participante (via policy em
 *   `storage.objects`), ele passaria a poder assinar POR FORA da
 *   interface — inclusive o caminho de um tile escondido ou de uma cena
 *   que o narrador ainda não revelou. O bucket privado viraria enfeite.
 *
 * Então ninguém recebe essa permissão, e quem assina é este cliente,
 * server-only, depois que uma RPC decidiu a autorização id por id
 * (`vtt_asset_assinavel_para`, migration 0100).
 *
 * REGRAS DE USO — não são sugestão:
 *   • só `lib/vtt/imageService.ts` importa este módulo;
 *   • nenhuma Server Action de domínio o toca;
 *   • nada aqui recebe input do cliente sem ter passado por uma RPC de
 *     autorização antes (o caminho no bucket é DERIVADO no banco, via
 *     `vtt_imagem_storage_path`, nunca enviado pelo browser).
 *
 * Requer `SUPABASE_SERVICE_ROLE_KEY`. Em ambiente que não a tenha (dev
 * anon, scripts de leitura), devolve `null` — quem chama trata como
 * "upload de imagem indisponível", como `browserClient.ts` trata a
 * ausência das env vars públicas.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

export function getAdminSupabaseClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    cached = null;
    return null;
  }

  // Sem sessão e sem refresh: esta conexão não representa usuário
  // nenhum. `auth.uid()` é NULL do lado do Postgres, e é por isso que
  // as RPCs chamadas por aqui recebem o usuário como PARÂMETRO
  // explícito em vez de deduzi-lo.
  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
