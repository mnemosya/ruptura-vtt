/**
 * ESTUDO da entrada da marca RUPTURA no login. Só visual; a tela real é /login.
 */

import { TituloEstudo } from "../_login-estudos/TituloEstudo";
import { assertDevRouteAllowed } from "../../../lib/dev/guard";

export default function Page() {
  assertDevRouteAllowed();
  return <TituloEstudo />;
}
