"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import { AlertCircle, Spinner } from "../../_design/icons";
import { aceitarConviteAction, type EstadoAceite } from "./actions";

const INICIAL: EstadoAceite = { erro: null };

/**
 * `demo`: a galeria de estilos monta o botão sem convite real — o
 * envio é ignorado em vez de chamar o servidor.
 * `cartao`: a credencial do convite, encaixada logo acima do botão.
 */
export function ConfirmarEntrada({ token, demo, cartao }: { token: string; demo?: boolean; cartao: ReactNode }) {
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
      <div className="rv-join-credencial">
        {cartao}
        <button type="submit" disabled={pendente} className="auth-submit-btn auth-submit-btn--cyan" data-testid="join-confirmar">
          {pendente && <Spinner size={13} className="rv-spin" style={{ marginRight: 10 }} />}
          {pendente ? "ENTRANDO..." : "ENTRAR NA CAMPANHA"}
        </button>
      </div>
      <Link href="/mesas" className="rv-join-voltar">AGORA NÃO</Link>
    </form>
  );
}
