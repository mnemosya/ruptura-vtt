"use client";

/**
 * PALCO E JANELAS INTERNAS — as últimas peças do mapa.
 *
 * `MapaHex` é o maior componente do produto (3083 linhas) e aqui ele é
 * montado com uma CENA fabricada: nome, tamanho, tokens e objetos. Não
 * há servidor envolvido — a cena é um objeto literal, e é por isso que
 * ela cabe numa galeria.
 *
 * As janelas internas (Console, convites, acesso) são o caso oposto:
 * elas são uma casca `JanelaInterna` mais um conteúdo que vem do
 * servidor. Fora de uma campanha a casca é real e o conteúdo cai no
 * estado de falha — que é exatamente o que a mesa mostraria se a
 * leitura falhasse, e é o estado que só aqui dá pra revisar de
 * propósito.
 */

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { MapaHex, type CenaMapa, type EstadoVisualToken } from "../../mesas/[campaignId]/vtt/_mapa/MapaHex";
import type { AreaDesenhavel } from "../../mesas/[campaignId]/vtt/_mapa/CamadaAreas";
import { AcoesAreaFlutuantes } from "../../mesas/[campaignId]/vtt/_shell/AcoesAreaFlutuantes";
import { JanelaJogadoresConvites, JanelaAcessoPersonagem } from "../../mesas/[campaignId]/vtt/_painel/janelas/JanelasAdmin";
import { ConsoleNoVtt } from "../../mesas/[campaignId]/vtt/_painel/janelas/ConsoleNoVtt";
import { TransferenciaBando } from "../../mesas/[campaignId]/vtt/_painel/TransferenciaBando";
import type { TokenApresentacao } from "../../mesas/[campaignId]/vtt/_dominio/tokenApresentacao";
import { SemCampanha } from "./SemCampanha";

const SEM_EFEITO = () => {};

/* ── cena fabricada ──────────────────────────────────────────────── */

function token(id: string, nome: string, sigla: string, lado: "pj" | "pn", q: number, r: number, extra: Partial<TokenApresentacao> = {}): TokenApresentacao {
  return {
    id, nome, sigla, lado, vertente: "energetico", tamanho: "medio",
    pos: { q, r }, offset: { q: 0, r: 0 }, orientacao: 0, direcao: 0,
    pegadaPersonalizada: null, retrato: null, pv: 20, pvMax: 20, pe: null, peMax: null, mana: null, manaMax: null,
    condicoes: [], visivel: true, bloqueado: false, characterId: null,
    pvPublico: true, pePublico: false, manaPublica: true, podeControlar: true, revision: 1,
    ...extra,
  } as TokenApresentacao;
}

const CENA: CenaMapa = {
  nome: "Doca 7 — o mercado que se desfez",
  largura: 14,
  altura: 10,
  tokens: [
    token("t1", "Mara Venn", "MV", "pj", 4, 3),
    token("t2", "Corvo", "CV", "pj", 5, 4, { vertente: "somatico", pv: 5, pvMax: 26, condicoes: ["sangrando"] }),
    token("t3", "Siv", "SV", "pj", 3, 5, { vertente: "cognitivo", tamanho: "grande", orientacao: 2 }),
    token("t4", "Sentinela da Doca", "#2", "pn", 9, 4, { vertente: "nenhuma" }),
    token("t5", "Contrabandista", "#3", "pn", 10, 6, { vertente: "material", visivel: false }),
  ],
  objetos: [
    {
      id: "o1", nome: "Barricada de contêineres",
      celulas: [{ q: 7, r: 3 }, { q: 7, r: 4 }, { q: 7, r: 5 }],
      grau: "maior", categoria: "resistente", pd: 12,
    },
    {
      id: "o2", nome: "Caixaria",
      celulas: [{ q: 2, r: 7 }, { q: 3, r: 7 }],
      grau: "parcial", categoria: "fragil", pd: 4,
    },
  ] as CenaMapa["objetos"],
};

