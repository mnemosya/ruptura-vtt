"use client";

/**
 * Jogadores e convites (aditivo §8) — consolida participantes,
 * convite por e-mail e convite limpo numa única área do narrador.
 * Reaproveita as mesmas Server Actions já testadas na Fase 1/2
 * (src/lib/table/storage.ts) — nenhuma regra de convite/participação
 * foi reimplementada aqui, só a apresentação.
 *
 * Fase 5: remover um participante agora também chama `reloadMembers()`
 * do provider, não só a lista local desta tela. O roster do painel de
 * sessão (aba Participantes, casca) vem do provider e sobrevive à
 * navegação — sem esta chamada ele seguia mostrando quem acabou de ser
 * removido até a janela perder e recuperar o foco. Criar ou revogar
 * convite NÃO precisa disso: nenhum dos dois mexe em `campaign_members`
 * na hora (a entrada de fato acontece quando a pessoa aceita, em outra
 * sessão — coberto pelas estratégias da correção #3 do plano).
 *
 * ERRO POR RECURSO (auditoria da Fase 5), mesmo padrão que o provider
 * já usa desde a Fase 3: participantes, convites e controles falham de
 * forma independente, então um erro de um NÃO pode ser apagado pelo
 * sucesso de outro nem esconder a seção que carregou bem. Nenhuma
 * releitura que falha zera a lista que já estava na tela — os dados
 * válidos ficam, o banner aparece por cima com "Tentar de novo".
 */
import { useState } from "react";
import {
  createCampaignInvite,
  createCampaignEmailInvite,
  listCampaignInvites,
  revokeCampaignInvite,
  listCampaignMembers,
  removeCampaignMember,
  getCampaignParticipantInfo,
  type CampaignParticipantInfo,
} from "../../../../lib/table/storage";
import { listCharacterControllers, type CharacterController } from "../../../../lib/character/storage";
import type { CampaignMember, CampaignInvite } from "../../../../lib/table";
import { useCampaignSession } from "../_shell/CampaignRealtimeProvider";

/** Falhas de LEITURA por recurso, vindas do SSR — ver `page.tsx`. */
export interface ErrosIniciais {
  membros?: string;
  convites?: string;
  controles?: string;
}

type ChaveRecurso = keyof ErrosIniciais;

interface Props {
  campaignId: string;
  membrosIniciais: CampaignMember[];
  convitesIniciais: CampaignInvite[];
  controlesIniciais: CharacterController[];
  /** Nome de exibição + e-mail por user_id (RPC get_campaign_participant_info, migration 0060) — nunca UUID cru na UI. */
  participantInfoIniciais: Record<string, CampaignParticipantInfo>;
  errosIniciais: ErrosIniciais;
}

