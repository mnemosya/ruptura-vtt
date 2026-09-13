"use client";

/**
 * A GAVETA DE CENAS — o catálogo do narrador, com estado fabricado.
 *
 * A gaveta de verdade (`_cenas/GerenciadorCenas.tsx`) é um container:
 * ela lê `list_vtt_scenes`, `list_vtt_scene_folders` e
 * `list_vtt_player_placements` no servidor. Montá-la aqui exibiria uma
 * falha de autorização como se fosse um estado de design.
 *
 * Por isso a galeria monta a CASCA (`_cenas/GavetaCasca.tsx`) com as
 * mesmas peças que o container usa — `CartaoCena`, `LinhaPasta`,
 * `TrilhoJogadores`, `ParametrosCena` — e um catálogo de mentira. O que
 * se vê aqui é a marcação real: se a gaveta mudar, isto muda junto ou
 * quebra, que é o único jeito de uma galeria não virar folclore.
 *
 * `data-em-linha` tira a gaveta do topo da tela: ela é `position:
 * fixed` na mesa, e assim cobriria a galeria inteira.
 */

import { useState } from "react";
import { Archive, FolderPlus, ImagePlus, Plus } from "lucide-react";
import { GavetaCasca } from "../../mesas/[campaignId]/vtt/_cenas/GavetaCasca";
import { CartaoCena } from "../../mesas/[campaignId]/vtt/_cenas/CartaoCena";
import { LinhaPasta } from "../../mesas/[campaignId]/vtt/_cenas/LinhaPasta";
import { MiniCartaoCena } from "../../mesas/[campaignId]/vtt/_cenas/MiniCartaoCena";
import { TrilhoJogadores } from "../../mesas/[campaignId]/vtt/_cenas/TrilhoJogadores";
import { ParametrosCena } from "../../mesas/[campaignId]/vtt/_cenas/ParametrosCena";
import type {
  CartaoCena as DadosCartaoCena, PastaCena, PosicaoJogador,
} from "../../../lib/vtt/sceneStorage";

const SEM_EFEITO = () => {};

/* ── O catálogo de mentira ─────────────────────────────────────────
   Três cenas que cobrem os três fatos que o ladrilho precisa mostrar
   ao mesmo tempo: a cena ABERTA pelo narrador, a cena onde a MESA
   está, e uma arquivada. Elas são deliberadamente CENAS DIFERENTES —
   é essa distância que a gaveta existe pra tornar visível, e um
   exemplo em que as três coincidem esconderia justamente o caso que
   dá trabalho. */
function cena(over: Partial<DadosCartaoCena> & { id: string; nome: string }): DadosCartaoCena {
  return {
    local: null, resumo: null, largura: 26, altura: 18,
    gradeCor: "#96bed7", gradeOpacidade: 0.07, celulaPx: 70,
    ordem: 0, revision: 3, arquivadaEm: null, apresentada: false,
    duplicadaDe: null, miniaturaImageId: null, pastaId: null,
    criadaEm: "2026-01-01T00:00:00Z", atualizadaEm: "2026-01-01T00:00:00Z",
    ...over,
  };
}

const CENAS: DadosCartaoCena[] = [
  cena({ id: "c1", nome: "Doca 7 — o mercado que se desfez", local: "Pátio de carga", ordem: 0 }),
  cena({ id: "c2", nome: "Casa de Máquinas", local: "Nível −3", ordem: 1, apresentada: true, largura: 20, altura: 14 }),
  cena({ id: "c3", nome: "Torre do Sino", local: "Ato I", ordem: 2, pastaId: "f1", largura: 40, altura: 30 }),
  cena({ id: "c4", nome: "Ponte Partida", ordem: 3, arquivadaEm: "2026-02-02T00:00:00Z" }),
];

const PASTAS: PastaCena[] = [
  { id: "f1", nome: "Ato I", parentId: null, ordem: 0, caminho: "Ato I", nivel: 1, arquivadaEm: null },
  { id: "f2", nome: "Esgotos", parentId: "f1", ordem: 0, caminho: "Ato I / Esgotos", nivel: 2, arquivadaEm: null },
  { id: "f3", nome: "Ato II", parentId: null, ordem: 1, caminho: "Ato II", nivel: 1, arquivadaEm: null },
];

