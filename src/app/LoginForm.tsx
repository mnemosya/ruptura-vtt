"use client";

/**
 * Terminal de acesso à malha — tela de autenticação do Ruptura VTT.
 *
 * Continua sendo o formulário compartilhado (checkpoint v0.22) usado
 * pela rota real /login (redireciona para /mesas), pela rota dev
 * /dev/login e pelo fluxo de convite por e-mail (`lockedEmail`). O que
 * mudou nesta versão foi só a INTERFACE — a lógica de auth é a mesma:
 * `signInWithPassword` / `signUpWithPassword` (Server Actions com a anon
 * key server-side, sessão em cookie httpOnly) e
 * `activatePendingEmailInvites` logo após entrar.
 *
 * O protótipo do Figma Make tinha três mocks aqui, todos resolvidos:
 *   - "ENTRADA RÁPIDA", que pulava a autenticação: removido;
 *   - submit com `setTimeout` fingindo sucesso: agora chama as Server
 *     Actions reais e mostra o erro real do Supabase;
 *   - "RECUPERAR SENHA" sem ação: agora chama `requestPasswordReset`.
 */

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  signInWithPassword,
  signUpWithPassword,
  requestPasswordReset,
} from "../lib/auth/actions";
import { activatePendingEmailInvites } from "../lib/table/storage";
import {
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Spinner,
  User,
} from "./_design/icons";
import "./_design/auth.css";

type AuthMode = "login" | "register";

interface FormErrors {
  name?: string;
  email?: string;
  password?: string;
}

type Feedback =
  | { kind: "none" }
  | { kind: "error"; message: string }
  | { kind: "success"; message: string }
  | { kind: "info"; message: string }
  | { kind: "needsConfirmation"; email: string };

