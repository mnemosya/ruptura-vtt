"use client";

/**
 * UM CARTÃO DO CATÁLOGO.
 *
 * Puramente apresentacional, como `PainelCena`: recebe valores e
 * devolve intenções. Quem chama a Server Action, guarda revisão e
 * reconcilia conflito é o `GerenciadorCenas`.
 *
 * Os dois selos do cartão são a separação da 0111 em forma visível:
 *
 *   · VOCÊ ESTÁ AQUI     — a cena que este narrador abriu;
 *   · JOGADORES AQUI     — `vtt_campaign_stage.presented_scene_id`.
 *
 * Eles existem SEPARADOS porque podem apontar pra cenas diferentes, e é
 * exatamente essa distância que o narrador precisa enxergar pra confiar
 * que abrir um cartão não mexeu na mesa. Um selo só ("cena atual")
 * voltaria a fundir o que a fundação separou.
 *
 * O cartão tem MODOS em vez de vários booleanos: renomear, duplicar e
 * excluir tomam a linha inteira, e são mutuamente exclusivos por
 * natureza. Três flags independentes permitiriam estados que não
 * existem ("renomeando e excluindo ao mesmo tempo") e obrigariam cada
 * um a lembrar de desligar os outros.
 *
 * Fora daqui, por fase: pastas e pesquisa (5), mover jogadores (6).
 */

import { useEffect, useRef, useState } from "react";
import {
  Archive, ArchiveRestore, Check, Copy, GripVertical, MonitorPlay,
  MoreVertical, Pencil, Trash2, Users, X,
} from "lucide-react";
import type {
  CartaoCena as DadosCartaoCena, ModoDuplicacao, PosicaoJogador,
} from "../../../../../lib/vtt/sceneStorage";

type Modo = "normal" | "renomeando" | "duplicando" | "excluindo" | "jogadores";

export interface PropsCartaoCena {
  cena: DadosCartaoCena;
  /** Esta é a cena que o narrador está olhando. */
  vista: boolean;
  /**
   * URL assinada da miniatura, quando existe e quando já foi emitida.
   * `null` é o caso NORMAL — cena sem fundo, assinatura ainda em voo,
   * ou arquivo que o servidor recusou assinar. Nos três o cartão cai na
   * inicial do nome, que é o que ele sempre fez.
   */
  miniaturaUrl?: string | null;
  /**
   * O caminho da pasta, mostrado só na BUSCA. Fora dela o caminho já
   * está no breadcrumb acima, e repeti-lo em cada cartão seria dizer a
   * mesma coisa N vezes.
   */
  caminhoPasta?: string | null;
  /** Alguma escrita desta cena está em voo — trava os gestos dela. */
  ocupada: boolean;
  /** A última escrita desta cena falhou; a mensagem pertence a ESTE cartão. */
  erro: string | null;
  onAbrir: () => void;
  onRenomear: (nome: string) => void;
  /** Levar a MESA para esta cena. */
  onApresentar: () => void;
  onDuplicar: (modo: ModoDuplicacao) => void;
  onArquivar: () => void;
  onRestaurar: () => void;
  onExcluir: (nomeConfirmacao: string) => void;
  /** Quem está NESTA cena agora (atribuído ou porque a mesa está aqui). */
  jogadoresAqui: PosicaoJogador[];
  /** Todos os jogadores da campanha, para a lista de "trazer para cá". */
  todosJogadores: PosicaoJogador[];
  onMoverJogadores: (userIds: string[]) => void;
  /** Reordenar pelo teclado — o arrasto não é alcançável sem mouse. */
  onMover: (direcao: -1 | 1) => void;
  podeSubir: boolean;
  podeDescer: boolean;
  /** Ganchos do arrasto, montados pelo gerenciador (ele é quem tem a lista). */
  arrasto: {
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
    arrastando: boolean;
    alvo: boolean;
  };
}

