"use client";

/**
 * Formulário de login/cadastro compartilhado (checkpoint v0.22) — usado
 * pela rota real /login (redireciona para /mesas) e pela rota dev
 * /dev/login (redireciona para /dev/auth/status). Mesma lógica de auth;
 * só muda o destino de sucesso e alguns textos.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithPassword, signUpDevNarrator } from "./../lib/auth/actions";

type Mode = "login" | "signup";
type Status =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | { kind: "needsConfirmation"; email: string };

const inputStyle: React.CSSProperties = { background: "#0f1014", color: "inherit", border: "1px solid #333", borderRadius: 4, padding: "8px 10px", fontSize: 13, width: "100%" };
const buttonStyle: React.CSSProperties = { background: "#1d1e24", color: "inherit", border: "1px solid #333", borderRadius: 6, padding: "8px 14px", fontSize: 13, cursor: "pointer" };
const primaryButtonStyle: React.CSSProperties = { ...buttonStyle, background: "#1d3a1e", border: "1px solid #2a5a2a", flex: 1 };
const modeTabStyle = (active: boolean): React.CSSProperties => ({ background: "transparent", color: active ? "inherit" : "#888", border: "none", borderBottom: active ? "2px solid #4caf50" : "2px solid transparent", padding: "8px 4px", fontSize: 13, fontWeight: active ? 700 : 400, cursor: "pointer", marginRight: 16 });

export function LoginForm({ redirectTo, context }: { redirectTo: string; context: "prod" | "dev" }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [busy, setBusy] = useState(false);

  function switchMode(next: Mode) { setMode(next); setStatus({ kind: "idle" }); }

  async function handleSubmit() {
    setBusy(true);
    setStatus({ kind: "idle" });
    if (mode === "login") {
      const res = await signInWithPassword(email, password);
      setBusy(false);
      if (res.ok) { router.push(redirectTo); router.refresh(); }
      else setStatus({ kind: "error", message: res.error ?? "Erro desconhecido no login." });
      return;
    }
    const res = await signUpDevNarrator(email, password);
    setBusy(false);
    if (res.ok && res.needsConfirmation) setStatus({ kind: "needsConfirmation", email: email.trim() });
    else if (res.ok) { router.push(redirectTo); router.refresh(); }
    else setStatus({ kind: "error", message: res.error ?? "Erro desconhecido no cadastro." });
  }

  const podeEnviar = email.trim().length > 0 && password.length > 0 && !busy;

  return (
    <main style={{ maxWidth: 420, margin: "60px auto", padding: "0 20px" }}>
      {context === "dev" ? (
        <p style={{ opacity: 0.5, fontSize: 11, marginBottom: 24 }}>
          /dev/login — auth dev do narrador (redireciona para o status de auth).
        </p>
      ) : (
        <p style={{ opacity: 0.5, fontSize: 11, marginBottom: 24 }}>Entre para gerenciar suas mesas.</p>
      )}

      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Narrador</h1>

      <div style={{ marginBottom: 20, borderBottom: "1px solid #333" }}>
        <button data-testid="login-mode-entrar" onClick={() => switchMode("login")} style={modeTabStyle(mode === "login")}>Entrar</button>
        <button data-testid="login-mode-cadastrar" onClick={() => switchMode("signup")} style={modeTabStyle(mode === "signup")}>Criar conta</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          Email
          <input data-testid="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="narrador@exemplo.com" style={inputStyle} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          Senha
          <input data-testid="login-senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && podeEnviar) handleSubmit(); }} style={inputStyle} />
        </label>
        <button data-testid="login-submit" onClick={handleSubmit} disabled={!podeEnviar} style={{ ...primaryButtonStyle, opacity: podeEnviar ? 1 : 0.5, cursor: podeEnviar ? "pointer" : "not-allowed" }}>
          {busy ? "…" : mode === "login" ? "Entrar" : "Criar conta"}
        </button>

        {status.kind === "error" && (
          <p data-testid="login-erro" style={{ fontSize: 12, color: "#ff6b6b", background: "#2a1a1a", border: "1px solid #5a2a2a", borderRadius: 6, padding: "8px 10px" }}>
            Erro do Supabase: {status.message}
          </p>
        )}
        {status.kind === "needsConfirmation" && (
          <div data-testid="login-verifique-email" style={{ fontSize: 12, background: "#2a2a15", border: "1px solid #5a5a2a", borderRadius: 6, padding: "10px 12px" }}>
            Conta criada para <strong>{status.email}</strong>, mas o projeto exige confirmação de email.
            Confirme pelo link enviado e depois use &quot;Entrar&quot;.
          </div>
        )}
      </div>

      {context === "dev" && (
        <p style={{ marginTop: 24, fontSize: 12 }}>
          <Link href="/dev/auth/status" style={{ color: "#5ec8ff" }}>Status de auth</Link>
          {" · "}
          <Link href="/dev/table" style={{ color: "#5ec8ff" }}>/dev/table</Link>
        </p>
      )}
    </main>
  );
}