const JOGADORES: PosicaoJogador[] = [
  { userId: "u1", nome: "Alma", sceneId: "c1", atribuido: true },
  { userId: "u2", nome: "Bruno", sceneId: "c2", atribuido: false },
  { userId: "u3", nome: "Cátia", sceneId: "c2", atribuido: false },
  { userId: "u4", nome: "Dário", sceneId: "c2", atribuido: false },
  { userId: "u5", nome: "Elis", sceneId: "c2", atribuido: false },
];

const ARRASTO_PARADO = {
  onDragStart: SEM_EFEITO, onDragOver: SEM_EFEITO, onDrop: SEM_EFEITO,
  onDragEnd: SEM_EFEITO, onDragLeave: SEM_EFEITO,
  arrastando: false, alvo: false,
};

/** Um ladrilho solto, para as vitrines que mostram um estado por vez. */
function Ladrilho({
  dados, vista = false, jogadoresAqui = [], alvoDeJogador = false, ocupada = false, erro = null,
  arrastando = false, alvo = false,
}: {
  dados: DadosCartaoCena; vista?: boolean; jogadoresAqui?: PosicaoJogador[];
  alvoDeJogador?: boolean; ocupada?: boolean; erro?: string | null;
  arrastando?: boolean; alvo?: boolean;
}) {
  return (
    <ul className="rv-cena-grade" style={{ maxWidth: 260 }}>
      <CartaoCena
        cena={dados}
        vista={vista}
        ocupada={ocupada}
        erro={erro}
        jogadoresAqui={jogadoresAqui}
        todosJogadores={JOGADORES}
        alvoDeJogador={alvoDeJogador}
        onAbrir={SEM_EFEITO} onRenomear={SEM_EFEITO} onConfigurar={SEM_EFEITO}
        onApresentar={SEM_EFEITO} onDuplicar={SEM_EFEITO} onArquivar={SEM_EFEITO}
        onRestaurar={SEM_EFEITO} onExcluir={SEM_EFEITO} onMoverJogadores={SEM_EFEITO}
        onMover={SEM_EFEITO} podeSubir podeDescer
        arrasto={{ ...ARRASTO_PARADO, arrastando, alvo }}
      />
    </ul>
  );
}

/* ── A gaveta inteira ──────────────────────────────────────────────── */

type Caso = "normal" | "jogadores" | "pasta" | "busca" | "vazio" | "arquivo" | "carregando" | "erro";

const ROTULO: Record<Caso, string> = {
  normal: "Catálogo",
  jogadores: "Mesa dividida",
  pasta: "Dentro de uma pasta",
  busca: "Busca sem resultado",
  vazio: "Catálogo vazio",
  arquivo: "Arquivo",
  carregando: "Primeira carga",
  erro: "Recusa do servidor",
};

