/**
 * Rota DEV de login — /dev/login. Reusa o formulário compartilhado
 * (checkpoint v0.22); em sucesso vai para /dev/auth/status. A rota real
 * é /login (→ /mesas).
 */

import { LoginForm } from "../../LoginForm";
import { assertDevRouteAllowed } from "../../../lib/dev/guard";

export default function DevLoginPage() {
  assertDevRouteAllowed();
  return <LoginForm redirectTo="/dev/auth/status" context="dev" />;
}
