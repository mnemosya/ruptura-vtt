"use client";

/**
 * A MOLDURA do painel lateral da Mesa — abas, cabeçalho por aba, corpo
 * rolável, rodapé opcional, recolhimento, redimensionamento e drawer.
 *
 * Antes disto o painel inteiro (cinco abas e todo o conteúdo delas)
 * vivia nas últimas 120 linhas de `VttClient.tsx`, com dado
 * inventado. Aqui a moldura não sabe nada de chat, personagem, item ou
 * conteúdo: ela só decide QUAL aba está visível e como o painel se
 * comporta na tela.
 *
 * DUAS DECISÕES QUE VALEM A PENA REGISTRAR:
 *
 * 1. As cinco abas ficam MONTADAS o tempo todo; a troca só muda qual
 *    delas está visível (`hidden`). É o que preserva o scroll e o
 *    estado interno de cada uma (rascunho do Chat, busca do
 *    Compêndio, pasta aberta do diretório) — e o que permite o Chat
 *    continuar contando não lidos enquanto outra aba está à frente.
 *    Cada aba recebe `visivel` e só BUSCA dado quando fica visível
 *    pela primeira vez, então "montado" não custa rede.
 *
 * 2. Cada aba tem seu próprio `LimiteErroAba`. Uma exceção de render
 *    no Bando mostra o erro DENTRO do corpo do painel, com a moldura e
 *    as outras abas intactas — nunca derruba o Chat nem a mesa.
 *
 * Em viewport estreita o painel vira DRAWER sobre o mapa (nunca uma
 * coluna que espreme o canvas até ele ficar inútil): fechado, sobra só
 * a faixa de ícones; aberto, ele flutua sobre a borda direita — sem
 * véu, então o mapa continua inteiro e clicável — e o × do cabeçalho,
 * a aba ativa ou o Esc fecham. Em desktop é coluna lateral, e Esc
 * apenas recolhe.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { PainelAbas } from "./PainelAbas";
import { ChatTab } from "./ChatTab";
import { PersonagensTab } from "./PersonagensTab";
import { ParticipantesTab } from "./ParticipantesTab";
import { BandoTab } from "./BandoTab";
import { CompendioTab } from "./CompendioTab";
import { LimiteErroAba } from "./LimiteErroAba";
import { TransferenciaBando, type AlvoTransferencia } from "./TransferenciaBando";
import { useConsoleDaMesa } from "../../_shell/ConsoleDaMesa";
import { JanelaAcessoPersonagem, JanelaJogadoresConvites } from "./janelas/JanelasAdmin";
import { JanelaInterna } from "./ui/JanelaInterna";
import type { ItemTransferivel } from "./bandoModelo";
import type { PersonagemArrastado } from "./personagensModelo";
import { ABAS_ORDEM, LARGURA_MAX, LARGURA_MIN, ROTULO_ABA, limitarLarguraPainel, type AbaId } from "./tipos";
import {
  PREFERENCIAS_PAINEL_PADRAO,
  carregarPreferenciasPainel,
  chavePreferenciasPainel,
  salvarPreferenciasPainel,
  type PreferenciasPainel,
} from "./preferencias";
import "./painel.css";

/** Abaixo disto o painel deixa de ser coluna e vira drawer sobre o mapa. */
const LARGURA_DRAWER_PX = 1100;

