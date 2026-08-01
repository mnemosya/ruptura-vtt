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

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserSupabaseClient } from "../../lib/supabase/browserClient";
import { AlertCircle, CheckCircle, KeyRound, Lock, Spinner } from "../_design/icons";
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

  useEffect(() => {
    const supabase = getBrowserSupabaseClient();
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
        if (error) { setPhase({ kind: "error", message: error.message }); return; }
        setPhase({ kind: "ready" });
        return;
      }
      if (tokenHash) {
        const { error } = await supabase!.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
        if (error) { setPhase({ kind: "error", message: error.message }); return; }
        setPhase({ kind: "ready" });
        return;
      }
      setPhase({
        kind: "error",
        message: "Link de redefinição inválido ou expirado. Peça um novo em RECUPERAR SENHA na tela de acesso.",
      });
    }

    void verify();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldError(null);
    if (password.length < 8) { setFieldError("Mínimo de 8 caracteres"); return; }
    if (password !== confirm) { setFieldError("As senhas não coincidem"); return; }

    const supabase = getBrowserSupabaseClient();
    if (!supabase) return;

    setPhase({ kind: "saving" });
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setPhase({ kind: "error", message: error.message }); return; }
    await supabase.auth.signOut().catch(() => undefined);
    setPhase({ kind: "done" });
  }

  const busy = phase.kind === "saving" || phase.kind === "verifying";

  return (
    <div className="rv-root">
      <div className="rv-bg" aria-hidden="true">
        <div className="rv-img-wrap">
          <div className="rv-img" />
          <div className="rv-img-tint" />
          <div className="rv-img-grad" />
          <div className="rv-img-mask" />
        </div>
      </div>
      <div className="rv-scanlines" aria-hidden="true" />

      <div className="rv-panel-wrap">
        <div className="rv-stripe rv-stripe-l" aria-hidden="true" />
        <div className="rv-stripe rv-stripe-r" aria-hidden="true" />
        <main className="rv-panel">
          <div className="rv-deco rv-deco-top" aria-hidden="true">
            <div className="rv-deco-line-a" />
            <div className="rv-deco-line-b" />
          </div>

          <div className="rv-header">
            <div className="rv-brand">
              <div className="rv-badge">
                <span className="rv-badge-dot" aria-hidden="true" />
                <span className="rv-badge-txt">// SYS.AUTH.RESET</span>
              </div>
              <h1 className="rv-title" style={{ fontSize: "clamp(26px, 7vw, 34px)" }}>NOVA SENHA</h1>
              <p className="rv-subtitle">REDEFINIÇÃO DE ACESSO</p>
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

              <button type="submit" disabled={busy} className="rv-submit rv-submit--cyan">
                <span className="rv-submit-glow rv-submit-glow--base" aria-hidden="true" />
                <span className="rv-submit-glow rv-submit-glow--hover" aria-hidden="true" />
                {phase.kind === "saving" && <Spinner size={13} className="rv-spin rv-z" />}
                <span className="rv-z">{phase.kind === "saving" ? "SALVANDO..." : "DEFINIR SENHA"}</span>
              </button>
            </form>
          )}

          <div className="rv-foot">
            <span className="rv-foot-line" aria-hidden="true" />
            <span className="rv-foot-txt">
              <Link href="/login" className="rv-foot-link">VOLTAR AO TERMINAL DE ACESSO</Link>
            </span>
            <span className="rv-foot-line" aria-hidden="true" />
          </div>
        </main>
      </div>
    </div>
  );
}
