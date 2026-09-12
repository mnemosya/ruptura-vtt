"use client";

/**
 * Espécimes de UM sistema de design, para rodar dentro de um iframe.
 *
 * Por que iframe: `mesa.css`, `app.css` e `auth.css` assumem que são
 * DONAS do documento — `.rv-seg-btn` é `flex: 1`, `.auth-submit-btn` é
 * `width: 100%`, e auth.css ancora decoração em `position: fixed`.
 * Importadas na mesma página, elas se atropelam e levam a galeria
 * junto (foi o que aconteceu).
 *
 * Cada item chega como `classe|rótulo|papel`. O RÓTULO é o texto que o
 * botão mostra no produto, não o nome da classe: uma versão anterior
 * usou o nome da classe como conteúdo, e a grade virou "btn",
 * "ferr-btn", "area-item-acao" — sem dizer o que a peça é, e quebrando
 * os botões só de ícone.
 */

export interface Item { classe: string; rotulo: string; papel: string }

/**
 * A RAIZ envolve só o BOTÃO, nunca a moldura.
 *
 * Primeira tentativa punha `.rm-root`/`.ra-root` em volta da grade
 * inteira, e as folhas alcançaram o rótulo e o nome da classe — texto
 * sobrepondo botão. A regra aqui é a mesma da galeria: nada da moldura
 * entra na peça, e nada da peça alcança a moldura.
 */
export function Especimes({ itens, raiz }: { itens: Item[]; raiz: string }) {
  return (
    <div className="esp-grade">
      {itens.map((i) => (
        <div key={i.classe} className="esp-cel">
          <div className="esp-palco">
            <div className={raiz}>
              <button type="button" className={i.classe}>{i.rotulo}</button>
            </div>
          </div>
          <strong>{i.papel}</strong>
          <code>.{i.classe}</code>
        </div>
      ))}
    </div>
  );
}
