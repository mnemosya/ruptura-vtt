"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContentAdminStatus } from "../../../lib/auth/contentAdmin";
import { getScopedTableClient } from "../../../lib/auth/scopedClient";

const ALLOWED = new Set(["open", "acknowledged", "resolved", "ignored"]);

export async function alterarStatusFinding(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const status = formData.get("status");
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id) || typeof status !== "string" || !ALLOWED.has(status))
    throw new Error("Achado ou status inválido.");
  const admin = await getContentAdminStatus();
  if (!admin.user || !admin.isAdmin) throw new Error("Acesso administrativo necessário.");
  const client = await getScopedTableClient();
  const { error } = await client.rpc("set_ruptura_agent_finding_status", { p_finding_id: id, p_status: status });
  if (error) throw new Error(`Falha ao atualizar achado: ${error.message}`);
  revalidatePath("/admin/ruptura-agent");
  revalidatePath(`/admin/ruptura-agent/${id}`);
  redirect(`/admin/ruptura-agent/${id}`);
}
