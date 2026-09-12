"use client";

/**
 * FERRAMENTAS DE MAPA — as que desenham SOBRE o palco.
 *
 * Terreno, Objetos e Áreas são janelas de ferramenta como as outras,
 * mas o corpo delas é um editor com fases: pintar → selecionar →
 * editar → salvar. A galeria mostra cada fase como um exemplo próprio,
 * porque é a fase que muda o painel inteiro, não um campo dele.
 *
 * O mesmo vale para o gerenciador de token (criar × editar) e para o
 * menu contextual (que só existe ancorado num ponto do mapa).
 */

import { useState } from "react";
import { ProvedorJanelasFerramenta } from "../../mesas/[campaignId]/vtt/_shell/JanelaFerramenta";
import { PainelTerreno } from "../../mesas/[campaignId]/vtt/_shell/PainelTerreno";
import { PainelObjetos } from "../../mesas/[campaignId]/vtt/_shell/PainelObjetos";
import { PainelAreas } from "../../mesas/[campaignId]/vtt/_shell/PainelAreas";
import { MenuContextual } from "../../mesas/[campaignId]/vtt/_shell/MenuContextual";
import { GerenciadorToken } from "../../mesas/[campaignId]/vtt/_shell/GerenciadorToken";
import {
  AREAS_OCIOSA, CONFIG_AREAS_PADRAO,
} from "../../mesas/[campaignId]/vtt/_ferramentas/areasEstado";

const SEM_EFEITO = () => {};
const SEM_EFEITO_ASYNC = async () => ({ ok: true });

function PalcoJanela({ chave, children }: { chave: string; children: React.ReactNode }) {
  return (
    <div className="gal-palco gal-palco--alto">
      <ProvedorJanelasFerramenta key={chave} campaignId="galeria" usuarioId="galeria">
        {children}
      </ProvedorJanelasFerramenta>
    </div>
  );
}

