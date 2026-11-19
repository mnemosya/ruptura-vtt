/**
 * ESTUDO de composição da tela de acesso — direção C. Só visual: os
 * campos aceitam digitação, mas nada é enviado. A tela real é /login.
 */

import { EstudoC } from "../_login-estudos/Estudos";
import { assertDevRouteAllowed } from "../../../lib/dev/guard";

export default function Page() {
  assertDevRouteAllowed();
  return <EstudoC />;
}
