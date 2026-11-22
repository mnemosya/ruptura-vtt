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

import { useState, useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { preload } from "react-dom";
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
  User,
} from "./_design/icons";
import "./_design/auth.css";
import { MarcaEntrada } from "./_design/MarcaEntrada";
import { CompendioAcesso } from "./_design/CompendioAcesso";
import { useBotaoSinal } from "./_design/botaoSinal";
import { AuthParticles } from "./_design/AuthParticles";

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
  id, name, label, type, inputMode, spellCheck, value, onChange, error, icon, placeholder, autoComplete, readOnly, testId,
}: {
  id: string;
  name?: string;
  label: string;
  type: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  spellCheck?: boolean;
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
      <div className={`rv-input-wrap${error ? " rv-input-wrap--err" : ""}`}>
        <span className="rv-input-icon" aria-hidden="true">{icon}</span>
        <input
          id={id}
          name={name}
          data-testid={testId}
          type={type}
          inputMode={inputMode}
          spellCheck={spellCheck}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          placeholder={placeholder ?? label}
          aria-label={label}
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
  // Caps Lock: o navegador só conta o estado da tecla dentro de um evento
  // de teclado, então o aviso nasce na primeira tecla e some ao sair do campo.
  const [caps, setCaps] = useState(false);
  const lerCaps = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState("CapsLock"));
  return (
    <div className="rv-field">
      <div className={`rv-input-wrap${error ? " rv-input-wrap--err" : ""}${caps ? " rv-input-wrap--caps" : ""}`}>
        <span className="rv-input-icon" aria-hidden="true"><Lock size={13} /></span>
        <input
          id={id}
          name="password"
          data-testid={testId}
          type={show ? "text" : "password"}
          value={value}
          onChange={onChange}
          onKeyDown={(e) => { lerCaps(e); onKeyDown?.(e); }}
          onKeyUp={lerCaps}
          onBlur={() => setCaps(false)}
          placeholder={placeholder ?? label}
          aria-label={label}
          className="rv-input rv-input--pwd"
          aria-describedby={error ? `${id}-err` : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete={autoComplete ?? "current-password"}
        />
        {caps && <span className="rv-caps" role="status">CAPS LOCK</span>}
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

/**
 * Texto que "decodifica" ao entrar: glifos aleatórios que assentam da
 * esquerda pra direita. Mexe direto no nó de texto (sem estado), e o
 * `aria-label` guarda a leitura estável.
 */
export function Decodifica({ texto, atraso = 250 }: { texto: string; atraso?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const GLIFOS = "ABCDEFGHJKLMNPRSTUVXZ0123456789/#%<>";
    const DUR = 850;
    let id = 0;
    let ultimo = 0;
    const inicio = performance.now() + atraso;
    const passo = (t: number) => {
      id = requestAnimationFrame(passo);
      if (t - ultimo < 38) return;
      ultimo = t;
      const p = Math.min(1, Math.max(0, (t - inicio) / DUR));
      const fixos = Math.floor(p * texto.length);
      let s = texto.slice(0, fixos);
      for (let i = fixos; i < texto.length; i++) {
        s += texto[i] === " " ? " " : GLIFOS[Math.floor(Math.random() * GLIFOS.length)];
      }
      el.textContent = s;
      if (p >= 1) cancelAnimationFrame(id);
    };
    id = requestAnimationFrame(passo);
    return () => {
      cancelAnimationFrame(id);
      el.textContent = texto;
    };
  }, [texto, atraso]);
  return <span ref={ref} aria-label={texto}>{texto}</span>;
}

/**
 * Cursor HUD do terminal + paralaxe do fundo — só em ponteiro fino e sem
 * "reduzir movimento". O fundo (`mundoRef`) desliza contra o ponteiro
 * enquanto as leituras de canto ficam paradas: é o que dá profundidade.
 */
function AuthCursor({ mundoRef }: { mundoRef: React.RefObject<HTMLDivElement | null> }) {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: -300, y: -300 });
  const ring = useRef({ x: -300, y: -300 });
  const raf = useRef(0);
  const hovering = useRef(false);
  const par = useRef({ x: 0, y: 0 });

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
      // Paralaxe: alvo em -1..1 a partir do centro; só escreve se andou.
      const ax = mouse.current.x < 0 ? 0 : (mouse.current.x / window.innerWidth - 0.5) * 2;
      const ay = mouse.current.y < 0 ? 0 : (mouse.current.y / window.innerHeight - 0.5) * 2;
      const dx = (ax - par.current.x) * 0.045;
      const dy = (ay - par.current.y) * 0.045;
      if (mundoRef.current && (Math.abs(dx) > 0.0002 || Math.abs(dy) > 0.0002)) {
        par.current.x += dx;
        par.current.y += dy;
        mundoRef.current.style.setProperty("--rv-par-x", par.current.x.toFixed(4));
        mundoRef.current.style.setProperty("--rv-par-y", par.current.y.toFixed(4));
      }
      raf.current = requestAnimationFrame(tick);
    };
    const onLeave = () => { mouse.current = { x: -300, y: -300 }; };
    const onDown = () => {
      ringRef.current?.classList.add("rv-cursor-ring--click");
      dotRef.current?.classList.add("rv-cursor-dot--click");
    };
    const onUp = () => {
      ringRef.current?.classList.remove("rv-cursor-ring--click");
      dotRef.current?.classList.remove("rv-cursor-dot--click");
    };

    document.addEventListener("mouseleave", onLeave);
    window.addEventListener("blur", onLeave);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    raf.current = requestAnimationFrame(tick);
    return () => {
      document.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("blur", onLeave);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      cancelAnimationFrame(raf.current);
    };
  }, [mundoRef]);

  return (
    <>
      <div ref={dotRef} className="rv-cursor-dot" aria-hidden="true" />
      <div ref={ringRef} className="rv-cursor-ring" aria-hidden="true" />
    </>
  );
}

