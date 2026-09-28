"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle, Spinner } from "../../_design/icons";
import { aceitarConviteAction, type EstadoAceite } from "./actions";

const INICIAL: EstadoAceite = { erro: null };

/**
 * `demo`: a galeria de estilos monta o botão sem convite real — o
 * envio é ignorado em vez de chamar o servidor.
 */
export function ConfirmarEntrada({ token, demo }: { token: string; demo?: boolean }) {
  const [estado, acao, pendente] = useActionState(aceitarConviteAction.bind(null, token), INICIAL);

  return (
    <form
      action={demo ? undefined : acao}
      onSubmit={demo ? (e) => e.preventDefault() : undefined}
      className="rv-join-acoes"
    >
      {estado.erro && (
        <div className="rv-alert rv-alert--error" role="alert" data-testid="join-erro">
          <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{estado.erro}</span>
        </div>
      )}
      <button type="submit" disabled={pendente} className="auth-submit-btn auth-submit-btn--cyan" data-testid="join-confirmar">
        {pendente && <Spinner size={13} className="rv-spin" style={{ marginRight: 10 }} />}
        {pendente ? "ENTRANDO..." : "ENTRAR NA CAMPANHA"}
      </button>
      <Link href="/mesas" className="rv-join-voltar">AGORA NÃO</Link>
    </form>
  );
}
