"use client";

/**
 * UMA LISTA QUE DIZ QUE ROLA — a casca `<ul>` em cima de
 * `useRolagemVelada`, que é quem mede. Existe só pra não repetir o
 * `{...veu.atributos}` em cada lista de cenas.
 */

import { useRolagemVelada } from "../_shell/useRolagemVelada";

export function ListaRolavel({ children, ...resto }: React.ComponentProps<"ul">) {
  const veu = useRolagemVelada<HTMLUListElement>();
  return <ul {...resto} {...veu.atributos}>{children}</ul>;
}
