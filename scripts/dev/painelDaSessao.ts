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

  // ESPERA O PAINEL ESTAR RECOLHIDO — sempre, mesmo sem ponto.
  //
  // A primeira versão retornava aqui quando não recebia ponto, com o
  // clique apenas despachado: quem chamava seguia medindo células com o
  // painel ainda na tela, e as mensagens continuavam dizendo "coberta
  // por DIV.rv-pn-chat-scroll" depois de um recolhimento que parecia ter
  // acontecido. Uma espera que não esperava, dentro do helper escrito
  // para consertar esperas ruins.
  //
  // O sinal é exato, não aproximado: `painel-expandir` só é renderizado
  // quando o painel está recolhido (`{!aberto && ...}` em `PainelAbas`).
  await page.locator('[data-testid="painel-expandir"]').waitFor({ timeout: 5000 });

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

/**
 * Garante que um ponto do mapa esteja ALCANÇÁVEL pelo mouse.
 *
 * Duas coisas tiram um token do alcance, e as duas produzem a mesma
 * falha silenciosa — o gesto acontece no vazio, nada se move, e o
 * critério acusa o que vem depois:
 *
 *   · o painel da sessão flutua POR CIMA do mapa (o `pointerdown` vai
 *     parar no chat);
 *   · o enquadramento inicial pode deixar a célula FORA da viewport, e
 *     `mouse.move` é limitado à janela.
 *
 * Medido em `check-vtt-animacao-movimento`: o token do jogador, que a
 * fixture põe em (7,2) — centro de uma cena de 12 colunas, de propósito
 * —, caía em x≈1489 numa viewport de 1280. Recolher o painel não movia
 * a caixa, e recarregar também não: não era estado herdado, era
 * enquadramento. A falha aparecia como "o jogador não move o próprio
 * token", que sugere autorização.
 *
 * A condição de parada é o token estar alcançável, não um número fixo
 * de cliques de zoom.
 */
export async function garantirTokenAlcancavel(page: Page, sigla: string, tentativas = 5): Promise<boolean> {
  await recolherPainelDaSessao(page);
  for (let i = 0; i <= tentativas; i++) {
    const caixa = await page.evaluate((sig) => {
      const els = Array.from(document.querySelectorAll(".rv-camada-tokens .rv-token text.rv-token-sigla"));
      const el = els.find((e) => e.textContent === sig)?.closest("g");
      const r = el?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    }, sigla);
    const vp = page.viewportSize();
    if (caixa && vp && caixa.x > 0 && caixa.x < vp.width && caixa.y > 0 && caixa.y < vp.height) return true;
    if (i === tentativas) return false;
    await page.locator('.rv-zoom button[aria-label="Afastar"]').click();
    await page.waitForTimeout(120);
  }
  return false;
}

/**
 * Versão geral de `garantirTokenAlcancavel`: serve para qualquer ponto
 * do mapa, não só para um token.
 *
 * Recebe uma FUNÇÃO de medir, e não um ponto pronto, porque afastar o
 * zoom move tudo: um par de coordenadas medido antes do primeiro clique
 * de "Afastar" já não vale depois dele. Quem chama sabe como achar o
 * alvo (a célula (14,5), a alça de largura, o canto de uma área) e
 * remede a cada tentativa.
 *
 * Devolve o ponto alcançável, ou `null` se nem afastando ele couber —
 * e nesse caso quem chama deve FALHAR dizendo isso, em vez de arrastar
 * no vazio e culpar o que vier depois.
 */
export async function garantirAlcancavel(
  page: Page,
  medir: () => Promise<{ x: number; y: number } | null>,
  tentativas = 5,
): Promise<{ x: number; y: number } | null> {
  const primeiro = await medir();
  await recolherPainelDaSessao(page, primeiro ?? undefined);
  for (let i = 0; i <= tentativas; i++) {
    const ponto = await medir();
    const vp = page.viewportSize();
    if (ponto && vp && ponto.x > 0 && ponto.x < vp.width && ponto.y > 0 && ponto.y < vp.height) {
      const emCima = await oQueEstaSob(page, ponto);
      if (!emCima.startsWith("painel")) return ponto;
    }
    if (i === tentativas) return null;
    await page.locator('.rv-zoom button[aria-label="Afastar"]').click();
    await page.waitForTimeout(120);
  }
  return null;
}
