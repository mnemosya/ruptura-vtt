"use client";

/**
 * O CATÁLOGO DE CENAS — a janela do narrador.
 *
 * A Fase 1 pôs no banco tudo que esta janela consome (`list_vtt_scenes`,
 * `create_vtt_scene`, `reorder_vtt_scenes`, `set_vtt_scene_config`) e
 * separou a cena apresentada da cena existente. Aqui essa separação
 * vira gesto: clicar num cartão ABRE a cena pra quem prepara, e a mesa
 * não se move.
 *
 * Listar, criar, renomear, abrir e reordenar (fase 2); apresentar
 * (fase 3). Duplicar, arquivar, excluir e miniatura são da 4.
 *
 * ABRIR e APRESENTAR são gestos separados e é essa separação que a
 * janela inteira existe pra oferecer: o primeiro move só quem prepara,
 * o segundo move a mesa. Por isso apresentar tem botão próprio em vez
 * de ser o que acontece ao clicar num cartão.
 *
 * Criar é um formulário DENTRO da janela, não um diálogo por cima.
 * A janela já é uma superfície flutuante; empilhar um modal sobre ela
 * obrigaria a resolver foco, empilhamento e fechamento em cascata pra
 * um formulário de um campo só. Quando criar ganhar tamanho de grade,
 * pasta e cena-modelo (Fase 5), aí o diálogo se paga.
 *
 * Esta janela é do NARRADOR. Não há verificação de papel aqui porque
 * ela não é a garantia: `list_vtt_scenes` não conta ao jogador que
 * existem outras cenas, e as RPCs de escrita recusam quem não é dono.
 * Quem decide montar é o `VttClient`, e o servidor não depende disso.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Archive, Clapperboard, Loader2, Plus, Undo2 } from "lucide-react";
import { JanelaFerramenta } from "../_shell/JanelaFerramenta";
import { CartaoCena } from "./CartaoCena";
import {
  apresentarCenaAction, arquivarCenaAction, criarCenaAction, duplicarCenaAction,
  excluirCenaAction, listarCenasAction, reordenarCenasAction, restaurarCenaAction,
  salvarConfigCenaAction,
} from "../_acoes/sceneActions";
import { assinarImagensAction } from "../_acoes/imageActions";
import type {
  CartaoCena as DadosCartaoCena, ModoDuplicacao,
} from "../../../../../lib/vtt/sceneStorage";

export interface PropsGerenciadorCenas {
  campaignId: string;
  /** A cena que o narrador está olhando — dela sai o selo "Você está aqui". */
  cenaVistaId: string | null;
  /** Trocar de cena é do `VttClient`: é ele que carrega e reassina. */
  onAbrir: (sceneId: string) => void;
  onFechar: () => void;
  /**
   * A revisão do palco conhecida pelo cliente, mandada a
   * `present_vtt_scene` para que um clique decidido sobre um palco que
   * já andou seja recusado em vez de aplicado por cima.
   */
  palcoRevision?: number | null;
  /**
   * A cena ABERTA pelo narrador acabou de ser arquivada ou excluída.
   * Quem decide pra onde levá-lo é o `VttClient`: só ele sabe qual cena
   * carregar e como reassinar o Realtime.
   */
  onCenaSaiuDeUso?: (sceneId: string) => void;
  /**
   * Muda quando algo fora daqui alterou uma cena (renomear pela janela
   * de Configurações, por exemplo). Releitura em vez de espelhar o
   * estado do pai: o catálogo tem campos que o `VttClient` não carrega.
   */
  versaoExterna?: number;
}

