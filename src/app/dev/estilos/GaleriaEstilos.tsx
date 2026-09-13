"use client";

/**
 * GALERIA DE ESTILOS — página de revisão das peças visuais do VTT.
 *
 * Por que ela existe: revisar uma peça na mesa real custa montar uma
 * campanha, uma cena, tokens e um combate — e vários estados (janela
 * concluída, turno aberto, Lentos, emboscada) só aparecem depois de
 * jogar até eles. Aqui cada estado é um objeto literal, então dá pra
 * olhar os oito de uma vez.
 *
 * REGRA DA PÁGINA: ela desenha os COMPONENTES DE VERDADE, com o CSS de
 * verdade (`vtt.css`). Nada de marcação copiada — uma galeria com cópia
 * envelhece em silêncio e passa a mentir justamente sobre o que ela
 * deveria provar. O `galeria.css` só cuida da moldura (fundo, grade,
 * legendas); nenhuma regra dele entra dentro das peças.
 */

import { useState, type ReactNode } from "react";
import { GRUPOS_CARDS, GrupoDeCards } from "./GaleriaCards";
import {
  VitrineDiretorio, VitrineEstados, VitrinePrimitivas, VitrineSobreposicoes,
} from "./GaleriaVocabulario";
import {
  VitrineBandeja, VitrineCampos, VitrineDadosEFaixa, VitrineMesa3D, VitrineMoldura, VitrineRolador,
} from "./GaleriaRolagem";
import { TrilhaFaccoes } from "../../mesas/[campaignId]/vtt/_turnos/TrilhaFaccoes";
/* O HUD já tinha um harness visual próprio, com as quatro situações
   montadas (`/dev/vtt-hud`). Ele entra na galeria REAPROVEITADO, não
   copiado: duas fixtures do mesmo HUD envelheceriam em ritmos
   diferentes, e a que ninguém abre é a que passa a mentir. */
import { VttHudVisualHarness } from "../vtt-hud/VttHudVisualHarness";
import { VitrineCamadas, VitrineCena, VitrineDados, VitrineMarcar, VitrineMedir, VitrineMoldura as VitrineMolduraJanela } from "./GaleriaJanelas";
import { VitrineGaveta, VitrineLadrilho, VitrineParametros } from "./GaleriaCenas";
import {
  VitrineAreas, VitrineGerenciadorToken, VitrineMenuContextual, VitrineObjetos, VitrineTerreno,
} from "./GaleriaMapa";
import {
  VitrineAbas, VitrineBando, VitrineChat, VitrineCompendio, VitrineComposer,
  VitrineCascaPainel, VitrineLimiteErro, VitrineMesaInteira, VitrineParticipantes, VitrinePersonagens,
} from "./GaleriaPainel";
import { VitrineAcoesArea, VitrineJanelasAdmin, VitrineMapa } from "./GaleriaPalco";
import {
  RepetidosAbas, RepetidosBotoes, RepetidosCampos, RepetidosChips, RepetidosEstados,
} from "./GaleriaRepetidos";
import { NucleoRodada } from "../../mesas/[campaignId]/vtt/_turnos/NucleoRodada";
import { PainelRodadas } from "../../mesas/[campaignId]/vtt/_turnos/PainelRodadas";
import { ProvedorJanelasFerramenta } from "../../mesas/[campaignId]/vtt/_shell/JanelaFerramenta";
import type { EstadoTrilha, Lado, Participante } from "../../mesas/[campaignId]/vtt/_turnos/modelo";
import type { TokenApresentacao } from "../../mesas/[campaignId]/vtt/_dominio/tokenApresentacao";

/* ── fixtures ───────────────────────────────────────────────────── */

function participante(over: Partial<Participante> & Pick<Participante, "id" | "nome" | "lado">): Participante {
  return {
    declaracao: null, paComprometido: null, paTotal: 4, paGasto: 0, reflexos: 2,
    agiuEm: [], fragmentouEm: null, encerrou: false, incapaz: null, ...over,
  };
}

const ELENCO: Participante[] = [
  participante({ id: "t1", nome: "Mara Venn", lado: "pj", reflexos: 4 }),
  participante({ id: "t2", nome: "Corvo", lado: "pj", reflexos: 3 }),
  participante({ id: "t3", nome: "Sentinela da Doca", lado: "pn" }),
  participante({ id: "t4", nome: "Contrabandista", lado: "pn" }),
  participante({ id: "t5", nome: "Estivador", lado: "pn" }),
];