/** Estáveis por módulo — mesma razão do `useMemo` acima. */
const ALVOS = ["t4"];
const PAN = { x: 0, y: 0 };

const ESTADO_BASE: EstadoVisualToken = {
  selecionado: false, sobCursor: false, turnoAtual: false, podeAgir: true,
  jaAgiu: false, fragmentado: false, alvo: false,
} as EstadoVisualToken;

/**
 * Áreas desenháveis — uma de cada forma que a camada sabe desenhar.
 *
 * `regiao` é geometria de MUNDO (não de célula): disco, setor, polígono,
 * corredor e segmento. As células afetadas vêm ao lado, já resolvidas
 * pela regra dos 50% — a camada desenha as duas coisas, a forma e o
 * realce, e por isso dá pra desligar o realce e inspecionar só a forma.
 */
const AREAS: AreaDesenhavel[] = [
  {
    id: "a1", tipo: "esfera",
    regiao: { forma: "disco", centro: { x: 3, y: 2 }, raio: 2.2 },
    cor: "#45b8c9", opacidade: 0.35, rotulo: "Compressão",
    estado: "selecionada",
    celulasAfetadas: [{ q: 5, r: 3 }, { q: 6, r: 3 }, { q: 5, r: 4 }, { q: 6, r: 4 }],
    pegadasAfetadas: [[{ q: 5, r: 4 }]],
  },
  {
    id: "a2", tipo: "cone",
    regiao: { forma: "setor", centro: { x: -2, y: 1 }, raio: 3.4, direcaoRad: 0.6, meiaAberturaRad: 0.5 },
    cor: "#8878d6", opacidade: 0.3, rotulo: "Cone de Estática",
    estado: "persistida",
    celulasAfetadas: [{ q: 2, r: 5 }, { q: 3, r: 5 }, { q: 3, r: 6 }],
    pegadasAfetadas: [],
  },
  {
    id: "a3", tipo: "linha",
    regiao: { forma: "segmento", a: { x: 1, y: -2 }, b: { x: 6, y: -1 } },
    cor: "#cf9a3e", opacidade: 0.4, rotulo: null,
    estado: "oculta",
    celulasAfetadas: [{ q: 8, r: 2 }, { q: 9, r: 2 }],
    pegadasAfetadas: [],
  },
] as unknown as AreaDesenhavel[];

/* ── mapa ────────────────────────────────────────────────────────── */