export function GerenciadorCenas(p: PropsGerenciadorCenas) {
  const [cenas, setCenas] = useState<DadosCartaoCena[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  /** Escritas em voo, por cena — trava só o cartão afetado. */
  const [ocupadas, setOcupadas] = useState<Record<string, true>>({});
  const [errosPorCena, setErrosPorCena] = useState<Record<string, string>>({});
  const [criando, setCriando] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const [salvandoNova, setSalvandoNova] = useState(false);
  const campoNovoRef = useRef<HTMLInputElement | null>(null);

  /**
   * As miniaturas, por id de asset.
   *
   * `list_vtt_scenes` devolve o ID da imagem (a escolhida a dedo ou,
   * na falta, o fundo da cena — 0111), nunca uma URL: quem emite URL
   * assinada é o servidor, depois de conferir se ESTA pessoa pode ver
   * AQUELE arquivo. Um mapa separado do catálogo porque as duas coisas
   * vencem em ritmos diferentes — a listagem é estável, a assinatura
   * expira em 5 minutos.
   */
  const [miniaturas, setMiniaturas] = useState<Record<string, string>>({});

  /** A aba de arquivo. Filtro de apresentação, não outra consulta. */
  const [verArquivo, setVerArquivo] = useState(false);
  const [arrastandoId, setArrastandoId] = useState<string | null>(null);
  const [alvoId, setAlvoId] = useState<string | null>(null);

  /**
   * A lista corrente, sempre fresca.
   *
   * Dois cliques rápidos na seta acontecem no MESMO render: o segundo
   * leria `cenas` do fechamento do primeiro — a lista de antes — e
   * mandaria ao servidor uma ordem que desfaz a anterior. O ref é lido
   * no instante do gesto.
   */
  const cenasRef = useRef<DadosCartaoCena[] | null>(null);
  useEffect(() => { cenasRef.current = cenas; }, [cenas]);

  /**
   * Reordenar é SERIALIZADO, não concorrente.
   *
   * `reorder_vtt_scenes` reescreve o bloco inteiro. Duas chamadas em
   * voo ao mesmo tempo chegam em ordem que ninguém controla, e a que
   * chegar por último vence no banco — podendo ser a mais VELHA. A tela
   * mostraria uma ordem e o catálogo teria outra, sem erro nenhum pra
   * denunciar.
   *
   * A fila resolve sem bloquear o gesto: cada reordenação entra atrás
   * da anterior e o otimismo continua respondendo no frame do clique.
   *
   * NOTA HONESTA: não foi possível reproduzir o atropelamento com a
   * fila desligada — o Next aparentemente já serializa Server Actions
   * do mesmo cliente, e três rodadas do check convergiram mesmo sem
   * ela. A fila fica porque essa serialização é detalhe de
   * implementação do framework, não contrato: o dia em que duas
   * chamadas saírem juntas, a mais VELHA pode vencer no banco e nada
   * denunciaria. Aqui a garantia é nossa e está escrita.
   */
  const filaOrdemRef = useRef<Promise<void>>(Promise.resolve());
  const pendentesOrdemRef = useRef(0);
  /**
   * Uma reordenação que FALHA invalida as que foram enfileiradas em
   * cima dela: elas descrevem posições de uma lista que o servidor
   * recusou. Quem tem época velha desiste, e a releitura do catálogo
   * passa a ser a única verdade.
   */
  const epocaOrdemRef = useRef(0);
  const [reordenando, setReordenando] = useState(false);

  /**
   * Toda releitura carrega o número da sua geração. Uma resposta que
   * chega depois de outra releitura ter começado é DESCARTADA — sem
   * isso, uma listagem lenta sobrescreveria o resultado de uma recente
   * e o catálogo voltaria no tempo. É o mesmo cuidado que o `VttClient`
   * toma com a carga de cena.
   */
  const geracaoRef = useRef(0);

  const recarregar = useCallback(async () => {
    const geracao = ++geracaoRef.current;
    setCarregando(true);
    try {
      // SEMPRE com as arquivadas: a aba de arquivo é um filtro de
      // apresentação, não outra consulta. Buscar de novo a cada troca
      // de aba faria o número do botão ("Arquivo (3)") depender de uma
      // carga que só acontece depois de clicar nele.
      const r = await listarCenasAction(p.campaignId, true);
      if (geracao !== geracaoRef.current) return;
      if (!r.ok || !r.dados) {
        setErro(r.erro ?? "Falha ao listar as cenas.");
      } else {
        setCenas([...r.dados.cenas].sort((a, b) => a.ordem - b.ordem));
        setErro(null);
      }
    } catch (e) {
      if (geracao !== geracaoRef.current) return;
      setErro(e instanceof Error ? e.message : "Falha inesperada ao listar as cenas.");
    } finally {
      if (geracao === geracaoRef.current) setCarregando(false);
    }
  }, [p.campaignId]);

  useEffect(() => { void recarregar(); }, [recarregar, p.versaoExterna]);

  useEffect(() => { if (criando) campoNovoRef.current?.focus(); }, [criando]);

  /**
   * Assina as miniaturas que ainda não têm URL.
   *
   * Só as que faltam: a assinatura é uma ida ao servidor por leva, e
   * repedir as que já estão na mão a cada releitura do catálogo faria
   * renomear uma cena recarregar todas as imagens.
   *
   * Um id que volta de fora da resposta some em silêncio (a ação
   * devolve só os autorizados, de propósito) — e aí o cartão mostra a
   * inicial, que é o que ele já fazia antes de existir miniatura.
   */
  const idsMiniatura = (cenas ?? [])
    .map((c) => c.miniaturaImageId)
    .filter((id): id is string => id !== null)
    .join(",");
  useEffect(() => {
    const ids = idsMiniatura.length > 0 ? idsMiniatura.split(",") : [];
    const faltando = ids.filter((id) => !(id in miniaturas));
    if (faltando.length === 0) return;
    let cancelado = false;
    void assinarImagensAction(p.campaignId, faltando)
      .then((r) => {
        if (cancelado || !r.ok || !r.dados) return;
        setMiniaturas((m) => ({ ...m, ...r.dados }));
      })
      .catch(() => { /* sem miniatura o cartão cai na inicial */ });
    return () => { cancelado = true; };
    // `miniaturas` de propósito FORA das dependências: ele é escrito
    // por este mesmo efeito, e incluí-lo faria o efeito se disparar em
    // resposta à própria escrita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsMiniatura, p.campaignId]);

  function marcarOcupada(id: string, ligado: boolean) {
    setOcupadas((o) => {
      if (ligado) return { ...o, [id]: true };
      const { [id]: _fora, ...resto } = o;
      return resto;
    });
  }

  function anotarErro(id: string, mensagem: string | null) {
    setErrosPorCena((e) => {
      if (mensagem === null) {
        const { [id]: _fora, ...resto } = e;
        return resto;
      }
      return { ...e, [id]: mensagem };
    });
  }

  async function criar() {
    const nome = nomeNovo.trim();
    if (nome.length === 0 || salvandoNova) return;
    setSalvandoNova(true);
    try {
      const r = await criarCenaAction({ campaignId: p.campaignId, nome });
      if (!r.ok || !r.dados) {
        setErro(r.erro ?? "Falha ao criar a cena.");
        return;
      }
      // A cena nasce no FIM do catálogo e NÃO é aberta: criar e abrir
      // são gestos separados, como criar e apresentar. O narrador que
      // quiser entrar clica no cartão.
      setCenas((c) => [...(c ?? []), r.dados!.cena]);
      setNomeNovo("");
      setCriando(false);
      setErro(null);
    } catch (e) {
      // Uma Server Action que REJEITA (em vez de devolver `{ok:false}`)
      // deixaria o formulário mudo: o botão volta do "salvando" e nada
      // explica por que a cena não apareceu. Coberto por critério —
      // sem este `catch`, ele falha.
      setErro(e instanceof Error ? e.message : "Falha inesperada ao criar a cena.");
    } finally {
      setSalvandoNova(false);
    }
  }

  async function renomear(cena: DadosCartaoCena, nome: string) {
    marcarOcupada(cena.id, true);
    anotarErro(cena.id, null);
    try {
      const r = await salvarConfigCenaAction({
        campaignId: p.campaignId,
        sceneId: cena.id,
        nome,
        // Renomear mexe SÓ no nome: os outros campos vão como estão
        // porque `set_vtt_scene_config` grava a configuração inteira.
        // Mandar vazio apagaria local e resumo sem ninguém ter pedido.
        local: cena.local,
        resumo: cena.resumo,
        largura: cena.largura,
        altura: cena.altura,
        revisionEsperada: cena.revision,
      });
      if (!r.ok || !r.dados) {
        // Revisão velha é o caso comum aqui (a cena mudou noutra aba, ou
        // pela janela de Configurações). Reler devolve a revisão nova e
        // o nome atual, e a pessoa tenta de novo sabendo o que havia.
        anotarErro(cena.id, r.erro ?? "Não foi possível renomear a cena.");
        void recarregar();
        return;
      }
      const gravada = r.dados.cena;
      setCenas((c) => (c ?? []).map((x) => (
        x.id === cena.id
          ? { ...x, nome: gravada.nome, local: gravada.local, resumo: gravada.resumo, revision: gravada.revision }
          : x
      )));
    } catch (e) {
      anotarErro(cena.id, e instanceof Error ? e.message : "Falha inesperada ao renomear.");
    } finally {
      marcarOcupada(cena.id, false);
    }
  }

  /**
   * Leva a MESA para uma cena — o único gesto daqui que muda o que os
   * jogadores veem.
   *
   * Manda a revisão que este cliente conhece. Se o palco andou desde
   * então (a outra aba do mesmo narrador, um co-narrador),
   * `present_vtt_scene` recusa em vez de aplicar por cima de uma
   * decisão tomada sobre estado velho — e aí a releitura mostra onde a
   * mesa realmente está.
   *
   * Não relê o catálogo no sucesso: o evento de palco chega pelo
   * Realtime e move o selo sozinho. Reler aqui seria uma segunda fonte
   * para o mesmo fato, e a corrida entre as duas é justamente o tipo de
   * divergência que essa fase existe pra não ter.
   */
  async function apresentar(cena: DadosCartaoCena) {
    marcarOcupada(cena.id, true);
    anotarErro(cena.id, null);
    try {
      const r = await apresentarCenaAction({
        campaignId: p.campaignId,
        sceneId: cena.id,
        revisionEsperada: p.palcoRevision ?? null,
      });
      if (!r.ok) {
        anotarErro(cena.id, r.erro ?? "Não foi possível apresentar a cena.");
        void recarregar();
      }
    } catch (e) {
      anotarErro(cena.id, e instanceof Error ? e.message : "Falha inesperada ao apresentar.");
    } finally {
      marcarOcupada(cena.id, false);
    }
  }

  /**
   * As três escritas de ciclo de vida (0116).
   *
   * Todas relêem o catálogo no fim, e nenhuma é otimista: duplicar cria
   * uma cena cujo conteúdo só o servidor conhece, arquivar muda em qual
   * aba a cena aparece, e excluir some com ela. Adivinhar qualquer um
   * desses no cliente seria desenhar um catálogo que talvez não exista.
   */
  async function comCena(cena: DadosCartaoCena, escrita: () => Promise<{ ok: boolean; erro?: string }>, falha: string) {
    marcarOcupada(cena.id, true);
    anotarErro(cena.id, null);
    try {
      const r = await escrita();
      if (!r.ok) { anotarErro(cena.id, r.erro ?? falha); return false; }
      await recarregar();
      return true;
    } catch (e) {
      anotarErro(cena.id, e instanceof Error ? e.message : falha);
      return false;
    } finally {
      marcarOcupada(cena.id, false);
    }
  }

  async function duplicar(cena: DadosCartaoCena, modo: ModoDuplicacao) {
    await comCena(cena,
      () => duplicarCenaAction({ campaignId: p.campaignId, sceneId: cena.id, modo }),
      "Falha ao duplicar a cena.");
  }

  async function arquivar(cena: DadosCartaoCena) {
    const ok = await comCena(cena,
      () => arquivarCenaAction({ campaignId: p.campaignId, sceneId: cena.id }),
      "Falha ao arquivar a cena.");
    // Arquivar a cena ABERTA deixaria o narrador numa cena congelada,
    // com as ferramentas todas respondendo "restaure antes de editar"
    // sem que nada na tela dissesse o porquê. Quem sabe pra onde levá-lo
    // é o `VttClient` — daqui só sai o aviso de que a cena saiu de uso.
    if (ok && cena.id === p.cenaVistaId) p.onCenaSaiuDeUso?.(cena.id);
  }

  async function restaurar(cena: DadosCartaoCena) {
    await comCena(cena,
      () => restaurarCenaAction({ campaignId: p.campaignId, sceneId: cena.id }),
      "Falha ao restaurar a cena.");
  }

  async function excluir(cena: DadosCartaoCena, nomeConfirmacao: string) {
    const ok = await comCena(cena,
      () => excluirCenaAction({ campaignId: p.campaignId, sceneId: cena.id, nomeConfirmacao }),
      "Falha ao excluir a cena.");
    if (ok && cena.id === p.cenaVistaId) p.onCenaSaiuDeUso?.(cena.id);
  }

  /**
   * Reordena otimista e confirma no servidor, uma de cada vez.
   *
   * Otimista porque arrastar precisa responder no frame do gesto.
   * Enfileirada porque `reorder_vtt_scenes` reescreve o bloco inteiro e
   * duas em voo se atropelariam no banco.
   *
   * Quando o servidor recusa, a reconciliação é uma RELEITURA, não a
   * lista de antes: com fila, "antes" é ambíguo (qual das enfileiradas?)
   * e restaurar um instantâneo qualquer deixaria uma ordem que nunca
   * existiu nem no cliente nem no banco. O catálogo do servidor é a
   * única resposta que não inventa nada.
   */
  function aplicarOrdem(nova: DadosCartaoCena[]) {
    const epoca = epocaOrdemRef.current;
    const ids = nova.map((c) => c.id);
    setCenas(nova.map((c, i) => ({ ...c, ordem: i })));
    setErro(null);

    pendentesOrdemRef.current++;
    setReordenando(true);
    filaOrdemRef.current = filaOrdemRef.current
      .then(async () => {
        if (epoca !== epocaOrdemRef.current) return; // a fila foi invalidada por uma falha anterior
        const r = await reordenarCenasAction({ campaignId: p.campaignId, sceneIds: ids })
          .catch((e) => ({ ok: false as const, erro: e instanceof Error ? e.message : "Falha ao reordenar." }));
        if (!r.ok) {
          epocaOrdemRef.current++;
          setErro(r.erro ?? "Falha ao reordenar as cenas.");
          await recarregar();
        }
      })
      .finally(() => {
        pendentesOrdemRef.current--;
        if (pendentesOrdemRef.current === 0) setReordenando(false);
      });
  }

  function mover(id: string, direcao: -1 | 1) {
    const lista = cenasRef.current ?? [];
    const de = lista.findIndex((c) => c.id === id);
    const para = de + direcao;
    if (de < 0 || para < 0 || para >= lista.length) return;
    const nova = [...lista];
    [nova[de], nova[para]] = [nova[para], nova[de]];
    aplicarOrdem(nova);
  }

  function soltarSobre(alvo: string) {
    const lista = cenasRef.current ?? [];
    const origem = arrastandoId;
    setArrastandoId(null);
    setAlvoId(null);
    if (!origem || origem === alvo) return;
    const de = lista.findIndex((c) => c.id === origem);
    const para = lista.findIndex((c) => c.id === alvo);
    if (de < 0 || para < 0) return;
    const nova = [...lista];
    const [movida] = nova.splice(de, 1);
    nova.splice(para, 0, movida);
    aplicarOrdem(nova);
  }

  const todas = cenas ?? [];
  const arquivadas = todas.filter((c) => c.arquivadaEm !== null);
  // A aba de arquivo é um FILTRO da mesma carga, não outra consulta.
  const lista = verArquivo ? arquivadas : todas.filter((c) => c.arquivadaEm === null);
  const vazio = !carregando && !erro && lista.length === 0;

  return (
    <JanelaFerramenta
      id="cenas"
      indice="11"
      acento="#c9a227"
      icone={<Clapperboard size={16} />}
      titulo="Cenas"
      modo={
        carregando && cenas === null ? "Carregando o catálogo"
          // A fila não trava o gesto, mas também não é invisível: a
          // ordem na tela ainda não é a ordem confirmada.
          : reordenando ? "Salvando a ordem…"
          : verArquivo ? `Arquivo — ${arquivadas.length === 1 ? "1 cena" : `${arquivadas.length} cenas`}`
          : lista.length === 1 ? "1 cena"
          : `${lista.length} cenas`
      }
      rotulo="Catálogo de cenas da campanha"
      rotuloFechar="Fechar o catálogo de cenas"
      aoFechar={p.onFechar}
      className="rv-cenas"
      testId="janela-cenas"
    >
      <div className="rv-fp-corpo">
        {/* CARREGANDO — só na PRIMEIRA carga. Uma releitura (depois de
            renomear, por exemplo) não pode apagar a lista da tela: o
            catálogo piscaria a cada escrita. */}
        {carregando && cenas === null && (
          <p className="rv-cena-estado" data-testid="cenas-carregando">
            <Loader2 size={14} className="rv-girando" aria-hidden="true" /> Carregando as cenas…
          </p>
        )}

        {erro && (
          <p className="rv-cena-estado" data-tipo="erro" role="alert" data-testid="cenas-erro">
            <AlertTriangle size={14} aria-hidden="true" /> {erro}
            <button type="button" className="rv-cena-mini-btn" onClick={() => void recarregar()}>Tentar de novo</button>
          </p>
        )}

        {vazio && (
          <p className="rv-cena-estado" data-testid="cenas-vazio">
            {verArquivo
              ? "Nada arquivado. Arquivar tira a cena do catálogo sem apagá-la."
              : "Nenhuma cena ainda. Crie a primeira para começar a preparar."}
          </p>
        )}

        {lista.length > 0 && (
          <ul className="rv-cena-lista" data-testid="cenas-lista">
            {lista.map((c, i) => (
              <CartaoCena
                key={c.id}
                cena={c}
                vista={c.id === p.cenaVistaId}
                ocupada={ocupadas[c.id] === true}
                erro={errosPorCena[c.id] ?? null}
                onAbrir={() => p.onAbrir(c.id)}
                onRenomear={(nome) => void renomear(c, nome)}
                miniaturaUrl={c.miniaturaImageId ? miniaturas[c.miniaturaImageId] ?? null : null}
                onApresentar={() => void apresentar(c)}
                onDuplicar={(modo) => void duplicar(c, modo)}
                onArquivar={() => void arquivar(c)}
                onRestaurar={() => void restaurar(c)}
                onExcluir={(nome) => void excluir(c, nome)}
                onMover={(d) => mover(c.id, d)}
                // As setas NÃO travam durante a fila: travar tornaria
                // "descer duas posições" um gesto que só funciona
                // esperando o servidor entre um clique e outro. A fila
                // existe exatamente pra que isso seja seguro.
                podeSubir={i > 0}
                podeDescer={i < lista.length - 1}
                arrasto={{
                  arrastando: arrastandoId === c.id,
                  alvo: alvoId === c.id && arrastandoId !== c.id,
                  onDragStart: (e) => {
                    setArrastandoId(c.id);
                    e.dataTransfer.effectAllowed = "move";
                    // Firefox não inicia arrasto sem payload.
                    e.dataTransfer.setData("text/plain", c.id);
                  },
                  onDragOver: (e) => { e.preventDefault(); setAlvoId(c.id); },
                  onDrop: (e) => { e.preventDefault(); soltarSobre(c.id); },
                  onDragEnd: () => { setArrastandoId(null); setAlvoId(null); },
                }}
              />
            ))}
          </ul>
        )}

        {criando ? (
          <div className="rv-cena-nova">
            <input
              ref={campoNovoRef}
              className="rv-cena-campo"
              value={nomeNovo}
              maxLength={120}
              placeholder="Nome da cena"
              aria-label="Nome da nova cena"
              data-testid="cena-nova-nome"
              onChange={(e) => setNomeNovo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); void criar(); }
                if (e.key === "Escape") { e.preventDefault(); setCriando(false); setNomeNovo(""); }
              }}
            />
            <button
              type="button" className="rv-cena-btn" data-testid="cena-nova-confirmar"
              disabled={nomeNovo.trim().length === 0 || salvandoNova} onClick={() => void criar()}
            >
              {salvandoNova ? <Loader2 size={13} className="rv-girando" aria-hidden="true" /> : "Criar"}
            </button>
            <button type="button" className="rv-cena-mini-btn" aria-label="Cancelar" onClick={() => { setCriando(false); setNomeNovo(""); }}>
              Cancelar
            </button>
          </div>
        ) : (
          <div className="rv-cena-rodape">
            {/* Criar some na aba de arquivo: uma cena nova nasce em uso,
                e oferecer "Nova cena" ali prometeria criar algo
                arquivado, que não existe. */}
            {!verArquivo && (
              <button
                type="button" className="rv-cena-btn" data-tipo="nova" data-testid="cena-nova"
                onClick={() => setCriando(true)}
              >
                <Plus size={14} aria-hidden="true" /> Nova cena
              </button>
            )}
            {/* O botão do arquivo só aparece quando há arquivo — ou
                quando já se está nele, pra que exista a porta de volta.
                Um "Arquivo (0)" permanente seria um item de interface
                que nunca leva a lugar nenhum. */}
            {(arquivadas.length > 0 || verArquivo) && (
              <button
                type="button" className="rv-cena-btn" data-tipo="arquivo"
                aria-pressed={verArquivo}
                data-testid="cenas-ver-arquivo"
                onClick={() => setVerArquivo((v) => !v)}
              >
                {verArquivo
                  ? <><Undo2 size={13} aria-hidden="true" /> Voltar ao catálogo</>
                  : <><Archive size={13} aria-hidden="true" /> Arquivo ({arquivadas.length})</>}
              </button>
            )}
          </div>
        )}
      </div>
    </JanelaFerramenta>
  );
}
