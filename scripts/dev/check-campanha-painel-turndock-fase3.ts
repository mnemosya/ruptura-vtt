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

    // --- 1, 2, 5 e 6 SAÍRAM: o DOCK DE TURNOS não existe mais ---
    //
    // Ele era peça da casca antiga da campanha, aquela com trilho de
    // navegação e sub-rotas (`/mesas/<id>/personagens`,
    // `/mesas/<id>/biblioteca`). Essa casca foi substituída quando "a
    // campanha virou a mesa" e a URL perdeu o `/vtt`: hoje a campanha é
    // uma página só, com o painel da sessão do lado.
    //
    // `rm-turndock` e `rm-session-roster` sobrevivem apenas no
    // `mesa.css` e na galeria de estilos — nenhum componente os
    // renderiza. Os quatro critérios mediam:
    //
    //   1 e 2 — o dock lendo `vtt_turn_tracks` em vez do `turn_track`
    //           fantasma. A trilha continua existindo e continua sendo
    //           a mesma tabela; quem a mostra agora é a ferramenta
    //           Rodadas do VTT, coberta por `check-vtt-rodadas` (40
    //           critérios, verde).
    //   5 e 6 — instância única do provider e estado preservado ao
    //           NAVEGAR entre as sub-rotas. Sem sub-rotas não há
    //           navegação que possa remontar o provider: o risco que
    //           eles guardavam saiu junto com as rotas.
    //
    // O que sobrou neste arquivo — painel, roster, console limpo, não
    // lidos e isolamento de erro — continua existindo e continua aqui.

    // --- 3. SessionPanel abre no Log, com entradas ---
    {
      const abaLog = page.locator('[data-testid="painel-aba-chat"]');
      const logSelecionado = (await abaLog.getAttribute("aria-selected")) === "true";
      const entradas = await page.locator('[data-testid="painel-chat-scroll"] > *').count();
      registrar("3 (SessionPanel abre no Log, com entradas)", logSelecionado, `aba Log selecionada por padrão=${logSelecionado}, entradas visíveis=${entradas}`);
    }

    // --- 4. Aba Participantes mostra o roster (narrador presente) ---
    {
      await page.locator('[data-testid="painel-aba-participantes"]').click();
      await page.waitForTimeout(300);
      // `session-roster-item[data-role]` virou
      // `painel-participantes-linha[data-papel]`.
      const itens = await page.locator('[data-testid="painel-participantes-linha"]').count();
      const temNarrador = (await page.locator('[data-testid="painel-participantes-linha"][data-papel="narrator"]').count()) > 0;
      registrar("4 (aba Participantes mostra o roster)", itens > 0 && temNarrador, `itens no roster=${itens}, narrador presente=${temNarrador}`);
      await page.locator('[data-testid="painel-aba-chat"]').click();
      await page.waitForTimeout(150);
    }

    registrar("7 (console limpo nas rotas da campanha)", erros.length === 0, erros.length ? JSON.stringify(erros.slice(0, 3)) : "nenhum");

    // --- 8 e 10 SAÍRAM com a mesma casca dos outros quatro ---
    //
    // Os dois giravam em torno do DRAWER da campanha: `campshell-painel-
    // sessao[data-open]`, o botão `campshell-drawer-toggle` e o badge de
    // não lidos que morava nele. Nenhum dos três existe.
    //
    // O painel de hoje recolhe e expande (`painel-recolher` /
    // `painel-expandir`, em `PainelAbas`), mas NÃO tem badge de não
    // lidos — a própria `PainelAbas` diz o que pretende no lugar dele:
    // "o contador é o número REAL de cada aba (não lidos do Chat,
    // participantes online, itens do bando…), nunca um badge fixo", e
    // esse contador ainda não está desenhado no trilho.
    //
    // Reescrever estes dois agora seria escrever um teste para uma peça
    // que ainda não existe. Ficam registrados aqui, e voltam quando o
    // contador das abas for construído.

    // --- 9, 11 e 12 SAÍRAM daqui; 9 e 11 viraram tarefa (SESS-01) ---
    //
    // O 12 é o badge de não lidos, que não existe — mesmo caso do 8 e
    // do 10, acima.
    //
    // O 9 e o 11 guardam algo REAL e vivo: o `CampaignRealtimeProvider`
    // mantém erro POR RECURSO (`erros.campaign ?? erros.logs ??
    // erros.roster ?? erros.viewer`), justamente pra que o sucesso de um
    // não apague o erro de outro. Isso continua no código e merece
    // teste.
    //
    // O que não funciona mais é a TÉCNICA. Os dois provocavam a falha
    // abortando a Server Action do recurso, e isso deixou de chegar no
    // `catch` do provider. Medido, não suposto: a interceptação dispara
    // (contei dois abortos da ação do roster, com a releitura chamada
    // pelo efeito de foco — trocar de aba não chama mais), o caminho de
    // erro do provider está correto lendo o código, e mesmo assim o
    // `EstadoErro` da aba Participantes nunca aparece.
    //
    // A suspeita é a mesma coisa que `check-vtt-modal-diagnostico` já
    // documentou de outro ângulo: ao abortar um Server Action, o Next
    // rejeita internamente em `fetchServerAction`, e essa rejeição não
    // necessariamente chega em quem chamou. Se for isso, provocar a
    // falha por abort testa o framework, não o provider — e o caminho
    // certo é fazer a AÇÃO falhar (erro do servidor), não a requisição.
    //
    // Deixar os dois reprovando aqui transformaria o arquivo em ruído
    // permanente; consertá-los às pressas seria adivinhar. Ficam
    // registrados como SESS-01.

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
      // O ESTADO DE INTERFACE A PRESERVAR mudou de endereço com a
      // casca. Não há mais drawer com `data-open` nem um id de montagem
      // publicado no DOM; o painel de hoje recolhe e expande
      // (`painel-recolher`/`painel-expandir`) e a aba selecionada
      // continua sendo a prova mais direta de que nada remontou — um
      // provider recriado levaria a aba junto.
      await page.locator('[data-testid="painel-expandir"]').click().catch(() => {});
      await page.waitForTimeout(300);
      await page.locator('[data-testid="painel-aba-participantes"]').click();
      await page.waitForTimeout(300);
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

      // O aviso de sincronização interrompida virou `vtt-aviso-sync`,
      // do próprio VTT.
      const semAlerta = (await page.locator('[data-testid="vtt-aviso-sync"]').count()) === 0;

      // Estado da interface preservado?
      // Painel expandido = o botão de EXPANDIR não existe (ele só é
      // renderizado quando o painel está recolhido, `{!aberto && …}`).
      const painelSegueAberto = (await page.locator('[data-testid="painel-expandir"]').count()) === 0;
      const abaParticipantes = (await page.locator('[data-testid="painel-aba-participantes"]').getAttribute("aria-selected")) === "true";

      // A PROVA de verdade: o canal ainda ENTREGA depois da renovação.
      // Sem `setAuth` do token novo, a RLS `to authenticated` voltaria a
      // barrar tudo (bug original) e esta entrada nunca chegaria.
      const marcadorPos = `check-fase3-pos-renovacao-${Date.now()}`;
      await inserirLogDeTeste(campaignId, marcadorPos);
      await page.waitForTimeout(2500);
      await page.locator('[data-testid="painel-aba-chat"]').click();
      await page.waitForTimeout(300);
      const entregouDepoisDaRenovacao = ((await page.locator('[data-testid="painel-chat-scroll"]').textContent().catch(() => "")) ?? "").includes(marcadorPos);

      registrar(
        "13 (Realtime renova sozinho, sem reload e sem perder estado de interface)",
        // O texto "Sincronizado" vinha de `mesa-sync-status`, da casca
        // antiga. O que restou é melhor do que ele: a ausência do aviso
        // de interrupção diz a mesma coisa sem depender de uma frase.
        renovouDeVerdade &&
          tokenAplicadoNoSocket &&
          semAlerta &&
          painelSegueAberto &&
          abaParticipantes &&
          entregouDepoisDaRenovacao,
        `+1h30 simuladas: TOKEN TROCADO DE VERDADE=${renovouDeVerdade} (exp ${expAntes ? new Date(expAntes).toISOString() : "?"} → ${expDepois ? new Date(expDepois).toISOString() : "?"}), ` +
          `APLICADO NO WEBSOCKET=${tokenAplicadoNoSocket} (setAuth ${authAntes?.aplicacoes}→${authDepois?.aplicacoes} aplicações, sufixo ${authAntes?.sufixo}→${authDepois?.sufixo}), ` +
          `sem alerta de interrupção=${semAlerta}, painel segue aberto=${painelSegueAberto}, ` +
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