export function VitrineGaveta() {
  const [caso, setCaso] = useState<Caso>("normal");
  const [busca, setBusca] = useState("");
  const [pastaAtual, setPastaAtual] = useState<string | null>(null);

  const temJogadores = caso === "jogadores";
  const jogadores = temJogadores ? JOGADORES : [];
  const emPasta = caso === "pasta";
  const noArquivo = caso === "arquivo";

  const lista = caso === "vazio" || caso === "busca" || caso === "carregando" || caso === "erro"
    ? []
    : noArquivo
      ? CENAS.filter((c) => c.arquivadaEm !== null)
      : emPasta
        ? CENAS.filter((c) => c.pastaId === "f1" && c.arquivadaEm === null)
        : CENAS.filter((c) => c.arquivadaEm === null);

  const modo = caso === "carregando" ? "Carregando o catálogo"
    : noArquivo ? "Arquivo — 1 cena"
    : lista.length === 1 ? "1 cena" : `${lista.length} cenas`;

  return (
    <>
      <div className="gal-abas" role="group" aria-label="Estado da gaveta">
        {(Object.keys(ROTULO) as Caso[]).map((c) => (
          <button
            key={c} type="button" className="gal-aba"
            aria-selected={caso === c}
            onClick={() => { setCaso(c); setBusca(c === "busca" ? "catacumba" : ""); setPastaAtual(c === "pasta" ? "f1" : null); }}
          >{ROTULO[c]}</button>
        ))}
      </div>
      <span className="gal-nota">
        “Mesa dividida” é o caso que a coluna da direita existe pra resolver: a Alma foi
        MANDADA para a Doca (contorno de acento) e o resto está onde a mesa está.
      </span>

      <GavetaCasca
        emLinha
        modo={modo}
        busca={busca}
        onBusca={setBusca}
        onFechar={SEM_EFEITO}
        acoes={<>
          {!noArquivo && (
            <>
              <button type="button" className="rv-btn rv-btn--pri"><Plus size={15} aria-hidden /> Nova cena</button>
              <button type="button" className="rv-btn rv-cena-btn-icone" aria-label="Nova cena a partir de um mapa">
                <ImagePlus size={15} aria-hidden />
                <span className="rv-dica rv-dica--abaixo">Nova cena a partir de um mapa</span>
              </button>
              <button type="button" className="rv-btn rv-cena-btn-icone" aria-label="Nova pasta">
                <FolderPlus size={15} aria-hidden />
                <span className="rv-dica rv-dica--abaixo">Nova pasta</span>
              </button>
            </>
          )}
          <button type="button" className="rv-btn" data-tipo="arquivo" aria-pressed={noArquivo}>
            <Archive size={14} aria-hidden /> Arquivo (1)
          </button>
        </>}
        trilho={busca.length > 0 ? undefined : (
          <nav className="rv-gav-trilho" aria-label="Pastas do catálogo">
            <button
              type="button" className="rv-pasta-degrau" data-raiz=""
              aria-current={pastaAtual === null && !noArquivo ? "page" : undefined}
              onClick={() => setPastaAtual(null)}
            >
              <span className="rv-pasta-nome-txt">Todas</span>
              <span className="rv-pasta-contagem">3</span>
            </button>
            <ul className="rv-gav-pastas">
              {PASTAS.map((f) => (
                <LinhaPasta
                  key={f.id} pasta={f}
                  aberta={pastaAtual === f.id}
                  quantidade={f.id === "f1" ? 1 : 0}
                  ocupada={false} erro={null}
                  onAbrir={() => setPastaAtual(f.id)}
                  onRenomear={SEM_EFEITO} onExcluir={SEM_EFEITO}
                  peso={f.id === "f1" ? { cenas: 3, subpastas: 1 } : { cenas: 0, subpastas: 0 }}
                  alvoDeArrasto={false}
                  onDragOver={SEM_EFEITO} onDragLeave={SEM_EFEITO} onDrop={SEM_EFEITO}
                  /* A galeria abre a primeira pasta pra mostrar os dois
                     estados do chevron e o mini-cartão lado a lado com
                     o cartão grande. */
                  expandida={f.id === "f1"}
                  onAlternarExpansao={SEM_EFEITO}
                  cenas={f.id === "f1" ? (
                    <ul className="rv-pasta-cenas">
                      <MiniCartaoCena
                        nome="Doca 7 — o mercado que se desfez" miniaturaUrl={null}
                        vista apresentada jogadoresAqui={[]} totalJogadores={3} ocupada={false} onAbrir={SEM_EFEITO}
                      />
                      <MiniCartaoCena
                        nome="Galeria inundada" miniaturaUrl={null}
                        vista={false} apresentada={false}
                        jogadoresAqui={[{ userId: "u1", sceneId: "c2", nome: "Alba" }] as never}
                        totalJogadores={3} ocupada={false} onAbrir={SEM_EFEITO}
                      />
                      <MiniCartaoCena
                        nome="Salão dos ossos" miniaturaUrl={null}
                        vista={false} apresentada={false}
                        jogadoresAqui={[{ userId: "u1" }, { userId: "u2" }, { userId: "u3" }] as never}
                        totalJogadores={3} ocupada={false} onAbrir={SEM_EFEITO}
                      />
                    </ul>
                  ) : undefined}
                />
              ))}
            </ul>
          </nav>
        )}
        conteudo={<>
          {busca.length > 0 && (
            <p className="rv-cena-estado">Nada encontrado para “{busca}”.</p>
          )}
          {caso === "carregando" && (
            <p className="rv-cena-estado">Carregando as cenas…</p>
          )}
          {caso === "erro" && (
            <p className="rv-cena-estado" data-tipo="erro" role="alert">
              A cena mudou enquanto você editava.
              <button type="button" className="rv-btn rv-btn--ghost">Tentar de novo</button>
            </p>
          )}
          {caso === "vazio" && (
            <p className="rv-cena-estado" data-testid="cenas-vazio">
              Nenhuma cena ainda. Crie a primeira para começar a preparar.
            </p>
          )}
          {lista.length > 0 && (
            <ul className="rv-cena-grade">
              {lista.map((c, i) => (
                <CartaoCena
                  key={c.id}
                  cena={c}
                  vista={c.id === "c1"}
                  ocupada={false}
                  erro={null}
                  jogadoresAqui={jogadores.filter((j) => j.sceneId === c.id)}
                  todosJogadores={jogadores}
                  caminhoPasta={pastaAtual === null && c.pastaId ? "Ato I" : null}
                  onAbrir={SEM_EFEITO} onRenomear={SEM_EFEITO} onConfigurar={SEM_EFEITO}
                  onApresentar={SEM_EFEITO} onDuplicar={SEM_EFEITO} onArquivar={SEM_EFEITO}
                  onRestaurar={SEM_EFEITO} onExcluir={SEM_EFEITO} onMoverJogadores={SEM_EFEITO}
                  onMover={SEM_EFEITO}
                  podeSubir={i > 0} podeDescer={i < lista.length - 1}
                  arrasto={ARRASTO_PARADO}
                />
              ))}
            </ul>
          )}
        </>}
        jogadores={
          <TrilhoJogadores
            jogadores={jogadores}
            nomeDaCena={(id) => CENAS.find((c) => c.id === id)?.nome ?? null}
            separados={jogadores.filter((j) => j.atribuido).length}
            onReagrupar={SEM_EFEITO}
            arrastandoId={null}
            onArrastarInicio={SEM_EFEITO}
            onArrastarFim={SEM_EFEITO}
          />
        }
      />
    </>
  );
}

