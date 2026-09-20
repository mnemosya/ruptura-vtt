"use server";

import { getScopedTableClient } from "../auth/scopedClient";
import { getCurrentUser } from "../auth/session";

/**
 * "Aparecer offline" (PRES-02) — preferência GLOBAL da conta, aplicada
 * às projeções públicas de presença e a nada além delas. A gravação
 * passa pela RLS de `user_presence_preferences`: cada conta só alcança
 * a própria linha, então não há como esconder ou expor outra pessoa.
 *
 * Ausência de linha é `false`, e não um estado especial — quem nunca
 * tocou na preferência simplesmente aparece.
 */
export async function readAppearOffline(): Promise<{ appearOffline: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Sem sessão.");
    const client = await getScopedTableClient();
    const { data, error } = await client.from("user_presence_preferences")
      .select("appear_offline").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    return { appearOffline: !!data?.appear_offline };
  } catch {
    // Em falha não afirmamos que a pessoa está visível: quem pediu para
    // se esconder não pode descobrir por um erro de leitura que não
    // estava escondido. O chamador trata `error` como "não sei".
    return { appearOffline: false, error: "Não foi possível ler a preferência de presença." };
  }
}

export async function setAppearOffline(value: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Sem sessão.");
    const client = await getScopedTableClient();
    const { error } = await client.from("user_presence_preferences")
      .upsert({ user_id: user.id, appear_offline: value, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw error;
    return { ok: true };
  } catch {
    return { ok: false, error: "Não foi possível salvar a preferência. Tente de novo." };
  }
}
