"use client";

/**
 * Container decoration — o MESMO componente de decoração de painel já
 * usado no login (`DecoTop` de `rv-deco-*`, auth.css) e na área
 * autenticada / "minhas campanhas" (`DecoTop` de `mesas/_global/parts`,
 * `ra-deco-*` em app.css): duas linhas finas empilhadas no topo do
 * container, a de cima curta e mais forte, a de baixo cheia e mais
 * fraca.
 *
 * Redeclarado aqui no namespace `rc-` em vez de importado de
 * `mesas/_global/parts` porque cada folha da linguagem HUD é
 * autocontida (é assim que `rv-` e `ra-` já convivem, com os mesmos
 * valores) — o Console não carrega `app.css`, então importar o
 * componente de lá traria markup sem estilo.
 *
 * O pai precisa ser `position: relative`.
 */
export function DecoTop() {
  return (
    <div className="rc-deco-top" aria-hidden="true">
      <div className="rc-deco-a" />
      <div className="rc-deco-b" />
    </div>
  );
}
