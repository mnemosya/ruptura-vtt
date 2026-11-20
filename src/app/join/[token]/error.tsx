"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AuthMoldura, Decodifica } from "../../LoginForm";
import { logError } from "../../../lib/logger";
import "../../_design/auth.css";

/** Falha inesperada ao ler o convite: mesma moldura, com tentar de novo. */
export default function JoinError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logError("join.token", error);
  }, [error]);

  return (
    <AuthMoldura>
      <div className="rv-header">
        <div className="rv-brand">
          <h1 className="rv-join-titulo">Erro no convite</h1>
          <p className="rv-subtitle"><Decodifica texto="LINK INDISPONÍVEL" atraso={250} /></p>
        </div>
      </div>
      <div className="rv-form">
        <div className="rv-alert rv-alert--error" role="alert">
          <span>Não foi possível verificar este convite. Tente novamente. Se persistir, peça um novo link ao narrador.</span>
        </div>
        <button type="button" onClick={reset} className="auth-submit-btn auth-submit-btn--cyan">
          TENTAR DE NOVO
        </button>
        <Link href="/login" className="rv-join-voltar">← ENTRAR</Link>
      </div>
    </AuthMoldura>
  );
}
