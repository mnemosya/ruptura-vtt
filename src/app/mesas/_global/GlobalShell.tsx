"use client";

/**
 * Shell da ÁREA AUTENTICADA GLOBAL (aditivo §4.3 — o "menu geral da
 * conta", que existe FORA de qualquer campanha). Substitui a antiga
 * `AccountNav` horizontal.
 *
 * Estrutura da V1 "Seco" (prancheta Main.dc.html do board "Minhas
 * Campanhas — game UI"):
 *   - header único: marca, as três seções (Campanhas, Personagens,
 *     Compêndio) com o sublinhado laranja que cresce, e o cartão de
 *     conta com o menu (conta, criar campanha, aparecer offline, sair);
 *   - fundo HUD fixo com grade de pontos, linhas e uma varredura lenta;
 *   - cursor HUD próprio.
 *
 * As preferências visuais ("reduzir movimento", "alto contraste") vivem
 * aqui em contexto, salvas na conta (`user_metadata.visual_prefs`) e
 * espelhadas no `localStorage`.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LinkPending, NavPendingProvider } from "../../_design/NavPending";
import { BootMinDurationOverlay } from "../../_boundaries/BootMinDurationOverlay";
import { setAppearOffline } from "../../../lib/campaign/presencePreferenceActions";
import { heartbeatAccountPresence } from "../../../lib/campaign/accountPresenceActions";
import { signOut, updateVisualPrefs } from "../../../lib/auth/actions";
import {
  AlertTriangle, BookText, CheckCircle, ChevronDown, Eye, EyeOff, LayoutGrid, LogOut,
  Plus, Spinner, Ticket, UserCog, Users, X,
} from "../../_design/icons";
import "../../_design/app.css";
import "../../_design/areaGlobal.css";
import "../../_design/areaV1.css";
import { MarcaRuptura } from "../../_design/Marca";
import { oxanium } from "../../_design/oxanium";
import { teko } from "../../_design/teko";

export type NavKey = "campaigns" | "characters" | "compendium" | "account";

/** Grupos e números como o menu de passos da Forja; o ícone só aparece com a barra recolhida. */
const NAV_ITEMS: { key: NavKey; label: string; grupo: string; href: string; icon: React.ReactNode }[] = [
  { key: "campaigns", label: "Campanhas", grupo: "Operações", href: "/mesas", icon: <LayoutGrid size={18} strokeWidth={1.5} /> },
  { key: "characters", label: "Personagens", grupo: "Operações", href: "/mesas/personagens", icon: <Users size={18} strokeWidth={1.5} /> },
  { key: "compendium", label: "Compêndio", grupo: "Arquivo", href: "/mesas/compendio", icon: <BookText size={18} strokeWidth={1.5} /> },
  { key: "account", label: "Conta", grupo: "Sistema", href: "/mesas/conta", icon: <UserCog size={18} strokeWidth={1.5} /> },
];

const PREFS_KEY = "ruptura.prefs";

// ── Preferências visuais ────────────────────────────────────────────
export interface VisualPrefs { reduceMotion: boolean; highContrast: boolean }
interface PrefsContextValue {
  prefs: VisualPrefs;
  togglePref: (key: keyof VisualPrefs) => void;
}
const PrefsContext = createContext<PrefsContextValue | null>(null);

/** Preferências visuais do shell global. Só funciona dentro de <GlobalShell>. */
export function useVisualPrefs(): PrefsContextValue {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("useVisualPrefs precisa estar dentro de <GlobalShell>.");
  return ctx;
}

// ── Toasts ──────────────────────────────────────────────────────────
export type ToastKind = "success" | "error" | "info";
interface Toast { id: number; kind: ToastKind; text: string }
const ToastContext = createContext<((kind: ToastKind, text: string) => void) | null>(null);

/** Empurra um aviso efêmero no rodapé. Fora do shell, vira no-op. */
export function usePushToast() {
  return useContext(ToastContext) ?? (() => undefined);
}

