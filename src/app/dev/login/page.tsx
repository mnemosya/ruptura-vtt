"use client";

/**
 * Página de DEBUG de login do narrador — base de auth dev (checkpoint
 * v0.13). Email/senha via Server Actions (anon key server-side, sessão
 * em cookie httpOnly). NÃO endurece RLS — os fluxos dev anon continuam
 * funcionando sem login nesta etapa.
 *
 * Magic link não é oferecido aqui porque depende de provider de email
 * configurado no painel do Supabase (SMTP/allowlist de redirect), que
 * não dá para garantir só por código — ver pendência no relatório.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithPassword, signUpDevNarrator } from "../../../lib/auth/actions";

const inputStyle: React.CSSProperties = {
  background: "#0f1014",
  color: "inherit",
  border: "1px solid #333",
  borderRadius: 4,
  padding: "8px 10px",
  fontSize: 13,
  width: "100%",
};

const buttonStyle: React.CSSProperties = {
  background: "#1d1e24",
  color: "inherit",
  border: "1px solid #333",
  borderRadius: 6,
  padding: "8px 14px",
  fontSize: 13,
  cursor: "pointer",
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSignIn() {
    setBusy(true);
    setMessage(null);
    const res = await signInWithPassword(email, password);
    setBusy(false);
    if (res.ok) {
      router.push("/dev/auth/status");
    } else {
      setMessage(`Erro no login: ${res.error}`);
    }
  }

  async function handleSignUp() {
    setBusy(true);
    setMessage(null);
    const res = await signUpDevNarrator(email, password);
    setBusy(false);
    if (res.ok && res.needsConfirmation) {
      setMessage(
        "Cadastro criado, mas o projeto exige confirmação de email. Confirme pelo link enviado " +
          "e depois faça login. (Ver pendência no relatório sobre desativar confirmação para dev.)",
      );
    } else if (res.ok) {
      router.push("/dev/auth/status");
    } else {
      setMessage(`Erro no cadastro: ${res.error}`);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "60px auto", padding: "0 20px" }}>
      <p style={{ opacity: 0.6, fontSize: 13, marginBottom: 4 }}>/dev/login — login dev do narrador.</p>
      <p style={{ opacity: 0.5, fontSize: 11, marginBottom: 24 }}>
        Auth dev: email/senha via Server Actions (anon key server-side, sessão em cookie httpOnly).
        Ainda NÃO endurece RLS — os fluxos dev anon continuam abertos por enquanto.
      </p>

      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Entrar como narrador</h1>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          Email
          <input
            data-testid="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="narrador@exemplo.com"
            style={inputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          Senha
          <input
            data-testid="login-senha"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
        </label>

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button data-testid="login-entrar" onClick={handleSignIn} disabled={busy} style={buttonStyle}>
            {busy ? "…" : "Entrar"}
          </button>
          <button data-testid="login-cadastrar" onClick={handleSignUp} disabled={busy} style={buttonStyle}>
            {busy ? "…" : "Cadastrar (dev)"}
          </button>
        </div>

        {message && (
          <p data-testid="login-mensagem" style={{ fontSize: 12, color: "#ffb84f", marginTop: 4 }}>
            {message}
          </p>
        )}
      </div>

      <p style={{ marginTop: 24, fontSize: 12 }}>
        <Link href="/dev/auth/status" style={{ color: "#5ec8ff" }}>
          Ver status de auth
        </Link>
        {" · "}
        <Link href="/dev/table" style={{ color: "#5ec8ff" }}>
          /dev/table
        </Link>
      </p>
    </main>
  );
}
