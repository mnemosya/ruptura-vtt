/**
 * Tirar o painel da sessão da frente do mapa, antes de qualquer gesto
 * de ponteiro.
 *
 * ── Por que isto precisa existir ────────────────────────────────────
 * O painel FLUTUA sobre o mapa — `position: absolute`, por decisão
 * registrada em `vtt.css` ("docado, o espaço dele saía da largura do
 * mapa e a margem virava uma tira do fundo da mesa"). Quem clica numa
 * coordenada debaixo dele acerta o painel, não o mapa.
 *
 * Para um teste que arrasta tokens, isso é veneno silencioso: o
 * `boundingBox` do token existe e tem as coordenadas certas, o
 * `mouse.down` acontece sem erro, e o `pointerdown` vai para o chat.
 * Nada se move, nada falha ali — a falha aparece passos adiante, com a
 * cara errada.
 *
 * Aconteceu duas vezes, em dois checks, com sintomas diferentes:
 *
 *   · `check-vtt-movimento-consultivo` acusava o Realtime de não
 *     entregar a posição para a outra sessão;
 *   · `check-vtt-pegada-reparo` acusava a regra consultiva de não
 *     desenhar a linha âmbar nem o aviso.
 *
 * Nos dois, `document.elementFromPoint` no ponto de origem do arraste
 * devolveu `rv-pn-chat-scroll`. Nenhum dos dois tinha defeito no
 * produto que acusava.
 */

import { type Page } from "playwright";

/**
 * Recolhe o painel e ESPERA o ponto de interesse ficar livre.
 *
 * `pontoQuePrecisaFicarLivre` é onde o teste vai clicar. A espera é por
 * condição — "esse ponto não pertence mais ao painel" —, não por tempo:
 * é a única forma de saber que a animação de recolher terminou naquele
 * ponto específico, que é tudo o que importa aqui.
 *
 * Sem ponto, só recolhe.
 */
export async function recolherPainelDaSessao(
  page: Page,
  pontoQuePrecisaFicarLivre?: { x: number; y: number },
): Promise<void> {
  const recolher = page.locator('[data-testid="painel-recolher"]');
  if ((await recolher.count()) === 0) return; // já recolhido
  await recolher.click();
  if (!pontoQuePrecisaFicarLivre) return;
  await page.waitForFunction(
    ([x, y]) => !document.elementFromPoint(x, y)?.closest?.(".rv-painel"),
    [pontoQuePrecisaFicarLivre.x, pontoQuePrecisaFicarLivre.y],
    { timeout: 5000 },
  );
}

/**
 * O que está sob um ponto, na linguagem do VTT. Usado para acusar a
 * causa certa quando um gesto não surte efeito, em vez de deixar o
 * teste falhar três passos adiante culpando outra coisa.
 */
export async function oQueEstaSob(page: Page, ponto: { x: number; y: number }): Promise<string> {
  return page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y) as Element | null;
    if (!el) return "(nada)";
    if (el.closest(".rv-token")) return "token";
    if (el.closest(".rv-painel")) return `painel (${el.getAttribute("class") ?? ""})`;
    if (el.closest(".rv-ferramentas")) return "trilho de ferramentas";
    if (el.closest(".rv-mapa")) return "mapa";
    return el.getAttribute("class") || el.tagName;
  }, [ponto.x, ponto.y]);
}
