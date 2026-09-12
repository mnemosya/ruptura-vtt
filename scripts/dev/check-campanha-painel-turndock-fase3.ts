/**
 * Browser check da Fase 3 — SessionPanel (Log/Participantes) e
 * TurnTrackDock, os dois painéis persistentes de verdade da área de
 * campanha, contra rotas REAIS (não o harness isolado).
 *
 * Cobre, especificamente, o pré-requisito 2 herdado da auditoria da
 * Fase 1 ("prova de instância única do provider"), que só podia ser
 * verificado de verdade a partir desta fase — precisa de um elemento
 * no DOM pra carregar o id, e esse elemento (`campshell-session-
 * mount-id`, dentro de `SessionPanel.tsx`) só passou a existir agora.
 *
 * Cobre:
 *   1. TurnTrackDock aparece em modo compacto por padrão, com status
 *      de rodada/janela.
 *   2. Expandir/Recolher alterna pro `TurnTrackPanel` de sempre e volta.
 *   3. SessionPanel abre na aba Log por padrão, com entradas.
 *   4. Trocar pra aba Participantes mostra o roster (o narrador
 *      logado aparece nele).
 *   5. INSTÂNCIA ÚNICA DO PROVIDER, EM ROTAS REAIS: navegar
 *      Mesa → Personagens → Conteúdo da campanha mantém o MESMO
 *      `sessionMountId` — se mudasse, o provider teria remontado
 *      silenciosamente, o que reiniciaria o scroll do log e o estado
 *      do dock a cada navegação.
 *   6. O dock mantém o MESMO estado (não re-busca do zero, sem flash
 *      de "carregando") ao navegar entre as mesmas três rotas.
 *   7. Zero erro de console nas rotas visitadas.
 *
 * Critérios 8 e 9, adicionados na correção pós-auditoria (P1/P2 da
 * revisão que pediu "não lidos com drawer fechado" e "sessionError
 * pode sofrer corrida"):
 *   8. NÃO LIDOS COM DRAWER FECHADO (P2): no breakpoint intermediário,
 *      com o drawer fechado (aba interna continua "log", que é o
 *      padrão), uma entrada nova de log — inserida direto no banco via
 *      service role, simulando outro participante mandando mensagem —
 *      precisa incrementar o contador de não lidos. Abrir o drawer
 *      precisa zerar esse contador. A versão anterior só checava
 *      `aba === "log"`, cega para o painel estar de fato invisível.
 *   9. ISOLAMENTO DE ERRO POR RECURSO (P1): força a releitura do roster
 *      a falhar (intercepta a Server Action pelo header `next-action`,
 *      identificado empiricamente por ser a única chamada disparada no
 *      mount) enquanto uma releitura de LOG, disparada por Realtime
 *      via inserção direta no banco, tem sucesso ao mesmo tempo. Prova
 *      que o banner de erro do roster continua visível depois do
 *      sucesso do log — um `sessionError` único compartilhado teria
 *      apagado esse erro sem o problema real ter sido resolvido.
 *
 * Critérios 10-12, adicionados numa SEGUNDA rodada de auditoria sobre a
 * correção acima — o "10/10" anterior tinha dois P1 mal-interpretados
 * (continuavam abertos) e uma lacuna nova de UX:
 *   10. BADGE VISÍVEL NO BOTÃO "SESSÃO": o contador de não lidos vivia
 *       SÓ dentro do `<aside>` do painel — exatamente o elemento que
 *       fica `display:none` com o drawer fechado. O número incrementava
 *       de verdade, mas nunca era VISTO por quem mais precisava (o
 *       usuário com o drawer fechado). Prova que o badge no botão
 *       (`campshell-drawer-toggle-badge`, fora do `<aside>`) fica
 *       genuinamente visível, não só presente no DOM.
 *   11. `reloadViewer` ESTRITO NÃO ENGOLE FALHA (P1 real #2): antes,
 *       `reloadControlledCharacterIds` capturava qualquer erro e
 *       devolvia `[]` — `reloadViewer()` "tinha sucesso" com uma lista
 *       vazia, apagando personagens controlados de verdade e limpando
 *       o erro. Dispara `reloadViewer` de verdade (evento `focus`
 *       sintético — é o único gatilho real, não há botão manual),
 *       identifica seu `next-action` por eliminação (o de `reloadMembers`
 *       já é conhecido de um disparo isolado antes), força só ele a
 *       falhar, e prova que o erro aparece (não é engolido).
 * Critérios 12 e 13, da TERCEIRA rodada de auditoria:
 *   12. NÃO LIDOS CONTAM O DELTA: o contador somava `1` sempre que
 *       `logs.length` crescia, mas uma releitura traz a lista INTEIRA —
 *       três mensagens agrupadas pelo debounce do Realtime viravam "1".
 *       Insere três de uma vez com o drawer fechado e exige badge "3".
 *   13. RENOVAÇÃO SILENCIOSA (substitui o critério de "expiração fica
 *       observável" da rodada anterior — aquele provava que a
 *       degradação AVISAVA; agora ela não deve mais acontecer): com
 *       relógio simulado, ultrapassa a validade do access token e exige
 *       que (a) nenhum alerta de interrupção apareça, (b) o indicador
 *       siga "Sincronizado", (c) o provider NÃO tenha remontado,
 *       (d) drawer aberto, aba Participantes e dock expandido sigam
 *       intactos, e (e) — a prova que importa — um evento novo AINDA
 *       SEJA ENTREGUE depois da renovação. Sem `setAuth` do token novo,
 *       a RLS `to authenticated` voltaria a barrar tudo e (e) falharia.
 *
 * Critérios 14 e 15, adicionados junto com 12/13:
 *   14. FALHA DE RENOVAÇÃO AVISA GLOBALMENTE E O RETRY RECUPERA: em rota
 *       NÃO-Mesa (`/personagens` — os indicadores `mesa-sync-status` só
 *       existem na Mesa), força a renovação a falhar de verdade e prova
 *       que `SyncAlert` aparece no cabeçalho com "Sincronização
 *       interrompida" + "Tentar novamente", e que o retry recupera.
 *   15. SESSÃO SALVA REGRAVADA COM SUCESSO: os critérios acima renovam
 *       de verdade contra a sessão salva, e o Supabase rotaciona o
 *       refresh token a cada uso — sem regravar `.auth/admin-
 *       session.json`, a PRÓXIMA execução (deste script ou de qualquer
 *       outro) falharia com um token já consumido, parecendo (falsamente)
 *       sessão expirada. Achado de auditoria: a versão anterior só
 *       imprimia um aviso no console quando a regravação falhava —
 *       reprova o check agora, porque uma falha aqui inutiliza sessões
 *       futuras silenciosamente.
 *
 * NÃO coberto por este script (P1 real #1 — erro inicial de SSR): forçar
 * `listLogsForViewer`/`listCampaignRoster` a falhar de verdade durante a
 * renderização SSR exigiria intervenção arriscada no banco (essas duas
 * leituras rodam dentro do próprio request de documento, sem um
 * `next-action` isolável pra interceptar do lado do browser, ao
 * contrário das recargas client-side). A correção em si (`layout.tsx`
 * propaga `initialErrors` pro provider em vez de `{}` fixo) é a MESMA
 * estrutura de erro-por-recurso que o critério 9 já prova funcionar —
 * só a origem do valor inicial mudou. Verificado por leitura + `tsc`,
 * não por um critério de ponta a ponta deste script.
 *
 * Uso: npx tsx scripts/dev/check-campanha-painel-turndock-fase3.ts
 * (precisa de `npm run dev` e de sessão salva —
 * npx tsx scripts/dev/refresh-admin-session.ts se necessário)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { ConsoleMessage } from "playwright";
import { BASE_URL, SESSION_FILE, withAuthenticatedPage } from "./authSession";

loadDotenv({ path: ".env.local" });

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Variável de ambiente obrigatória ausente: ${name}`);
    process.exit(1);
  }
  return v;
}

// Service role só para simular eventos de OUTRO participante (inserir
// log direto na tabela, o que dispara Realtime pros clients
// conectados) — nunca como identidade submetida a nenhuma autorização
// verificada por este script. Mesmo padrão de validate-campaign-roster.mjs.
const admin = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const idsDeLogParaLimpar: string[] = [];

async function inserirLogDeTeste(campaignId: string, texto: string): Promise<void> {
  const { data, error } = await admin
    .from("table_logs")
    .insert({ campaign_id: campaignId, type: "chat", visibility: "public", payload: { text: texto } })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao inserir log de teste: ${error.message}`);
  idsDeLogParaLimpar.push(data.id);
}

let passou = 0;
let falhou = 0;

function registrar(criterio: string, ok: boolean, detalhe: string) {
  if (ok) {
    passou++;
    console.log(`ok - ${criterio}: ${detalhe}`);
  } else {
    falhou++;
    console.error(`FALHA - ${criterio}: ${detalhe}`);
  }
}

function erroRelevante(msg: ConsoleMessage): boolean {
  if (msg.type() !== "error") return false;
  const t = msg.text();
  if (t.includes("favicon")) return false;
  if (t.includes("Download the React DevTools")) return false;
  return true;
}

async function main() {
  await withAuthenticatedPage(async (page) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Erros contados só a partir da navegação para dentro da campanha —
    // `/mesas` (o dashboard, visitado abaixo só pra descobrir um id) tem
    // um 404 pré-existente e alheio a esta reestrutura
    // (`/brand/app-hud.png` referenciado em `mesas/_global/parts.tsx`,
    // arquivo real é `.jpg`; mesmo padrão já aplicado nos checks das
    // Fases 1 e 2). Contar aqui mascararia uma regressão real da
    // campanha atrás de ruído de outra área.
    const erros: string[] = [];
    let contarErros = false;
    page.on("console", (m) => {
      if (contarErros && erroRelevante(m)) erros.push(m.text().slice(0, 200));
    });

    await page.goto(`${BASE_URL}/mesas`, { waitUntil: "networkidle" });
    const hrefs = await page.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    const campaignId = hrefs
      .map((h) => h.match(/^\/mesas\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i)?.[1])
      .find(Boolean);
    if (!campaignId) {
      registrar("0 (campanha de teste)", false, "Nenhuma campanha encontrada em /mesas para esta conta.");
      return;
    }
    registrar("0 (campanha de teste)", true, `usando ${campaignId}`);

    contarErros = true;
    await page.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);

    // --- 1. Sem combate, o dock diz isso — não uma rodada inventada ---
    // O dock lia `campaigns.turn_track`, um SEGUNDO sistema de turnos
    // que o VTT nunca escreveu: mostrava "Rodada 1 · sem janela ativa"
    // de forma perene, enquanto os trilhos do mapa podiam estar na
    // rodada 3. Agora a fonte é `vtt_turn_tracks` — a mesma do VTT — e
    // "sem combate" é um estado honesto, não um placeholder.
    {
      const compacto = page.locator('[data-testid="turndock-compacto"]');
      const status = page.locator('[data-testid="turndock-status"]');
      const compactoVisivel = await compacto.isVisible().catch(() => false);
      const statusTexto = compactoVisivel ? await status.textContent() : null;
      registrar(
        "1 (sem combate, o dock declara isso em vez de inventar rodada)",
        compactoVisivel && statusTexto === "Sem combate em andamento",
        `compacto visível=${compactoVisivel}, status="${statusTexto}"`,
      );
    }

    // --- 2. O dock reflete a trilha REAL do VTT ---
    // A prova da unificação: escrevendo direto em `vtt_turn_tracks` — a
    // linha que a ferramenta Rodadas do VTT usa — o dock, que vive em
    // outra rota e nunca viu o mapa, passa a mostrar aquela rodada e
    // aquela janela.
    {
      const { data: cena } = await admin
        .from("vtt_scenes").select("id").eq("campaign_id", campaignId)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (!cena?.id) {
        registrar("2 (o dock mostra a trilha real de vtt_turn_tracks)", false, "campanha sem cena — abra o VTT uma vez para semear");
      } else {
        const { data: tokenQualquer } = await admin
          .from("vtt_tokens").select("id, nome").eq("scene_id", cena.id).limit(1).maybeSingle();
        await admin.from("vtt_turn_tracks").upsert({
          scene_id: cena.id,
          campaign_id: campaignId,
          estado: {
            modo: "combate", janela: "lentos", rodada: 7, ultimoLado: null, agindoId: null,
            participantes: [{
              id: tokenQualquer?.id ?? campaignId, nome: tokenQualquer?.nome ?? "Elenco",
              lado: "pj", declaracao: null, paTotal: 3, paGasto: 0, reflexos: 0,
              agiuEm: [], fragmentouEm: null, encerrou: false,
            }],
          },
        }, { onConflict: "scene_id" });

        await page.reload({ waitUntil: "networkidle" });
        await page.waitForTimeout(1200);
        const statusReal = await page.locator('[data-testid="turndock-status"]').textContent().catch(() => null);
        const levaAoMapa = await page.locator('[data-testid="turndock-abrir-rodadas"]').count();
        registrar(
          "2 (o dock mostra a trilha real de vtt_turn_tracks, e leva à ferramenta Rodadas)",
          statusReal === "Rodada 7 · Lentos" && levaAoMapa === 1,
          `status="${statusReal}" (esperado "Rodada 7 · Lentos"), link pro mapa=${levaAoMapa}`,
        );

        await admin.from("vtt_turn_tracks").delete().eq("scene_id", cena.id);
        await page.reload({ waitUntil: "networkidle" });
        await page.waitForTimeout(600);
      }
    }

    // --- 3. SessionPanel abre no Log, com entradas ---
    {
      const abaLog = page.locator('[data-testid="session-tab-log"]');
      const logSelecionado = (await abaLog.getAttribute("aria-selected")) === "true";
      const entradas = await page.locator('[data-testid="session-log-entry"]').count();
      registrar("3 (SessionPanel abre no Log, com entradas)", logSelecionado, `aba Log selecionada por padrão=${logSelecionado}, entradas visíveis=${entradas}`);
    }

    // --- 4. Aba Participantes mostra o roster (narrador presente) ---
    {
      await page.locator('[data-testid="session-tab-participantes"]').click();
      await page.waitForTimeout(300);
      const itens = await page.locator('[data-testid="session-roster-item"]').count();
      const temNarrador = (await page.locator('[data-testid="session-roster-item"][data-role="narrator"]').count()) > 0;
      registrar("4 (aba Participantes mostra o roster)", itens > 0 && temNarrador, `itens no roster=${itens}, narrador presente=${temNarrador}`);
      await page.locator('[data-testid="session-tab-log"]').click();
      await page.waitForTimeout(150);
    }

    // --- 5 e 6. Instância única do provider + estado do dock preservados, em rotas REAIS ---
    {
      const mountIdMesa = await page.locator('[data-testid="campshell-session-mount-id"]').getAttribute("data-mount-id");
      const statusMesa = await page.locator('[data-testid="turndock-status"]').textContent();

      await page.locator('a.rm-navrail-btn[aria-label="Personagens"]').click();
      await page.waitForURL(`**/mesas/${campaignId}/personagens`);
      await page.waitForTimeout(400);
      const mountIdPersonagens = await page.locator('[data-testid="campshell-session-mount-id"]').getAttribute("data-mount-id");
      const statusPersonagens = await page.locator('[data-testid="turndock-status"]').textContent();

      await page.locator('a.rm-navrail-btn[aria-label="Conteúdo da campanha"]').click();
      await page.waitForURL(`**/mesas/${campaignId}/biblioteca`);
      await page.waitForTimeout(400);
      const mountIdBiblioteca = await page.locator('[data-testid="campshell-session-mount-id"]').getAttribute("data-mount-id");
      const statusBiblioteca = await page.locator('[data-testid="turndock-status"]').textContent();

      const instanciaUnica = !!mountIdMesa && mountIdMesa === mountIdPersonagens && mountIdMesa === mountIdBiblioteca;
      registrar(
        "5 (instância única do provider — Mesa → Personagens → Conteúdo da campanha)",
        instanciaUnica,
        `mount id: Mesa="${mountIdMesa}", Personagens="${mountIdPersonagens}", Conteúdo="${mountIdBiblioteca}"`,
      );

      const estadoPreservado = statusMesa === statusPersonagens && statusMesa === statusBiblioteca;
      registrar(
        "6 (dock mantém o mesmo estado ao navegar, sem re-buscar do zero)",
        estadoPreservado,
        `status: Mesa="${statusMesa?.trim()}", Personagens="${statusPersonagens?.trim()}", Conteúdo="${statusBiblioteca?.trim()}"`,
      );
    }

    // --- 7. Console limpo nas rotas DA CAMPANHA ---
    registrar("7 (console limpo nas rotas da campanha)", erros.length === 0, erros.length ? JSON.stringify(erros.slice(0, 3)) : "nenhum");

    // --- 8. Não lidos incrementam com o drawer FECHADO (P2) ---
    {
      await page.setViewportSize({ width: 1024, height: 800 });
      await page.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(600);

      const abertoAntes = await page.locator('[data-testid="campshell-painel-sessao"]').getAttribute("data-open");

      const marcador = `check-fase3-nao-lido-${Date.now()}`;
      await inserirLogDeTeste(campaignId, marcador);
      // Debounce do Realtime (200ms) + round-trip do refetch.
      await page.waitForTimeout(1500);

      const naoLidosFechado = await page
        .locator('[data-testid="session-log-nao-lidos"]')
        .textContent()
        .catch(() => null);

      // Critério 10: o badge no BOTÃO (fora do `<aside>` oculto) precisa
      // estar genuinamente VISÍVEL agora, não só presente no DOM — é
      // exatamente o que faltava na correção anterior: o número existia,
      // mas morava dentro do elemento com `display:none`.
      const badgeNoBotaoTexto = await page
        .locator('[data-testid="campshell-drawer-toggle-badge"]')
        .textContent()
        .catch(() => null);
      const badgeNoBotaoVisivel = await page
        .locator('[data-testid="campshell-drawer-toggle-badge"]')
        .isVisible()
        .catch(() => false);

      await page.locator('[data-testid="campshell-drawer-toggle"]').click();
      await page.waitForTimeout(300);
      const abertoDepois = await page.locator('[data-testid="campshell-painel-sessao"]').getAttribute("data-open");
      const badgeSumiu = (await page.locator('[data-testid="session-log-nao-lidos"]').count()) === 0;
      const badgeNoBotaoSumiu = (await page.locator('[data-testid="campshell-drawer-toggle-badge"]').count()) === 0;
      const entradaVisivel = (await page.locator(`[data-testid="session-log-entry"]:has-text("${marcador}")`).count()) > 0;

      registrar(
        "8 (não lidos com drawer fechado incrementam e zeram ao abrir)",
        abertoAntes === "false" && naoLidosFechado === "1" && abertoDepois === "true" && badgeSumiu && entradaVisivel,
        `drawer antes(open=${abertoAntes})="fechado esperado", não lidos com drawer fechado="${naoLidosFechado}", drawer depois(open=${abertoDepois}), badge sumiu ao abrir=${badgeSumiu}, entrada nova visível=${entradaVisivel}`,
      );

      registrar(
        "10 (badge de não lidos visível no botão \"Sessão\", fora do painel oculto)",
        badgeNoBotaoTexto === "1" && badgeNoBotaoVisivel && badgeNoBotaoSumiu,
        `badge no botão com drawer fechado: texto="${badgeNoBotaoTexto}", visível=${badgeNoBotaoVisivel}; sumiu ao abrir o drawer=${badgeNoBotaoSumiu}`,
      );

      await page.setViewportSize({ width: 1440, height: 900 });
    }

    // --- 9. sessionError isolado por recurso — sucesso de um não apaga erro de outro (P1) ---
    {
      // A ÚNICA Server Action disparada no mount desta página é o
      // `reloadMembers()` do efeito de troca de aba do SessionPanel
      // (roda também na montagem inicial, aba parte de "log"). Captura
      // o header `next-action` dessa chamada — cada Server Action tem
      // um id de build estável e distinto, então isso identifica
      // `reloadMembers` sem depender de nenhuma API interna do Next.
      // O listener PRECISA estar montado ANTES da navegação — o efeito
      // dispara logo após a hidratação, então anexar depois do `goto`
      // arrisca perder a única chamada que identificaria a ação.
      const pageUrl = `${BASE_URL}/mesas/${campaignId}`;
      let idAcaoRoster: string | null = null;
      const capturaId = (req: import("playwright").Request) => {
        if (req.method() === "POST" && req.url() === pageUrl && !idAcaoRoster) {
          idAcaoRoster = req.headers()["next-action"] ?? null;
        }
      };
      page.on("request", capturaId);
      await page.goto(pageUrl, { waitUntil: "networkidle" });
      await page.waitForTimeout(1000);
      page.off("request", capturaId);

      if (!idAcaoRoster) {
        registrar("9 (isolamento de sessionError por recurso)", false, "não foi possível capturar o next-action de reloadMembers no mount — script desatualizado?");
      } else {
        const idCapturado = idAcaoRoster as string;
        await page.route(pageUrl, (route) => {
          const header = route.request().headers()["next-action"];
          if (header === idCapturado) {
            route.abort("failed");
          } else {
            route.continue();
          }
        });

        // Força reloadMembers a falhar (troca de aba dispara a releitura).
        await page.locator('[data-testid="session-tab-participantes"]').click();
        await page.waitForTimeout(600);
        await page.locator('[data-testid="session-tab-log"]').click();
        await page.waitForTimeout(300);

        // Escopado a `.rm-session` (não `.rm-erro` global): Fase 4 deu a
        // MESMA classe `rm-erro` ao banner de erro do MesaClient.tsx, que
        // também exibe `sessionError` por design (`{(error || sessionError)
        // && ...}`) — sem escopo, o locator resolve pra 2 elementos e
        // `isVisible()` lança violação de strict mode, engolida pelo
        // `.catch` e lida como "erro não apareceu". O painel de sessão é
        // o alvo real deste critério.
        const erroAppareceu = await page.locator(".rm-session .rm-erro").isVisible().catch(() => false);

        // Enquanto o erro do roster está de pé, um recurso DIFERENTE
        // (log) recarrega com SUCESSO via Realtime — não deve apagar o
        // erro do roster se o isolamento por recurso estiver correto.
        const marcadorErro = `check-fase3-isolamento-erro-${Date.now()}`;
        await inserirLogDeTeste(campaignId, marcadorErro);
        await page.waitForTimeout(1500);

        const logChegou = (await page.locator(`[data-testid="session-log-entry"]:has-text("${marcadorErro}")`).count()) > 0;
        const erroContinuaAppos = await page.locator(".rm-session .rm-erro").isVisible().catch(() => false);

        await page.unroute(pageUrl);
        // Deixa a sessão saudável de novo antes de encerrar o script —
        // reloadMembers sem a interceptação volta a funcionar.
        await page.locator('[data-testid="session-tentar-de-novo"]').click({ trial: false }).catch(() => {});
        await page.waitForTimeout(600);

        registrar(
          "9 (isolamento de sessionError por recurso)",
          erroAppareceu && logChegou && erroContinuaAppos,
          `erro do roster apareceu=${erroAppareceu}, log novo chegou via Realtime durante o erro=${logChegou}, erro do roster continua visível após sucesso do log=${erroContinuaAppos}`,
        );
      }
    }

    // --- 11. reloadViewer ESTRITO não engole falha (P1 real #2) ---
    {
      const pageUrl = `${BASE_URL}/mesas/${campaignId}`;

      // `reloadViewer` só dispara por `focus`/`visibilitychange` — sem
      // botão manual. Identifica o next-action de `reloadMembers`
      // (já conhecido pelo mesmo truque do mount) e, por eliminação, o
      // de `reloadViewer` a partir de um disparo de foco sintético que
      // chama os dois juntos (mesmo par que o efeito real do provider
      // dispara).
      let idRoster: string | null = null;
      const capturaRoster = (req: import("playwright").Request) => {
        if (req.method() === "POST" && req.url() === pageUrl && !idRoster) {
          idRoster = req.headers()["next-action"] ?? null;
        }
      };
      page.on("request", capturaRoster);
      await page.goto(pageUrl, { waitUntil: "networkidle" });
      await page.waitForTimeout(1000);
      page.off("request", capturaRoster);

      const idsDoFoco = new Set<string>();
      const capturaFoco = (req: import("playwright").Request) => {
        if (req.method() === "POST" && req.url() === pageUrl) {
          const id = req.headers()["next-action"];
          if (id) idsDoFoco.add(id);
        }
      };
      page.on("request", capturaFoco);
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page.waitForTimeout(1000);
      page.off("request", capturaFoco);

      const idViewer = [...idsDoFoco].find((id) => id !== idRoster) ?? null;

      if (!idRoster || !idViewer) {
        registrar(
          "11 (reloadViewer estrito não engole falha)",
          false,
          `não foi possível identificar os dois next-action (roster="${idRoster}", ids vistos no foco=${JSON.stringify([...idsDoFoco])}) — script desatualizado?`,
        );
      } else {
        const idViewerCapturado = idViewer;
        await page.route(pageUrl, (route) => {
          const header = route.request().headers()["next-action"];
          if (header === idViewerCapturado) {
            route.abort("failed");
          } else {
            route.continue();
          }
        });

        // Dispara reloadMembers (sucesso, não interceptado) + reloadViewer
        // (falha, interceptado) juntos — o mesmo par real do efeito de foco.
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await page.waitForTimeout(1000);

        const erroAppareceuComFalhaSoDoViewer = await page.locator(".rm-session .rm-erro").isVisible().catch(() => false);

        await page.unroute(pageUrl);
        // Deixa a sessão saudável antes de encerrar — outro foco, agora sem interceptação, deixa reloadViewer ter sucesso de novo.
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await page.waitForTimeout(800);

        registrar(
          "11 (reloadViewer estrito não engole falha)",
          erroAppareceuComFalhaSoDoViewer,
          `com SÓ reloadViewer falhando (reloadMembers, disparado no mesmo evento, teve sucesso): banner de erro apareceu=${erroAppareceuComFalhaSoDoViewer} (esperado true — a versão antiga engolia o erro em fetchControlledCharacterIds e nunca mostrava nada aqui)`,
        );
      }
    }

    // --- 12. Não lidos contam o DELTA, não "1 por releitura" ---
    {
      await page.setViewportSize({ width: 1024, height: 800 });
      await page.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);

      // Três inserções seguidas: o debounce de 200ms do Realtime agrupa,
      // então UMA releitura traz as três de uma vez — `logs.length` sobe
      // 3 num único efeito. A versão antiga somava `1` fixo aqui.
      const lote = `check-fase3-lote-${Date.now()}`;
      await inserirLogDeTeste(campaignId, `${lote}-a`);
      await inserirLogDeTeste(campaignId, `${lote}-b`);
      await inserirLogDeTeste(campaignId, `${lote}-c`);
      await page.waitForTimeout(2000);

      const badgeLote = await page
        .locator('[data-testid="campshell-drawer-toggle-badge"]')
        .textContent()
        .catch(() => null);

      registrar(
        "12 (não lidos contam o delta real, não 1 por releitura)",
        badgeLote === "3",
        `3 mensagens inseridas com o drawer fechado → badge="${badgeLote}" (esperado "3"; a versão antiga mostraria "1")`,
      );

      await page.setViewportSize({ width: 1440, height: 900 });
    }

    // --- 13. Renovação SILENCIOSA do Realtime, sem reload e sem perder estado ---
    {
      await page.setViewportSize({ width: 1024, height: 800 });
      await page.clock.install({ time: Date.now() });
      await page.goto(`${BASE_URL}/mesas/${campaignId}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1200);

      // Estado de interface a preservar: drawer ABERTO, aba
      // Participantes, e o id de montagem do provider (prova de que
      // nada remontou).
      //
      // O dock saiu desta lista porque deixou de ter estado próprio: com
      // a trilha unificada ele é só leitura da linha de
      // `vtt_turn_tracks`, e "ver tudo" virou o link pra ferramenta
      // Rodadas, no VTT, em vez de um segundo painel de turnos.
      await page.locator('[data-testid="campshell-drawer-toggle"]').click();
      await page.waitForTimeout(300);
      await page.locator('[data-testid="session-tab-participantes"]').click();
      await page.waitForTimeout(300);

      const mountAntes = await page.locator('[data-testid="campshell-session-mount-id"]').getAttribute("data-mount-id");
      const statusAntes = await page.locator('[data-testid="mesa-sync-status"]').textContent();
      // `exp` do access token guardado no cookie ANTES do salto. O
      // relógio simulado só engana o BROWSER — pro Supabase o token
      // segue válido em tempo real, então "o evento chegou" sozinho não
      // provaria renovação. Um `exp` maior depois prova: só uma troca
      // real de token move esse número.
      const expAntes = await lerExpiracaoDoCookie(page);
      // O token que o WEBSOCKET tem aplicado agora. O `exp` do cookie
      // prova que a Server Action renovou, mas NÃO que o socket recebeu
      // o token novo — e o evento posterior chegaria mesmo se `setAuth`
      // tivesse falhado, porque o relógio simulado engana só o browser.
      // Este marcador fecha esse buraco.
      const authAntes = await lerAuthRealtimeAplicada(page);

      // O relógio simulado engana só o BROWSER — a requisição real que
      // o timer dispara chega ao servidor no relógio REAL, segundos
      // depois da carga da página, com o access token real ainda longe
      // do vencimento de verdade. Desde que `refreshAccessToken`
      // (`lib/auth/actions.ts`) ganhou uma checagem de "já foi renovado
      // agora mesmo" — pra não girar o refresh token duas vezes com
      // `middleware.ts` — essa checagem decodifica o `exp` REAL do
      // token e, vendo validade de sobra, devolve o MESMO token sem
      // tocar o Supabase: correto do ponto de vista do servidor, mas
      // silenciosamente esvaziava este critério (nenhuma rotação de
      // verdade acontecia, então `expDepois > expAntes` nunca seria
      // provado por uma razão nova). Troca o cookie por um access token
      // que DECODIFICA como vencido (mantendo o refresh token REAL) —
      // força tanto o middleware quanto a Server Action a passarem pelo
      // Supabase de verdade quando o timer disparar.
      const cookiesAntesForcar = await page.context().cookies();
      const brutoAntesForcar = cookiesAntesForcar.find((c) => c.name === "ruptura_auth")?.value;
      const refreshTokenReal = brutoAntesForcar
        ? (JSON.parse(decodeURIComponent(brutoAntesForcar)) as { refresh_token?: string }).refresh_token
        : undefined;
      if (refreshTokenReal) {
        await page.context().addCookies([{
          name: "ruptura_auth",
          value: JSON.stringify({ access_token: "cabecalho.expirado.forcado", refresh_token: refreshTokenReal }),
          domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax",
          expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
        }]);
      }

      // Ultrapassa a validade do access token (~1h). O agendamento
      // dispara a renovação silenciosa durante este salto.
      await page.clock.fastForward("01:30:00");
      await page.waitForTimeout(2500);

      const expDepois = await lerExpiracaoDoCookie(page);
      const renovouDeVerdade = expAntes !== null && expDepois !== null && expDepois > expAntes;

      const authDepois = await lerAuthRealtimeAplicada(page);
      const tokenAplicadoNoSocket =
        !!authAntes && !!authDepois && authDepois.aplicacoes > authAntes.aplicacoes && authDepois.sufixo !== authAntes.sufixo;

      const semAlerta = (await page.locator('[data-testid="campshell-sync-alerta"]').count()) === 0;
      const statusDepois = await page.locator('[data-testid="mesa-sync-status"]').textContent();
      const mountDepois = await page.locator('[data-testid="campshell-session-mount-id"]').getAttribute("data-mount-id");

      // Estado da interface preservado?
      const drawerAberto = (await page.locator('[data-testid="campshell-painel-sessao"]').getAttribute("data-open")) === "true";
      const abaParticipantes = (await page.locator('[data-testid="session-tab-participantes"]').getAttribute("aria-selected")) === "true";

      // A PROVA de verdade: o canal ainda ENTREGA depois da renovação.
      // Sem `setAuth` do token novo, a RLS `to authenticated` voltaria a
      // barrar tudo (bug original) e esta entrada nunca chegaria.
      const marcadorPos = `check-fase3-pos-renovacao-${Date.now()}`;
      await inserirLogDeTeste(campaignId, marcadorPos);
      await page.waitForTimeout(2500);
      await page.locator('[data-testid="session-tab-log"]').click();
      await page.waitForTimeout(300);
      const entregouDepoisDaRenovacao = (await page.locator(`[data-testid="session-log-entry"]:has-text("${marcadorPos}")`).count()) > 0;

      registrar(
        "13 (Realtime renova sozinho, sem reload e sem perder estado de interface)",
        !!statusAntes?.includes("Sincronizado") &&
          renovouDeVerdade &&
          tokenAplicadoNoSocket &&
          semAlerta &&
          !!statusDepois?.includes("Sincronizado") &&
          mountAntes === mountDepois &&
          drawerAberto &&
          abaParticipantes &&
          entregouDepoisDaRenovacao,
        `+1h30 simuladas: TOKEN TROCADO DE VERDADE=${renovouDeVerdade} (exp ${expAntes ? new Date(expAntes).toISOString() : "?"} → ${expDepois ? new Date(expDepois).toISOString() : "?"}), ` +
          `APLICADO NO WEBSOCKET=${tokenAplicadoNoSocket} (setAuth ${authAntes?.aplicacoes}→${authDepois?.aplicacoes} aplicações, sufixo ${authAntes?.sufixo}→${authDepois?.sufixo}), ` +
          `status="${statusDepois?.trim()}" (antes "${statusAntes?.trim()}"), sem alerta de interrupção=${semAlerta}, ` +
          `provider NÃO remontou=${mountAntes === mountDepois} (id ${mountAntes}→${mountDepois}), drawer segue aberto=${drawerAberto}, ` +
          `aba Participantes preservada=${abaParticipantes}, ENTREGOU evento novo após renovar=${entregouDepoisDaRenovacao}`,
      );

      // Não há `uninstall` na API de Clock do Playwright — devolver o
      // relógio ao tempo real é suficiente pro que vem depois (só a
      // regravação da sessão).
      await page.clock.setSystemTime(new Date());
      await page.setViewportSize({ width: 1440, height: 900 });
    }

    // --- 14. Falha de renovação avisa GLOBALMENTE (fora da Mesa) e o retry recupera ---
    {
      // Rota NÃO-Mesa de propósito: os indicadores `mesa-sync-status` só
      // existem na Mesa, então quem estivesse em Personagens ficaria mudo
      // sem saber — a lacuna que a auditoria apontou. O aviso vive no
      // cabeçalho da casca, visível em toda rota e todo breakpoint.
      const rotaPersonagens = `${BASE_URL}/mesas/${campaignId}/personagens`;
      await page.clock.install({ time: Date.now() });
      await page.goto(rotaPersonagens, { waitUntil: "networkidle" });
      await page.waitForTimeout(1200);

      // Descobre o next-action de `refreshAccessToken`: é a única Server
      // Action que um salto de relógio dispara sozinho (os `reload*` de
      // roster/viewer só vêm de foco/troca de aba, que não acontecem aqui).
      let idRefresh: string | null = null;
      const capturaRefresh = (req: import("playwright").Request) => {
        if (req.method() === "POST" && req.url() === rotaPersonagens && !idRefresh) {
          idRefresh = req.headers()["next-action"] ?? null;
        }
      };
      page.on("request", capturaRefresh);
      await page.clock.fastForward("01:00:00");
      await page.waitForTimeout(2000);
      page.off("request", capturaRefresh);

      if (!idRefresh) {
        registrar("14 (falha de renovação avisa globalmente e o retry recupera)", false, "não foi possível capturar o next-action de refreshAccessToken — script desatualizado?");
      } else {
        const idRefreshCapturado = idRefresh as string;
        await page.route(rotaPersonagens, (route) => {
          if (route.request().headers()["next-action"] === idRefreshCapturado) {
            route.abort("failed");
          } else {
            route.continue();
          }
        });

        // Força a próxima renovação a falhar.
        await page.clock.fastForward("01:00:00");
        await page.waitForTimeout(2500);

        const alerta = page.locator('[data-testid="campshell-sync-alerta"]');
        const alertaVisivel = await alerta.isVisible().catch(() => false);
        const textoAlerta = alertaVisivel ? (await alerta.textContent())?.trim() : null;
        const temRetry = (await page.locator('[data-testid="campshell-sync-alerta-retry"]').count()) > 0;
        const foraDaMesa = page.url().includes("/personagens");

        // Retry manual, agora sem interceptação: precisa recuperar.
        await page.unroute(rotaPersonagens);
        await page.locator('[data-testid="campshell-sync-alerta-retry"]').click();
        await page.waitForTimeout(2000);
        const alertaSumiu = (await page.locator('[data-testid="campshell-sync-alerta"]').count()) === 0;

        registrar(
          "14 (falha de renovação avisa globalmente e o retry recupera)",
          alertaVisivel && !!textoAlerta?.includes("interrompida") && temRetry && foraDaMesa && alertaSumiu,
          `em rota NÃO-Mesa (${foraDaMesa ? "/personagens" : page.url()}): alerta visível=${alertaVisivel}, texto="${textoAlerta}", ` +
            `botão "Tentar novamente" presente=${temRetry}; após clicar no retry sem a falha forçada, alerta sumiu=${alertaSumiu}`,
        );
      }

      await page.clock.setSystemTime(new Date());
    }

    // A renovação ROTACIONA o refresh token no cookie da sessão de teste.
    // Sem regravar o arquivo, o `.auth/admin-session.json` ficaria com um
    // refresh token já consumido e o próximo `refresh-admin-session.ts`
    // falharia — parecendo (falsamente) sessão expirada. Registrado como
    // critério de verdade (não só um aviso no console): uma falha aqui
    // inutiliza a sessão salva pras próximas execuções, então precisa
    // reprovar o check, não passar em silêncio.
    const persistiu = await persistirCookiesRotacionados(page);
    registrar("15 (sessão salva regravada com o cookie rotacionado)", persistiu.ok, persistiu.detalhe);
  });
}

/**
 * Último `setAuth` efetivamente APLICADO ao WebSocket nesta aba —
 * publicado por `browserClient.ts` em `window.__rupturaRealtimeAuth`
 * (só fora de produção, e só o sufixo do token: o suficiente pra
 * distinguir um do outro, nunca material utilizável).
 *
 * Sem isto o critério 13 teria um buraco: o `exp` do cookie prova que a
 * Server Action renovou, mas não que o socket recebeu o token novo, e o
 * evento posterior chegaria de qualquer jeito porque o relógio simulado
 * do Playwright engana só o BROWSER — pro Supabase o token velho segue
 * válido em tempo real.
 */
async function lerAuthRealtimeAplicada(page: import("playwright").Page): Promise<{ sufixo: string | null; aplicacoes: number } | null> {
  return page.evaluate(() => (window as unknown as { __rupturaRealtimeAuth?: { sufixo: string | null; aplicacoes: number } }).__rupturaRealtimeAuth ?? null);
}

/**
 * `exp` (ms) do access token que está no cookie de sessão do contexto.
 * Lê o cookie DO BROWSER (não o arquivo salvo) — é ele que a renovação
 * silenciosa reescreve, então é a evidência direta de que a troca de
 * token aconteceu de verdade.
 */
async function lerExpiracaoDoCookie(page: import("playwright").Page): Promise<number | null> {
  try {
    const cookies = await page.context().cookies();
    const bruto = cookies.find((c) => c.name === "ruptura_auth")?.value;
    if (!bruto) return null;
    const tokens = JSON.parse(decodeURIComponent(bruto)) as { access_token?: string };
    if (!tokens.access_token) return null;
    const payload = JSON.parse(Buffer.from(tokens.access_token.split(".")[1], "base64").toString("utf8")) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Regrava `.auth/admin-session.json` com os cookies ATUAIS do contexto.
 * Necessário porque o critério 13 exercita a renovação de verdade, e o
 * Supabase rotaciona o refresh token a cada uso: o arquivo salvo ficaria
 * apontando pra um token já consumido.
 */
async function persistirCookiesRotacionados(page: import("playwright").Page): Promise<{ ok: boolean; detalhe: string }> {
  try {
    const estado = await page.context().storageState();
    const atual = JSON.parse(readFileSync(SESSION_FILE, "utf8")) as { cookies: unknown[]; origins: unknown[] };
    const novoCookie = estado.cookies.find((c) => c.name === "ruptura_auth");
    if (!novoCookie) {
      return { ok: false, detalhe: "cookie ruptura_auth ausente no contexto após a renovação — sessão salva NÃO atualizada" };
    }
    atual.cookies = (atual.cookies as { name: string }[]).map((c) => (c.name === "ruptura_auth" ? novoCookie : c));
    writeFileSync(SESSION_FILE, JSON.stringify(atual, null, 2));
    return { ok: true, detalhe: "sessão salva atualizada com o refresh token rotacionado pela renovação" };
  } catch (e) {
    return { ok: false, detalhe: `falha ao regravar a sessão salva: ${e instanceof Error ? e.message : e}` };
  }
}

async function limparLogsDeTeste(): Promise<void> {
  if (idsDeLogParaLimpar.length === 0) return;
  const { error } = await admin.from("table_logs").delete().in("id", idsDeLogParaLimpar);
  if (error) console.error(`Aviso: falha ao limpar ${idsDeLogParaLimpar.length} log(s) de teste: ${error.message}`);
}

main()
  .catch((err) => {
    console.error("Erro fatal no check:", err instanceof Error ? err.message : err);
    falhou++;
  })
  .finally(async () => {
    await limparLogsDeTeste();
    console.log(`\n${passou} critérios aprovados, ${falhou} reprovados.`);
    if (falhou > 0) process.exitCode = 1;
  });