function Alternador<T extends string>({ valor, onMudar, opcoes, rotulo }: {
  valor: T; onMudar: (v: T) => void; opcoes: { v: T; rotulo: string }[]; rotulo: string;
}) {
  return (
    <div className="gal-abas" role="group" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button key={o.v} type="button" className="gal-aba" aria-selected={valor === o.v} onClick={() => onMudar(o.v)}>
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

/* ── terreno ─────────────────────────────────────────────────────── */

export function VitrineTerreno() {
  const [modo, setModo] = useState<Parameters<typeof PainelTerreno>[0]["modoTerreno"]>("dificil");
  const [pincel, setPincel] = useState<Parameters<typeof PainelTerreno>[0]["modoPincel"]>("pincel");
  const [raio, setRaio] = useState(1);
  const [gesto, setGesto] = useState<"ocioso" | "pintando" | "concluido">("concluido");

  return (
    <>
      <Alternador
        rotulo="Fase do gesto de terreno"
        valor={gesto}
        onMudar={setGesto}
        opcoes={[
          { v: "ocioso", rotulo: "Ocioso" },
          { v: "pintando", rotulo: "Pintando" },
          { v: "concluido", rotulo: "Gesto concluído" },
        ]}
      />
      <span className="gal-nota">
        Com um gesto concluído aparece a ação de converter as células pintadas num objeto tático.
      </span>
      <PalcoJanela chave={`terreno-${gesto}`}>
        <PainelTerreno
          modoTerreno={modo}
          onModoTerreno={setModo}
          modoPincel={pincel}
          onModoPincel={setPincel}
          raioPincel={raio}
          onRaioPincel={setRaio}
          contagemGesto={gesto === "pintando" ? 6 : null}
          celulasUltimoGesto={gesto === "concluido" ? 9 : 0}
          onConverterEmObjeto={SEM_EFEITO}
          onFechar={SEM_EFEITO}
        />
      </PalcoJanela>
    </>
  );
}

/* ── objetos ─────────────────────────────────────────────────────── */

const OBJETO = {
  id: "obj-1",
  nome: "Barricada de contêineres",
  categoria: "resistente" as const,
  preset: "barricada" as const,
  celulas: [{ q: 3, r: 2 }, { q: 4, r: 2 }],
  cobertura: "maior" as const,
  bloqueiaMovimento: true,
  bloqueiaLinhaDeVisao: true,
  pd: 12,
  pdMax: 20,
  travado: false,
  entulho: false,
  revision: 3,
};

export function VitrineObjetos() {
  const [fase, setFase] = useState<"criar" | "selecionado" | "editando" | "movendo">("selecionado");
  const [preset, setPreset] = useState<Parameters<typeof PainelObjetos>[0]["presetObjeto"]>("barricada");
  const objeto = fase === "criar" ? null : (OBJETO as unknown as Parameters<typeof PainelObjetos>[0]["objetoSelecionado"]);

  return (
    <>
      <Alternador
        rotulo="Fase da ferramenta de objetos"
        valor={fase}
        onMudar={setFase}
        opcoes={[
          { v: "criar", rotulo: "Criando" },
          { v: "selecionado", rotulo: "Selecionado" },
          { v: "editando", rotulo: "Editando" },
          { v: "movendo", rotulo: "Movendo" },
        ]}
      />
      <PalcoJanela chave={`objetos-${fase}`}>
        <PainelObjetos
          presetObjeto={preset}
          onPresetObjeto={setPreset}
          celulasPendentes={fase === "criar" ? 2 : 0}
          criando={false}
          onCriar={SEM_EFEITO}
          onCancelarSelecao={SEM_EFEITO}
          objetoSelecionado={objeto}
          objetoMovendo={fase === "movendo" ? objeto : null}
          movendo={fase === "movendo"}
          onConfirmarMover={SEM_EFEITO}
          onIniciarMover={SEM_EFEITO}
          onDesmarcar={SEM_EFEITO}
          rascunho={fase === "editando" ? ({ nome: "Barricada de contêineres", cobertura: "maior", bloqueiaMovimento: true, bloqueiaLinhaDeVisao: true, pdMax: "20" } as unknown as Parameters<typeof PainelObjetos>[0]["rascunho"]) : null}
          onRascunho={SEM_EFEITO}
          salvandoEdicao={false}
          onIniciarEdicao={SEM_EFEITO}
          onSalvarEdicao={SEM_EFEITO}
          onCancelarEdicao={SEM_EFEITO}
          onAlternarTravamento={SEM_EFEITO}
          deltaPd="4"
          onDeltaPd={SEM_EFEITO}
          aplicandoDano={false}
          onAplicarDano={SEM_EFEITO}
          onVirarEntulho={SEM_EFEITO}
          excluindo={false}
          onExcluir={SEM_EFEITO}
          onFechar={SEM_EFEITO}
        />
      </PalcoJanela>
    </>
  );
}

/* ── áreas ───────────────────────────────────────────────────────── */

const TOKENS_AREA = [
  { id: "t1", nome: "Mara Venn", sigla: "MV" },
  { id: "t2", nome: "Corvo", sigla: "CV" },
];

const AREAS_LISTA = [
  { id: "a1", rotulo: "Cone de Compressão", tipo: "cone" as const, cor: "ciano" as const, visivel: true, celulas: 7, tokens: 2 },
  { id: "a2", rotulo: "Névoa", tipo: "esfera" as const, cor: "roxo" as const, visivel: false, celulas: 19, tokens: 0 },
];

export function VitrineAreas() {
  const [fase, setFase] = useState<"ociosa" | "concluida" | "erro">("concluida");
  const [config, setConfig] = useState(CONFIG_AREAS_PADRAO);
  const [recolhido, setRecolhido] = useState(false);
  const [aparencia, setAparencia] = useState(false);

  const estado = fase === "ociosa"
    ? AREAS_OCIOSA
    : ({ fase: fase === "erro" ? "erro" : "concluida_local", params: { tipo: "cone", raioM: 6 }, mensagem: "O servidor recusou a área." } as unknown as Parameters<typeof PainelAreas>[0]["estado"]);

  return (
    <>
      <Alternador
        rotulo="Fase da ferramenta de áreas"
        valor={fase}
        onMudar={setFase}
        opcoes={[
          { v: "ociosa", rotulo: "Ociosa" },
          { v: "concluida", rotulo: "Área desenhada" },
          { v: "erro", rotulo: "Recusa do servidor" },
        ]}
      />
      <PalcoJanela chave={`areas-${fase}-${recolhido}`}>
        <PainelAreas
          config={config}
          onConfig={(patch) => setConfig((c) => ({ ...c, ...patch }))}
          estado={estado}
          paramsAtuais={fase === "ociosa" ? null : ({ tipo: "cone", raioM: 6 } as unknown as Parameters<typeof PainelAreas>[0]["paramsAtuais"])}
          onAlterarParams={SEM_EFEITO}
          resumo={fase === "ociosa" ? null : { celulas: 7, tokens: 2 }}
          tokens={TOKENS_AREA}
          areas={AREAS_LISTA as unknown as Parameters<typeof PainelAreas>[0]["areas"]}
          selecionadaId="a1"
          onSelecionar={SEM_EFEITO}
          onLocalizar={SEM_EFEITO}
          onDescartar={SEM_EFEITO}
          onManter={SEM_EFEITO}
          onConcluirPontos={SEM_EFEITO}
          onDesfazerPonto={SEM_EFEITO}
          onEscolherTokenAura={SEM_EFEITO}
          motivoNaoConclui={null}
          onEditar={SEM_EFEITO}
          onSalvarEdicao={SEM_EFEITO}
          onCancelarEdicao={SEM_EFEITO}
          onDuplicar={SEM_EFEITO}
          onExcluir={SEM_EFEITO}
          onAlternarVisibilidade={SEM_EFEITO}
          onFecharFerramenta={SEM_EFEITO}
          erro={fase === "erro" ? "O servidor recusou a área: fora dos limites da cena." : null}
          recolhido={recolhido}
          onAlternarRecolhido={() => setRecolhido((v) => !v)}
          aparenciaAberta={aparencia}
          onAlternarAparencia={() => setAparencia((v) => !v)}
        />
      </PalcoJanela>
    </>
  );
}

/* ── gerenciador de token ────────────────────────────────────────── */

const VALORES_TOKEN = {
  nome: "", sigla: "", lado: "pn" as const, vertente: "nenhuma" as const,
  tamanho: "medio" as const, orientacao: 0, q: 0, r: 0,
  characterId: null, visivel: true, bloqueado: false, retratoUrl: null,
  pvAtual: null, pvMax: null, condicoes: [],
};

const VALORES_EDICAO = {
  ...VALORES_TOKEN,
  nome: "Mara Venn", sigla: "MV", lado: "pj" as const, vertente: "energetico" as const,
  tamanho: "grande" as const, orientacao: 2, q: 4, r: 3,
  characterId: "p1", pvAtual: 14, pvMax: 20,
};

export function VitrineGerenciadorToken() {
  const [modo, setModo] = useState<"criar" | "editar">("criar");
  return (
    <>
      <Alternador
        rotulo="Modo do gerenciador"
        valor={modo}
        onMudar={setModo}
        opcoes={[{ v: "criar", rotulo: "Criar" }, { v: "editar", rotulo: "Editar" }]}
      />
      <span className="gal-nota">
        Criando, o nome nasce vazio e o fluxo segue para posicionar no mapa. Editando, o token já
        tem âncora — e o tamanho grande abre a orientação, que só existe para quem ocupa mais de uma célula.
      </span>
      <div className="gal-palco gal-palco--alto">
        <GerenciadorToken
          key={modo}
          aberto
          modo={modo}
          valoresIniciais={(modo === "criar" ? VALORES_TOKEN : VALORES_EDICAO) as unknown as Parameters<typeof GerenciadorToken>[0]["valoresIniciais"]}
          personagens={[{ id: "p1", nome: "Mara Venn" }, { id: "p2", nome: "Corvo" }]}
          largura={24}
          altura={18}
          terrenoReal={new Map() as unknown as Parameters<typeof GerenciadorToken>[0]["terrenoReal"]}
          ocupadosPorOutros={new Set<string>()}
          onConfirmarEdicao={SEM_EFEITO_ASYNC}
          onContinuarParaPosicionar={SEM_EFEITO}
          onFechar={SEM_EFEITO}
        />
      </div>
    </>
  );
}

/* ── menu contextual ─────────────────────────────────────────────── */

export function VitrineMenuContextual() {
  /* Posição fixa dentro do palco: o menu é `position: fixed` e se
     ancora num ponto de clique do mapa, então aqui ele recebe um ponto
     inventado em vez de um evento. */
  return (
    <>
      <span className="gal-nota">
        Ancorado num ponto do mapa. Itens com acento, separador de grupo e item desabilitado.
      </span>
      <div className="gal-palco gal-palco--medio">
        <MenuContextual
          posicao={{ x: 320, y: 260 }}
          onFechar={SEM_EFEITO}
          codigo="Célula"
          alvo="12, -4"
          itens={[
            { id: "focar", rotulo: "Centralizar aqui", onSelecionar: SEM_EFEITO },
            { id: "token", rotulo: "Criar token", onSelecionar: SEM_EFEITO },
            { id: "marcar", rotulo: "Marcar ponto", onSelecionar: SEM_EFEITO, separadorAntes: true },
            { id: "remover", rotulo: "Remover da cena", onSelecionar: SEM_EFEITO, desabilitado: true, perigoso: true, separadorAntes: true },
          ] as unknown as Parameters<typeof MenuContextual>[0]["itens"]}
        />
      </div>
    </>
  );
}
