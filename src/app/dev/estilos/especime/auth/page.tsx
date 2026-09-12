/**
 * Espécimes da folha `auth.css`, num documento só dela.
 *
 * Aberta dentro de um `<iframe>` pela família "Repetidos". A folha
 * abaixo é a ÚNICA importada: é isso que impede que ela atropele as
 * outras superfícies da galeria.
 */

import { assertDevRouteAllowed } from "../../../../../lib/dev/guard";
import { Especimes } from "../Especimes";
import { lerItens } from "../lerItens";
import "../../../../_design/auth.css";
import "../especime.css";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ itens?: string }> }) {
  assertDevRouteAllowed();
  const { itens } = await searchParams;
  return <Especimes itens={lerItens(itens)} raiz="rv-mesa" />;
}