function trilha(over: Partial<EstadoTrilha> = {}): EstadoTrilha {
  return {
    modo: "combate", rodada: 1, janela: "rapidos",
    ultimoLado: null, agindoId: null, ladoSurpresa: null,
    participantes: ELENCO.map((p) => ({ ...p })), ...over,
  };
}

function token(id: string, nome: string, sigla: string, lado: Lado): TokenApresentacao {
  return {
    id, nome, sigla, lado, vertente: "energetico", tamanho: "medio",
    pos: { q: 0, r: 0 }, offset: { q: 0, r: 0 }, orientacao: 0,
    pegadaPersonalizada: null, retrato: null, retratoImageId: null, origemRetrato: "nenhum", pv: null, pvMax: null,
    condicoes: [], visivel: true, bloqueado: false, characterId: null,
    pvPublico: true, pePublico: false, manaPublica: true, podeControlar: true, revision: 1,
  };
}

const TOKENS: TokenApresentacao[] = [
  token("t1", "Mara Venn", "MV", "pj"),
  token("t2", "Corvo", "CV", "pj"),
  token("t3", "Sentinela da Doca", "#2", "pn"),
  token("t4", "Contrabandista", "#3", "pn"),
  token("t5", "Estivador", "#4", "pn"),
];

/**
 * Estados do núcleo da rodada.
 *
 * Só os que EXISTEM como desenho: os dois nós do Figma e a variação de
 * janela, que é a mesma peça com o outro acento. Inventar cartões pra
 * combinações que ninguém desenhou enche a página de coisa que não é
 * referência de nada — e faz a revisão aprovar o que eu chutei.
 */
const NUCLEOS: {
  chave: string; titulo: string; nota: string;
  props: Omit<React.ComponentProps<typeof NucleoRodada>, "onAvancarJanela" | "onProximaRodada">;
}[] = [
  {
    chave: "repouso", titulo: "Repouso", nota: "Figma 440:1827 — sem notícia, sem rodapé.",
    props: { trilha: trilha(), agindo: null, vez: null, janelaAcabou: false },
  },
  {
    chave: "concluida", titulo: "Janela concluída", nota: "Figma 440:2643 — régua, estado e ação.",
    props: { trilha: trilha(), agindo: null, vez: null, janelaAcabou: true },
  },
  {
    chave: "lentos", titulo: "Lentos", nota: "A mesma peça na outra janela: o acento vira âmbar.",
    props: { trilha: trilha({ janela: "lentos" }), agindo: null, vez: null, janelaAcabou: true },
  },
];

/* ── navegação ──────────────────────────────────────────────────── */

/**
 * UMA peça por aba.
 *
 * A navegação tem DOIS níveis, os dois em abas horizontais:
 *
 *   FAMÍLIA  (Turnos, Cards do Chat Log, …)
 *   COMPONENTE (Núcleo da rodada · Janela de Rodadas | Mensagem · Rolagem · …)
 *
 * Horizontal e em dois níveis porque a galeria só cresce: uma lista
 * vertical com tudo volta a ser o scroll que a página tinha antes, só
 * que numa coluna mais estreita. Abas quebram em linha e a família
 * segura o crescimento — componente novo entra numa família existente
 * sem alongar a navegação inteira.
 *
 * `render` é função, não elemento: só a peça escolhida é construída, e
 * a janela de ferramenta (que monta estado, mede posição e observa
 * resize) não paga por estar numa aba que ninguém abriu.
 */
interface Peca {
  chave: string;
  grupo: string;
  rotulo: string;
  render: () => ReactNode;
}

const SEM_EFEITO = () => {};

function Secao({ titulo, sub, children }: { titulo: string; sub: ReactNode; children: ReactNode }) {
  return (
    <section className="gal-secao">
      <h2>{titulo}</h2>
      <p className="gal-sub">{sub}</p>
      {children}
    </section>
  );
}