// ── Cursor HUD ──────────────────────────────────────────────────────
/**
 * Exportado para o Console do Personagem (`src/app/ficha/_console/`)
 * reusar o MESMO tracking (mousemove/hover/click), em vez de uma
 * implementação paralela — o Console não passa por `GlobalShell`, mas
 * precisa do mesmo cursor HUD do resto do VTT.
 */
/**
 * SÓ UM cursor HUD desenha por vez, em toda a aplicação.
 *
 * O Console monta o seu próprio porque também roda sozinho em `/ficha`,
 * onde não há casca de campanha. Aberto dentro da campanha — ou sobre
 * Personagens, pelo modal interceptado — já existe outro, e dois anéis
 * perseguindo o mesmo ponteiro com a mesma interpolação aparecem como
 * cursor duplicado.
 *
 * O registro é de MÓDULO, e não um contexto de React, porque o modal de
 * ficha vive no slot paralelo `@modal`: ele não é descendente da casca
 * que desenhou o primeiro cursor, e nenhum contexto desceria até lá.
 *
 * Quem chega primeiro desenha. Se esse sair, os demais são avisados e o
 * próximo assume — senão fechar a casca deixaria todo mundo sem cursor.
 */
const instanciasDeCursor: symbol[] = [];
const ouvintesDeCursor = new Set<() => void>();
function avisarCursores() { for (const f of [...ouvintesDeCursor]) f(); }