export function VitrineMapa() {
  const [selecionado, setSelecionado] = useState<string | null>("t1");
  const [hover, setHover] = useState<string | null>(null);
  const [realce, setRealce] = useState<"nenhum" | "alcance" | "movimento" | "area">("alcance");
  const [zoom, setZoom] = useState(1);
  const [comAreas, setComAreas] = useState(false);
  const [mostrarCelulas, setMostrarCelulas] = useState(true);

  /* `useMemo`/`useCallback` aqui não são zelo: o MapaHex usa estas duas
     como dependência de efeito, e recriá-las a cada render fazia o
     efeito disparar, chamar `setState` e re-renderizar em laço
     ("Maximum update depth exceeded"). A mesa real passa referências
     estáveis; a galeria precisa fazer o mesmo, ou testa outra coisa. */
  const celulas = useMemo(
    () => (realce === "nenhum" ? [] : [{ q: 5, r: 3 }, { q: 6, r: 3 }, { q: 5, r: 4 }, { q: 6, r: 4 }, { q: 6, r: 5 }]),
    [realce],
  );

  const estadoPorToken = useCallback(
    (t: TokenApresentacao): EstadoVisualToken => ({
      ...ESTADO_BASE,
      selecionado: t.id === selecionado,
      sobCursor: t.id === hover,
      turnoAtual: t.id === "t1",
      alvo: t.id === "t4",
      fragmentado: t.id === "t2",
    }),
    [selecionado, hover],
  );

  const areas = useMemo(() => (comAreas ? AREAS : undefined), [comAreas]);
  const selecionar = useCallback((id: string) => setSelecionado(id), []);
  /* Sem isto a vitrine não exercitava a seleção por CAIXA — e é ela
     que também responde pelo clique no vazio (caixa 0×0 = desselecionar
     tudo). A galeria existe pra pegar esse tipo de coisa antes da
     mesa. */
  const selecionarCaixa = useCallback((ids: string[]) => setSelecionado(ids[ids.length - 1] ?? null), []);

  return (
    <>
      <div className="gal-abas" role="group" aria-label="Realce no mapa">
        {(["nenhum", "alcance", "movimento", "area"] as const).map((t) => (
          <button key={t} type="button" className="gal-aba" aria-selected={realce === t} onClick={() => setRealce(t)}>
            {t === "nenhum" ? "Sem realce" : t === "alcance" ? "Alcance" : t === "movimento" ? "Movimento" : "Área"}
          </button>
        ))}
        <button type="button" className="gal-aba" onClick={() => setZoom((z) => (z >= 1.4 ? 0.8 : z + 0.2))}>
          Zoom {zoom.toFixed(1)}×
        </button>
        <button type="button" className="gal-aba" aria-selected={comAreas} onClick={() => setComAreas((v) => !v)}>
          Áreas
        </button>
        {comAreas && (
          <button type="button" className="gal-aba" aria-selected={mostrarCelulas} onClick={() => setMostrarCelulas((v) => !v)}>
            Realce das células
          </button>
        )}
      </div>
      <span className="gal-nota">
        Cinco tokens (um grande e orientado, um ferido com condição, um oculto), dois objetos com
        cobertura e PD. Clique num token para selecionar; o realce muda de cor conforme o tipo.
      </span>
      <div className="gal-palco gal-palco--mapa">
        {/* Zoom — a outra peça flutuante do rodapé, no canto oposto ao
            chip. Mesma casca, e é isso que a vitrine deixa conferir. */}
        <div className="rv-zoom" role="group" aria-label="Zoom" style={{ position: "absolute", right: 16, bottom: 16 }}>
          <button type="button" aria-label="Aproximar"><Plus size={14} /></button>
          <span>100%</span>
          <button type="button" aria-label="Afastar"><Minus size={14} /></button>
        </div>

        {/* Chip "Cena ativa" — peça do palco (`VttClient`), montada aqui
            só pra poder ser vista sem sessão. Os dois estados: narrador
            (botão que abre o catálogo) e jogador (texto). */}
        <button type="button" className="rv-cena-chip" style={{ position: "absolute", left: 10, bottom: 12 }}>
          <span className="rv-cena-chip__rot">Cena ativa:</span>
          <span className="rv-cena-chip__nome">Doca 7 — o mercado que se desfez</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        <MapaHex
          cena={CENA}
          zoom={zoom}
          pan={PAN}
          selecionadoId={selecionado}
          hoverId={hover}
          alvoIds={ALVOS}
          estadoPorToken={estadoPorToken}
          celulasRealce={celulas}
          tipoRealce={realce === "nenhum" ? null : realce}
          onSelecionarToken={selecionar}
          onSelecionarCaixa={selecionarCaixa}
          ferramenta="interagir"
          onHoverToken={setHover}
          areas={areas}
          areasMostrarCelulas={mostrarCelulas}
          areasMostrarHalos
        />
      </div>
    </>
  );
}

/* ── janelas internas ────────────────────────────────────────────── */

/**
 * As quatro janelas internas compartilham a casca e só diferem no
 * conteúdo — e o conteúdo TODO vem do servidor, com autorização por
 * campanha.
 *
 * Uma versão anterior montava elas sem campanha, e o resultado era a
 * janela exibindo "Você não tem acesso a esta campanha": falha de
 * autorização apresentada como se fosse um estado de design. Pior que
 * não mostrar, porque parece uma tela de verdade.
 *
 * Agora ou há campanha (e os dados são reais), ou a galeria diz o que
 * falta. A casca destas janelas, que é o que elas têm de visual
 * próprio, está isolada na aba Sobreposições (`JanelaInterna`).
 */
