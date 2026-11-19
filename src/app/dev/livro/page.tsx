/**
 * ESTUDO — o Compêndio como LIVRO DIGITAL (`/dev/livro`).
 *
 * Fica ao lado do Compêndio real, que não é tocado: mesma fonte de
 * conteúdo, outra forma de ler (página dupla, folhear, dedeiras, fita).
 * Guardada por `assertDevRouteAllowed`, como as demais rotas `/dev`.
 */
import { assertDevRouteAllowed } from "../../../lib/dev/guard";
import { carregarIndice } from "./dados";
import { LivroDigital } from "./LivroDigital";
import "./livro.css";

export const dynamic = "force-dynamic";

export default async function DevLivroPage() {
  assertDevRouteAllowed();
  const indice = await carregarIndice();
  return <LivroDigital indice={indice} />;
}
