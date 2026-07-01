/**
 * Rota REAL de login do narrador (checkpoint v0.22): /login.
 * Em sucesso, vai para o dashboard /mesas.
 */

import { LoginForm } from "../LoginForm";

export default function LoginPage() {
  return <LoginForm redirectTo="/mesas" context="prod" />;
}
