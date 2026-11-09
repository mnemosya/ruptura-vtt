/** Teclas da Forja só atuam quando a janela dela é a mais recente. */
export function modalSobreForja(raiz: Element | null): boolean {
  if (!raiz) return false;
  return [...document.querySelectorAll(".rc-recorte-janela, [aria-modal='true']")].some((modal) =>
    !modal.contains(raiz) && Boolean(raiz.compareDocumentPosition(modal) & Node.DOCUMENT_POSITION_FOLLOWING),
  );
}

export function eventoDaForjaDisponivel(e: KeyboardEvent, raiz: Element | null): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.defaultPrevented || modalSobreForja(raiz)) return false;
  const alvo = e.target;
  return !(alvo instanceof Element && alvo.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"));
}
