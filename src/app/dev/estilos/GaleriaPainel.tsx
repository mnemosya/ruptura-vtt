"use client";

/**
 * ABAS DO PAINEL LATERAL.
 *
 * Estas são as peças que a galeria mais custou a montar, e o motivo é
 * o mesmo em todas: elas leem do SERVIDOR na montagem. Fora de uma
 * campanha, o único estado que apareceria seria o de erro — que é um
 * estado real, mas não o que se quer revisar.
 *
 * A saída segue o padrão que o projeto já tinha adotado no
 * `CartaoTokenHover` (`dadosFixos`): uma prop opcional de dados
 * prontos, documentada como exclusiva de `/dev`, que curto-circuita a
 * leitura. A mesa real nunca a passa.
 *
 * O que não vem por prop vem por CONTEXTO: Chat e Participantes leem
 * `useCampaignSession()`. Em vez de furar esses componentes, a galeria
 * monta uma SESSÃO FABRICADA no próprio contexto — o componente
 * continua lendo do jeito que sempre leu, e o que mudou foi quem
 * responde.
 */

import { useMemo, useState, type ReactNode } from "react";
import {
  CampaignSessionContext, type CampaignSessionValue,
} from "../../mesas/[campaignId]/_shell/CampaignRealtimeProvider";
import { VttClient } from "../../mesas/[campaignId]/vtt/VttClient";
import { normalizeReactionRules } from "../../../lib/character";
import { PainelVtt } from "../../mesas/[campaignId]/vtt/_painel/PainelVtt";
import { PainelAbas } from "../../mesas/[campaignId]/vtt/_painel/PainelAbas";
import { ChatTab } from "../../mesas/[campaignId]/vtt/_painel/ChatTab";
import { BandoTab } from "../../mesas/[campaignId]/vtt/_painel/BandoTab";
import { CompendioTab } from "../../mesas/[campaignId]/vtt/_painel/CompendioTab";
import { PersonagensTab } from "../../mesas/[campaignId]/vtt/_painel/PersonagensTab";
import { ParticipantesTab } from "../../mesas/[campaignId]/vtt/_painel/ParticipantesTab";
import { Composer } from "../../mesas/[campaignId]/vtt/_painel/feed/Composer";
import { LimiteErroAba } from "../../mesas/[campaignId]/vtt/_painel/LimiteErroAba";
import { SemCampanha } from "./SemCampanha";
import type { TableLogEntry, TableLogVisibility } from "../../../lib/table";

const SEM_EFEITO = () => {};
const SEM_EFEITO_ASYNC = async () => {};

/* ── sessão fabricada ────────────────────────────────────────────── */

let seq = 0;
function log(type: string, payload: Record<string, unknown>, extra: Partial<TableLogEntry> = {}): TableLogEntry {
  seq += 1;
  return {
    id: extra.id ?? `pn-${seq}`,
    campaign_id: "galeria",
    character_id: extra.character_id ?? null,
    type,
    visibility: (extra.visibility ?? "public") as TableLogVisibility,
    payload,
    created_at: new Date(Date.UTC(2026, 1, 1, 21, 10, seq % 60)).toISOString(),
    created_by_user_id: "u-galeria",
  };
}

const LOGS: TableLogEntry[] = [
  log("chat", { text: "Alguém checou a escotilha de carga?", autorNome: "Mara Venn", autorTipo: "personagem" }, { character_id: "p1" }),
  log("rolagem_pericia", {
    characterNome: "Mara Venn", atributo: "Corpo", atributoValor: 2, pericia: null, periciaValor: 0,
    modificador: 3, cd: 8, total: 10, sucesso: true, dados: [6, 7], maiorDado: 7,
    classificacaoMargem: "sucesso_padrao", margemRotulo: "Sucesso Padrão",
  }, { character_id: "p1" }),
  log("chat", { text: "A névoa desce pelo pátio e engole os contêineres.", autorNome: "Narrador", autorTipo: "narrador", estilo: "narracao" }),
  log("condition_applied", { condicaoNome: "Sangrando", characterNome: "Corvo", duracao: "2 rodadas restantes", intensidade: 2, danoPorRodada: "1d8" }),
];

const ROSTER = [
  { userId: "u1", displayName: "Gabi", role: "narrator", email: null },
  { userId: "u2", displayName: "Vitor", role: "player", email: null },
  { userId: "u3", displayName: "Lia", role: "player", email: null },
];