/* ── O ladrilho, estado por estado ─────────────────────────────────── */

export function VitrineLadrilho() {
  return (
    <div className="gal-grade-peças">
      <figure className="gal-peça">
        <Ladrilho dados={CENAS[0]} />
        <figcaption>Normal — sem mapa, cai na inicial do nome</figcaption>
      </figure>
      <figure className="gal-peça">
        <Ladrilho dados={CENAS[0]} vista />
        <figcaption>Aberta por você — borda no acento da ferramenta</figcaption>
      </figure>
      <figure className="gal-peça">
        <Ladrilho dados={CENAS[1]} jogadoresAqui={JOGADORES.filter((j) => j.sceneId === "c2")} />
        <figcaption>Onde a mesa está, com quatro presentes</figcaption>
      </figure>
      <figure className="gal-peça">
        <Ladrilho dados={CENAS[1]} jogadoresAqui={JOGADORES} />
        <figcaption>Cinco presentes — os nomes param no quarto</figcaption>
      </figure>
      <figure className="gal-peça">
        <Ladrilho dados={CENAS[3]} />
        <figcaption>Arquivada — legível, visivelmente fora de uso</figcaption>
      </figure>
      <figure className="gal-peça">
        <Ladrilho dados={CENAS[0]} alvoDeJogador />
        <figcaption>Jogador pairando — alvo VERDE, não o âmbar de reordenar</figcaption>
      </figure>
      <figure className="gal-peça">
        <Ladrilho dados={CENAS[0]} alvo />
        <figcaption>Cena pairando — linha de inserção</figcaption>
      </figure>
      <figure className="gal-peça">
        <Ladrilho dados={CENAS[0]} erro="A cena mudou enquanto você editava." />
        <figcaption>Recusa do servidor — a mensagem é DESTE ladrilho</figcaption>
      </figure>
    </div>
  );
}

/* ── A folha de parâmetros ─────────────────────────────────────────── */

export function VitrineParametros() {
  const [cena, setCena] = useState(CENAS[1]);
  return (
    <div className="gal-palco gal-palco--alto" style={{ position: "relative" }}>
      <ParametrosCena
        cena={cena}
        ocupada={false}
        erro={null}
        onSalvar={(v) => setCena((c) => ({ ...c, ...v }))}
        onFechar={SEM_EFEITO}
      />
    </div>
  );
}