export function PainelVtt({
  campaignId,
  usuarioId,
  ehNarrador,
  personagemDoTokenSelecionado,
  onAdicionarPersonagemACena,
  onArrastarPersonagem,
  onFocarToken,
  fixtureVisual,
}: {
  campaignId: string;
  usuarioId: string | null;
  ehNarrador: boolean;
  /** Personagem do token selecionado, só quando a conta pode controlá-lo — o Chat usa como identidade automática. */
  personagemDoTokenSelecionado: { id: string; nome: string } | null;
  /** Inicia o fluxo CANÔNICO de criação de token vinculado (posicionamento no mapa). */
  onAdicionarPersonagemACena: (p: PersonagemArrastado) => void;
  /** Repassado ao diretório: quem está sendo arrastado pro mapa. */
  onArrastarPersonagem?: (p: PersonagemArrastado | null) => void;
  /**
   * Centraliza a câmera num token. É a ÚNICA ação do painel autorizada
   * a mexer na cena, e só a partir de um controle explicitamente
   * rotulado ("Centralizar a câmera no alvo") — a exceção que o
   * invariante de não-navegação prevê.
   */
  onFocarToken?: (tokenId: string) => void;
  /**
   * Dados prontos de cada aba, só para a galeria visual em
   * `/dev/estilos` — nunca usado pela mesa real.
   *
   * O painel é COMPOSIÇÃO: ele não lê nada do servidor por conta
   * própria, só monta as abas. Então o repasse é literal — cada chave
   * vai para a aba correspondente, que já sabe o que fazer com ela
   * (mesmo padrão do `dadosFixos` do `CartaoTokenHover`).
   *
   * É isto que permite revisar o painel como NARRADOR e como JOGADOR
   * sem campanha nenhuma: com campanha real o papel é o que o servidor
   * disser, e quem é narrador da própria mesa nunca alcança a visão de
   * jogador.
   */
  fixtureVisual?: {
    chat?: React.ComponentProps<typeof ChatTab>["fixtureVisual"];
    personagens?: React.ComponentProps<typeof PersonagensTab>["fixtureVisual"];
    participantes?: React.ComponentProps<typeof ParticipantesTab>["fixtureVisual"];
    bando?: React.ComponentProps<typeof BandoTab>["fixtureVisual"];
    compendio?: React.ComponentProps<typeof CompendioTab>["fixtureVisual"];
  };
}) {
  const chave = useMemo(() => chavePreferenciasPainel(usuarioId, campaignId), [usuarioId, campaignId]);
  // As preferências não podem ser lidas na renderização (SSR não tem
  // `localStorage`, e ler no primeiro render do cliente divergiria do
  // HTML do servidor). Nascem no padrão e são hidratadas num efeito —
  // mesma solução do `sessionMountId` do provider.
  const [prefs, setPrefs] = useState<PreferenciasPainel>(PREFERENCIAS_PAINEL_PADRAO);
  const [hidratado, setHidratado] = useState(false);
  useEffect(() => {
    setPrefs(carregarPreferenciasPainel(chave));
    setHidratado(true);
  }, [chave]);

  const atualizarPrefs = useCallback(
    (parcial: Partial<PreferenciasPainel>) => {
      setPrefs((atual) => {
        const proximo = { ...atual, ...parcial };
        salvarPreferenciasPainel(chave, proximo);
        return proximo;
      });
    },
    [chave],
  );

  const [ehDrawer, setEhDrawer] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${LARGURA_DRAWER_PX - 1}px)`);
    const aplicar = () => setEhDrawer(mq.matches);
    aplicar();
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, []);


  const asideRef = useRef<HTMLElement | null>(null);
  const idBase = useId();
  const idPainelDe = useCallback((aba: AbaId) => `${idBase}-painel-${aba}`, [idBase]);

  /**
   * Devolve o foco à ABA ativa. É pra onde o teclado tem que voltar
   * depois de recolher/fechar: o botão de recolher some junto com o
   * painel aberto, e a aba ativa continua visível na faixa recolhida —
   * ela é, literalmente, o botão que reabre o painel. Sem isto o foco
   * cairia no `<body>` e a navegação por teclado recomeçaria do zero.
   */
  const focarAbaAtiva = useCallback((aba: AbaId) => {
    requestAnimationFrame(() => {
      asideRef.current?.querySelector<HTMLElement>(`#rv-aba-${aba}`)?.focus();
    });
  }, []);

  const recolher = useCallback(() => {
    atualizarPrefs({ aberto: false });
    focarAbaAtiva(prefs.aba);
  }, [atualizarPrefs, focarAbaAtiva, prefs.aba]);

  const selecionar = useCallback(
    (aba: AbaId) => {
      // Clicar de novo na aba JÁ ativa é INERTE. A versão anterior
      // recolhia o painel (atalho do Foundry) e isso se mostrou hostil
      // aqui: um clique repetido — comum ao voltar para o Chat — fechava
      // o painel inteiro e a pessoa perdia scroll, busca e rascunho. O
      // recolhimento passou a ter caminhos PRÓPRIOS e explícitos: o
      // botão de recolher, o × do drawer e o Esc.
      if (prefs.aberto && prefs.aba === aba) return;
      atualizarPrefs({ aba, aberto: true });
    },
    [prefs.aberto, prefs.aba, atualizarPrefs],
  );

  // Esc: fecha o drawer / recolhe a coluna — mas nunca quando o foco
  // está num campo editável (digitar Esc no Chat não pode fechar o
  // painel) nem quando um diálogo do painel está aberto (ele tem o
  // próprio Esc).
  const [transferencia, setTransferencia] = useState<AlvoTransferencia | null>(null);
  useEffect(() => {
    if (!prefs.aberto) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (transferencia) return;
      const alvo = document.activeElement as HTMLElement | null;
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT" || alvo.isContentEditable)) return;
      if (!asideRef.current?.contains(alvo)) return;
      e.preventDefault();
      e.stopPropagation();
      recolher();
    }
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [prefs.aberto, recolher, transferencia]);

  // ── Redimensionamento por arrasto ──────────────────────────────
  const arrastandoRef = useRef(false);
  const inicioRef = useRef({ x: 0, largura: 0 });
  const [redimensionando, setRedimensionando] = useState(false);

  const aoPressionarAlca = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      arrastandoRef.current = true;
      inicioRef.current = { x: e.clientX, largura: prefs.largura };
      setRedimensionando(true);
    },
    [prefs.largura],
  );

  const aoMoverAlca = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!arrastandoRef.current) return;
    // A alça fica na borda ESQUERDA do painel: arrastar pra esquerda
    // AUMENTA a largura, daí o sinal invertido.
    const proposta = inicioRef.current.largura - (e.clientX - inicioRef.current.x);
    setPrefs((atual) => ({ ...atual, largura: limitarLarguraPainel(proposta) }));
  }, []);

  const aoSoltarAlca = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!arrastandoRef.current) return;
      arrastandoRef.current = false;
      setRedimensionando(false);
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      // Só grava no fim do gesto — não uma escrita em `localStorage`
      // por frame de arrasto.
      setPrefs((atual) => {
        salvarPreferenciasPainel(chave, atual);
        return atual;
      });
    },
    [chave],
  );

  /** Teclado na alça: setas ajustam de 10 em 10 px, Home/End vão aos limites. */
  const aoTeclarAlca = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      let proposta: number | null = null;
      if (e.key === "ArrowLeft") proposta = prefs.largura + 10;
      else if (e.key === "ArrowRight") proposta = prefs.largura - 10;
      else if (e.key === "Home") proposta = 9999;
      else if (e.key === "End") proposta = 0;
      if (proposta === null) return;
      e.preventDefault();
      atualizarPrefs({ largura: limitarLarguraPainel(proposta) });
    },
    [prefs.largura, atualizarPrefs],
  );

  const [sinalRecarregarBando, setSinalRecarregarBando] = useState(0);

  // ── Janelas internas ────────────────────────────────────────────
  // Todo destino que ANTES era `router.push`/`<Link>` virou uma destas.
  // Nenhuma troca a URL, nenhuma remonta o VTT.
  const [acessoDe, setAcessoDe] = useState<string | null>(null);
  const [convitesAberto, setConvitesAberto] = useState(false);
  const [bandoAberto, setBandoAberto] = useState(false);
  const [compendioAberto, setCompendioAberto] = useState(false);
  const [participantesAberto, setParticipantesAberto] = useState(false);
  const [personagensAberto, setPersonagensAberto] = useState(false);

  /**
   * A ficha não é mais janela DO PAINEL: quem a hospeda é a casca da
   * campanha (`_shell/ConsoleDaMesa.tsx`), pra que Personagens, Mesa e
   * VTT abram exatamente a mesma coisa, do mesmo jeito, sem navegar.
   * Aqui só ficaram as duas intenções: abrir e aquecer.
   */
  const consoleDaMesa = useConsoleDaMesa();
  const abrirConsole = useCallback((id: string) => consoleDaMesa?.abrir(id), [consoleDaMesa]);
  const aquecerConsole = useCallback(() => consoleDaMesa?.aquecer(), [consoleDaMesa]);

  /**
   * Empresta ao Console a câmera do mapa enquanto o VTT está montado.
   *
   * A ficha vive na casca da campanha, ACIMA do VTT, e por isso não
   * alcança a câmera sozinha. Registrando aqui, "Ver no mapa" aparece
   * na ficha só onde existe mapa — em Personagens ou na Mesa a ação
   * simplesmente não é oferecida, em vez de existir e não fazer nada.
   */
  const registrarFocoNoMapa = consoleDaMesa?.registrarFocoNoMapa;
  useEffect(() => {
    if (!registrarFocoNoMapa) return;
    registrarFocoNoMapa(onFocarToken ?? null);
    return () => registrarFocoNoMapa(null);
  }, [registrarFocoNoMapa, onFocarToken]);

  const aberto = prefs.aberto;
  const abaAtiva = prefs.aba;

  const conteudoAba: Record<AbaId, React.ReactNode> = {
    chat: (
      <ChatTab
        visivel={aberto && abaAtiva === "chat"}
        personagemDoTokenSelecionado={personagemDoTokenSelecionado}
        onFocarToken={onFocarToken}
        fixtureVisual={fixtureVisual?.chat}
      />
    ),
    personagens: (
      <PersonagensTab
        campaignId={campaignId}
        visivel={aberto && abaAtiva === "personagens"}
        ehNarrador={ehNarrador}
        onAdicionarACena={onAdicionarPersonagemACena}
        onArrastarPersonagem={onArrastarPersonagem}
        onAbrirConsole={abrirConsole}
        onConfigurarAcesso={setAcessoDe}
        onPrecarregarConsole={aquecerConsole}
        onReceberItemDoBando={(item, personagem) => setTransferencia({ item, personagem })}
        onAbrirJanela={() => setPersonagensAberto(true)}
        fixtureVisual={fixtureVisual?.personagens}
      />
    ),
    participantes: (
      <ParticipantesTab
        campaignId={campaignId}
        visivel={aberto && abaAtiva === "participantes"}
        ehNarrador={ehNarrador}
        onAbrirConvites={() => setConvitesAberto(true)}
        onAbrirConsole={abrirConsole}
        onAbrirJanela={() => setParticipantesAberto(true)}
        fixtureVisual={fixtureVisual?.participantes}
      />
    ),
    bando: (
      <BandoTab
        campaignId={campaignId}
        visivel={aberto && abaAtiva === "bando"}
        onEnviarParaPersonagem={(item: ItemTransferivel) => setTransferencia({ item, personagem: null })}
        recarregarSinal={sinalRecarregarBando}
        onAbrirJanela={() => setBandoAberto(true)}
        fixtureVisual={fixtureVisual?.bando}
      />
    ),
    compendio: (
      <CompendioTab
        campaignId={campaignId}
        visivel={aberto && abaAtiva === "compendio"}
        onAbrirJanela={() => setCompendioAberto(true)}
        fixtureVisual={fixtureVisual?.compendio}
      />
    ),
  };

  return (
    <>
      {/* SEM véu de fundo, de propósito. Um drawer "de manual" põe um
          scrim sobre o resto e o resto para de responder — numa Mesa
          isso significa o MAPA parar de responder enquanto o painel
          está aberto, que é justamente o que a mesa não pode fazer
          (foi o que um browser check pegou: o véu interceptava o
          clique no mapa). Aqui o painel só FLUTUA por cima da borda
          direita: o mapa segue com a largura inteira e continua
          clicável, e quem quiser fechar tem o botão × do cabeçalho, a
          própria aba ativa e o Esc. */}
      <aside
        ref={asideRef}
        className="rv-painel"
        data-aberto={aberto}
        data-drawer={ehDrawer ? "true" : undefined}
        data-hidratado={hidratado ? "true" : undefined}
        data-redimensionando={redimensionando ? "true" : undefined}
        // Largura INLINE, não por classe: `vtt.css` já declara
        // `.rv-painel[data-aberto="true"] { width: 316px }` com a mesma
        // especificidade da regra equivalente de `painel.css`, e qual
        // das duas vence dependeria da ordem em que os dois arquivos
        // entram no bundle — frágil demais para a largura que a pessoa
        // escolheu. O estilo inline vence as duas, sempre. No drawer
        // ele ainda respeita o teto de viewport.
        style={
          aberto
            ? { width: ehDrawer ? `min(${prefs.largura}px, 88vw)` : `${prefs.largura}px` }
            : undefined
        }
        aria-label="Painel da sessão"
        data-testid="painel-vtt"
      >
        {aberto && !ehDrawer && (
          <div
            className="rv-painel-alca"
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionar painel"
            aria-valuenow={prefs.largura}
            aria-valuemin={LARGURA_MIN}
            aria-valuemax={LARGURA_MAX}
            tabIndex={0}
            onPointerDown={aoPressionarAlca}
            onPointerMove={aoMoverAlca}
            onPointerUp={aoSoltarAlca}
            onPointerCancel={aoSoltarAlca}
            onKeyDown={aoTeclarAlca}
            data-testid="painel-alca"
          />
        )}

        <PainelAbas
          abaAtiva={abaAtiva}
          aberto={aberto}
          onSelecionar={selecionar}
          onRecolher={recolher}
          idPainelDe={idPainelDe}
        />

        {/* Corpo: os cinco painéis existem sempre; só um fica visível.
            `hidden` (não desmontar) é o que preserva scroll e estado. */}
        <div className="rv-painel-corpo" hidden={!aberto}>
          {ABAS_ORDEM.map((id) => (
            <section
              key={id}
              id={idPainelDe(id)}
              role="tabpanel"
              aria-labelledby={`rv-aba-${id}`}
              className="rv-painel-tabpanel"
              hidden={!aberto || abaAtiva !== id}
              data-testid={`painel-tabpanel-${id}`}
            >
              {/* Sem título: a aba selecionada já diz onde você está —
                  repetir "CHAT LOG" logo abaixo dela era uma linha de
                  altura gasta pra não dizer nada de novo. O nome
                  acessível do painel continua vindo da própria aba
                  (`aria-labelledby`), então nada se perde pra quem usa
                  leitor de tela. O cabeçalho sobrevive SÓ no modo
                  gaveta, onde ele carrega o botão de fechar. */}
              {ehDrawer && (
                <header className="rv-painel-cab">
                  <button type="button" className="rv-painel-fechar" onClick={recolher} aria-label="Fechar painel">
                    <X size={15} />
                  </button>
                </header>
              )}
              <LimiteErroAba chaveReset={id} rotuloAba={ROTULO_ABA[id]}>
                {conteudoAba[id]}
              </LimiteErroAba>
            </section>
          ))}
        </div>
      </aside>

      {/* Janelas internas — o que antes era navegação. */}
      <JanelaJogadoresConvites campaignId={campaignId} aberta={convitesAberto} onFechar={() => setConvitesAberto(false)} />
      <JanelaAcessoPersonagem campaignId={campaignId} characterId={acessoDe} onFechar={() => setAcessoDe(null)} />
      {bandoAberto && (
        <JanelaInterna aberta titulo="Bando" largura={620} altura={620} onFechar={() => setBandoAberto(false)} testId="painel-janela-bando">
          {/* Mesma aba, com mais espaço — nada de uma segunda
              implementação do Bando para manter em sincronia. */}
          <div className="rv-pn-aba" style={{ height: "100%" }}>
            <BandoTab
              campaignId={campaignId}
              visivel
              onEnviarParaPersonagem={(item: ItemTransferivel) => setTransferencia({ item, personagem: null })}
              recarregarSinal={sinalRecarregarBando}
            />
          </div>
        </JanelaInterna>
      )}
      {compendioAberto && (
        <JanelaInterna aberta titulo="Compêndio" largura={680} altura={620} onFechar={() => setCompendioAberto(false)} testId="painel-janela-compendio">
          {/* Mesma aba, com mais espaço — nada de uma segunda implementação do Compêndio. */}
          <div className="rv-pn-aba" style={{ height: "100%" }}>
            <CompendioTab campaignId={campaignId} visivel />
          </div>
        </JanelaInterna>
      )}
      {participantesAberto && (
        <JanelaInterna aberta titulo="Participantes" largura={620} altura={620} onFechar={() => setParticipantesAberto(false)} testId="painel-janela-participantes">
          {/* Mesma aba, com mais espaço — nada de uma segunda implementação de Participantes. */}
          <div className="rv-pn-aba" style={{ height: "100%" }}>
            <ParticipantesTab
              campaignId={campaignId}
              visivel
              ehNarrador={ehNarrador}
              onAbrirConvites={() => setConvitesAberto(true)}
              onAbrirConsole={abrirConsole}
            />
          </div>
        </JanelaInterna>
      )}
      {personagensAberto && (
        <JanelaInterna aberta titulo="Personagens" largura={680} altura={620} onFechar={() => setPersonagensAberto(false)} testId="painel-janela-personagens">
          {/* Mesma aba, com mais espaço — nada de uma segunda implementação de Personagens. */}
          <div className="rv-pn-aba" style={{ height: "100%" }}>
            <PersonagensTab
              campaignId={campaignId}
              visivel
              ehNarrador={ehNarrador}
              onAdicionarACena={onAdicionarPersonagemACena}
              onArrastarPersonagem={onArrastarPersonagem}
              onAbrirConsole={abrirConsole}
              onConfigurarAcesso={setAcessoDe}
              onPrecarregarConsole={aquecerConsole}
              onReceberItemDoBando={(item, personagem) => setTransferencia({ item, personagem })}
            />
          </div>
        </JanelaInterna>
      )}

      {transferencia && (
        <TransferenciaBando
          campaignId={campaignId}
          alvo={transferencia}
          onFechar={() => setTransferencia(null)}
          onConcluido={() => {
            setTransferencia(null);
            setSinalRecarregarBando((n) => n + 1);
          }}
        />
      )}
    </>
  );
}