export function CartaoCena(p: PropsCartaoCena) {
  const [modo, setModo] = useState<Modo>("normal");
  const [rascunho, setRascunho] = useState(p.cena.nome);
  const [confirmacao, setConfirmacao] = useState("");
  const [menuAberto, setMenuAberto] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const campoRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLSpanElement | null>(null);

  const arquivada = p.cena.arquivadaEm !== null;

  // O nome de fora manda enquanto ninguém está editando: o servidor
  // pode ter devolvido outro (nome em branco volta pro anterior), e o
  // cartão precisa mostrar o que a mesa PASSOU A TER.
  useEffect(() => {
    if (modo !== "renomeando") setRascunho(p.cena.nome);
  }, [p.cena.nome, modo]);

  useEffect(() => {
    if (modo === "renomeando") campoRef.current?.select();
    if (modo === "excluindo") campoRef.current?.focus();
    if (modo === "normal") { setConfirmacao(""); setSelecionados(new Set()); }
    // Quem já está aqui vem pré-marcado: o gesto comum é ACRESCENTAR
    // alguém ao grupo que está nesta cena, e obrigar a remarcar os que
    // já estavam faria cada ajuste parecer um recomeço.
    if (modo === "jogadores") setSelecionados(new Set(p.jogadoresAqui.map((j) => j.userId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo]);

  /** Fechar o menu por clique fora e por Escape — as duas saídas que quem usa menu espera. */
  useEffect(() => {
    if (!menuAberto) return;
    const foraDaqui = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuAberto(false);
    };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuAberto(false); };
    document.addEventListener("mousedown", foraDaqui);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", foraDaqui);
      document.removeEventListener("keydown", escape);
    };
  }, [menuAberto]);

  function confirmarNome() {
    const limpo = rascunho.trim();
    setModo("normal");
    // Nome igual (ou vazio) não vira round-trip: `set_vtt_scene_config`
    // consome uma revisão a cada chamada, e gastar uma pra gravar o que
    // já estava lá faria o próximo salvamento legítimo ser recusado.
    if (limpo.length === 0 || limpo === p.cena.nome) {
      setRascunho(p.cena.nome);
      return;
    }
    p.onRenomear(limpo);
  }

  function doMenu(acao: () => void) {
    setMenuAberto(false);
    acao();
  }

  return (
    <li
      className="rv-cena-cartao"
      data-vista={p.vista || undefined}
      data-arquivada={arquivada || undefined}
      data-arrastando={p.arrasto.arrastando || undefined}
      data-alvo={p.arrasto.alvo || undefined}
      data-testid="cena-cartao"
      data-cena-id={p.cena.id}
      // Arrastar serve pra reordenar E pra mover entre pastas; nos dois
      // casos o gesto não faz sentido no meio de uma edição inline.
      draggable={modo === "normal"}
      onDragStart={p.arrasto.onDragStart}
      onDragOver={p.arrasto.onDragOver}
      onDrop={p.arrasto.onDrop}
      onDragEnd={p.arrasto.onDragEnd}
    >
      <span className="rv-cena-pegador" aria-hidden="true"><GripVertical size={13} /></span>

      {/* A miniatura é o fundo da cena (ou a imagem escolhida a dedo),
          derivada em `list_vtt_scenes`. Sem ela, a inicial do nome —
          que distingue cartões de relance sem prometer uma imagem que
          não existe. `aria-hidden` nos dois casos: o nome está logo ao
          lado, e anunciá-lo duas vezes só atrapalha quem ouve. */}
      <span className="rv-cena-mini" aria-hidden="true">
        {p.miniaturaUrl
          ? <img src={p.miniaturaUrl} alt="" className="rv-cena-mini-img" />
          : (p.cena.nome.trim()[0] ?? "?").toUpperCase()}
      </span>

      <span className="rv-cena-txt">
        {modo === "renomeando" ? (
          <span className="rv-cena-editar">
            <input
              ref={campoRef}
              className="rv-cena-campo"
              value={rascunho}
              maxLength={120}
              aria-label="Nome da cena"
              data-testid="cena-campo-nome"
              onChange={(e) => setRascunho(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); confirmarNome(); }
                if (e.key === "Escape") { e.preventDefault(); setModo("normal"); }
              }}
              // Sair do campo confirma, como em toda edição inline da
              // mesa. Perder o que foi digitado por um clique fora é o
              // comportamento que mais irrita e menos protege.
              onBlur={confirmarNome}
            />
            <button type="button" className="rv-cena-mini-btn" aria-label="Confirmar nome" onMouseDown={(e) => e.preventDefault()} onClick={confirmarNome}>
              <Check size={13} />
            </button>
            <button type="button" className="rv-cena-mini-btn" aria-label="Cancelar" onMouseDown={(e) => e.preventDefault()} onClick={() => setModo("normal")}>
              <X size={13} />
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="rv-cena-nome"
            data-testid="cena-abrir"
            disabled={p.ocupada}
            onClick={p.onAbrir}
            // O cartão inteiro ABRE; o menu faz o resto. Clicar no nome
            // pra renomear disputaria com o gesto principal.
            title={p.vista ? "Você já está nesta cena" : "Abrir esta cena"}
          >
            {p.cena.nome}
          </button>
        )}

        <span className="rv-cena-selos">
          {p.vista && <span className="rv-cena-selo" data-tipo="vista">Você está aqui</span>}
          {p.cena.apresentada && (
            <span className="rv-cena-selo" data-tipo="mesa">
              <Users size={11} aria-hidden="true" /> Jogadores aqui
            </span>
          )}
          {arquivada && <span className="rv-cena-selo" data-tipo="arquivo">Arquivada</span>}
          {p.jogadoresAqui.map((j) => (
            <span
              key={j.userId}
              className="rv-cena-jogador"
              data-atribuido={j.atribuido || undefined}
              // O título distingue os dois motivos de estar aqui —
              // sem ele, "mandei o Bruno" e "o Bruno está onde a mesa
              // está" seriam a mesma etiqueta.
              title={j.atribuido
                ? `${j.nome} foi mandado para esta cena`
                : `${j.nome} está aqui porque a mesa está`}
            >{j.nome}</span>
          ))}
          {p.caminhoPasta && <span className="rv-cena-local" data-tipo="pasta">{p.caminhoPasta}</span>}
          {p.cena.local && <span className="rv-cena-local">{p.cena.local}</span>}
        </span>

        {/* DUPLICAR — os dois modos que a 0116 oferece, escolhidos aqui
            em vez de num diálogo: são duas opções e cabem na linha. A
            duplicação seletiva por categoria (fase 5) vai precisar de
            diálogo; duas não. */}
        {modo === "duplicando" && (
          <span className="rv-cena-linha-acao" data-testid="cena-duplicar-opcoes">
            <button
              type="button" className="rv-cena-btn" data-testid="cena-duplicar-completa"
              onClick={() => { setModo("normal"); p.onDuplicar("completa"); }}
            >Tudo reusável</button>
            <button
              type="button" className="rv-cena-btn" data-testid="cena-duplicar-mapa"
              onClick={() => { setModo("normal"); p.onDuplicar("mapa"); }}
            >Só mapa</button>
            <button type="button" className="rv-cena-mini-btn" onClick={() => setModo("normal")}>Cancelar</button>
          </span>
        )}

        {/* EXCLUIR — o nome digitado é exigência da RPC, não teatro da
            UI: `delete_vtt_scene` confere no servidor. Aqui o campo
            existe pra que a exigência seja cumprível, e o nome fica à
            vista logo acima pra que cumpri-la não vire adivinhação. */}
        {modo === "excluindo" && (
          <span className="rv-cena-linha-acao" data-testid="cena-excluir-confirma">
            <input
              ref={campoRef}
              className="rv-cena-campo"
              value={confirmacao}
              maxLength={120}
              placeholder={`Digite "${p.cena.nome}"`}
              aria-label={`Digite o nome da cena para confirmar a exclusão de ${p.cena.nome}`}
              data-testid="cena-excluir-campo"
              onChange={(e) => setConfirmacao(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.preventDefault(); setModo("normal"); }
                if (e.key === "Enter" && confirmacao === p.cena.nome) {
                  e.preventDefault();
                  setModo("normal");
                  p.onExcluir(confirmacao);
                }
              }}
            />
            <button
              type="button" className="rv-cena-btn" data-tipo="perigo"
              data-testid="cena-excluir-confirmar"
              // Desabilitado até bater: a RPC recusaria de todo jeito, e
              // deixar clicar só pra receber erro seria fazer o servidor
              // ensinar o que a tela já sabe.
              disabled={confirmacao !== p.cena.nome}
              onClick={() => { setModo("normal"); p.onExcluir(confirmacao); }}
            >Excluir</button>
            <button type="button" className="rv-cena-mini-btn" onClick={() => setModo("normal")}>Cancelar</button>
          </span>
        )}

        {modo === "jogadores" && (
          <span className="rv-cena-linha-acao" data-testid="cena-jogadores-lista">
            {p.todosJogadores.length === 0 ? (
              <span className="rv-pasta-aviso">Ninguém mais na campanha.</span>
            ) : (
              <>
                {p.todosJogadores.map((j) => (
                  <label key={j.userId} className="rv-cena-jogador-opcao">
                    <input
                      type="checkbox"
                      checked={selecionados.has(j.userId)}
                      data-testid={`cena-jogador-${j.userId}`}
                      onChange={(e) => setSelecionados((s) => {
                        const novo = new Set(s);
                        if (e.target.checked) novo.add(j.userId); else novo.delete(j.userId);
                        return novo;
                      })}
                    />
                    {j.nome}
                  </label>
                ))}
                <button
                  type="button" className="rv-cena-btn" data-testid="cena-jogadores-confirmar"
                  onClick={() => { setModo("normal"); p.onMoverJogadores([...selecionados]); }}
                >Mandar para cá</button>
              </>
            )}
            <button type="button" className="rv-cena-mini-btn" onClick={() => setModo("normal")}>Cancelar</button>
          </span>
        )}

        {p.erro && <span className="rv-cena-erro" role="alert">{p.erro}</span>}
      </span>

      <span className="rv-cena-acoes">
        {/* APRESENTAR — o único gesto do catálogo que mexe no que os
            jogadores veem, e por isso o único fora do menu junto das
            setas. Some no cartão que já é o palco e na cena arquivada,
            que a 0116 recusa apresentar. */}
        {!p.cena.apresentada && !arquivada && (
          <button
            type="button" className="rv-cena-mini-btn" data-tipo="apresentar"
            aria-label={`Apresentar "${p.cena.nome}" aos jogadores`}
            title="Apresentar aos jogadores"
            data-testid="cena-apresentar"
            disabled={p.ocupada} onClick={p.onApresentar}
          ><MonitorPlay size={13} /></button>
        )}
        {/* Reordenar pelo teclado. O arrasto continua sendo o gesto
            natural, mas ele não existe pra quem navega por teclado — e
            "reordenar" estava no aceite da fase 2 pra todo mundo. */}
        <button
          type="button" className="rv-cena-mini-btn" aria-label={`Mover "${p.cena.nome}" para cima`}
          disabled={!p.podeSubir || p.ocupada} onClick={() => p.onMover(-1)}
        >↑</button>
        <button
          type="button" className="rv-cena-mini-btn" aria-label={`Mover "${p.cena.nome}" para baixo`}
          disabled={!p.podeDescer || p.ocupada} onClick={() => p.onMover(1)}
        >↓</button>

        <span className="rv-cena-menu-casca" ref={menuRef}>
          <button
            type="button" className="rv-cena-mini-btn"
            aria-label={`Mais ações para "${p.cena.nome}"`}
            aria-expanded={menuAberto}
            aria-haspopup="menu"
            data-testid="cena-menu"
            disabled={p.ocupada}
            onClick={() => setMenuAberto((a) => !a)}
          ><MoreVertical size={13} /></button>

          {menuAberto && (
            <span className="rv-cena-menu" role="menu" data-testid="cena-menu-lista">
              {!arquivada && (
                <button
                  type="button" role="menuitem" className="rv-cena-menu-item"
                  data-testid="cena-renomear"
                  onClick={() => doMenu(() => setModo("renomeando"))}
                ><Pencil size={12} aria-hidden="true" /> Renomear</button>
              )}
              {!arquivada && (
                <button
                  type="button" role="menuitem" className="rv-cena-menu-item"
                  data-testid="cena-jogadores"
                  onClick={() => doMenu(() => setModo("jogadores"))}
                ><Users size={12} aria-hidden="true" /> Quem joga aqui…</button>
              )}
              <button
                type="button" role="menuitem" className="rv-cena-menu-item"
                data-testid="cena-duplicar"
                onClick={() => doMenu(() => setModo("duplicando"))}
              ><Copy size={12} aria-hidden="true" /> Duplicar…</button>

              {arquivada ? (
                <button
                  type="button" role="menuitem" className="rv-cena-menu-item"
                  data-testid="cena-restaurar"
                  onClick={() => doMenu(p.onRestaurar)}
                ><ArchiveRestore size={12} aria-hidden="true" /> Restaurar</button>
              ) : (
                <button
                  type="button" role="menuitem" className="rv-cena-menu-item"
                  data-testid="cena-arquivar"
                  // A cena apresentada não arquiva (0116): a mesa ficaria
                  // numa cena congelada. Desabilitado com o porquê no
                  // título, em vez de ausente — some sem explicação seria
                  // a pessoa procurando um item que ela viu ontem.
                  disabled={p.cena.apresentada}
                  title={p.cena.apresentada
                    ? "Leve a mesa para outra cena antes de arquivar esta"
                    : "Arquivar"}
                  onClick={() => doMenu(p.onArquivar)}
                ><Archive size={12} aria-hidden="true" /> Arquivar</button>
              )}

              <button
                type="button" role="menuitem" className="rv-cena-menu-item" data-tipo="perigo"
                data-testid="cena-excluir"
                disabled={p.cena.apresentada}
                title={p.cena.apresentada
                  ? "Leve a mesa para outra cena antes de excluir esta"
                  : "Excluir — arquivar é o caminho reversível"}
                onClick={() => doMenu(() => setModo("excluindo"))}
              ><Trash2 size={12} aria-hidden="true" /> Excluir…</button>
            </span>
          )}
        </span>
      </span>
    </li>
  );
}
