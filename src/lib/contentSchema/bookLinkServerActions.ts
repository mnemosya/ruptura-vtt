"use server";

/**
 * Ações administrativas de vínculo editorial (Etapa 11) — criar/remover
 * um `content_book_links`. Mesma disciplina das demais Server Actions:
 * reverifica admin no servidor antes de qualquer escrita (a RLS
 * admin-only da tabela reforça no banco).
 */

import { revalidatePath } from "next/cache";
import { getContentAdminStatus } from "../auth/contentAdmin";
import { criarBookLink, removerBookLink, type NovoVinculoEditorial } from "./bookLinksQueries";

async function requireAdmin(): Promise<{ id: string; email: string | null }> {
  const status = await getContentAdminStatus();
  if (!status.user) throw new Error("Não autenticado.");
  if (!status.isAdmin) throw new Error("Sem acesso administrativo à Biblioteca.");
  return status.user;
}

export interface ResultadoVinculoEditorial {
  ok: boolean;
  erro?: string;
  id?: string;
}

export async function criarVinculoEditorialAction(dados: NovoVinculoEditorial, caminhoRevalidar: string): Promise<ResultadoVinculoEditorial> {
  try {
    const admin = await requireAdmin();
    if (!dados.capitulo || dados.capitulo.trim() === "") return { ok: false, erro: "Capítulo é obrigatório." };
    const resultado = await criarBookLink(admin, dados);
    if (!resultado.ok) return resultado;
    revalidatePath(caminhoRevalidar);
    return { ok: true, id: resultado.id };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}

export async function removerVinculoEditorialAction(id: string, caminhoRevalidar: string): Promise<ResultadoVinculoEditorial> {
  try {
    await requireAdmin();
    const resultado = await removerBookLink(id);
    if (!resultado.ok) return resultado;
    revalidatePath(caminhoRevalidar);
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}
