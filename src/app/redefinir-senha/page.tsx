"use client";

/**
 * Destino do link de redefinição de senha enviado por
 * `requestPasswordReset` (src/lib/auth/actions.ts).
 *
 * O Supabase entrega o link em dois formatos, dependendo da configuração
 * do projeto — os dois são aceitos aqui:
 *   - implícito: `#access_token=...&refresh_token=...&type=recovery`;
 *   - PKCE/verify: `?token_hash=...&type=recovery`.
 *
 * A troca de senha em si acontece no navegador, com a anon key pública e
 * a sessão temporária de recuperação (`auth.updateUser`) — é a própria
 * conta autenticando a mudança nela mesma, nunca uma escrita
 * administrativa. Nada disso grava o cookie httpOnly de sessão do app:
 * ao final, a pessoa entra normalmente por /login.
 */

import { traduzirErroAuth } from "../../lib/auth/mensagens";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserRecoveryClient } from "../../lib/supabase/browserClient";
import { AlertCircle, CheckCircle, KeyRound, Lock, Spinner } from "../_design/icons";
import { AuthMoldura, Decodifica } from "../LoginForm";
import "../_design/auth.css";

type Phase =
  | { kind: "verifying" }
  | { kind: "ready" }
  | { kind: "saving" }
  | { kind: "done" }
  | { kind: "error"; message: string };

export default function RedefinirSenhaPage() {
  const [phase, setPhase] = useState<Phase>({ kind: "verifying" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  /** Cada incremento sacode os campos (mesmo tranco do login). */
  const [abalo, setAbalo] = useState(0);

  useEffect(() => {
    const supabase = getBrowserRecoveryClient();
    if (!supabase) {
      setPhase({
        kind: "error",
        message: "Redefinição indisponível: as variáveis públicas do Supabase não estão configuradas nesta instalação.",
      });
      return;
    }

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);

    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const tokenHash = query.get("token_hash") ?? hash.get("token_hash");
    const hashError = hash.get("error_description") ?? query.get("error_description");

    if (hashError) {
      setPhase({ kind: "error", message: hashError });
      return;
    }

    async function verify() {
      if (accessToken && refreshToken) {
        const { error } = await supabase!.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (error) { setPhase({ kind: "error", message: traduzirErroAuth(error, "Não foi possível redefinir a senha. Peça um novo link.") }); return; }
        setPhase({ kind: "ready" });
        return;
      }
      if (tokenHash) {
        const { error } = await supabase!.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
        if (error) { setPhase({ kind: "error", message: traduzirErroAuth(error, "Não foi possível redefinir a senha. Peça um novo link.") }); return; }
        setPhase({ kind: "ready" });
        return;
      }
      setPhase({
        kind: "error",
        message: "Link de redefinição inválido ou expirado. Peça um novo em RECUPERAR SENHA na tela de acesso.",
      });
    }

    const FALHA = "Não foi possível validar o link. Abra-o de novo ou peça outro em RECUPERAR SENHA.";
    verify().catch((err: unknown) => {
      setPhase({ kind: "error", message: traduzirErroAuth(err as Error, FALHA) });
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldError(null);
    if (password.length < 8) { setFieldError("Mínimo de 8 caracteres"); setAbalo((n) => n + 1); return; }
    if (password !== confirm) { setFieldError("As senhas não coincidem"); setAbalo((n) => n + 1); return; }

    const supabase = getBrowserRecoveryClient();
    if (!supabase) return;

    setPhase({ kind: "saving" });
    const { error } = await supabase.auth.updateUser({ password }).catch((err: unknown) => ({ error: err as Error }));
    if (error) { setAbalo((n) => n + 1); setPhase({ kind: "error", message: traduzirErroAuth(error, "Não foi possível redefinir a senha. Peça um novo link.") }); return; }
    await supabase.auth.signOut().catch(() => undefined);
    setPhase({ kind: "done" });
  }

  const busy = phase.kind === "saving" || phase.kind === "verifying";

  return (
    <AuthMoldura
      abalo={abalo}
      rodape={<Link href="/login" className="rv-foot-link">VOLTAR AO TERMINAL DE ACESSO</Link>}
    >
          <div className="rv-header">
            <div className="rv-brand">
              <h1 className="rv-join-titulo">NOVA SENHA</h1>
              <p className="rv-subtitle"><Decodifica texto="REDEFINIÇÃO DE ACESSO" atraso={250} /></p>
            </div>
          </div>

          {phase.kind === "verifying" && (
            <div className="rv-alert rv-alert--info" role="status">
              <Spinner size={12} className="rv-spin" />
              <span>Validando o link de redefinição…</span>
            </div>
          )}

          {phase.kind === "error" && (
            <div className="rv-alert rv-alert--error" role="alert">
              <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{phase.message}</span>
            </div>
          )}

          {phase.kind === "done" && (
            <div className="rv-alert rv-alert--success" role="status">
              <CheckCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Senha atualizada. Entre novamente com a nova senha.</span>
            </div>
          )}

          {(phase.kind === "ready" || phase.kind === "saving") && (
            <form onSubmit={handleSubmit} noValidate className="rv-form">
              <div className="rv-fields">
                <div className="rv-field">
                  <label className="rv-label" htmlFor="nova-senha">NOVA SENHA</label>
                  <div className={`rv-input-wrap${fieldError ? " rv-input-wrap--err" : ""}`}>
                    <span className="rv-input-icon" aria-hidden="true"><Lock size={13} /></span>
                    <input
                      id="nova-senha"
                      type="password"
                      className="rv-input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      placeholder="•••••••••"
                    />
                  </div>
                </div>
                <div className="rv-field">
                  <label className="rv-label" htmlFor="confirmar-senha">CONFIRMAR SENHA</label>
                  <div className={`rv-input-wrap${fieldError ? " rv-input-wrap--err" : ""}`}>
                    <span className="rv-input-icon" aria-hidden="true"><KeyRound size={13} /></span>
                    <input
                      id="confirmar-senha"
                      type="password"
                      className="rv-input"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      autoComplete="new-password"
                      placeholder="•••••••••"
                    />
                  </div>
                  {fieldError && (
                    <div className="rv-field-error" role="alert">
                      <AlertCircle size={10} />{fieldError}
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="auth-submit-btn auth-submit-btn--cyan"
                data-estado={phase.kind === "saving" ? "ocupado" : undefined}
                aria-busy={phase.kind === "saving" || undefined}
              >
                {phase.kind === "saving" ? "SALVANDO" : "DEFINIR SENHA"}
              </button>
            </form>
          )}

    </AuthMoldura>
  );
}