function NucleoDaRodada() {
  return (
    <Secao
      titulo="Núcleo da rodada"
      sub={<>A placa fixa no topo do palco. Figma <code>440:1827</code> (repouso) e <code>440:2643</code> (com ação). Componente: <code>_turnos/NucleoRodada.tsx</code>.</>}
    >
      <div className="gal-grade">
        {NUCLEOS.map((n) => (
          <figure key={n.chave} className="gal-cartao">
            <div className="gal-palco">
              {/* A placa é `position: absolute` com `left: 50%` — o palco
                  de mentira aqui reproduz só isso: um bloco posicionado,
                  do tamanho de um pedaço de mesa. */}
              <NucleoRodada {...n.props} onAvancarJanela={SEM_EFEITO} onProximaRodada={SEM_EFEITO} />
            </div>
            <figcaption>
              <strong>{n.titulo}</strong>
              <span>{n.nota}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </Secao>
  );
}

function JanelaDeRodadas() {
  const [painel, setPainel] = useState<"configuracao" | "ativo">("ativo");
  const trilhaDoPainel = painel === "ativo"
    ? trilha({ rodada: 1, participantes: ELENCO.map((p, i) => ({ ...p, incapaz: i === 4 ? { motivo: "inconsciente" } : null })) })
    : null;
  return (
    <Secao
      titulo="Janela de Rodadas"
      sub={<>A ferramenta tem dois desenhos inteiros: montar o combate e administrar o que está em curso. Componente: <code>_turnos/PainelRodadas.tsx</code>.</>}
    >
      <div className="gal-abas" role="tablist" aria-label="Estado da janela de Rodadas">
        {(["configuracao", "ativo"] as const).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={painel === v}
            className="gal-aba" onClick={() => setPainel(v)}>
            {v === "configuracao" ? "Configuração" : "Combate ativo"}
          </button>
        ))}
      </div>
      {/* Sem o provedor a janela nunca resolve a posição de abertura e
          fica em `visibility: hidden` — ela lê a âncora lembrada por
          usuário/campanha. Ids fabricados: aqui nada é gravado que
          importe, mas o componente exige o par. */}
      <div className="gal-palco gal-palco--alto">
        <ProvedorJanelasFerramenta campaignId="galeria" usuarioId="galeria">
          <PainelRodadas
            key={painel}
            ehNarrador
            tokens={TOKENS}
            trilha={trilhaDoPainel}
            oculta={false}
            ocupado={false}
            erro={null}
            onIniciar={SEM_EFEITO}
            onEncerrar={SEM_EFEITO}
            onAdicionar={SEM_EFEITO}
            onRemover={SEM_EFEITO}
            onAlternarIncapaz={SEM_EFEITO}
            onEncerrarParticipacao={SEM_EFEITO}
            onAlternarOculta={SEM_EFEITO}
            onFechar={SEM_EFEITO}
          />
        </ProvedorJanelasFerramenta>
      </div>
    </Secao>
  );
}

/**
 * Peça que a galeria AINDA não monta, com o motivo.
 *
 * Ela continua tendo aba: o valor de um mapa é justamente não ter
 * buraco — uma peça ausente da navegação é uma peça que ninguém lembra
 * que existe. O que muda é o conteúdo, que diz o que falta em vez de
 * fingir um exemplo.
 */
function Pendente({ arquivo, precisa }: { arquivo: string; precisa: string }) {
  return (
    <div className="gal-pendente">
      <strong>Ainda não montada aqui</strong>
      <p>{precisa}</p>
      <code>{arquivo}</code>
    </div>
  );
}

function pendente(grupo: string, rotulo: string, arquivo: string, precisa: string): Peca {
  return {
    chave: `pend-${arquivo}-${rotulo}`,
    grupo,
    rotulo,
    render: () => (
      <Secao titulo={rotulo} sub={<>Componente: <code>{arquivo}</code>.</>}>
        <Pendente arquivo={arquivo} precisa={precisa} />
      </Secao>
    ),
  };
}

function TrilhaDeFaccoes() {
  return (
    <Secao
      titulo="Trilha de facções"
      sub={<>Os dois trilhos laterais do palco, com o núcleo da rodada entre eles. Componente: <code>_turnos/TrilhaFaccoes.tsx</code>.</>}
    >
      <div className="gal-palco gal-palco--alto">
        <TrilhaFaccoes
          trilha={trilha({ agindoId: "t1" })}
          ehNarrador
          tokenPorId={new Map(TOKENS.map((t) => [t.id, t]))}
          selecionadoId="t1"
          onDeclarar={SEM_EFEITO}
          onAssumir={SEM_EFEITO}
          onConcluir={SEM_EFEITO}
          onEncerrar={SEM_EFEITO}
          onAvancarJanela={SEM_EFEITO}
          onProximaRodada={SEM_EFEITO}
          onFocar={SEM_EFEITO}
        />
      </div>
    </Secao>
  );
}

function montarPecas(campaignId: string | null): Peca[] { return [
  { chave: "primitivas", grupo: "Vocabulário", rotulo: "Primitivas", render: () => (
    <Secao titulo="Primitivas do painel" sub={<>O vocabulário compartilhado por cards, abas e janelas. Componente: <code>_painel/ui/primitivas.tsx</code>.</>}>
      <VitrinePrimitivas />
    </Secao>
  ) },
  { chave: "estados", grupo: "Vocabulário", rotulo: "Estados de aba", render: () => (
    <Secao titulo="Estados de aba" sub={<>Carregando, conectando, vazio, indisponível e erro. Componente: <code>_painel/Estados.tsx</code>.</>}>
      <VitrineEstados />
    </Secao>
  ) },
  { chave: "diretorio", grupo: "Vocabulário", rotulo: "Diretório", render: () => (
    <Secao titulo="Diretório" sub={<>Busca, grupo, linha e rodapé — a anatomia das abas de lista. Componente: <code>_painel/Diretorio.tsx</code>.</>}>
      <VitrineDiretorio />
    </Secao>
  ) },
  { chave: "sobreposicoes", grupo: "Vocabulário", rotulo: "Sobreposições", render: () => (
    <Secao titulo="Diálogos, menu e janela interna" sub={<>Componentes: <code>ui/Dialogo.tsx</code>, <code>ui/MenuAncorado.tsx</code>, <code>ui/JanelaInterna.tsx</code>.</>}>
      <VitrineSobreposicoes />
    </Secao>
  ) },

  { chave: "nucleo", grupo: "Turnos", rotulo: "Núcleo da rodada", render: () => <NucleoDaRodada /> },
  { chave: "rodadas", grupo: "Turnos", rotulo: "Janela de Rodadas", render: () => <JanelaDeRodadas /> },
  { chave: "faccoes", grupo: "Turnos", rotulo: "Trilha de facções", render: () => <TrilhaDeFaccoes /> },
  ...GRUPOS_CARDS.map((g) => ({
    chave: `card-${g.chave}`,
    grupo: "Cards do Chat Log",
    rotulo: g.aba,
    render: () => (
      <Secao
        titulo={`Card · ${g.titulo}`}
        sub={<>Cada exemplo é uma entrada de log que atravessa a projeção de verdade (<code>projetarFeed</code>) e é desenhada pelo despachante de verdade (<code>EntradaFeed</code>) — se um projetor parar de ler um campo, o card aqui esvazia junto.</>}
      >
        <GrupoDeCards grupo={g} />
      </Secao>
    ),
  })),

  /* ── o que ainda não está montado, com o motivo ── */
  { chave: "rol-campos", grupo: "Rolagem", rotulo: "Campos e botões", render: () => (
    <Secao titulo="Campos e botões da rolagem" sub={<>Select, Leitura, Stepper, CampoCD, SeletorVisibilidade, RollButton e GroupLabel. Componente: <code>_dados3d/ResultadoRolagem.tsx</code>.</>}>
      <VitrineCampos />
    </Secao>
  ) },
  { chave: "rol-dados", grupo: "Rolagem", rotulo: "Dados e faixa", render: () => (
    <Secao titulo="Dados e faixa de resultado" sub={<>PolyDie, DadosRolados e FaixaResultado — as peças que a ferramenta, o Console e o card de teste compartilham.</>}>
      <VitrineDadosEFaixa />
    </Secao>
  ) },
  { chave: "rol-moldura", grupo: "Rolagem", rotulo: "Moldura", render: () => (
    <Secao titulo="Moldura da rolagem" sub={<>A casca da janela flutuante, em estilo inline — espinha, cantos e cabeçalho. Componente: <code>_dados3d/ResultadoRolagem.tsx</code>.</>}>
      <VitrineMoldura />
    </Secao>
  ) },
  { chave: "rol-rolador", grupo: "Rolagem", rotulo: "Rolador", render: () => (
    <Secao titulo="Rolador de dados" sub={<>A ferramenta inteira, com o palco ao lado. Sem campanha a aba de teste diz “sem personagem” (ela lê a ficha do servidor) — a aba Livre rola normalmente. Componente: <code>_dados3d/RoladorDados.tsx</code>.</>}>
      <VitrineRolador />
    </Secao>
  ) },
  { chave: "rol-bandeja", grupo: "Rolagem", rotulo: "Bandeja", render: () => (
    <Secao titulo="Bandeja de dados" sub={<>A versão recolhida que vive no rodapé do Chat. Componente: <code>_dados3d/RoladorDados.tsx</code>.</>}>
      <VitrineBandeja />
    </Secao>
  ) },
  { chave: "rol-mesa", grupo: "Rolagem", rotulo: "Mesa 3D", render: () => (
    <Secao titulo="Mesa 3D" sub={<>A arena de corpos rígidos sobre o palco (Three.js + cannon-es). O valor não é sorteado: sai da face que ficou para cima. Componente: <code>_dados3d/MesaDadosOverlay.tsx</code>.</>}>
      <VitrineMesa3D />
    </Secao>
  ) },

  { chave: "jan-moldura", grupo: "Janelas de ferramenta", rotulo: "Moldura", render: () => (
    <Secao titulo="Moldura da janela" sub={<>A casca comum às oito ferramentas: espinha, cantos, cabeçalho-alça e fechar. Componente: <code>_shell/JanelaFerramenta.tsx</code>.</>}>
      <VitrineMolduraJanela />
    </Secao>
  ) },
  { chave: "jan-medir", grupo: "Janelas de ferramenta", rotulo: "Medir", render: () => (
    <Secao titulo="Medir" sub={<>Régua instantânea (só pra você) ou permanente (fica pra mesa), com dobras fixadas em Q. Componente: <code>_shell/PainelMedir.tsx</code>.</>}>
      <VitrineMedir />
    </Secao>
  ) },
  { chave: "jan-marcar", grupo: "Janelas de ferramenta", rotulo: "Marcar", render: () => (
    <Secao titulo="Marcar" sub={<>Sinal, cor, duração e texto da marcação — mais o recorte de quem pode limpar o quê. Componente: <code>_shell/PainelMarcar.tsx</code>.</>}>
      <VitrineMarcar />
    </Secao>
  ) },
  { chave: "jan-camadas", grupo: "Janelas de ferramenta", rotulo: "Camadas", render: () => (
    <Secao titulo="Camadas do mapa" sub={<>Visível e bloqueada por camada, separadas em cena e ferramentas — conteúdo escondido some pra mesa mas o narrador continua vendo; ferramenta escondida some pra todo mundo. Componente: <code>_shell/PainelCamadas.tsx</code>.</>}>
      <VitrineCamadas />
    </Secao>
  ) },
  { chave: "jan-cena", grupo: "Janelas de ferramenta", rotulo: "Cena", render: () => (
    <Secao titulo="Cena" sub={<>Nome, local, resumo e tamanho da grade, com o aviso do que ficaria de fora ao encolher. Componente: <code>_shell/PainelCena.tsx</code>.</>}>
      <VitrineCena />
    </Secao>
  ) },
  { chave: "jan-terreno", grupo: "Janelas de ferramenta", rotulo: "Terreno", render: () => (
    <Secao titulo="Terreno" sub={<>Pincel ou balde, raio, e o tipo de terreno. Com um gesto concluído abre a conversão das células em objeto tático. Componente: <code>_shell/PainelTerreno.tsx</code>.</>}>
      <VitrineTerreno />
    </Secao>
  ) },
  { chave: "jan-objetos", grupo: "Janelas de ferramenta", rotulo: "Objetos", render: () => (
    <Secao titulo="Objetos táticos" sub={<>As quatro fases: criando, selecionado, editando e movendo. Objeto tem identidade própria — PD, cobertura, travamento e entulho. Componente: <code>_shell/PainelObjetos.tsx</code>.</>}>
      <VitrineObjetos />
    </Secao>
  ) },
  { chave: "jan-areas", grupo: "Janelas de ferramenta", rotulo: "Áreas", render: () => (
    <Secao titulo="Áreas" sub={<>Ociosa, área desenhada e recusa do servidor, mais a lista de áreas da cena e o painel de aparência. Componente: <code>_shell/PainelAreas.tsx</code>.</>}>
      <VitrineAreas />
    </Secao>
  ) },
  { chave: "jan-dados", grupo: "Janelas de ferramenta", rotulo: "Dados", render: () => (
    <Secao titulo="Dados" sub={<>A moldura com o rolador dentro, e o palco ao lado. <code>campaignId: null</code> é o modo ensaio: rola de verdade, não vira registro. Componente: <code>_shell/PainelDados.tsx</code>.</>}>
      <VitrineDados />
    </Secao>
  ) },

  { chave: "cen-gaveta", grupo: "Catálogo de cenas", rotulo: "Gaveta", render: () => (
    <Secao titulo="Gaveta de cenas" sub={<>A superfície inteira, em oito situações. Três colunas que não disputam espaço: pastas (caminho), mapas (destino) e jogadores (quem está onde). Componentes: <code>_cenas/GavetaCasca.tsx</code> + <code>_cenas/GerenciadorCenas.tsx</code>.</>}>
      <VitrineGaveta />
    </Secao>
  ) },
  { chave: "cen-ladrilho", grupo: "Catálogo de cenas", rotulo: "Ladrilho", render: () => (
    <Secao titulo="Ladrilho da cena" sub={<>O mapa É o cartão. Os dois selos ficam separados de propósito — “você está aqui” e “jogadores aqui” podem cair em cenas diferentes, e é essa distância que a gaveta existe pra mostrar. Componente: <code>_cenas/CartaoCena.tsx</code>.</>}>
      <VitrineLadrilho />
    </Secao>
  ) },
  { chave: "cen-parametros", grupo: "Catálogo de cenas", rotulo: "Parâmetros", render: () => (
    <Secao titulo="Parâmetros da cena" sub={<>Células e pixels são a mesma medida em duas linguagens, e as duas são escrevíveis. O divisor é conversão, não desenho. Componente: <code>_cenas/ParametrosCena.tsx</code>.</>}>
      <VitrineParametros />
    </Secao>
  ) },

  { chave: "mapa-hex", grupo: "Mapa e HUD", rotulo: "Mapa hexagonal", render: () => (
    <Secao titulo="Mapa hexagonal" sub={<>O palco, com cena fabricada: tokens de tamanhos e vertentes diferentes, um oculto, objetos com cobertura e PD, e os quatro tipos de realce. Componente: <code>_mapa/MapaHex.tsx</code>.</>}>
      <VitrineMapa />
    </Secao>
  ) },
  { chave: "mapa-areas", grupo: "Mapa e HUD", rotulo: "Camada de áreas", render: () => (
    <Secao titulo="Camada de áreas" sub={<>Disco, setor e segmento sobre o mapa, com o realce das células que cumprem a regra dos 50% — desligável, para inspecionar só a forma. Use o botão <em>Áreas</em>. Componente: <code>_mapa/CamadaAreas.tsx</code>.</>}>
      <VitrineMapa />
    </Secao>
  ) },
  { chave: "hud-token", grupo: "Mapa e HUD", rotulo: "HUD do token", render: () => (
    <Secao
      titulo="HUD do token"
      sub={<>As quatro situações do HUD: controlador com ficha, observador, narrador sem ficha e personagem sem recursos. O componente aceita <code>visualFixtureData</code> justamente pra isto — nenhuma action é chamada. Componente: <code>_shell/SelectedTokenHud.tsx</code>.</>}
    >
      <div className="gal-hud"><VttHudVisualHarness /></div>
    </Secao>
  ) },
  { chave: "mapa-token", grupo: "Mapa e HUD", rotulo: "Gerenciador de token", render: () => (
    <Secao titulo="Gerenciador de token" sub={<>Criar (nome vazio, segue para posicionar) e editar (já tem âncora; tamanho grande abre a orientação). Componente: <code>_shell/GerenciadorToken.tsx</code>.</>}>
      <VitrineGerenciadorToken />
    </Secao>
  ) },
  { chave: "mapa-menu", grupo: "Mapa e HUD", rotulo: "Menu contextual", render: () => (
    <Secao titulo="Menu contextual do mapa" sub={<>Ancorado num ponto de clique, com grupo e item desabilitado. Componente: <code>_shell/MenuContextual.tsx</code>.</>}>
      <VitrineMenuContextual />
    </Secao>
  ) },
  { chave: "mapa-acoes", grupo: "Mapa e HUD", rotulo: "Ações de área", render: () => (
    <Secao titulo="Ações flutuantes de área" sub={<>A barra que confirma ou descarta a área recém-desenhada: criando, editando, salvando e recusada. Componente: <code>_shell/AcoesAreaFlutuantes.tsx</code>.</>}>
      <VitrineAcoesArea />
    </Secao>
  ) },

  { chave: "pn-casca", grupo: "Painel lateral", rotulo: "Casca do painel", render: () => (
    <Secao titulo="Casca do painel" sub={<>O painel inteiro — barra de abas e as cinco abas montadas, com dados nas duas visões. Componente: <code>_painel/PainelVtt.tsx</code>.</>}>
      <VitrineCascaPainel />
    </Secao>
  ) },
  { chave: "pn-abas", grupo: "Painel lateral", rotulo: "Barra de abas", render: () => (
    <Secao titulo="Barra de abas do painel" sub={<>Aberto e recolhido, com os contadores por aba. Componente: <code>_painel/PainelAbas.tsx</code>.</>}>
      <VitrineAbas />
    </Secao>
  ) },
  { chave: "pn-chat", grupo: "Painel lateral", rotulo: "Chat", render: () => (
    <Secao titulo="Chat" sub={<>O feed inteiro sobre uma sessão fabricada, como narrador e como jogador. Componente: <code>_painel/ChatTab.tsx</code>.</>}>
      <VitrineChat />
    </Secao>
  ) },
  { chave: "pn-composer", grupo: "Painel lateral", rotulo: "Composer", render: () => (
    <Secao titulo="Composer" sub={<>Normal, enviando e com erro — mais a escolha de identidade, visibilidade e narração. Componente: <code>_painel/feed/Composer.tsx</code>.</>}>
      <VitrineComposer />
    </Secao>
  ) },
  { chave: "pn-bando", grupo: "Painel lateral", rotulo: "Bando", render: () => (
    <Secao titulo="Bando" sub={<>Inventário compartilhado, com itens e vazio. Componente: <code>_painel/BandoTab.tsx</code>.</>}>
      <VitrineBando />
    </Secao>
  ) },
  { chave: "pn-compendio", grupo: "Painel lateral", rotulo: "Compêndio", render: () => (
    <Secao titulo="Compêndio" sub={<>Resumo por categoria, com a contagem do que é da mesa (override ou homebrew). Componente: <code>_painel/CompendioTab.tsx</code>.</>}>
      <VitrineCompendio />
    </Secao>
  ) },
  { chave: "pn-participantes", grupo: "Painel lateral", rotulo: "Participantes", render: () => (
    <Secao titulo="Participantes" sub={<>Contas da mesa e presença, como narrador e como jogador. Componente: <code>_painel/ParticipantesTab.tsx</code>.</>}>
      <VitrineParticipantes />
    </Secao>
  ) },
  { chave: "pn-personagens", grupo: "Painel lateral", rotulo: "Personagens", render: () => (
    <Secao titulo="Personagens" sub={<>Diretório com pastas, PN e arquivados. Como jogador a contagem de controladores some — a RLS só mostra a própria linha. Componente: <code>_painel/PersonagensTab.tsx</code>.</>}>
      <VitrinePersonagens />
    </Secao>
  ) },
  { chave: "pn-limite", grupo: "Painel lateral", rotulo: "Limite de erro", render: () => (
    <Secao titulo="Limite de erro da aba" sub={<>Com um filho que lança de verdade — um erro fabricado seria casca. Componente: <code>_painel/LimiteErroAba.tsx</code>.</>}>
      <VitrineLimiteErro />
    </Secao>
  ) },

  { chave: "jan-console", grupo: "Janelas internas", rotulo: "Console no VTT", render: () => (
    <Secao titulo="Janelas internas" sub={<>As quatro janelas internas na mesma casca: Console, convites, acesso e transferência. Componentes: <code>_painel/janelas/*</code> e <code>_painel/TransferenciaBando.tsx</code>.</>}>
      <VitrineJanelasAdmin campaignId={campaignId} />
    </Secao>
  ) },

  /* ── o que se repete ── */
  { chave: "rep-botoes", grupo: "Repetidos", rotulo: "Botões", render: () => (
    <Secao titulo="Botões" sub={<>Seis vocabulários rodando em paralelo (<code>rv-</code>, <code>rc-</code>, <code>rm-</code>, <code>ra-</code>, <code>ra2-</code>, <code>pn-</code>) resolveram a mesma peça N vezes. Cada espécime aparece na raiz que carrega os tokens dele.</>}>
      <RepetidosBotoes />
    </Secao>
  ) },
  { chave: "rep-chips", grupo: "Repetidos", rotulo: "Chips", render: () => (
    <Secao titulo="Chips, tags e badges" sub={<>Trinta e seis classes para a mesma ideia de etiqueta.</>}>
      <RepetidosChips />
    </Secao>
  ) },
  { chave: "rep-campos", grupo: "Repetidos", rotulo: "Campos", render: () => (
    <Secao titulo="Campos de formulário" sub={<>Zero abstração e 533 usos crus — o caso com mais repetição do produto.</>}>
      <RepetidosCampos />
    </Secao>
  ) },
  { chave: "rep-estados", grupo: "Repetidos", rotulo: "Estados", render: () => (
    <Secao titulo="Vazio, erro e carregando" sub={<>Cada superfície escreveu o próprio jeito de dizer “não há nada aqui”.</>}>
      <RepetidosEstados />
    </Secao>
  ) },
  { chave: "rep-abas", grupo: "Repetidos", rotulo: "Abas", render: () => (
    <Secao titulo="Abas" sub={<>Três desenhos de aba convivendo: trilho do Console, abas do painel e abas de sessão da Mesa.</>}>
      <RepetidosAbas />
    </Secao>
  ) },

  { chave: "casca-vtt", grupo: "Casca", rotulo: "VttClient", render: () => (
    <Secao titulo="A mesa inteira" sub={<>O orquestrador: cena, realtime, ferramentas, turnos e painel. Componente: <code>VttClient.tsx</code>.</>}>
      <VitrineMesaInteira campaignId={campaignId} />
    </Secao>
  ) },
]; }



/* ── página ─────────────────────────────────────────────────────── */

export function GaleriaEstilos({ campaignId }: { campaignId: string | null }) {
  /* O registro depende do `campaignId`, então ele é montado por render.
     É barato (é só descrição; `render` continua sendo função) e evita um
     `useMemo` que só existiria para agradar o lint. */
  const PECAS = montarPecas(campaignId);
  const FAMILIAS = [...new Set(PECAS.map((p) => p.grupo))];
  const [familia, setFamilia] = useState(PECAS[0].grupo);
  /* Lembra a peça aberta de CADA família: voltar pra "Cards do Chat
     Log" depois de olhar Turnos devolve o card em que se estava, não o
     primeiro da fila. */
  const [porFamilia, setPorFamilia] = useState<Record<string, string>>({});
  const daFamilia = PECAS.filter((p) => p.grupo === familia);
  const peca = daFamilia.find((p) => p.chave === porFamilia[familia]) ?? daFamilia[0];

  return (
    // `.rv-mesa` NÃO é decoração: os tokens do chassi (`--cy`, `--am`,
    // `--rv-panel`…) são escopados nessa lista de raízes, nunca em
    // `:root`. Sem ela a galeria desenha as peças com todas as cores
    // resolvendo pra vazio.
    <div className="rv-mesa gal">
      <header className="gal-cab">
        <h1>Estilos do VTT</h1>
        <p>
          Peças reais, CSS real. Cada exemplo monta o componente de produção com um estado
          fabricado — o que muda de um exemplo pro outro é só o dado.
        </p>
      </header>

      <div className="gal-corpo">
        <nav className="gal-nav">
          <div className="gal-abas gal-abas--familia" role="tablist" aria-label="Família de componentes">
            {FAMILIAS.map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={f === familia}
                className="gal-aba gal-aba--familia"
                onClick={() => setFamilia(f)}
              >
                {f}
                <span className="gal-aba-n">{PECAS.filter((p) => p.grupo === f).length}</span>
              </button>
            ))}
          </div>

          <div className="gal-abas gal-abas--peca" role="tablist" aria-label="Componente">
            {daFamilia.map((p) => (
              <button
                key={p.chave}
                type="button"
                role="tab"
                aria-selected={p.chave === peca.chave}
                className="gal-aba gal-aba--peca"
                onClick={() => setPorFamilia((atuais) => ({ ...atuais, [familia]: p.chave }))}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
        </nav>

        {/* `key` remonta a peça ao trocar de aba: sem isso, o estado
            local de uma (a aba interna da Janela de Rodadas, por
            exemplo) vazaria pra próxima que ocupasse o mesmo lugar na
            árvore. */}
        <div className="gal-conteudo" key={peca.chave}>{peca.render()}</div>
      </div>
    </div>
  );
}