/**
 * Valor de sessão fabricado.
 *
 * O `as unknown as` é deliberado e está confinado aqui: a sessão real
 * tem dezenas de campos de realtime (canais, estados de auth, contagem
 * de montagem) que nenhuma aba desenha. Reproduzir todos daria uma
 * fixture que envelhece a cada campo novo do provedor sem provar mais
 * nada — o que as abas leem está tudo escrito acima.
 */
function sessaoFalsa(papel: "narrator" | "player", campaignId = "galeria"): CampaignSessionValue {
  return {
    campaignId,
    role: papel,
    isNarrator: papel === "narrator",
    viewer: { userId: papel === "narrator" ? "u1" : "u2", displayName: papel === "narrator" ? "Gabi" : "Vitor", characterIds: ["p1"] },
    campaign: { id: campaignId, name: "Mesa Teste", owner_user_id: "u1" },
    setCampaign: SEM_EFEITO,
    logs: LOGS,
    roster: ROSTER,
    onlineUserIds: new Set(["u1", "u2"]),
    presenceSyncStatus: "subscribed",
    sessionSyncStatus: "subscribed",
    realtimeAuthEstado: "ok",
    realtimeAuthDegradado: false,
    renovarRealtimeAuth: SEM_EFEITO_ASYNC,
    sessionError: null,
    reloadCampaign: SEM_EFEITO_ASYNC,
    reloadLogs: SEM_EFEITO_ASYNC,
    reloadMembers: SEM_EFEITO_ASYNC,
    reloadViewer: SEM_EFEITO_ASYNC,
    sessionMountId: 1,
  } as unknown as CampaignSessionValue;
}

/** Casca do painel: a coluna real tem largura fixa, e isso muda o layout das abas. */
function ColunaDoPainel({ papel = "narrator", campaignId, children }: { papel?: "narrator" | "player"; campaignId?: string | null; children: ReactNode }) {
  return (
    <CampaignSessionContext.Provider value={sessaoFalsa(papel, campaignId ?? undefined)}>
      <div className="rv-painel gal-coluna">{children}</div>
    </CampaignSessionContext.Provider>
  );
}

function Papeis({ papel, onMudar }: { papel: "narrator" | "player"; onMudar: (p: "narrator" | "player") => void }) {
  return (
    <div className="gal-abas" role="group" aria-label="Papel de quem vê">
      <button type="button" className="gal-aba" aria-selected={papel === "narrator"} onClick={() => onMudar("narrator")}>Narrador</button>
      <button type="button" className="gal-aba" aria-selected={papel === "player"} onClick={() => onMudar("player")}>Jogador</button>
    </div>
  );
}

/* ── barra de abas ───────────────────────────────────────────────── */

export function VitrineAbas() {
  const [aba, setAba] = useState<Parameters<typeof PainelAbas>[0]["abaAtiva"]>("chat");
  const [aberto, setAberto] = useState(true);
  return (
    <>
      <div className="gal-abas" role="group" aria-label="Estado do painel">
        <button type="button" className="gal-aba" aria-selected={aberto} onClick={() => setAberto(true)}>Aberto</button>
        <button type="button" className="gal-aba" aria-selected={!aberto} onClick={() => setAberto(false)}>Recolhido</button>
      </div>
      <span className="gal-nota">Os contadores são por aba; `null` esconde o selo em vez de mostrar zero.</span>
      <ColunaDoPainel>
        <PainelAbas
          abaAtiva={aba}
          aberto={aberto}
          onSelecionar={setAba}
          onRecolher={() => setAberto((v) => !v)}
          idPainelDe={(a) => `gal-painel-${a}`}
        />
      </ColunaDoPainel>
    </>
  );
}

/* ── chat ────────────────────────────────────────────────────────── */

export function VitrineChat() {
  const [papel, setPapel] = useState<"narrator" | "player">("narrator");
  const f = useMemo(() => fixturesDoPainel(papel), [papel]);
  return (
    <>
      <Papeis papel={papel} onMudar={setPapel} />
      <span className="gal-nota">
        O feed é uma projeção dos logs da sessão. Como jogador, entradas marcadas como “só o
        narrador” não chegam — o recorte é do servidor, e aqui a sessão fabricada reproduz isso.
      </span>
      <ColunaDoPainel papel={papel}>
        <ChatTab
          key={papel}
          visivel
          personagemDoTokenSelecionado={{ id: "p1", nome: "Mara Venn" }}
          fixtureVisual={{
            ...f.chat,
          } as Parameters<typeof ChatTab>[0]["fixtureVisual"]}
        />
      </ColunaDoPainel>
    </>
  );
}

/* ── composer ────────────────────────────────────────────────────── */