function TextField({
  id, label, type, value, onChange, error, icon, placeholder, autoComplete, readOnly, testId,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  icon: React.ReactNode;
  placeholder?: string;
  autoComplete?: string;
  readOnly?: boolean;
  testId?: string;
}) {
  return (
    <div className="rv-field">
      <label className="rv-label" htmlFor={id}>{label}</label>
      <div className={`rv-input-wrap${error ? " rv-input-wrap--err" : ""}`}>
        <span className="rv-input-icon" aria-hidden="true">{icon}</span>
        <input
          id={id}
          data-testid={testId}
          type={type}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          placeholder={placeholder}
          className="rv-input"
          aria-describedby={error ? `${id}-err` : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete={autoComplete}
        />
      </div>
      {error && (
        <div id={`${id}-err`} className="rv-field-error" role="alert">
          <AlertCircle size={10} />{error}
        </div>
      )}
    </div>
  );
}

function PasswordField({
  id, label, value, onChange, onKeyDown, error, show, onToggle, autoComplete, placeholder, testId,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  error?: string;
  show: boolean;
  onToggle: () => void;
  autoComplete?: string;
  placeholder?: string;
  testId?: string;
}) {
  return (
    <div className="rv-field">
      <label className="rv-label" htmlFor={id}>{label}</label>
      <div className={`rv-input-wrap${error ? " rv-input-wrap--err" : ""}`}>
        <span className="rv-input-icon" aria-hidden="true"><Lock size={13} /></span>
        <input
          id={id}
          data-testid={testId}
          type={show ? "text" : "password"}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="rv-input rv-input--pwd"
          aria-describedby={error ? `${id}-err` : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete={autoComplete ?? "current-password"}
        />
        <button
          type="button"
          className="rv-toggle-btn"
          onClick={onToggle}
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
        >
          {show ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </div>
      {error && (
        <div id={`${id}-err`} className="rv-field-error" role="alert">
          <AlertCircle size={10} />{error}
        </div>
      )}
    </div>
  );
}

/** Cursor HUD do terminal — só em ponteiro fino e sem "reduzir movimento". */
function AuthCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: -300, y: -300 });
  const ring = useRef({ x: -300, y: -300 });
  const raf = useRef(0);
  const hovering = useRef(false);

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const onMove = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
      if (dotRef.current) dotRef.current.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 3}px)`;
      const target = e.target as HTMLElement | null;
      const hoverable = target?.closest?.("button, a, input, [role='tab'], label");
      if (hoverable && !hovering.current) {
        hovering.current = true;
        ringRef.current?.classList.add("rv-cursor-ring--hover");
      } else if (!hoverable && hovering.current) {
        hovering.current = false;
        ringRef.current?.classList.remove("rv-cursor-ring--hover");
      }
    };
    const tick = () => {
      ring.current.x += (mouse.current.x - ring.current.x) * 0.11;
      ring.current.y += (mouse.current.y - ring.current.y) * 0.11;
      if (ringRef.current) ringRef.current.style.transform = `translate(${ring.current.x - 17}px, ${ring.current.y - 17}px)`;
      raf.current = requestAnimationFrame(tick);
    };
    const onDown = () => {
      ringRef.current?.classList.add("rv-cursor-ring--click");
      dotRef.current?.classList.add("rv-cursor-dot--click");
    };
    const onUp = () => {
      ringRef.current?.classList.remove("rv-cursor-ring--click");
      dotRef.current?.classList.remove("rv-cursor-dot--click");
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    raf.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <>
      <div ref={dotRef} className="rv-cursor-dot" aria-hidden="true" />
      <div ref={ringRef} className="rv-cursor-ring" aria-hidden="true" />
    </>
  );
}

export function LoginForm({
  redirectTo,
  context,
  lockedEmail,
}: {
  redirectTo: string;
  context: "prod" | "dev";
  /**
   * Fase 2 (aditivo §6): quando a rota chega de um convite POR E-MAIL,
   * o e-mail vem pré-preenchido e travado (não editável) — "não pode
   * ser trocado silenciosamente". Login/cadastro com outro e-mail deve
   * ser feito fora deste fluxo.
   */
  lockedEmail?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(lockedEmail ?? "");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({ kind: "none" });
  const [formKey, setFormKey] = useState(0);

  const isLogin = mode === "login";

  function switchMode(next: AuthMode) {
    if (next === mode) return;
    setMode(next);
    setName("");
    setEmail(lockedEmail ?? "");
    setPassword("");
    setErrors({});
    setShowPwd(false);
    setFeedback({ kind: "none" });
    setFormKey((k) => k + 1);
  }

  function validate(): boolean {
    const next: FormErrors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "E-mail inválido";
    if (!password) next.password = "Informe a senha";
    // O mínimo de caracteres só vale no CADASTRO: contas antigas podem
    // ter senha mais curta e precisam continuar conseguindo entrar.
    else if (!isLogin && password.length < 8) next.password = "Mínimo de 8 caracteres";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    if (!validate()) return;

    setBusy(true);
    setFeedback({ kind: "none" });

    if (isLogin) {
      const res = await signInWithPassword(email, password);
      if (!res.ok) {
        setBusy(false);
        setFeedback({ kind: "error", message: res.error ?? "Erro desconhecido no login." });
        return;
      }
      await activatePendingEmailInvites().catch(() => []);
      setFeedback({ kind: "success", message: "Autenticação bem-sucedida. Iniciando sessão na malha…" });
      router.push(redirectTo);
      router.refresh();
      return;
    }

    const res = await signUpWithPassword(email, password, name);
    if (!res.ok) {
      setBusy(false);
      setFeedback({ kind: "error", message: res.error ?? "Erro desconhecido no cadastro." });
      return;
    }
    if (res.needsConfirmation) {
      setBusy(false);
      setFeedback({ kind: "needsConfirmation", email: email.trim() });
      return;
    }
    await activatePendingEmailInvites().catch(() => []);
    setFeedback({ kind: "success", message: "Conta criada. Iniciando sessão na malha…" });
    router.push(redirectTo);
    router.refresh();
  }

  async function handleRecover() {
    if (busy) return;
    setBusy(true);
    setFeedback({ kind: "none" });
    const res = await requestPasswordReset(email);
    setBusy(false);
    if (!res.ok) {
      setFeedback({ kind: "error", message: res.error ?? "Não foi possível pedir a redefinição." });
      return;
    }
    setFeedback({
      kind: "info",
      message: "Se existir uma conta com esse e-mail, enviamos um link de redefinição de senha.",
    });
  }

  const submitting = busy || feedback.kind === "success";

  return (
    <div className="rv-root">
      <AuthCursor />

      <div className="rv-bg" aria-hidden="true">
        <div className="rv-img-wrap">
          <div className="rv-img" />
          <div className="rv-img-tint" />
          <div className="rv-img-grad" />
          <div className="rv-img-mask" />
        </div>
      </div>
      <div className="rv-scan-sweep" aria-hidden="true" />

      <div className="rv-vp-corner rv-vp-corner-tl" aria-hidden="true" />
      <div className="rv-vp-corner rv-vp-corner-tr" aria-hidden="true" />
      <div className="rv-vp-corner rv-vp-corner-bl" aria-hidden="true" />
      <div className="rv-vp-corner rv-vp-corner-br" aria-hidden="true" />
      <div className="rv-coord rv-coord-tl" aria-hidden="true">
        <div>39°42′22″N // 104°59′14″W</div>
        <div>ALT: 1609m // SETOR: VOSEK-07</div>
      </div>
      <div className="rv-coord rv-coord-br" aria-hidden="true">
        <div>RUPTURA VTT ENGINE v0.0.1</div>
        <div>SYS.RUPTURA v1.2 // NÓ: <span className="rv-val--amber">AUTH-01</span></div>
      </div>
      <div className="rv-readings" aria-hidden="true">
        <div>MALHA<span className="rv-val">&nbsp;ONLINE</span></div>
        <div>ASSINATURA<span className="rv-val">&nbsp;MASCARADA</span></div>
        <div>NÓ<span className="rv-val--amber">&nbsp;AUTH-01</span></div>
      </div>

      <div className="rv-panel-wrap">
        <div className="rv-stripe rv-stripe-l" aria-hidden="true" />
        <div className="rv-stripe rv-stripe-r" aria-hidden="true" />
        <main className="rv-panel">
          <div className="rv-deco rv-deco-top" aria-hidden="true">
            <div className="rv-deco-line-a" />
            <div className="rv-deco-line-b" />
          </div>
          <div className="rv-deco rv-deco-bottom" aria-hidden="true">
            <div className="rv-deco-line-b" />
            <div className="rv-deco-line-a" />
          </div>
          <div className="rv-panel-scan" aria-hidden="true" />

          <div className="rv-header">
            <div className="rv-brand">
              <div className="rv-badge">
                <span className="rv-badge-dot" aria-hidden="true" />
                <span className="rv-badge-txt">
                  // SYS.AUTH.NODE
                  <span className="rv-badge-sep" aria-hidden="true" />
                  TERMINAL DE ACESSO À MALHA
                </span>
              </div>
              <h1 className="rv-title">RUPTURA</h1>
              <p className="rv-subtitle">VIRTUAL TABLETOP</p>
            </div>

            <div className="rv-divider" aria-hidden="true">
              <span className="rv-div-line" />
              <span className="rv-div-icon">⬡</span>
              <span className="rv-div-line" />
            </div>

            <div className="rv-segmented" role="tablist" aria-label="Modo de autenticação">
              <button
                role="tab"
                type="button"
                aria-selected={isLogin}
                aria-controls="rv-form"
                data-testid="login-mode-entrar"
                className={`rv-seg-btn rv-seg-cyan${isLogin ? " rv-seg-btn--active-cyan" : ""}`}
                onClick={() => switchMode("login")}
              >
                ENTRAR
              </button>
              <button
                role="tab"
                type="button"
                aria-selected={!isLogin}
                aria-controls="rv-form"
                data-testid="login-mode-cadastrar"
                className={`rv-seg-btn rv-seg-amber${!isLogin ? " rv-seg-btn--active-amber" : ""}`}
                onClick={() => switchMode("register")}
              >
                CRIAR CONTA
              </button>
            </div>
          </div>

          <form id="rv-form" key={formKey} onSubmit={handleSubmit} noValidate className="rv-form">
            <div className="rv-fields">
              {!isLogin && (
                <TextField
                  id="rv-name"
                  testId="login-nome"
                  label="NOME DE EXIBIÇÃO"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  error={errors.name}
                  icon={<User size={13} />}
                  placeholder="ex: Gabs"
                  autoComplete="nickname"
                />
              )}

              <TextField
                id="rv-email"
                testId="login-email"
                label="E-MAIL"
                type="email"
                value={email}
                onChange={lockedEmail ? undefined : (e) => setEmail(e.target.value)}
                readOnly={!!lockedEmail}
                error={errors.email}
                icon={<Mail size={13} />}
                placeholder="narrador@exemplo.com"
                autoComplete="email"
              />
              {lockedEmail && (
                <p className="rv-field-hint">
                  Este convite pertence a este e-mail — entre ou crie uma conta com ele.
                </p>
              )}

              <div className="rv-field-group">
                <PasswordField
                  id="rv-password"
                  testId="login-senha"
                  label="SENHA"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                  error={errors.password}
                  show={showPwd}
                  onToggle={() => setShowPwd((v) => !v)}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  placeholder="•••••••••"
                />
                {isLogin && (
                  <div className="rv-recover">
                    <button
                      type="button"
                      className="rv-recover-btn"
                      data-testid="login-recuperar-senha"
                      onClick={handleRecover}
                    >
                      RECUPERAR SENHA
                    </button>
                  </div>
                )}
              </div>
            </div>

            {feedback.kind === "error" && (
              <div className="rv-alert rv-alert--error" role="alert" data-testid="login-erro">
                <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{feedback.message}</span>
              </div>
            )}
            {feedback.kind === "info" && (
              <div className="rv-alert rv-alert--info" role="status">
                <Mail size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{feedback.message}</span>
              </div>
            )}
            {feedback.kind === "success" && (
              <div className="rv-alert rv-alert--success" role="status">
                <CheckCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{feedback.message}</span>
              </div>
            )}
            {feedback.kind === "needsConfirmation" && (
              <div className="rv-alert rv-alert--info" role="status" data-testid="login-verifique-email">
                <Mail size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  Conta criada para <strong>{feedback.email}</strong>, mas o projeto exige confirmação de e-mail.
                  Confirme pelo link enviado e depois use ENTRAR.
                </span>
              </div>
            )}

            <button
              type="submit"
              data-testid="login-submit"
              className={`auth-submit-btn ${isLogin ? "auth-submit-btn--cyan" : "auth-submit-btn--amber"}`}
            >
              {submitting && <Spinner size={13} className="rv-spin" style={{ marginRight: 10 }} />}
              {submitting ? "PROCESSANDO..." : isLogin ? "INICIAR SESSÃO" : "CRIAR CONTA"}
            </button>
          </form>

          <div className="rv-foot">
            <span className="rv-foot-line" aria-hidden="true" />
            <span className="rv-foot-txt">
              {context === "dev" ? (
                <>
                  MODO DEV //{" "}
                  <Link href="/dev/auth/status" className="rv-foot-link">STATUS DE AUTH</Link>
                  {" · "}
                  <Link href="/dev/table" className="rv-foot-link">/DEV/TABLE</Link>
                </>
              ) : (
                <>RUPTURA VTT v0.0.1 // ACESSO RESTRITO</>
              )}
            </span>
            <span className="rv-foot-line" aria-hidden="true" />
          </div>
        </main>
      </div>
    </div>
  );
}
