/**
 * Layout da campanha (Fase 3 do plano de contas/campanhas/convites/
 * personagens — aditivo §5). Ponto único de:
 *   - exigir sessão (redirect /login);
 *   - resolver campanha + papel (narrador/jogador) via
 *     `resolveCampaignAccess` (src/lib/campaign/access.ts);
 *   - carregar o estado de SESSÃO da campanha (log e roster) e montar o
 *     provider que o mantém vivo entre rotas;
 *   - renderizar a casca de navegação (CampaignShell/CampaignNav) com
 *     a estrutura certa para o papel.
 *
 * Envolve TODAS as rotas aninhadas (Mesa, Personagens, Bando, Mercado,
 * Biblioteca, Livro, criação de personagem, Jogadores e convites,
 * Configurações) — cada uma dessas ainda faz sua própria checagem de
 * papel quando for exclusiva do narrador (defesa em profundidade: o
 * menu escondido não é a autorização real, aditivo §5.3).
 *
 * Por que log e roster são buscados AQUI e não na página da Mesa: os
 * painéis que os mostram vivem na casca e sobrevivem à navegação, então
 * precisam de dado inicial em qualquer rota — entrar direto em
 * Personagens não pode mostrar log vazio. `campaign` não custa consulta
 * extra: `resolveCampaignAccess` já a traz inteira (com `turn_track`) e
 * é memoizada por request. A lista de PERSONAGENS continua fora daqui,
 * na Mesa: ela só serve a "Resolver Ataque" e vem com payload pesado
 * que as outras rotas não devem pagar.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveCampaignAccess } from "../../../lib/campaign/access";
import { resolveCampaignSessionViewer } from "../../../lib/campaign/session";
import { readAuthTokens } from "../../../lib/auth/session";
import { listCampaignRoster, listLogsForViewer, type CampaignRosterEntry } from "../../../lib/table/storage";
import type { TableLogEntry } from "../../../lib/table";
import { CampaignRealtimeProvider } from "./_shell/CampaignRealtimeProvider";
import { CampaignShell } from "./_shell/CampaignShell";
import { SessionPanel } from "./_shell/SessionPanel";
import { TurnTrackDock } from "./_shell/TurnTrackDock";
import { SyncAlert } from "./_shell/SyncAlert";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ campaignId: string }>;
}

export default async function CampaignLayout({ children, params }: LayoutProps) {
  const { campaignId } = await params;
  const access = await resolveCampaignAccess(campaignId);

  if (access.kind === "no_session") {
    redirect("/login");
  }

  if (access.kind === "not_found") {
    return (
      // `.rm-root` de propósito, mesmo sem casca/provider: os tokens de
      // cor de `rm-*` (`--cy`, `--rm-text-strong` etc.) só existem dentro
      // deste escopo — sem ele, as classes abaixo cairiam pro valor
      // inicial do CSS, não pra cor nenhuma.
      <div className="rm-root">
        <main className="rm-page" style={{ maxWidth: 560, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
          <h1 className="rm-page-title" style={{ marginBottom: 12 }}>Campanha não encontrada</h1>
          <p className="rm-faint" style={{ marginBottom: 20 }}>Esta campanha não existe ou foi removida.</p>
          <Link href="/mesas" style={{ color: "var(--cy)", fontSize: 13 }}>← Minhas Campanhas</Link>
        </main>
      </div>
    );
  }

  if (access.kind === "no_access") {
    return (
      <div className="rm-root">
        <main className="rm-page" style={{ maxWidth: 560, margin: "80px auto", padding: "0 20px", textAlign: "center" }} role="alert">
          <h1 className="rm-page-title" style={{ marginBottom: 12 }}>Sem acesso a esta campanha</h1>
          <p className="rm-faint" style={{ marginBottom: 20 }}>
            Sua conta não participa desta campanha. Peça um convite ao narrador ou volte para as suas campanhas.
          </p>
          <Link href="/mesas" style={{ color: "var(--cy)", fontSize: 13 }}>← Minhas Campanhas</Link>
        </main>
      </div>
    );
  }

  // Estado de sessão. Nenhuma destas leituras pode derrubar a campanha
  // inteira: log e roster indisponíveis degradam para painel vazio, com
  // o botão de recarregar do próprio painel como saída.
  const viewer = await resolveCampaignSessionViewer(access.campaign.id, access.user.id);

  // SÓ o access token (nunca o refresh token) — autentica o WebSocket
  // de Realtime do provider (ver `setBrowserSupabaseRealtimeAuth`). Sem
  // isto, nenhuma policy de RLS `to authenticated` libera evento algum
  // pro canal do browser — bug real corrigido na mesma auditoria que
  // pediu isolamento de `sessionError` (ver CampaignRealtimeProvider).
  const authTokens = await readAuthTokens();

  // Achado real de auditoria: cair pra `[]` aqui SEM registrar o erro
  // fazia uma falha de leitura parecer "campanha sem nenhum evento/
  // participante" — a UI mostrava "Nenhum evento"/"Nenhum participante"
  // e nem oferecia o retry que o comentário acima promete (`sessionError`
  // começava sempre `null`, então o botão "Tentar de novo" nunca
  // aparecia pra cobrir exatamente este caso). `initialErrors` alimenta
  // o mapa de erro por recurso do provider desde o primeiro render —
  // "vazio de verdade" e "falhou ao carregar" deixam de ser
  // indistinguíveis.
  let logsIniciais: TableLogEntry[] = [];
  let rosterInicial: CampaignRosterEntry[] = [];
  const initialErrors: { logs?: string; roster?: string } = {};
  const [logsResult, rosterResult] = await Promise.allSettled([
    listLogsForViewer(access.campaign.id, {}),
    listCampaignRoster(access.campaign.id),
  ]);
  if (logsResult.status === "fulfilled") {
    logsIniciais = logsResult.value;
  } else {
    initialErrors.logs = logsResult.reason instanceof Error ? logsResult.reason.message : "Erro ao carregar o log da mesa.";
  }
  if (rosterResult.status === "fulfilled") {
    rosterInicial = rosterResult.value;
  } else {
    initialErrors.roster = rosterResult.reason instanceof Error ? rosterResult.reason.message : "Erro ao carregar os participantes.";
  }

  return (
    <CampaignRealtimeProvider
      campaignId={access.campaign.id}
      role={access.role}
      viewer={viewer}
      initialCampaign={access.campaign}
      initialLogs={logsIniciais}
      initialRoster={rosterInicial}
      initialErrors={initialErrors}
      realtimeAccessToken={authTokens?.access_token ?? null}
    >
      <CampaignShell
        campaignId={access.campaign.id}
        campaignName={access.campaign.name}
        role={access.role}
        painelSessao={<SessionPanel />}
        turnTrackDock={<TurnTrackDock />}
        avisoSync={<SyncAlert />}
      >
        {children}
      </CampaignShell>
    </CampaignRealtimeProvider>
  );
}
