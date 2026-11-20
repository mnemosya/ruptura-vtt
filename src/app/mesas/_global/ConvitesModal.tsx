"use client";

/**
 * "Jogadores e convites" aberto a partir da Rede, em Minhas Campanhas.
 *
 * É a MESMA janela que o narrador abre dentro da mesa
 * (`vtt/_painel/janelas/JanelasAdmin.tsx`): as mesmas ações de servidor,
 * com a mesma checagem de narrador. O que muda é a moldura (V1) e uma
 * fileira para trocar de campanha, porque aqui a pessoa pode narrar
 * várias.
 *
 * Remover participante e revogar convite pedem um segundo clique em até
 * 3 s — a confirmação de duas etapas da janela da mesa.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Campaign } from "../../../lib/table";
import { usePresence } from "../../_design/usePresence";
import { Check, Spinner, X } from "../../_design/icons";
import {
  criarConviteAction,
  enviarConviteAction,
  lerJogadoresConvitesAction,
  removerParticipanteAction,
  revogarConviteAction,
  type DadosJogadoresConvites,
} from "../[campaignId]/vtt/_painel/acoes/administracaoPainel";
import { capaDaCampanha } from "./parts";

function iniciais(nome: string): string {
  return nome.trim().split(/\s+/).map((w) => w.charAt(0)).join("").slice(0, 2).toUpperCase() || "?";
}

export function ConvitesModal({ aberto, campanhas, campanhaInicial, onClose }: {
  aberto: boolean;
  /** Só as campanhas que esta conta narra. */
  campanhas: Campaign[];
  campanhaInicial: string | null;
  onClose: () => void;
}) {
  const { montado } = usePresence(aberto, 180);
  const [campanhaId, setCampanhaId] = useState<string | null>(campanhaInicial);
  const [troca, setTroca] = useState(0);
  const [dados, setDados] = useState<DadosJogadoresConvites | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [rotulo, setRotulo] = useState("");
  const [email, setEmail] = useState("");
  const [statusEnvio, setStatusEnvio] = useState<string | null>(null);
  const [linkNovo, setLinkNovo] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirma, setConfirma] = useState<string | null>(null);
  const confirmaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contexto = useRef(0);

  // Ao abrir, começa pela campanha que estava em destaque.
  useEffect(() => {
    contexto.current += 1;
    if (aberto) {
      setCampanhaId(campanhaInicial);
      setRotulo("");
      setEmail("");
      setStatusEnvio(null);
      setLinkNovo(null);
      setCopiado(false);
      setConfirma(null);
    }
  }, [aberto, campanhaInicial]);

  const carregar = useCallback(async (id: string) => {
    const contextoAtual = contexto.current;
    setErro(null);
    const r = await lerJogadoresConvitesAction(id);
    if (contexto.current !== contextoAtual) return;
    if (r.ok && r.dados) setDados(r.dados);
    else { setDados(null); setErro(r.erro ?? "Falha ao carregar jogadores e convites."); }
  }, []);

  useEffect(() => {
    if (!aberto || !campanhaId) return;
    setDados(null);
    void carregar(campanhaId);
  }, [aberto, campanhaId, carregar]);

  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberto, onClose]);

  useEffect(() => () => { if (confirmaTimer.current) clearTimeout(confirmaTimer.current); }, []);

  if (!montado) return null;
  const campanha = campanhas.find((c) => c.id === campanhaId) ?? null;

  function trocar(id: string) {
    if (id === campanhaId || ocupado === "email") return;
    contexto.current += 1;
    setCampanhaId(id); setTroca((n) => n + 1); setRotulo(""); setEmail(""); setStatusEnvio(null); setLinkNovo(null); setCopiado(false); setConfirma(null);
  }

  /** Segundo clique em até 3 s executa; o primeiro só arma. */
  function confirmar(chave: string, acao: () => Promise<void>) {
    if (confirma === chave) { setConfirma(null); void acao(); return; }
    setConfirma(chave);
    if (confirmaTimer.current) clearTimeout(confirmaTimer.current);
    confirmaTimer.current = setTimeout(() => setConfirma((c) => (c === chave ? null : c)), 3000);
  }

  async function executar(chave: string, fn: () => Promise<{ ok: boolean; erro?: string }>) {
    if (!campanhaId || ocupado) return;
    setOcupado(chave); setErro(null);
    const r = await fn();
    setOcupado(null);
    if (!r.ok) { setErro(r.erro ?? "Falha na operação."); return; }
    await carregar(campanhaId);
  }

  async function gerar() {
    if (!campanhaId || ocupado) return;
    setStatusEnvio(null);
    setOcupado("novo"); setErro(null); setCopiado(false);
    const r = await criarConviteAction(campanhaId, rotulo, window.location.origin);
    setOcupado(null);
    if (!r.ok || !r.dados) { setErro(r.erro ?? "Falha ao criar o convite."); return; }
    setLinkNovo(r.dados.link);
    setRotulo("");
    await carregar(campanhaId);
  }

  async function enviar() {
    if (!campanhaId || ocupado) return;
    const contextoDoEnvio = contexto.current;
    setOcupado("email");
    setErro(null);
    setStatusEnvio(null);
    setLinkNovo(null);
    setCopiado(false);
    try {
      const r = await enviarConviteAction(campanhaId, email, rotulo);
      if (contexto.current !== contextoDoEnvio) return;
      if (!r.ok || !r.dados) {
        setErro(r.erro ?? "Falha ao criar o convite por e-mail.");
        return;
      }
      setLinkNovo(r.dados.link);
      setStatusEnvio(r.dados.enviado
        ? `Convite enviado para ${email.trim()}.`
        : "O convite foi criado, mas o envio não foi confirmado. Você pode copiar o link abaixo.");
      setEmail("");
      setRotulo("");
      await carregar(campanhaId);
    } catch {
      if (contexto.current === contextoDoEnvio) {
        setErro("Não foi possível confirmar a operação. Confira a lista de convites antes de tentar de novo.");
      }
    } finally {
      setOcupado(null);
    }
  }

  // "sai" só quando está fechando (ver a nota no modal de criar campanha).
  const sai = aberto ? "" : " sai";
  const participantes = dados?.participantes ?? [];

  return (
    <>
      <div className={`v1-veu${sai}`} onMouseDown={onClose} aria-hidden="true" />
      <div className={`v1-modal v1-modal--convites${sai}`} role="dialog" aria-modal="true" aria-label="Jogadores e convites" data-testid="dash-janela-convites">
        <div className="v1-conv-capa">
          {campanha && <div key={troca} className={`v1-conv-capa-img${troca ? " v1-wipe-a" : ""}`} style={capaDaCampanha(campanha)} aria-hidden="true" />}
          <div className="v1-modal-capa-veu" aria-hidden="true" />
          <button type="button" className="v1-u v1-fechar" onClick={onClose} aria-label="Fechar"><X size={14} /></button>
          <div className="v1-modal-capa-texto">
            <span className="v1-modal-sobrancelha v1-modal-sobrancelha--cy">Jogadores e convites</span>
            <span key={troca} className={`v1-modal-nome${troca ? " v1-glitch-a" : ""}`}>{campanha?.name ?? "—"}</span>
          </div>
        </div>

        {campanhas.length > 1 && (
          <div className="v1-conv-campanhas" role="tablist" aria-label="Campanha">
            {campanhas.map((c) => {
              const on = c.id === campanhaId;
              return (
                <button key={c.id} type="button" role="tab" aria-selected={on} disabled={ocupado === "email"} className={`v1-u v1-dest${on ? " on" : ""}`} onClick={() => trocar(c.id)}>
                  <span className="v1-dest-arte" style={capaDaCampanha(c)} aria-hidden="true" />
                  <span className="v1-dest-nome">{c.name}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="v1-conv-corpo">
          {erro && <span role="alert" className="v1-campo-erro">{erro}</span>}
          {!dados && !erro ? (
            <span className="v1-painel-nota v1-carregando">Carregando…</span>
          ) : dados && (
            <>
              <div className="v1-conv-secao">
                <h3 className="v1-conv-titulo">Participantes</h3>
                <span className="v1-painel-info">{participantes.length} na campanha</span>
              </div>
              <ul className="v1-conv-pessoas">
                {participantes.map((p, i) => {
                  const chave = `m:${p.userId}`, conf = confirma === chave;
                  const narrador = p.role === "narrator";
                  return (
                    <li key={`${troca}-${p.userId}`} className="v1-rede v1-carta-a v1-conv-pessoa" style={{ animationDelay: `${(i * 0.03).toFixed(2)}s` }}>
                      <span className={`v1-hex v1-pessoa-hex${narrador ? " v1-pessoa-hex--eu" : ""}`} aria-hidden="true">{iniciais(p.displayName)}</span>
                      <span className="v1-pessoa-texto">
                        <span className="v1-pessoa-nome">{p.displayName}</span>
                        <span className={`v1-conv-papel${narrador ? " v1-conv-papel--narrador" : ""}`}>◆ {narrador ? "Narrador" : "Jogador"}</span>
                      </span>
                      {!narrador && (
                        <button type="button" className={`v1-u v1-ghost v1-perigo${conf ? " on" : ""}`} disabled={ocupado === chave}
                          data-testid="dash-convites-remover-participante"
                          onClick={() => confirmar(chave, () => executar(chave, () => removerParticipanteAction(campanhaId!, p.userId)))}>
                          {ocupado === chave ? <Spinner size={11} className="mo-spin" /> : conf ? "Confirmar" : "Remover"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>

              <h3 className="v1-conv-titulo">Convites</h3>
              <div className="v1-conv-novo">
                <label className="v1-campo-grupo">
                  <span className="v1-campo-rotulo">Rótulo do convite · <span className="v1-campo-opcional">Opcional</span></span>
                  <input className="v1-u v1-campo v1-campo--peq" value={rotulo} onChange={(e) => setRotulo(e.target.value)}
                    placeholder="Ex.: grupo da terça" data-testid="dash-convites-rotulo" />
                </label>
                <button type="button" className="v1-u v1-criar v1-btn-gerar" onClick={() => void gerar()} disabled={ocupado !== null} data-testid="dash-convites-gerar">
                  {ocupado === "novo" ? <Spinner size={13} className="mo-spin" /> : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>}
                  {ocupado === "novo" ? "Gerando…" : "Gerar link de convite"}
                </button>
                <form className="v1-campo-grupo" onSubmit={(event) => { event.preventDefault(); void enviar(); }}>
                  <label className="v1-campo-grupo">
                    <span className="v1-campo-rotulo">E-mail do jogador</span>
                    <input type="email" autoComplete="email" required maxLength={254} value={email} disabled={ocupado === "email"}
                      className="v1-u v1-campo v1-campo--peq" onChange={(event) => setEmail(event.target.value)}
                      data-testid="dash-convites-email" />
                  </label>
                  <button type="submit" className="v1-u v1-criar v1-btn-gerar" disabled={ocupado !== null} data-testid="dash-convites-enviar">
                    {ocupado === "email" ? "Enviando…" : "Enviar convite"}
                  </button>
                </form>
                {statusEnvio && <p role="status" className="v1-painel-nota">{statusEnvio}</p>}
                {linkNovo && (
                  <div className="v1-conv-link v1-desliza-a">
                    <input readOnly value={linkNovo} className="v1-u v1-conv-link-txt" data-testid="dash-convites-link" onFocus={(e) => e.currentTarget.select()} />
                    <button type="button" className={`v1-u v1-criar v1-btn-copiar${copiado ? " v1-btn-copiar--ok" : ""}`}
                      onClick={() => { void navigator.clipboard?.writeText(linkNovo).then(() => setCopiado(true)); }}>
                      {copiado && <Check size={12} className="v1-check" />}{copiado ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                )}
              </div>
              {dados.convites.length === 0 ? (
                <div className="v1-conv-vazio">Nenhum convite criado ainda.</div>
              ) : (
                <ul className="v1-conv-lista">
                  {dados.convites.map((c) => {
                    const chave = `c:${c.id}`, conf = confirma === chave;
                    const estado = c.ativadoEm ? "Ativado" : c.ativo ? "Ativo" : "Revogado";
                    return (
                      <li key={c.id} className="v1-rede v1-conv-convite" data-estado={c.ativo ? "ativo" : "inativo"}>
                        <span className="v1-conv-pip" aria-hidden="true" />
                        <span className="v1-pessoa-texto">
                          <span className="v1-pessoa-nome">{c.label ?? (c.email ?? "Convite sem rótulo")}</span>
                          <span className="v1-pessoa-status">{c.kind === "email" ? "Por e-mail" : "Reutilizável"} · {estado}</span>
                        </span>
                        {c.ativo && (
                          <button type="button" className={`v1-u v1-ghost v1-perigo${conf ? " on" : ""}`} disabled={ocupado === chave}
                            data-testid="dash-convites-revogar"
                            onClick={() => confirmar(chave, () => executar(chave, () => revogarConviteAction(campanhaId!, c.id)))}>
                            {ocupado === chave ? <Spinner size={11} className="mo-spin" /> : conf ? "Confirmar" : "Revogar"}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