export function HudCursor({ enabled }: { enabled: boolean }) {
  const id = useRef<symbol>(undefined as unknown as symbol);
  if (id.current === undefined) id.current = Symbol("hud-cursor");
  const [desenha, setDesenha] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const meu = id.current;
    instanciasDeCursor.push(meu);
    const recalcular = () => setDesenha(instanciasDeCursor[0] === meu);
    ouvintesDeCursor.add(recalcular);
    avisarCursores();
    return () => {
      ouvintesDeCursor.delete(recalcular);
      const i = instanciasDeCursor.indexOf(meu);
      if (i >= 0) instanciasDeCursor.splice(i, 1);
      avisarCursores();
    };
  }, [enabled]);
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: -300, y: -300 });
  const ring = useRef({ x: -300, y: -300 });
  const raf = useRef(0);
  const hovering = useRef(false);

  useEffect(() => {
    if (!enabled || !desenha) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const onMove = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
      if (dotRef.current) dotRef.current.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 3}px)`;
      const target = e.target as HTMLElement | null;
      const hoverable = target?.closest?.("button, a, input, select, textarea, [role='tab'], [role='button'], [data-cursor-action='true'], label");
      if (hoverable && !hovering.current) {
        hovering.current = true;
        ringRef.current?.classList.add("ra-cursor-ring--hover");
      } else if (!hoverable && hovering.current) {
        hovering.current = false;
        ringRef.current?.classList.remove("ra-cursor-ring--hover");
      }
    };
    const tick = () => {
      ring.current.x += (mouse.current.x - ring.current.x) * 0.14;
      ring.current.y += (mouse.current.y - ring.current.y) * 0.14;
      if (ringRef.current) ringRef.current.style.transform = `translate(${ring.current.x - 17}px, ${ring.current.y - 17}px)`;
      raf.current = requestAnimationFrame(tick);
    };
    // O anel e o PONTO viram âmbar juntos: o clique é um só gesto, e o
    // ponto é a parte do cursor que se olha.
    const onDown = () => {
      ringRef.current?.classList.add("ra-cursor-ring--click");
      dotRef.current?.classList.add("ra-cursor-dot--click");
    };
    const onUp = () => {
      ringRef.current?.classList.remove("ra-cursor-ring--click");
      dotRef.current?.classList.remove("ra-cursor-dot--click");
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
  }, [enabled, desenha]);

  if (!enabled || !desenha) return null;
  return (
    <>
      <div ref={dotRef} className="ra-cursor-dot" aria-hidden="true" />
      <div ref={ringRef} className="ra-cursor-ring" aria-hidden="true" />
    </>
  );
}


// ── Shell ───────────────────────────────────────────────────────────
/**
 * Rota ativa DERIVADA do pathname, não recebida por prop.
 *
 * Mudou porque a casca saiu das páginas e subiu para o layout do grupo
 * `(global)` — e um layout não sabe (nem deve saber) qual das quatro
 * rotas filhas está em cena. `usePathname` já estava aqui de qualquer
 * forma; a prop `active` só duplicava, em quatro lugares, uma
 * informação que o próprio componente tinha.
 *
 * Ordem importa: `/mesas` é prefixo de todas as outras, então a
 * checagem exata dele vem por último.
 */
function rotaAtiva(pathname: string): NavKey | null {
  if (pathname.startsWith("/mesas/personagens")) return "characters";
  if (pathname.startsWith("/mesas/compendio")) return "compendium";
  if (pathname.startsWith("/mesas/conta")) return "account";
  if (pathname === "/mesas") return "campaigns";
  return null;
}

export function GlobalShell({
  userEmail,
  displayName,
  avatarPath = null,
  visualPrefsIniciais = null,
  aparecerOfflineInicial = false,
  contagens = null,
  children,
}: {
  /** Números ao lado de Campanhas e Personagens no menu. Null = não mostra. */
  contagens?: { campanhas: number; personagens: number } | null;
  userEmail: string;
  displayName: string | null;
  /** Caminho do avatar da conta; muda a cada troca e serve de chave de cache da imagem. */
  avatarPath?: string | null;
  /** Preferências visuais salvas na conta; null quando nunca foram salvas. */
  visualPrefsIniciais?: VisualPrefs | null;
  /** "Aparecer offline" lido no servidor — é preferência de CONTA, não deste navegador. */
  aparecerOfflineInicial?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const ativo = rotaAtiva(pathname);

  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [aparecerOffline, setAparecerOffline] = useState(aparecerOfflineInicial);
  const [presencaOcupada, setPresencaOcupada] = useState(false);
  // A Rede mede atividade na conta, inclusive nesta página fora de uma mesa.
  useEffect(() => {
    let ativo = true;
    const renovar = async () => {
      const ok = await heartbeatAccountPresence();
      if (ok && ativo && pathname === "/mesas") router.refresh();
    };
    void renovar();
    const timer = window.setInterval(() => { void renovar(); }, 60_000);
    const aoVoltar = () => { void renovar(); };
    window.addEventListener("focus", aoVoltar);
    return () => { ativo = false; window.clearInterval(timer); window.removeEventListener("focus", aoVoltar); };
  }, [pathname, router]);
  const [prefs, setPrefs] = useState<VisualPrefs>(visualPrefsIniciais ?? { reduceMotion: false, highContrast: false });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);

  // Conta que nunca salvou: herda o que este navegador guardava antes de
  // as preferências irem para a conta, e já grava lá. Depois da
  // hidratação, para não divergir do HTML do servidor.
  useEffect(() => {
    if (visualPrefsIniciais) return;
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<VisualPrefs>;
        const herdadas = { reduceMotion: !!parsed.reduceMotion, highContrast: !!parsed.highContrast };
        setPrefs(herdadas);
        void updateVisualPrefs(herdadas);
      }
    } catch {
      /* localStorage indisponível (modo privado, etc.) — segue com o padrão. */
    }
  }, [visualPrefsIniciais]);

  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const togglePref = useCallback((key: keyof VisualPrefs) => {
    const next = { ...prefsRef.current, [key]: !prefsRef.current[key] };
    setPrefs(next);
    try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* ignora */ }
    void updateVisualPrefs(next);
  }, []);

  const pushToast = useCallback((kind: ToastKind, text: string) => {
    const id = ++toastSeq.current;
    setToasts((prev) => [...prev, { id, kind, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3600);
  }, []);

  // Fecha o menu de perfil ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

  // Navegar fecha o menu de perfil (o Link já trocou a rota).
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  /**
   * A preferência é da CONTA, não deste navegador — por isso não vai
   * para o localStorage junto das preferências visuais, e por isso um
   * `router.refresh()` no fim: as projeções de presença são calculadas
   * no servidor e precisam ser recalculadas com o novo valor.
   */
  async function handleAparecerOffline() {
    if (presencaOcupada) return;
    const proximo = !aparecerOffline;
    setPresencaOcupada(true);
    setAparecerOffline(proximo); // otimista: o menu responde na hora
    const resultado = await setAppearOffline(proximo);
    setPresencaOcupada(false);
    if (!resultado.ok) {
      setAparecerOffline(!proximo);
      pushToast("error", resultado.error);
      return;
    }
    pushToast("success", proximo ? "Você está aparecendo offline." : "Você voltou a aparecer online.");
    router.refresh();
  }

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.push("/login");
    router.refresh();
  }

  const shortName = useMemo(() => {
    const base = displayName?.trim() || userEmail.split("@")[0] || "Operador";
    return base.split(" ")[0];
  }, [displayName, userEmail]);

  const prefsValue = useMemo(() => ({ prefs, togglePref }), [prefs, togglePref]);

  const rootClass = [
    "ra-root",
    "ag",
    "v1",
    oxanium.variable,
    teko.variable,
    prefs.highContrast ? "ra-hc" : "",
    prefs.reduceMotion ? "ra-reduce-motion ra-no-cursor" : "",
  ].filter(Boolean).join(" ");

  return (
    <PrefsContext.Provider value={prefsValue}>
      <ToastContext.Provider value={pushToast}>
        {/* Agrega `useLinkStatus()` de todo `<LinkPending>` desta casca
            numa contagem única — é o sinal que `BootMinDurationOverlay`
            (dentro de `.v1-conteudo`, abaixo) usa pra saber se alguma
            navegação está em voo. Precisa envolver TANTO os links do
            menu quanto a sobreposição, então fica na raiz da árvore. */}
        <NavPendingProvider>
        <div className={rootClass}>
          <HudCursor enabled={!prefs.reduceMotion} />

          {/* Fundo da V1: a arte do HUD de campanhas com tinta, gradiente,
              máscara, grade de pontos, linhas de varredura e uma varredura
              lenta que desce em loop. */}
          <div className="v1-fundo" aria-hidden="true">
            <div className="v1-fundo-img" />
            <div className="v1-fundo-tinta" />
            <div className="v1-fundo-grad" />
            <div className="v1-fundo-mascara" />
            <div className="v1-fundo-pontos" />
            <div className="v1-fundo-linhas" />
            <div className="v1-fundo-varredura v1-scanline" />
          </div>

          <header className="v1-cab v1-e1">
            <Link href="/mesas" className="v1-marca" aria-label="Ruptura VTT — Minhas Campanhas">
              <MarcaRuptura como="span" />
            </Link>

            <nav className="v1-nav" aria-label="Navegação global">
              {NAV_ITEMS.filter((item) => item.key !== "account").map((item) => {
                const isActive = ativo === item.key;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    data-testid={`nav-${item.key}`}
                    aria-current={isActive ? "page" : undefined}
                    className={`v1-sub v1-nav-item${isActive ? " on" : ""}`}
                  >
                    {item.label}
                    {/* Destino pendente — ver `NavPending.tsx`. */}
                    <LinkPending />
                  </Link>
                );
              })}
            </nav>

            <div className="v1-perfil-ancora" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="v1-u v1-perfil"
                data-testid="topbar-perfil"
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="v1-banner" src="/forja/classes/vanguarda.webp" alt="" aria-hidden="true" />
                <span className="v1-perfil-veu" aria-hidden="true" />
                <span className="v1-hex v1-perfil-hex" aria-hidden="true">
                  {avatarPath
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={`/api/conta/avatar?v=${encodeURIComponent(avatarPath)}`} alt="" />
                    : shortName.charAt(0).toUpperCase()}
                </span>
                <span className="v1-perfil-texto">
                  <span className="v1-perfil-nome">{shortName}</span>
                  {/* A etiqueta era "Online" fixo — dizia a mesma coisa
                      para quem tinha acabado de se esconder. */}
                  <span className="v1-perfil-linha">
                    <span className="v1-perfil-presenca" data-offline={aparecerOffline || undefined} data-testid="topbar-presenca">
                      {aparecerOffline ? "○ " : "● "}<span className="ra-online-txt">{aparecerOffline ? "Offline" : "Online"}</span>
                    </span>
                    {contagens && <> · {contagens.campanhas} {contagens.campanhas === 1 ? "campanha" : "campanhas"}</>}
                  </span>
                </span>
                <ChevronDown size={14} strokeWidth={2.5} className={`v1-perfil-seta${menuOpen ? " v1-perfil-seta--aberta" : ""}`} />
              </button>

              {menuOpen && (
                <div className="v1-menu" role="menu">
                  <Link href="/mesas?novo=1" role="menuitem" className="v1-item" data-testid="account-nav-criar-campanha">
                    <Plus size={15} /> Criar campanha
                  </Link>
                  <Link href="/mesas/conta" role="menuitem" className="v1-item" data-testid="account-nav-conta">
                    <UserCog size={15} /> Conta e preferências
                  </Link>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={aparecerOffline}
                    className="v1-u v1-item"
                    data-testid="account-aparecer-offline"
                    onClick={handleAparecerOffline}
                    disabled={presencaOcupada}
                  >
                    {/* O rótulo diz o que o clique faz: escondida, oferece voltar a aparecer online. */}
                    {aparecerOffline ? <Eye size={15} /> : <EyeOff size={15} />}
                    {aparecerOffline ? "Aparecer online" : "Aparecer offline"}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="v1-u v1-item v1-item--perigo"
                    data-testid="account-nav-sair"
                    onClick={handleSignOut}
                    disabled={signingOut}
                    aria-busy={signingOut}
                  >
                    {signingOut ? <Spinner size={15} className="mo-spin" /> : <LogOut size={15} />} {signingOut ? "Saindo…" : "Sair"}
                  </button>
                </div>
              )}
            </div>
          </header>

          <div className="v1-conteudo">
            {children}
            <BootMinDurationOverlay label="Carregando" />
          </div>

          {/* Sair é a ação mais lenta da casca (Server Action + dois
              `router.*`): a cortina diz o que está acontecendo. */}
          {signingOut && (
            <div className="v1-cortina v1-saida" role="status" aria-live="polite">
              <div className="v1-saida-corpo">
                <MarcaRuptura como="span" className="v1-saida-marca" />
                <span className="v1-saida-txt v1-carregando">Encerrando sessão…</span>
              </div>
            </div>
          )}

          <div className="v1-toasts" aria-live="polite">
            {toasts.map((t) => (
              <div key={t.id} className={`v1-toast v1-toast--${t.kind}`}>
                {t.kind === "success" ? <CheckCircle size={14} /> : t.kind === "error" ? <AlertTriangle size={14} /> : <Ticket size={14} />}
                {t.text}
                <span className="v1-encolhe v1-toast-tempo" aria-hidden="true" />
              </div>
            ))}
          </div>
        </div>
        </NavPendingProvider>
      </ToastContext.Provider>
    </PrefsContext.Provider>
  );
}

/** Botão de fechar padrão dos modais do shell. */
export function ModalCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="ra-iconbtn ra-modal-close" onClick={onClose} aria-label="Fechar">
      <X size={16} />
    </button>
  );
}