export function VitrineComposer() {
  const [texto, setTexto] = useState("");
  const [visibilidade, setVisibilidade] = useState<TableLogVisibility>("public");
  const [caso, setCaso] = useState<"normal" | "enviando" | "erro">("normal");

  return (
    <>
      <div className="gal-abas" role="group" aria-label="Estado do composer">
        {(["normal", "enviando", "erro"] as const).map((c) => (
          <button key={c} type="button" className="gal-aba" aria-selected={caso === c} onClick={() => setCaso(c)}>
            {c === "normal" ? "Normal" : c === "enviando" ? "Enviando" : "Erro"}
          </button>
        ))}
      </div>
      <ColunaDoPainel>
        <Composer
          papel="narrator"
          identidade={{ characterId: "p1", nome: "Mara Venn", modo: "personagem" } as Parameters<typeof Composer>[0]["identidade"]}
          identidadesDisponiveis={[{ id: "p1", nome: "Mara Venn" }, { id: "p2", nome: "Corvo" }]}
          escolhaIdentidade="p1"
          onEscolherIdentidade={SEM_EFEITO}
          visibilidade={visibilidade}
          onEscolherVisibilidade={setVisibilidade}
          texto={texto}
          onTexto={setTexto}
          enviando={caso === "enviando"}
          erro={caso === "erro" ? "A mesa recusou a mensagem: sessão expirada." : null}
          onEnviar={SEM_EFEITO}
          onLimparErro={SEM_EFEITO}
          ultimaEnviada={null}
        />
      </ColunaDoPainel>
    </>
  );
}

/**
 * As fixtures de cada aba, por papel.
 *
 * SEMPRE consumida via `useMemo` por papel — nunca chamada solta no
 * corpo de um componente. O motivo é concreto: as abas recebem a
 * fixture como dependência do `useCallback` que carrega os dados, e um
 * objeto novo a cada render faz o efeito disparar de novo, que chama
 * `setState`, que re-renderiza, que cria outro objeto. É laço infinito
 * ("Maximum update depth exceeded"), e foi exatamente o que aconteceu
 * aqui antes deste comentário existir.
 *
 * A mesa real não corre esse risco: ela nunca passa a prop, então a
 * dependência é `undefined` — estável por construção.
 */
export function fixturesDoPainel(papel: "narrator" | "player") {
  const narrador = papel === "narrator";
  return {
    chat: {
      nomeDaConta: narrador ? "Gabi" : "Vitor",
      personagens: narrador
        ? [{ id: "p1", nome: "Mara Venn" }, { id: "p2", nome: "Corvo" }, { id: "p4", nome: "Sentinela da Doca" }]
        : [{ id: "p1", nome: "Mara Venn" }],
    },
    bando: { podeAdministrar: narrador, itens: BANDO.itens },
    compendio: COMPENDIO,
    personagens: {
      ...DIRETORIO,
      podeAdministrar: narrador,
      /* Como JOGADOR o servidor manda `null` — a RLS de
         `character_controllers` só mostra a própria linha. A contagem
         SOME; não vira zero, que seria afirmar algo falso. */
      entradas: DIRETORIO.entradas.map((e) => ({ ...e, controladores: narrador ? e.controladores : null })),
    },
    participantes: {
      completo: narrador,
      porUsuario: (narrador
        ? { u1: [{ id: "p4", nome: "Sentinela da Doca" }], u2: [{ id: "p1", nome: "Mara Venn" }], u3: [{ id: "p2", nome: "Corvo" }] }
        : { u2: [{ id: "p1", nome: "Mara Venn" }] }) as Record<string, { id: string; nome: string }[]>,
    },
  };
}

/* ── bando ───────────────────────────────────────────────────────── */

const BANDO = {
  podeAdministrar: true,
  itens: [
    { id: "i1", nome: "Estimulante de Combate", slug: "estimulante", categoria: "consumivel", subtipo: "quimico", quantidade: 3, payload: {} },
    { id: "i2", nome: "Cordame de Aço", slug: "cordame", categoria: "equipamento", subtipo: null, quantidade: 1, payload: {} },
    { id: "i3", nome: "Munição pesada", slug: "municao-pesada", categoria: "municao", subtipo: null, quantidade: 24, payload: {} },
  ],
};

/** Estável por módulo: objeto novo a cada render reabriria o laço. */
const BANDO_VAZIO = { podeAdministrar: true, itens: [] };