export function VitrineJanelasAdmin({ campaignId }: { campaignId: string | null }) {
  const [qual, setQual] = useState<"convites" | "acesso" | "console" | "transferencia">("convites");
  if (!campaignId) {
    return (
      <SemCampanha
        peca="As janelas internas"
        jaExisteEm="/dev/character-sheet?campaignId=<uuid>&characterId=<uuid>"
        oQueTemAqui="a casca delas em Vocabulário › Sobreposições (JanelaInterna)"
      />
    );
  }
  return (
    <>
      <div className="gal-abas" role="group" aria-label="Qual janela interna">
        {([
          ["convites", "Jogadores e convites"],
          ["acesso", "Acesso ao personagem"],
          ["console", "Console no VTT"],
          ["transferencia", "Transferência do bando"],
        ] as const).map(([v, rotulo]) => (
          <button key={v} type="button" className="gal-aba" aria-selected={qual === v} onClick={() => setQual(v)}>
            {rotulo}
          </button>
        ))}
      </div>
      <span className="gal-nota">
        Dados reais da campanha <code>{campaignId}</code>.
      </span>
      <div className="gal-palco gal-palco--alto">
        {qual === "convites" && <JanelaJogadoresConvites campaignId={campaignId} aberta onFechar={SEM_EFEITO} />}
        {qual === "acesso" && <JanelaAcessoPersonagem campaignId={campaignId} characterId="p1" onFechar={SEM_EFEITO} />}
        {qual === "console" && <ConsoleNoVtt campaignId={campaignId} characterId="p1" onFechar={SEM_EFEITO} />}
        {qual === "transferencia" && (
          <TransferenciaBando
            campaignId={campaignId}
            alvo={{ item: { id: "i1", nome: "Estimulante de Combate", quantidade: 3 }, personagem: { id: "p1", nome: "Mara Venn" } } as Parameters<typeof TransferenciaBando>[0]["alvo"]}
            onFechar={SEM_EFEITO}
            onConcluido={SEM_EFEITO}
          />
        )}
      </div>
    </>
  );
}

/* ── ações flutuantes de área ────────────────────────────────────── */

/**
 * A barra que aparece ao lado da área recém-desenhada. Ela se posiciona
 * a partir da geometria do mapa (`posicaoDasAcoes` + `areaUtilDoMapa`),
 * então precisa de uma âncora em coordenadas de TELA — aqui, um ponto
 * fixo dentro do palco.
 */
export function VitrineAcoesArea() {
  const [caso, setCaso] = useState<"criando" | "editando" | "persistindo" | "erro">("criando");
  return (
    <>
      <div className="gal-abas" role="group" aria-label="Estado das ações de área">
        {([
          ["criando", "Criando"],
          ["editando", "Editando"],
          ["persistindo", "Salvando"],
          ["erro", "Recusada"],
        ] as const).map(([v, rotulo]) => (
          <button key={v} type="button" className="gal-aba" aria-selected={caso === v} onClick={() => setCaso(v)}>
            {rotulo}
          </button>
        ))}
      </div>
      <span className="gal-nota">
        Criando, o botão diz “Manter”; editando, “Salvar”. A medida ao lado só aparece quando a
        área tem uma — e ela muda a posição da barra, para a medida não cobrir o desenho.
      </span>
      <div className="gal-palco gal-palco--medio">
        <AcoesAreaFlutuantes
          ancoraTela={{ x: 420, y: 300 }}
          onManter={SEM_EFEITO}
          onDescartar={SEM_EFEITO}
          persistindo={caso === "persistindo"}
          erro={caso === "erro" ? "Fora dos limites da cena." : null}
          editando={caso === "editando"}
          medida="6 m · 7 células"
        />
      </div>
    </>
  );
}