/**
 * Casca visual das telas de acesso: fundo, cantos, leituras e o painel
 * chanfrado. O `LoginForm` e as telas de convite (`/join/[token]`)
 * montam o conteúdo dentro dela — é o que mantém as duas no mesmo
 * design system.
 */
export function AuthMoldura({
  children,
  rodape,
  estado = "ocioso",
  abalo = 0,
  modo = "login",
}: {
  children: ReactNode;
  modo?: AuthMode;
  rodape?: ReactNode;
  /** "concedido" dispara a saída de cena: o painel desliga e a câmera mergulha no fundo. */
  estado?: "ocioso" | "concedido";
  /** Contador: cada incremento sacode o painel (acesso negado / campo inválido). */
  abalo?: number;
}) {
  const mundoRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const molduraRef = useRef<HTMLDivElement>(null);
  useBotaoSinal(wrapRef, abalo);
  // O fundo é a maior pintura da tela e mora no CSS (`.rv-img`), onde o
  // scanner de pré-carga não o enxerga: sem isto ele só começa a baixar
  // depois que a folha de estilo chega e é aplicada. Quem não lê AVIF
  // ignora a dica pelo `type` e segue o `image-set()` do CSS.
  preload("/brand/bg1-parallax/background.avif", { as: "image", type: "image/avif", fetchPriority: "high" });

  useEffect(() => {
    if (!abalo || !wrapRef.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Web Animations: re-dispara a cada erro sem remontar o formulário.
    // Só os campos tremem, cada um 30ms depois do anterior, de cima pra
    // baixo; marca, botão e links ficam parados. O vermelho acende na moldura.
    const pecas = wrapRef.current.querySelectorAll<HTMLElement>(
      ".rv-field",
    );
    // Mola amortecida (seno que decai), amostrada em 24 quadros: as idas e
    // voltas encolhem de forma contínua em vez de saltar entre 4 posições.
    const TRANCO = Array.from({ length: 25 }, (_, k) => {
      const t = k / 24;
      const x = 10 * Math.exp(-3.8 * t) * Math.sin(t * Math.PI * 5.5);
      return { translate: `${(k === 24 ? 0 : -x).toFixed(2)}px 0` };
    });
    pecas.forEach((peca, i) => {
      peca.animate(TRANCO, { duration: 440, delay: i * 30, easing: "linear" });
    });
    molduraRef.current?.animate(
      [
        { borderColor: "rgba(255, 60, 80, 0.85)", boxShadow: "inset 0 0 60px rgba(255, 60, 80, 0.28)" },
        { borderColor: "rgba(0, 212, 255, 0.14)", boxShadow: "inset 0 0 60px rgba(255, 60, 80, 0)" },
      ],
      { duration: 700, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
    );
  }, [abalo]);

  return (
    <div className="rv-root" data-estado={estado} data-modo={modo}>
      <AuthCursor mundoRef={mundoRef} />

      <div ref={mundoRef} className="rv-mundo" aria-hidden="true">
        <div className="rv-bg">
          <div className="rv-img-wrap">
            <div className="rv-img rv-depth-background" />
            <div className="rv-img rv-depth-midground" />
            <div className="rv-img-tint" />
            <div className="rv-img-grad" />
            <div className="rv-img-mask" />
          </div>
        </div>
      </div>
      <div className="rv-img rv-depth-foreground" aria-hidden="true" />
      <div className="rv-atmosfera" aria-hidden="true" />
      <AuthParticles />
      <div className="rv-scan-sweep" aria-hidden="true" />

      <div className="rv-coord rv-coord-tl" aria-hidden="true">
        <div>39°42′22″N // 104°59′14″W</div>
        <div>ALT: 1609m // SETOR: VOSEK-07</div>
      </div>
      <div className="rv-coord rv-coord-br" aria-hidden="true">
        <div>RUPTURA VTT ENGINE v0.0.1</div>
        <div>SYS.RUPTURA v1.2 // NÓ: <span className="rv-val--amber">AUTH-01</span></div>
      </div>
      <CompendioAcesso />

      {/* A moldura da tela: o que antes emoldurava o painel (fio ciano e as
          faixas âmbar/ciano) agora contorna a viewport. */}
      <div ref={molduraRef} className="rv-tela-moldura" aria-hidden="true">
        <div className="rv-stripe rv-stripe-l" />
        <div className="rv-stripe rv-stripe-r" />
        <div className="rv-deco rv-deco-top">
          <div className="rv-deco-line-a" />
          <div className="rv-deco-line-b" />
        </div>
        <div className="rv-deco rv-deco-bottom">
          <div className="rv-deco-line-b" />
          <div className="rv-deco-line-a" />
        </div>
      </div>

      <div ref={wrapRef} className="rv-panel-wrap" onPointerMove={(e) => {
        if (e.pointerType === "touch") return;
        const rect = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--rv-light-x", `${e.clientX - rect.left}px`);
        e.currentTarget.style.setProperty("--rv-light-y", `${e.clientY - rect.top}px`);
      }}>
        <main className="rv-panel">
          <div className="rv-panel-scan" aria-hidden="true" />

          {children}
        </main>
      </div>

      {/* Rodapé na base da tela, centralizado no eixo. */}
      <div className="rv-foot">
        <span className="rv-foot-line" aria-hidden="true" />
        <span className="rv-foot-txt">{rodape ?? <>A ORDEM É UMA FACHADA</>}</span>
        <span className="rv-foot-line" aria-hidden="true" />
      </div>

      <div className="rv-saida" aria-hidden="true">
        <span className="rv-saida-dot" />
        ENTRANDO NA MALHA
      </div>
    </div>
  );
}

/**
 * Duração da saída de cena em `auth.css` (estado "concedido"): o painel
 * desliga (0,55s + 0,6s) e o escuro com a legenda termina de entrar
 * (1,15s + 0,9s). Navegar antes disso cortava a animação no meio, porque
 * a próxima rota carrega rápido. Com "reduzir movimento", vai direto.
 */
const SAIDA_DE_CENA_MS = 2050;

function sairDeCena(destino: string) {
  const calmo = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // A área autenticada lê isto e continua a cena: o escuro se dissolve sobre ela.
  try { sessionStorage.setItem("ruptura:chegada", "1"); } catch { /* sem armazenamento: chega sem véu */ }
  window.setTimeout(() => window.location.assign(destino), calmo ? 0 : SAIDA_DE_CENA_MS);
}

const FASES_ENTRAR = ["VALIDANDO CHAVE", "ABRINDO CANAL", "SINCRONIZANDO"];
const FASES_CRIAR = ["REGISTRANDO CONTA", "ABRINDO CANAL"];

export function LoginForm({
  redirectTo,
  context,
  lockedEmail,
  faixa,
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
  /** Bloco extra entre o cabeçalho e o formulário (ex.: o convite que trouxe a pessoa até aqui). */
  faixa?: ReactNode;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(lockedEmail ?? "");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({ kind: "none" });
  const [formKey, setFormKey] = useState(0);
  const [abalo, setAbalo] = useState(0);
  const [recuperando, setRecuperando] = useState(false);
  const [fase, setFase] = useState(0);

  // Enquanto o servidor responde, o botão narra o aperto de mão em etapas
  // (para na última — não finge progresso que não existe).
  useEffect(() => {
    if (!busy) return;
    setFase(0);
    const id = window.setInterval(() => setFase((f) => f + 1), 1100);
    return () => window.clearInterval(id);
  }, [busy]);

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
    if (Object.keys(next).length > 0) setAbalo((n) => n + 1);
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
        setAbalo((n) => n + 1);
        return;
      }
      await activatePendingEmailInvites().catch(() => []);
      setFeedback({ kind: "success", message: "Autenticação bem-sucedida. Iniciando sessão na malha…" });
      // Carga completa em vez de router.push + refresh: a navegação do
      // cliente, disparada junto com o refresh logo após gravar os cookies
      // de sessão, ficava pendurada em produção e o botão nunca saía de
      // "Processando…".
      sairDeCena(redirectTo);
      return;
    }

    const res = await signUpWithPassword(email, password, name);
    if (!res.ok) {
      setBusy(false);
      setFeedback({ kind: "error", message: res.error ?? "Erro desconhecido no cadastro." });
      setAbalo((n) => n + 1);
      return;
    }
    if (res.needsConfirmation) {
      setBusy(false);
      setFeedback({ kind: "needsConfirmation", email: email.trim() });
      return;
    }
    await activatePendingEmailInvites().catch(() => []);
    setFeedback({ kind: "success", message: "Conta criada. Iniciando sessão na malha…" });
    sairDeCena(redirectTo);
  }

  async function handleRecover() {
    if (busy) return;
    setBusy(true);
    setRecuperando(true);
    setFeedback({ kind: "none" });
    const res = await requestPasswordReset(email);
    setBusy(false);
    setRecuperando(false);
    if (!res.ok) {
      setFeedback({ kind: "error", message: res.error ?? "Não foi possível pedir a redefinição." });
      return;
    }
    setFeedback({
      kind: "info",
      message: "Se existir uma conta com esse e-mail, enviamos um link de redefinição de senha.",
    });
  }

  const concedido = feedback.kind === "success";
  const submitting = busy || concedido;
  const fases = isLogin ? FASES_ENTRAR : FASES_CRIAR;
  const rotuloOcupado = recuperando ? "PROCESSANDO..." : fases[Math.min(fase, fases.length - 1)];

  return (
    <AuthMoldura
      modo={mode}
      estado={concedido ? "concedido" : "ocioso"}
      abalo={abalo}
      rodape={
        <>
              {context === "dev" ? (
                <>
                  MODO DEV //{" "}
                  <Link href="/dev/auth/status" className="rv-foot-link">STATUS DE AUTH</Link>
                  {" · "}
                  <Link href="/dev/table" className="rv-foot-link">/DEV/TABLE</Link>
                </>
              ) : (
                <>A ORDEM É UMA FACHADA</>
              )}
            </>
      }
    >
          <div className="rv-header">
            <div className="rv-brand">
              <MarcaEntrada className="rv-marca" />
              <p className="rv-subtitle"><Decodifica texto="VIRTUAL TABLETOP" atraso={650} /></p>
            </div>
          </div>

          {faixa}

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
                  autoComplete="nickname"
                />
              )}

              <TextField
                id="rv-email"
                name="email"
                testId="login-email"
                label="E-MAIL"
                // `type=email` desativa substituições de texto do macOS.
                // A validação do endereço já acontece em `validate()`.
                type="text"
                inputMode="email"
                spellCheck
                value={email}
                onChange={lockedEmail ? undefined : (e) => setEmail(e.target.value)}
                readOnly={!!lockedEmail}
                error={errors.email}
                icon={<Mail size={13} />}
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
              data-estado={concedido ? "concedido" : busy ? "ocupado" : undefined}
              aria-busy={submitting || undefined}
            >
              {/* Sem ícone: a fase em texto (decodificando) diz o que está acontecendo. */}
              {concedido ? "ACESSO CONCEDIDO" : busy ? rotuloOcupado : isLogin ? "INICIAR SESSÃO" : "CRIAR CONTA"}
            </button>
          </form>

          {/* Um caminho só (entrar); o outro modo é um link abaixo do botão. */}
          <p className="rv-troca">
            {isLogin ? "Ainda não tem conta?" : "Já tem conta?"}
            <button
              type="button"
              className="rv-troca-btn"
              data-testid={isLogin ? "login-mode-cadastrar" : "login-mode-entrar"}
              aria-controls="rv-form"
              onClick={() => switchMode(isLogin ? "register" : "login")}
            >
              {isLogin ? "Criar conta" : "Entrar"}
            </button>
          </p>

    </AuthMoldura>
  );
}