export function VitrineBando() {
  const [vazio, setVazio] = useState(false);
  return (
    <>
      <div className="gal-abas" role="group" aria-label="Conteúdo do bando">
        <button type="button" className="gal-aba" aria-selected={!vazio} onClick={() => setVazio(false)}>Com itens</button>
        <button type="button" className="gal-aba" aria-selected={vazio} onClick={() => setVazio(true)}>Vazio</button>
      </div>
      <ColunaDoPainel>
        <BandoTab
          key={String(vazio)}
          campaignId="galeria"
          visivel
          onEnviarParaPersonagem={SEM_EFEITO}
          recarregarSinal={0}
          fixtureVisual={(vazio ? BANDO_VAZIO : BANDO) as Parameters<typeof BandoTab>[0]["fixtureVisual"]}
        />
      </ColunaDoPainel>
    </>
  );
}

/* ── compêndio ───────────────────────────────────────────────────── */

const COMPENDIO = [
  { categoria: "magias", rotulo: "Magias", total: 42, daMesa: 3 },
  { categoria: "itens", rotulo: "Itens", total: 118, daMesa: 7 },
  { categoria: "condicoes", rotulo: "Condições", total: 21, daMesa: 0 },
  { categoria: "talentos", rotulo: "Talentos", total: 64, daMesa: 2 },
];

export function VitrineCompendio() {
  return (
    <ColunaDoPainel>
      <CompendioTab
        campaignId="galeria"
        visivel
        fixtureVisual={COMPENDIO as Parameters<typeof CompendioTab>[0]["fixtureVisual"]}
      />
    </ColunaDoPainel>
  );
}

/* ── personagens ─────────────────────────────────────────────────── */

const DIRETORIO = {
  podeAdministrar: true,
  pastas: [{ id: "f1", nome: "Antagonistas", posicao: 0, parentId: null }],
  entradas: [
    { characterId: "p1", nome: "Mara Venn", tipo: "jogador", pastaId: null, posicao: 0, arquivado: false, controladores: 1, pv: { atual: 20, max: 20 } },
    { characterId: "p2", nome: "Corvo", tipo: "jogador", pastaId: null, posicao: 1, arquivado: false, controladores: 1, pv: { atual: 5, max: 26 } },
    { characterId: "p3", nome: "Siv", tipo: "jogador", pastaId: null, posicao: 2, arquivado: false, controladores: 0, pv: { atual: 18, max: 18 } },
    { characterId: "p4", nome: "Sentinela da Doca", tipo: "pn", pastaId: "f1", posicao: 0, arquivado: false, controladores: null, pv: { atual: 12, max: 12 } },
  ],
};

export function VitrinePersonagens() {
  const [papel, setPapel] = useState<"narrator" | "player">("narrator");
  const f = useMemo(() => fixturesDoPainel(papel), [papel]);
  return (
    <>
      <Papeis papel={papel} onMudar={setPapel} />
      <span className="gal-nota">
        Como jogador, `controladores` vem `null` do servidor (a RLS só mostra a própria linha) e a
        linha deixa de decorar — por isso a contagem some, não vira zero.
      </span>
      <ColunaDoPainel papel={papel}>
        <PersonagensTab
          key={papel}
          campaignId="galeria"
          visivel
          ehNarrador={papel === "narrator"}
          onAbrirConsole={SEM_EFEITO}
          onConfigurarAcesso={SEM_EFEITO}
          onPrecarregarConsole={SEM_EFEITO}
          onAdicionarACena={SEM_EFEITO}
          onReceberItemDoBando={SEM_EFEITO}
          fixtureVisual={f.personagens as unknown as Parameters<typeof PersonagensTab>[0]["fixtureVisual"]}
        />
      </ColunaDoPainel>
    </>
  );
}

/* ── participantes ───────────────────────────────────────────────── */

export function VitrineParticipantes() {
  const [papel, setPapel] = useState<"narrator" | "player">("narrator");
  const f = useMemo(() => fixturesDoPainel(papel), [papel]);
  return (
    <>
      <Papeis papel={papel} onMudar={setPapel} />
      <span className="gal-nota">
        Roster e presença vêm do contexto de sessão (Gabi e Vitor online, Lia ausente). Como
        JOGADOR, a leitura de controles não cobre a campanha inteira (`completo: false`) — e a aba
        então não afirma nada sobre as outras linhas, em vez de mostrar zero.
      </span>
      <ColunaDoPainel papel={papel}>
        <ParticipantesTab
          key={papel}
          campaignId="galeria"
          visivel
          ehNarrador={papel === "narrator"}
          onAbrirConvites={SEM_EFEITO}
          fixtureVisual={f.participantes}
        />
      </ColunaDoPainel>
    </>
  );
}

/* ── limite de erro ──────────────────────────────────────────────── */

function AbaQueQuebra(): ReactNode {
  throw new Error("Falha proposital para exercitar o limite de erro da aba.");
}

