/**
 * Abrir um rascunho de edição a partir de conteúdo publicado — pelos
 * DOIS caminhos que o app tem, sem o check precisar saber qual.
 *
 * ── Por que existem dois ────────────────────────────────────────────
 * Conteúdo COM metadata editorial (tabela `content_editor_metadata`,
 * migration 0023) vai direto para `/rascunhos/<uuid>`. Conteúdo SEM
 * passa antes pelo diagnóstico de conversão, em
 * `/rascunhos/legado/<tipo>/<slug>`, e só depois de "Iniciar rascunho
 * de edição" chega ao rascunho — comportamento deliberado da Etapa 6.
 *
 * Na prática, hoje, TODO o acervo é do segundo tipo: 450 documentos
 * publicados, zero linhas de metadata editorial, porque o conteúdo foi
 * seedado antes de o Editor existir e a conversão acontece sob demanda.
 * Mas conteúdo criado pelo próprio Editor (o que os checks publicam)
 * nasce com metadata e segue o caminho rápido — então os dois caminhos
 * são reais e um check pode encontrar qualquer um.
 *
 * ── Por que isto é uma função, e não código repetido ────────────────
 * `check-admin-content-drafts` e `check-admin-effect-builder` faziam a
 * mesma navegação, os dois esperando só o caminho rápido, e os dois
 * morriam no mesmo `waitForURL` quando o app passou a desviar. Corrigir
 * em dois lugares convida a corrigir em um só da próxima vez.
 */

import { type Page } from "playwright";
import { BASE_URL } from "./authSession";

/**
 * Clica "Criar rascunho de edição" na página de detalhe já aberta,
 * atravessa o diagnóstico de conversão se ele aparecer, e devolve o id
 * do rascunho.
 */
export interface RascunhoDeEdicao {
  id: string;
  /** Passou pelo diagnóstico de conversão (conteúdo sem metadata editorial). */
  viaLegado: boolean;
}

export async function abrirRascunhoDeEdicao(page: Page): Promise<RascunhoDeEdicao> {
  await page.getByRole("button", { name: "Criar rascunho de edição" }).click();
  await page.waitForURL(/\/admin\/biblioteca\/rascunhos\/(legado\/|[0-9a-f-]{36})/, { timeout: 10000 });

  const viaLegado = page.url().includes("/rascunhos/legado/");
  if (viaLegado) {
    await page.getByRole("button", { name: "Iniciar rascunho de edição" }).click();
    await page.waitForURL(/\/admin\/biblioteca\/rascunhos\/[0-9a-f-]{36}/, { timeout: 15000 });
  }
  return { id: page.url().split("/").pop()!, viaLegado };
}

/** Abre o detalhe do conteúdo publicado e devolve o rascunho de edição dele. */
export async function abrirRascunhoDeEdicaoDe(page: Page, contentType: string, slug: string): Promise<RascunhoDeEdicao> {
  await page.goto(`${BASE_URL}/admin/biblioteca/${contentType}/${slug}`, { waitUntil: "domcontentloaded" });
  return abrirRascunhoDeEdicao(page);
}

/**
 * Salva o rascunho e ESPERA o salvamento terminar.
 *
 * Três checks faziam `click()` em "Salvar rascunho" e, na linha
 * seguinte, `page.reload()`. Entre as duas não havia espera nenhuma: o
 * reload podia chegar antes de a ação de servidor completar, e aí o
 * campo recém-preenchido sumia — não porque o app não persistiu, mas
 * porque o teste recarregou antes de ele ter chance.
 *
 * O sintoma acusava o app de um defeito que era do teste: "Tipo de
 * companheiro deveria persistir após recarregar".
 *
 * A espera é por CONDIÇÃO, não por tempo: o próprio botão fica
 * desabilitado e escreve "Salvando..." enquanto a ação corre, então
 * esperar ele voltar a ficar habilitado é esperar exatamente o fim do
 * salvamento — em qualquer máquina, sob qualquer carga.
 */
export async function salvarRascunho(page: Page): Promise<void> {
  const botao = page.locator('[data-testid="rascunho-salvar"]');
  await botao.click();
  // As DUAS bordas, nesta ordem. A primeira versão disto esperava só
  // "não está salvando" e `:not([disabled])` — as duas condições já são
  // verdadeiras com o botão em repouso, então a função retornava antes
  // de o salvamento sequer começar: uma espera que não esperava nada.
  await botao.filter({ hasText: "Salvando" }).waitFor({ timeout: 15000 });
  await botao.filter({ hasText: "Salvar rascunho" }).waitFor({ timeout: 30000 });
}
