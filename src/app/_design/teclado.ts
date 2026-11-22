/**
 * Enter que vale como "confirmar" num campo de texto.
 *
 * Durante uma composição (IME de japonês ou chinês, acento morto no
 * macOS: ´ seguido de e), o Enter que fecha a composição chega como
 * `keydown` com `key === "Enter"`. Tratado como envio, ele mandava a
 * mensagem ou confirmava o nome no meio da palavra. Os navegadores
 * marcam esse Enter com `isComposing` e, em alguns casos, só com
 * `keyCode === 229`; por isso os dois testes.
 */

type EventoDeTecla = {
  key: string;
  keyCode?: number;
  isComposing?: boolean;
  nativeEvent?: { isComposing?: boolean };
};

export function compondoTexto(e: EventoDeTecla): boolean {
  return Boolean(e.nativeEvent?.isComposing ?? e.isComposing) || e.keyCode === 229;
}

export function ehEnter(e: EventoDeTecla): boolean {
  return e.key === "Enter" && !compondoTexto(e);
}
