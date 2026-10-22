"use server";

import { getScopedTableClient } from "../auth/scopedClient";

/** Renova a presença autenticada sem aceitar um identificador de usuário do cliente. */
export async function heartbeatAccountPresence(): Promise<boolean> {
  try {
    const client = await getScopedTableClient();
    const { error } = await client.rpc("heartbeat_account_presence");
    return !error;
  } catch {
    return false;
  }
}
