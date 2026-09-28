/**
 * Interações com o gerenciador de token que mudaram de forma e
 * quebraram vários checks de uma vez.
 *
 * O campo **Tamanho** era um `<select id="rv-campo-tamanho">` e virou um
 * SEGMENTADO: `role="radiogroup"`, com um `role="radio"` por categoria.
 * O id não existe mais em lugar nenhum do app, então `selectOption` não
 * tinha o que operar — e quatro checks morriam no primeiro uso, cada um
 * com vários critérios esperando atrás.
 *
 * Fica aqui, e não repetido em cada arquivo, porque foi exatamente a
 * repetição que fez um seletor morto derrubar quatro checks: quando o
 * controle mudar de novo, muda-se um lugar.
 */

import { type Page } from "playwright";

/** Categoria canônica → rótulo que o segmentado mostra (`TAMANHOS` em `_mapa/hex.ts`). */
const ROTULO_TAMANHO: Record<string, string> = {
  pequeno: "Pequeno",
  medio: "Médio",
  grande: "Grande",
  enorme: "Enorme",
  colossal: "Colossal",
};

/** Escolhe o tamanho pelo rótulo visível, aceitando a categoria canônica. */
export async function escolherTamanhoDoToken(page: Page, categoria: string): Promise<void> {
  await page
    .locator('.rv-segmentado[aria-label="Tamanho"] button[role="radio"]')
    .filter({ hasText: ROTULO_TAMANHO[categoria] ?? categoria })
    .first()
    .click();
}

/**
 * Fecha o gerenciador por "Continuar para posicionar" e entra de fato
 * no modo de posicionamento.
 *
 * ── O que mudou, e por que três checks pararam juntos ───────────────
 * Havia um aviso geral `.rv-escolha-posicao` logo depois de confirmar,
 * e era por ele que os checks sabiam que o modo tinha começado. Hoje
 * esse elemento só existe no caso de ERRO:
 *
 *     {fluxoToken?.fase === "erro" && (
 *       <div className="rv-escolha-posicao" ... data-fase="erro">
 *
 * No fluxo normal ele não é renderizado. Quem sinaliza o modo é a
 * camada no mapa (`.rv-camada-posicionamento-token`) — e ela só existe
 * quando há ÂNCORA, que nasce do ponteiro sobre uma célula
 * (`posicionamentoToken?.ativo && posicionamentoToken.ancora`).
 *
 * Esperar o aviso antigo era esperar por algo que não existe mais;
 * esperar a camada sem mover o ponteiro é esperar por algo que, por
 * construção, ainda não pode ter sido desenhado. Daí a ordem daqui:
 * confirmar, ver o gerenciador sair, mover o ponteiro, então esperar a
 * camada.
 */
export async function continuarParaPosicionar(page: Page, nome?: string): Promise<void> {
  if (nome !== undefined) {
    await page.locator(".rv-gerenciador-token input[type=text]").first().fill(nome);
  }
  await page.locator(".rv-gerenciador-token .rv-btn--pri", { hasText: "Continuar para posicionar" }).click();
  await page.locator(".rv-gerenciador-token").waitFor({ state: "detached", timeout: 8000 });

  const primeira = await page.locator(".rv-camada-grade path").first().boundingBox();
  if (primeira) {
    await page.mouse.move(primeira.x + primeira.width / 2, primeira.y + primeira.height / 2, { steps: 3 });
  }
  await page.waitForSelector(".rv-camada-posicionamento-token", { timeout: 8000 });
}
