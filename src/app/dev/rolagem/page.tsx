/**
 * ÍNDICE DOS PROTÓTIPOS DE ROLAGEM — Dado Normal + Dado de Sobrecarga.
 * Liga as três propostas (`/dev/rolagem-a`, `-b`, `-c`) e traz a ficha
 * de cada uma. Precedente: `/dev/login-a`, `-b`, `-c`.
 */

import { assertDevRouteAllowed } from "../../../lib/dev/guard";
import { Indice } from "./_base/Indice";
import "./_base/indice.css";

export const dynamic = "force-dynamic";

export default function Page() {
  assertDevRouteAllowed();
  return <Indice />;
}
