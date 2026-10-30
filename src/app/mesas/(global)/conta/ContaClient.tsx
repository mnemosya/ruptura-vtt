"use client";

/**
 * "Conta e preferências" (aditivo §4.3), agora dentro do shell global,
 * no layout da V1 "Seco": o cartão do operador (avatar, nome, totais) à
 * esquerda e, à direita, Identidade, Preferências visuais e Sessão.
 *
 * Salvamento automático (aditivo §13.10): sem botão genérico "Salvar" —
 * grava em segundo plano, com atraso curto após a digitação parar, e
 * mostra só os estados discretos "Salvando…"/"Salvo"/"Falha ao salvar"
 * (com nova tentativa).
 *
 * As preferências visuais ("reduzir movimento", "alto contraste") são do
 * shell (`useVisualPrefs`), que as salva na conta em
 * `user_metadata.visual_prefs`; o avatar fica em `user_metadata.avatar_path`.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUp } from "lucide-react";
import { signOut, updateDisplayName } from "../../../../lib/auth/actions";
import { prepararRecorteQuadrado, TIPOS_ACEITOS } from "../../../../lib/vtt/imagePreparation";
import { JanelaRecorte } from "../../../ficha/_console/RecorteImagem";
import { enviarAvatarConta, removerAvatarConta } from "./avatarActions";
// A janela de recorte (`.rc-recorte-janela`) é estilizada no CSS do Console.
import "../../../_design/console.css";
import { useVisualPrefs } from "../../_global/GlobalShell";
import { AlertTriangle, Check, Lock, LogOut, Spinner } from "../../../_design/icons";

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

const AUTOSAVE_DELAY_MS = 700;

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state.kind === "saving") {
    return (
      <span className="v1-salvo" role="status" aria-live="polite">
        <Spinner size={11} className="mo-spin" /> Salvando…
      </span>
    );
  }
  if (state.kind === "saved") {
    return (
      <span className="v1-salvo v1-salvo--ok" role="status" aria-live="polite">
        <Check size={11} className="v1-check" /> Salvo
      </span>
    );
  }
  if (state.kind === "error") {
    return (
      <span className="v1-salvo v1-salvo--erro" role="status" aria-live="polite">
        <AlertTriangle size={11} /> Falha ao salvar: {state.message}
        <button type="button" className="v1-u v1-link" data-testid="conta-tentar-novamente" onClick={onRetry}>
          Tentar novamente
        </button>
      </span>
    );
  }
  return null;
}

export default function ContaClient({
  email,
  displayNameInicial,
  avatarPathInicial,
  contagens = null,
}: {
  email: string;
  displayNameInicial: string | null;
  avatarPathInicial: string | null;
  /** Totais do cartão do operador; null quando a leitura falhou (não mostra). */
  contagens?: { campanhas: number; personagens: number; narradas?: number } | null;
}) {
  const router = useRouter();
  const { prefs, togglePref } = useVisualPrefs();

  const [displayName, setDisplayName] = useState(displayNameInicial ?? "");
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [signingOut, setSigningOut] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef(displayNameInicial ?? "");
  const [avatarPath, setAvatarPath] = useState(avatarPathInicial);
  const [arquivoAvatar, setArquivoAvatar] = useState<File | null>(null);
  const [avatarOcupado, setAvatarOcupado] = useState(false);
  const [avatarErro, setAvatarErro] = useState<string | null>(null);
  const inputAvatar = useRef<HTMLInputElement>(null);

  async function salvarAvatar(recorte: { x: number; y: number; tamanho: number }) {
    if (!arquivoAvatar) return;
    setAvatarOcupado(true);
    setAvatarErro(null);
    try {
      const preparada = await prepararRecorteQuadrado(arquivoAvatar, recorte);
      URL.revokeObjectURL(preparada.previewUrl);
      const form = new FormData();
      form.append("avatar", preparada.blob, "avatar.webp");
      const res = await enviarAvatarConta(form);
      if (!res.ok) throw new Error(res.error);
      setAvatarPath(res.avatarPath);
      setArquivoAvatar(null);
      router.refresh();
    } catch (e) {
      setAvatarErro(e instanceof Error ? e.message : "Falha ao enviar o avatar.");
    } finally {
      setAvatarOcupado(false);
    }
  }

  async function removerAvatar() {
    setAvatarOcupado(true);
    setAvatarErro(null);
    const res = await removerAvatarConta();
    setAvatarOcupado(false);
    if (!res.ok) { setAvatarErro(res.error); return; }
    setAvatarPath(null);
    router.refresh();
  }

  async function persist(value: string) {
    setSaveState({ kind: "saving" });
    const res = await updateDisplayName(value);
    if (res.ok) {
      lastSavedRef.current = value;
      setSaveState({ kind: "saved" });
      router.refresh();
    } else {
      setSaveState({ kind: "error", message: res.error ?? "Erro ao salvar nome de exibição." });
    }
  }

  function scheduleSave(value: string) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => persist(value), AUTOSAVE_DELAY_MS);
  }

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  // Tenta concluir a alteração pendente antes de fechar/trocar de página (§13.10).
  useEffect(() => {
    function handleBeforeUnload() {
      if (timeoutRef.current && displayName !== lastSavedRef.current) void persist(displayName);
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [displayName]);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.push("/login");
    router.refresh();
  }

  const nomeVisivel = displayName.trim() || email.split("@")[0] || "Operador";

  return (
    <main className="v1-conta">
      <div className="v1-conta-grade">
        <section className="v1-e1 v1-operador" aria-label="Operador">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="v1-operador-banner" src="/forja/classes/vanguarda.webp" alt="" aria-hidden="true" />
          <div className="v1-operador-veu" aria-hidden="true" />
          <div className="v1-operador-corpo">
            {/* Avatar: o próprio quadro é o botão de trocar. */}
            <button
              type="button"
              data-testid="conta-avatar"
              aria-label={avatarPath ? "Trocar avatar" : "Enviar avatar"}
              title={avatarPath ? "Trocar avatar" : "Enviar avatar"}
              disabled={avatarOcupado}
              onClick={() => inputAvatar.current?.click()}
              className="v1-u v1-avatar v1-hex"
            >
              {avatarOcupado ? (
                <Spinner size={22} className="mo-spin" />
              ) : avatarPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/conta/avatar?v=${encodeURIComponent(avatarPath)}`} alt="" width={140} height={124} />
              ) : (
                <span className="v1-avatar-inicial">{nomeVisivel.charAt(0).toUpperCase()}</span>
              )}
              <span className="v1-avatar-veu" aria-hidden="true">
                <ImageUp size={20} strokeWidth={1.5} />
                <span>{avatarPath ? "Trocar" : "Enviar"}</span>
              </span>
            </button>
            {avatarPath && (
              <button type="button" className="v1-u v1-link" disabled={avatarOcupado} onClick={() => void removerAvatar()}>
                Remover
              </button>
            )}
            <input
              ref={inputAvatar}
              type="file"
              accept={TIPOS_ACEITOS.join(",")}
              hidden
              onChange={(ev) => {
                const f = ev.target.files?.[0];
                ev.target.value = "";
                if (f) { setAvatarErro(null); setArquivoAvatar(f); }
              }}
            />
            {arquivoAvatar && (
              <JanelaRecorte
                arquivo={arquivoAvatar}
                ocupado={avatarOcupado}
                erro={avatarErro}
                onConfirmar={(r) => void salvarAvatar(r)}
                onCancelar={() => { setArquivoAvatar(null); setAvatarErro(null); }}
              />
            )}
            {avatarErro && !arquivoAvatar && (
              <span className="v1-campo-erro" role="alert"><AlertTriangle size={11} /> {avatarErro}</span>
            )}
            <div className="v1-operador-nome-bloco">
              <span className="v1-operador-nome">{nomeVisivel}</span>
              <span className="v1-operador-presenca">● Online</span>
            </div>
            {contagens && (
              <div className="v1-operador-totais">
                <div><span className="v1-operador-n">{contagens.campanhas}</span><span className="v1-operador-rot">{contagens.campanhas === 1 ? "Campanha" : "Campanhas"}</span></div>
                {contagens.narradas !== undefined && <div><span className="v1-operador-n">{contagens.narradas}</span><span className="v1-operador-rot">Narra</span></div>}
                <div><span className="v1-operador-n">{contagens.personagens}</span><span className="v1-operador-rot">{contagens.personagens === 1 ? "Personagem" : "Personagens"}</span></div>
              </div>
            )}
          </div>
        </section>

        <div className="v1-conta-col">
          <div className="v1-e1 v1-conta-cab">
            <span className="v1-pg-sobrancelha">Perfil do operador</span>
            <h1 className="v1-glitch-a v1-conta-titulo">Conta e preferências</h1>
          </div>

          <section className="v1-e2 v1-modulo" aria-label="Identidade">
            <div className="v1-modulo-cab">
              <h2 className="v1-modulo-titulo">Identidade</h2>
              {saveState.kind !== "idle" && <SaveIndicator state={saveState} onRetry={() => persist(displayName)} />}
            </div>
            <label className="v1-campo-grupo" htmlFor="conta-nome-exibicao">
              <span className="v1-campo-rotulo">Nome de exibição</span>
              <input
                id="conta-nome-exibicao"
                data-testid="conta-nome-exibicao"
                className="v1-u v1-campo"
                type="text"
                value={displayName}
                maxLength={60}
                onChange={(e) => { setDisplayName(e.target.value); scheduleSave(e.target.value); }}
                placeholder="Como você quer aparecer nas suas campanhas"
              />
              <span className="v1-modulo-dica">É como você aparece para as pessoas das suas campanhas: na mesa, na Rede e no seu perfil.</span>
            </label>
            <div className="v1-campo-grupo">
              <span className="v1-campo-rotulo">E-mail</span>
              <span className="v1-conta-email"><Lock size={12} /><span data-testid="conta-email">{email}</span></span>
            </div>
          </section>

          <div className="v1-conta-dupla">
            <section className="v1-e3 v1-modulo" aria-label="Preferências visuais">
              <h2 className="v1-modulo-titulo">Preferências visuais</h2>
              <div className="v1-pref">
                <div className="v1-pref-texto">
                  <span className="v1-pref-titulo">Reduzir movimento</span>
                  <span className="v1-pref-desc">Desativa parallax, cursor HUD e animações ambientais.</span>
                </div>
                <button type="button" role="switch" aria-checked={prefs.reduceMotion} aria-label="Reduzir movimento"
                  data-testid="conta-reduzir-movimento" className={`v1-u v1-switch${prefs.reduceMotion ? " on" : ""}`}
                  onClick={() => togglePref("reduceMotion")}><span /></button>
              </div>
              <div className="v1-pref">
                <div className="v1-pref-texto">
                  <span className="v1-pref-titulo">Alto contraste</span>
                  <span className="v1-pref-desc">Reforça bordas e legibilidade dos painéis HUD.</span>
                </div>
                <button type="button" role="switch" aria-checked={prefs.highContrast} aria-label="Alto contraste"
                  data-testid="conta-alto-contraste" className={`v1-u v1-switch${prefs.highContrast ? " on" : ""}`}
                  onClick={() => togglePref("highContrast")}><span /></button>
              </div>
            </section>

            <section className="v1-e3 v1-modulo v1-modulo--sessao" aria-label="Sessão">
              <h2 className="v1-modulo-titulo">Sessão</h2>
              <dl className="v1-conta-kv">
                <div><dt>Terminal</dt><dd>WEB // NAVEGADOR</dd></div>
                <div><dt>Conta</dt><dd>{email}</dd></div>
                <div><dt>Status</dt><dd className="v1-conta-on"><span className="v1-carregando">●</span> Conectado</dd></div>
              </dl>
              <button
                type="button"
                className="v1-u v1-ghost v1-btn-sair"
                data-testid="conta-encerrar-sessao"
                onClick={handleSignOut}
                disabled={signingOut}
              >
                <LogOut size={14} /> {signingOut ? "Encerrando…" : "Encerrar sessão"}
              </button>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