export default function JogadoresConvitesClient({ campaignId, membrosIniciais, convitesIniciais, controlesIniciais, participantInfoIniciais, errosIniciais }: Props) {
  // Roster da CASCA (painel de sessão) — recarregado junto com a lista
  // local desta tela quando um participante sai; ver docblock acima.
  const { reloadMembers } = useCampaignSession();
  const [membros, setMembros] = useState(membrosIniciais);
  const [convites, setConvites] = useState(convitesIniciais);
  const [controles, setControles] = useState(controlesIniciais);
  const [participantInfo, setParticipantInfo] = useState<Record<string, CampaignParticipantInfo>>(participantInfoIniciais);
  const [conviteLabel, setConviteLabel] = useState("");
  const [conviteEmail, setConviteEmail] = useState("");
  const [conviteEmailLabel, setConviteEmailLabel] = useState("");
  const [linkNovo, setLinkNovo] = useState<string | null>(null);
  // Erros de LEITURA por recurso (nasce do SSR) e erro de AÇÃO, separado:
  // "não consegui listar os convites" e "não consegui revogar este
  // convite" são coisas diferentes e não podem se sobrescrever.
  const [erros, setErros] = useState<ErrosIniciais>(errosIniciais);
  const [acaoError, setAcaoError] = useState<string | null>(null);
  const [busyInvite, setBusyInvite] = useState(false);

  function definirErro(chave: ChaveRecurso, mensagem: string | null) {
    setErros((atual) => {
      if (mensagem === null) {
        if (atual[chave] === undefined) return atual;
        const proximo = { ...atual };
        delete proximo[chave];
        return proximo;
      }
      if (atual[chave] === mensagem) return atual;
      return { ...atual, [chave]: mensagem };
    });
  }

  function fail(err: unknown, msg: string) {
    setAcaoError(err instanceof Error ? err.message : msg);
  }

  // Nenhuma destas zera a lista em caso de falha: só grava quando a
  // leitura deu certo, e registra o erro do PRÓPRIO recurso.
  async function reloadMembros() {
    try {
      setMembros(await listCampaignMembers(campaignId));
      definirErro("membros", null);
    } catch (e) {
      definirErro("membros", e instanceof Error ? e.message : "Erro ao recarregar participantes.");
    }
  }
  async function reloadConvites() {
    try {
      setConvites(await listCampaignInvites(campaignId));
      definirErro("convites", null);
    } catch (e) {
      definirErro("convites", e instanceof Error ? e.message : "Erro ao recarregar convites.");
    }
  }
  async function reloadControles() {
    try {
      setControles(await listCharacterControllers(campaignId));
      definirErro("controles", null);
    } catch (e) {
      definirErro("controles", e instanceof Error ? e.message : "Erro ao recarregar controles de personagem.");
    }
  }
  async function reloadParticipantInfo() {
    try { setParticipantInfo(Object.fromEntries(await getCampaignParticipantInfo(campaignId))); } catch { /* nome/e-mail são só apresentação — falha não bloqueia a tela */ }
  }

  function nomeDe(userId: string): string {
    return participantInfo[userId]?.display_name ?? "Conta sem nome";
  }
  function emailDe(userId: string): string | null {
    return participantInfo[userId]?.email ?? null;
  }

  async function removerParticipante(userId: string) {
    if (!window.confirm("Remover este participante da campanha? Isso revoga o acesso dele aos personagens que controla aqui.")) return;
    setAcaoError(null);
    try {
      await removeCampaignMember(campaignId, userId);
      await Promise.all([reloadMembros(), reloadControles(), reloadParticipantInfo(), reloadMembers()]);
    } catch (e) { fail(e, "Erro ao remover participante."); }
  }

  async function criarConvite() {
    setAcaoError(null);
    setBusyInvite(true);
    try {
      const { rawToken } = await createCampaignInvite(campaignId, conviteLabel);
      setConviteLabel("");
      setLinkNovo(`${window.location.origin}/join/${rawToken}`);
      await reloadConvites();
    } catch (e) { fail(e, "Erro ao criar convite."); } finally { setBusyInvite(false); }
  }

  async function criarConviteEmail() {
    if (!conviteEmail.trim()) return;
    setAcaoError(null);
    setBusyInvite(true);
    try {
      const { rawToken } = await createCampaignEmailInvite(campaignId, conviteEmail, conviteEmailLabel);
      setConviteEmail("");
      setConviteEmailLabel("");
      setLinkNovo(`${window.location.origin}/join/${rawToken}`);
      await reloadConvites();
    } catch (e) { fail(e, "Erro ao criar convite por e-mail."); } finally { setBusyInvite(false); }
  }

  async function revogar(inviteId: string) {
    setAcaoError(null);
    try { await revokeCampaignInvite(inviteId); await reloadConvites(); }
    catch (e) { fail(e, "Erro ao revogar convite."); }
  }

  const jogadores = membros.filter((m) => m.role !== "owner");
  const convitesEmail = convites.filter((c) => c.kind === "email");
  const convitesLimpos = convites.filter((c) => c.kind === "clean");

  function controlesDe(userId: string): number {
    return controles.filter((c) => c.user_id === userId).length;
  }

  return (
    <main className="rm-page">
      <h1 className="rm-page-title">Jogadores e convites</h1>

      {acaoError && <p role="alert" className="rm-erro" style={{ marginBottom: 16 }}>Erro: {acaoError}</p>}

      <section style={{ marginBottom: 32 }}>
        <h2 className="rm-section-title">Jogadores{erros.membros ? "" : ` (${jogadores.length})`}</h2>
        {/* Contagem escondida enquanto a leitura está falha: "Jogadores (0)"
            afirmaria um fato do domínio que não sabemos ser verdade. */}
        <BannerRecurso
          testid="jogadores-erro-membros"
          mensagem={erros.membros}
          onTentarDeNovo={reloadMembros}
        />
        <BannerRecurso
          testid="jogadores-erro-controles"
          mensagem={erros.controles}
          prefixo="Contagem de personagens controlados indisponível"
          onTentarDeNovo={reloadControles}
        />
        {erros.membros ? null : jogadores.length === 0 ? (
          <div className="rm-empty">Nenhum jogador entrou nesta campanha ainda. Convide alguém abaixo.</div>
        ) : (
          <div className="rm-card-grid">
            {jogadores.map((m) => (
              <div key={m.id} data-testid="det-membro" className="rm-card rm-card-row">
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontWeight: 600 }}>{nomeDe(m.user_id)}</span>
                  {emailDe(m.user_id) && <span className="rm-faint" style={{ fontSize: 11 }}>{emailDe(m.user_id)}</span>}
                  <span className="rm-faint">
                    {m.status === "active" ? "Ativo" : "Removido"} · {controlesDe(m.user_id)} personagem{controlesDe(m.user_id) === 1 ? "" : "ns"} controlado{controlesDe(m.user_id) === 1 ? "" : "s"}
                  </span>
                </div>
                {m.status === "active" && (
                  <button data-testid={`det-remover-participante-${m.user_id}`} onClick={() => removerParticipante(m.user_id)} className="rm-btn rm-btn-danger rv-focusable">
                    Remover
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="rm-faint" style={{ marginTop: 10 }}>
          Atribuir ou remover controle de personagem é feito em <strong>Personagens</strong>.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 className="rm-section-title">Convite por e-mail</h2>
        <p className="rm-faint" style={{ marginBottom: 10 }}>
          Ao autenticar com este e-mail, a pessoa entra automaticamente na campanha — sem etapa extra de aceitar convite.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <input
            data-testid="det-convite-email"
            aria-label="E-mail do convite"
            type="email"
            value={conviteEmail}
            onChange={(e) => setConviteEmail(e.target.value)}
            placeholder="e-mail@exemplo.com"
            className="rm-input rv-focusable"
            style={{ flex: 1, minWidth: 200 }}
          />
          <input
            data-testid="det-convite-email-label"
            aria-label="Rótulo do convite por e-mail"
            value={conviteEmailLabel}
            onChange={(e) => setConviteEmailLabel(e.target.value)}
            placeholder="Rótulo (opcional)"
            className="rm-input rv-focusable"
            style={{ flex: 1, minWidth: 140 }}
          />
          <button data-testid="det-criar-convite-email" onClick={criarConviteEmail} disabled={!conviteEmail.trim() || busyInvite} className="rm-btn rm-btn-primary rv-focusable">
            Convidar por e-mail
          </button>
        </div>
        {/* Criar convite segue funcionando mesmo com a LISTAGEM falha —
            são operações distintas; só a lista fica sob o banner. */}
        <BannerRecurso
          testid="jogadores-erro-convites-email"
          mensagem={erros.convites}
          prefixo="Não foi possível listar os convites por e-mail"
          onTentarDeNovo={reloadConvites}
        />
        {!erros.convites && convitesEmail.length > 0 && (
          <div className="rm-card-grid">
            {convitesEmail.map((c) => (
              <InviteRow key={c.id} invite={c} onRevoke={revogar} />
            ))}
          </div>
        )}
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 className="rm-section-title">Convite limpo</h2>
        <p className="rm-faint" style={{ marginBottom: 10 }}>
          Qualquer pessoa com o link entra automaticamente como Jogador — nunca concede Narrador.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            data-testid="det-convite-label"
            aria-label="Rótulo do convite limpo"
            value={conviteLabel}
            onChange={(e) => setConviteLabel(e.target.value)}
            placeholder="Rótulo (opcional)"
            className="rm-input rv-focusable"
            style={{ flex: 1 }}
          />
          <button data-testid="det-criar-convite" onClick={criarConvite} disabled={busyInvite} className="rm-btn rm-btn-primary rv-focusable">
            Gerar convite limpo
          </button>
        </div>
        <BannerRecurso
          testid="jogadores-erro-convites-limpos"
          mensagem={erros.convites}
          prefixo="Não foi possível listar os convites limpos"
          onTentarDeNovo={reloadConvites}
        />
        {!erros.convites && convitesLimpos.length > 0 && (
          <div className="rm-card-grid">
            {convitesLimpos.map((c) => (
              <InviteRow key={c.id} invite={c} onRevoke={revogar} />
            ))}
          </div>
        )}
      </section>

      {linkNovo && (
        <div data-testid="det-link-novo" className="rm-note rm-note--ok" style={{ marginBottom: 12 }}>
          <div style={{ opacity: 0.75, marginBottom: 4 }}>Link (mostrado só agora — copie antes de sair desta tela):</div>
          <code className="rm-code">{linkNovo}</code>
        </div>
      )}
    </main>
  );
}

/**
 * Banner de falha de LEITURA de um recurso. Existe para que a tela
 * nunca precise escolher entre "mostrar vazio" e "não mostrar nada":
 * o dado que carregou continua na tela, e o que falhou aparece como
 * falha explícita, com retry do PRÓPRIO recurso.
 */
function BannerRecurso({
  testid,
  mensagem,
  prefixo = "Não foi possível carregar",
  onTentarDeNovo,
}: {
  testid: string;
  mensagem?: string;
  prefixo?: string;
  onTentarDeNovo: () => void | Promise<void>;
}) {
  if (!mensagem) return null;
  return (
    <div className="rm-note rm-note--danger" role="alert" data-testid={testid} style={{ marginBottom: 12 }}>
      {prefixo}: {mensagem}{" "}
      <button type="button" onClick={() => void onTentarDeNovo()} className="rm-btn rm-btn-ghost rm-btn-sm rv-focusable" style={{ marginLeft: 6 }}>
        Tentar de novo
      </button>
    </div>
  );
}

function InviteRow({ invite, onRevoke }: { invite: CampaignInvite; onRevoke: (id: string) => void }) {
  const revogado = invite.revoked_at != null || !invite.is_active;
  const status = revogado ? "Revogado" : invite.kind === "email" ? (invite.activated_at ? "Ativado" : "Pendente") : "Ativo";
  const statusClasse = revogado ? "rm-badge rm-badge--danger" : invite.kind === "email" && !invite.activated_at ? "rm-badge rm-badge--warn" : "rm-badge";
  return (
    <div data-testid="det-convite" className="rm-card rm-card-row">
      <span>
        {invite.kind === "email" ? invite.email : invite.label ?? "(sem rótulo)"}{" "}
        <span className={statusClasse}>{status}</span>
      </span>
      <button data-testid={`det-revogar-${invite.id}`} onClick={() => onRevoke(invite.id)} disabled={revogado} className="rm-btn rm-btn-ghost rv-focusable">
        Revogar
      </button>
    </div>
  );
}
