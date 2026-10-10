"use client";

/**
 * "Conta e preferências" (aditivo §4.3), agora dentro do shell global.
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
import { PageHead } from "../../_global/parts";
import {
  AlertTriangle, Check, Lock, LogOut, Monitor, Shield, Spinner, User, Zap,
} from "../../../_design/icons";

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

const AUTOSAVE_DELAY_MS = 700;

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state.kind === "saving") {
    return (
      <span className="ra-save ra-save--saving" role="status" aria-live="polite">
        <Spinner size={11} className="ra-spin" /> Salvando…
      </span>
    );
  }
  if (state.kind === "saved") {
    return (
      <span className="ra-save ra-save--saved" role="status" aria-live="polite">
        <Check size={11} /> Salvo
      </span>
    );
  }
  if (state.kind === "error") {
    return (
      <span className="ra-save ra-save--error" role="status" aria-live="polite">
        <AlertTriangle size={11} /> Falha ao salvar: {state.message}
        <button type="button" className="ra-linkbtn" data-testid="conta-tentar-novamente" onClick={onRetry}>
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
}: {
  email: string;
  displayNameInicial: string | null;
  avatarPathInicial: string | null;
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

  return (
    <div className="ra2-page ra2-page--narrow ra2-view-enter">
      <PageHead eyebrow="SYS.OPERATOR // PERFIL" title="Conta e preferências" />

      <div className="ra-module">
        <div className="ra-module-title">Identidade</div>
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
          {/* Avatar: o próprio quadro é o botão de trocar. */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flex: "none" }}>
            <button
              type="button"
              data-testid="conta-avatar"
              aria-label={avatarPath ? "Trocar avatar" : "Enviar avatar"}
              title={avatarPath ? "Trocar avatar" : "Enviar avatar"}
              disabled={avatarOcupado}
              onClick={() => inputAvatar.current?.click()}
              className="ra-avatar-upload"
            >
              {avatarOcupado ? (
                <Spinner size={22} className="ra-spin" />
              ) : avatarPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/conta/avatar?v=${encodeURIComponent(avatarPath)}`} alt="" width={112} height={112} />
              ) : (
                <User size={40} strokeWidth={1.1} />
              )}
              <span className="ra-avatar-upload__veu" aria-hidden="true">
                <ImageUp size={20} strokeWidth={1.5} />
                <span>{avatarPath ? "Trocar" : "Enviar"}</span>
              </span>
            </button>
            {avatarPath && (
              <button type="button" className="ra-linkbtn" disabled={avatarOcupado} onClick={() => void removerAvatar()}>
                Remover
              </button>
            )}
          </div>
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

          <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="ra-field" style={{ margin: 0 }}>
              <label className="ra-flabel" htmlFor="conta-nome-exibicao">Nome de exibição</label>
              <input
                id="conta-nome-exibicao"
                data-testid="conta-nome-exibicao"
                className="ra-input"
                type="text"
                value={displayName}
                maxLength={60}
                onChange={(e) => { setDisplayName(e.target.value); scheduleSave(e.target.value); }}
                placeholder="Como você quer aparecer nas suas campanhas"
              />
              <span className="ra-hint" style={{ marginTop: 6 }}>
                É como você aparece para as pessoas das suas campanhas: na mesa, na Rede e no seu perfil.
              </span>
              {saveState.kind !== "idle" && (
                <div style={{ marginTop: 6 }}>
                  <SaveIndicator state={saveState} onRetry={() => persist(displayName)} />
                </div>
              )}
            </div>

            <div className="ra-field" style={{ margin: 0 }}>
              <span className="ra-flabel">E-mail</span>
              <div
                className="ra-mono"
                style={{ fontSize: 12.5, color: "rgba(184,216,232,.6)", display: "flex", alignItems: "center", gap: 6 }}
              >
                <Lock size={12} />
                <span data-testid="conta-email" style={{ wordBreak: "break-all" }}>{email}</span>
              </div>
            </div>

            {avatarErro && !arquivoAvatar && (
              <div className="ra-save ra-save--error" role="alert">
                <AlertTriangle size={11} /> {avatarErro}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="ra-module">
        <div className="ra-module-title"><Monitor size={12} /> Preferências visuais</div>

        <div className="ra-toggle-row">
          <div className="ra-toggle-copy">
            <strong><Zap size={12} /> Reduzir movimento</strong>
            <span>Desativa parallax, cursor HUD e animações ambientais.</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.reduceMotion}
            aria-label="Reduzir movimento"
            data-testid="conta-reduzir-movimento"
            className={`ra-switch${prefs.reduceMotion ? " ra-switch--on" : ""}`}
            onClick={() => togglePref("reduceMotion")}
          >
            <span className="ra-switch-knob" />
          </button>
        </div>

        <div className="ra-toggle-row">
          <div className="ra-toggle-copy">
            <strong><Shield size={12} /> Alto contraste</strong>
            <span>Reforça bordas e legibilidade dos painéis HUD.</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.highContrast}
            aria-label="Alto contraste"
            data-testid="conta-alto-contraste"
            className={`ra-switch${prefs.highContrast ? " ra-switch--on" : ""}`}
            onClick={() => togglePref("highContrast")}
          >
            <span className="ra-switch-knob" />
          </button>
        </div>
      </div>

      <div className="ra-module">
        <div className="ra-module-title">Sessão</div>
        <div className="ra-kv">
          <div><span>Terminal</span><span className="ra-kv-v">WEB // NAVEGADOR</span></div>
          <div><span>Conta</span><span className="ra-kv-v">{email}</span></div>
          <div><span>Status</span><span style={{ color: "#22d3aa" }}>● Conectado</span></div>
        </div>
        <div style={{ marginTop: 18 }}>
          <button
            type="button"
            className="ra-btn ra-btn--danger ra-btn--block"
            data-testid="conta-encerrar-sessao"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            <LogOut size={14} /> {signingOut ? "Encerrando…" : "Encerrar sessão"}
          </button>
        </div>
      </div>
    </div>
  );
}