/**
 * O limite de erro só tem um estado visível, e ele exige um filho que
 * lance de verdade. Um exemplo com erro fabricado seria uma casca; aqui
 * a aba quebra mesmo, e o que aparece é o que a mesa mostraria.
 */
export function VitrineLimiteErro() {
  const [quebrar, setQuebrar] = useState(true);
  return (
    <>
      <div className="gal-abas" role="group" aria-label="Estado do limite de erro">
        <button type="button" className="gal-aba" aria-selected={quebrar} onClick={() => setQuebrar(true)}>Aba quebrada</button>
        <button type="button" className="gal-aba" aria-selected={!quebrar} onClick={() => setQuebrar(false)}>Aba saudável</button>
      </div>
      <ColunaDoPainel>
        <LimiteErroAba key={String(quebrar)} chaveReset={String(quebrar)} rotuloAba="Compêndio">
          {quebrar ? <AbaQueQuebra /> : <p className="pn-texto">Conteúdo normal da aba.</p>}
        </LimiteErroAba>
      </ColunaDoPainel>
    </>
  );
}

/* ── casca do painel ─────────────────────────────────────────────── */

/**
 * O painel INTEIRO: barra de abas mais a aba ativa. É a peça que mostra
 * como as abas convivem — a troca preserva estado (elas não desmontam)
 * e o contador de cada uma vem de dentro dela.
 *
 * Diferente das abas isoladas, esta NÃO recebe fixture: ela monta as
 * abas de verdade, e injetar dado falso aqui seria repassá-lo por dentro
 * do painel inteiro. Com campanha, mostra o painel real; sem, diz o que
 * falta — nunca o erro de autorização com cara de tela.
 */
export function VitrineCascaPainel() {
  const [papel, setPapel] = useState<"narrator" | "player">("narrator");
  const f = useMemo(() => fixturesDoPainel(papel), [papel]);
  return (
    <>
      <Papeis papel={papel} onMudar={setPapel} />
      <span className="gal-nota">
        O painel inteiro, com as cinco abas montadas e dados nas duas visões. Trocar de aba preserva
        estado (elas não desmontam) e cada contador vem de dentro da própria aba.
      </span>
      <ColunaDoPainel papel={papel}>
        <PainelVtt
          key={papel}
          campaignId="galeria"
          usuarioId={papel === "narrator" ? "u1" : "u2"}
          ehNarrador={papel === "narrator"}
          personagemDoTokenSelecionado={{ id: "p1", nome: "Mara Venn" }}
          onAdicionarPersonagemACena={SEM_EFEITO}
          fixtureVisual={f as unknown as Parameters<typeof PainelVtt>[0]["fixtureVisual"]}
        />
      </ColunaDoPainel>
    </>
  );
}

/* ── a mesa inteira ──────────────────────────────────────────────── */

/**
 * `VttClient` — 4866 linhas que orquestram cena, realtime, ferramentas,
 * turnos e painel.
 *
 * Ela entra na galeria pelo que a galeria PODE mostrar dela: a casca
 * (trilho de ferramentas, cabeçalho de cena, palco, painel lateral) e o
 * ciclo de abertura. A cena vem do servidor e não há prop de fixture
 * aqui — dar uma a este componente significaria abrir um caminho de
 * dados falsos no orquestrador inteiro, e não só numa aba.
 *
 * Nada se perde por isso: cada peça de dentro dela tem aba própria
 * nesta galeria, com estado fabricado e todas as variações. O que esta
 * aba acrescenta é o CONJUNTO — e o estado de carregamento/falha da
 * mesa, que na prática só se vê quando algo dá errado.
 */
export function VitrineMesaInteira({ campaignId }: { campaignId: string | null }) {
  const [papel, setPapel] = useState<"narrator" | "player">("narrator");
  if (!campaignId) {
    return (
      <SemCampanha
        peca="A mesa inteira"
        jaExisteEm="/dev/vtt?campaignId=<uuid>"
        oQueTemAqui="o palco em Mapa e HUD, as ferramentas em Janelas de ferramenta e o painel em Painel lateral"
      />
    );
  }
  return (
    <>
      <Papeis papel={papel} onMudar={setPapel} />
      <span className="gal-nota">
        Mesa real da campanha <code>{campaignId}</code>. Cada peça de dentro também tem aba própria
        nesta galeria, isolada e com todos os estados.
      </span>
      <div className="gal-mesa">
        <CampaignSessionContext.Provider value={sessaoFalsa(papel, campaignId)}>
          <VttClient
            key={papel}
            campaignId={campaignId}
            papel={papel}
          />
        </CampaignSessionContext.Provider>
      </div>
    </>
  );
}
