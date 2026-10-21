"use client";
/**
 * Bando — o inventário compartilhado REAL da campanha
 * (`campaign_inventory_items`), agrupado por categoria e pesquisável.
 *
 * Substitui os quatro itens de demonstração do painel antigo ("Aretz
 * do bando", "créditos de favor", "contato", "van de transporte"):
 * nenhum deles existe no modelo, e inventar um domínio novo só pra
 * preservar texto de exemplo seria o oposto do pedido. O modelo real é
 * instância de item — é isso que esta aba mostra.
 *
 * TRANSFERÊNCIA: arrastar um item para uma linha da aba Personagens
 * (ou usar "Enviar para…") chama a operação canônica de
 * `lib/table/crewTransfer.ts`, que preserva a INSTÂNCIA inteira
 * (cargas, munição carregada, runas, estados técnicos) e recusa
 * divisão parcial de instância com estado individual. Nunca uma
 * mutação parcial nem uma cópia rasa. Só o narrador retira do bando —
 * a RLS da migration 0019 já garante isso, e a interface não finge o
 * contrário.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, PackageOpen, RefreshCw, Send, Trash2 } from "lucide-react";
import { BotaoAba, BuscaDiretorio, CabecalhoGrupo, LinhaDiretorio, RodapeAcoes } from "./Diretorio";
import { EsqueletoLista, EstadoErro, EstadoVazio } from "./Estados";
import { SecaoDossie } from "./ui/primitivas";
import { MIME_ITEM_BANDO, agruparPorCategoria, detalhesDaInstancia, serializarItemBando, totalDeUnidades, type ItemTransferivel, } from "./bandoModelo";
import { lerBandoPainelAction, removerItemBandoAction, type BandoPainel, type ItemBandoPainel } from "./acoes/bandoPainel";
import { useRolagemVelada } from "../_shell/useRolagemVelada";
import { comecarLeitura, dadosDoEstado, falharLeitura, type EstadoAba } from "./tipos";
import { DialogoConfirmar } from "./ui/Dialogo";
import type { FichaBandoPainel } from "./acoes/bandoFichaPainel";
import { BandoFicha } from "./BandoFicha";
import "./bando.css";
export function BandoTab({ campaignId, visivel, onEnviarParaPersonagem, recarregarSinal, onAbrirJanela, fixtureVisual, fichaVisual, }: {
    campaignId: string;
    visivel: boolean;
    /** Abre a escolha explícita de personagem autorizado (o painel não adivinha destino). */
    onEnviarParaPersonagem: (item: ItemTransferivel) => void;
    /** Muda quando uma transferência concluída lá fora exige releitura desta aba. */
    recarregarSinal: number;
    /** Abre o Bando completo em JANELA INTERNA. `undefined` quando ESTA instância já é a janela. */
    onAbrirJanela?: () => void;
    /**
     * Dados prontos, só para a galeria visual em `/dev/estilos` — nunca
     * usado pela mesa real. Mesmo padrão do `dadosFixos` do
     * `CartaoTokenHover`: sem ele, a única forma de ver esta aba fora de
     * uma campanha seria o estado de erro.
     */
    fixtureVisual?: BandoPainel;
    fichaVisual?: FichaBandoPainel;
}) {
    /* O degradê nas pontas da lista — ver `useRolagemVelada`. */
    const veuDaLista = useRolagemVelada<HTMLDivElement>();
    const [estado, setEstado] = useState<EstadoAba<BandoPainel>>({ fase: "ocioso" });
    const [consulta, setConsulta] = useState("");
    const [detalheId, setDetalheId] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    /** Confirmação destrutiva sem `window.confirm` — ver `ui/Dialogo.tsx`. */
    const [confirmarRemocao, setConfirmarRemocao] = useState<ItemBandoPainel | null>(null);
    const jaCarregouRef = useRef(false);
    /** "Ficha" é o Bando Refratário v1.2 (cap. 10); "Inventário" é o que a aba já mostrava. */
    const [secao, setSecao] = useState<"visao" | "operacao" | "recursos" | "inventario">(fixtureVisual && !fichaVisual ? "inventario" : "visao");
    const carregar = useCallback(async () => {
        if (fixtureVisual) {
            setEstado({ fase: "pronto", dados: fixtureVisual });
            return;
        }
        setEstado((e) => comecarLeitura(e));
        const r = await lerBandoPainelAction(campaignId);
        setEstado((e) => (r.ok && r.dados ? { fase: "pronto", dados: r.dados } : falharLeitura(e, r.erro ?? "Falha ao carregar o bando.")));
    }, [campaignId, fixtureVisual]);
    useEffect(() => {
        if (!visivel || secao !== "inventario" || jaCarregouRef.current)
            return;
        jaCarregouRef.current = true;
        carregar();
    }, [visivel, secao, carregar]);
    // Releitura ao voltar o foco e quando uma transferência concluída
    // fora desta aba avisa (o item pode ter saído do bando).
    useEffect(() => {
        if (!visivel || !jaCarregouRef.current)
            return;
        function aoFocar() {
            carregar();
        }
        window.addEventListener("focus", aoFocar);
        return () => window.removeEventListener("focus", aoFocar);
    }, [visivel, carregar]);
    useEffect(() => {
        if (recarregarSinal === 0 || !jaCarregouRef.current)
            return;
        carregar();
    }, [recarregarSinal, carregar]);
    const dados = dadosDoEstado(estado);
    const grupos = useMemo(() => (dados ? agruparPorCategoria(dados.itens, consulta) : []), [dados, consulta]);
    const totalVisivel = useMemo(() => grupos.reduce((n, g) => n + g.itens.length, 0), [grupos]);
    const detalhe = useMemo(() => (detalheId ? (dados?.itens.find((i) => i.id === detalheId) ?? null) : null), [detalheId, dados]);
    async function remover(item: ItemBandoPainel) {
        if (fixtureVisual)
            return;
        setOcupado(true);
        try {
            const r = await removerItemBandoAction(campaignId, item.id);
            if (!r.ok) {
                setEstado((e) => falharLeitura(e, r.erro ?? "Remoção recusada."));
                return;
            }
            setDetalheId(null);
            await carregar();
        }
        finally {
            setOcupado(false);
        }
    }
    const categoriasVisiveis = grupos.length;
    const unidadesVisiveis = useMemo(() => grupos.reduce((n, g) => n + totalDeUnidades(g.itens), 0), [grupos]);
    const abas = (<nav className="bn-tabs" aria-label="Seção do bando">
      {([["visao", "Visão"], ["operacao", "Operação"], ["recursos", "Recursos"], ["inventario", "Inventário"]] as const).map(([id, nome]) => <button type="button" key={id} aria-pressed={secao === id} onClick={() => setSecao(id)} data-testid={`painel-bando-secao-${id}`}>{nome}</button>)}
    </nav>);
    return (<div className="rv-pn-aba rv-bando">
      {(!fixtureVisual || fichaVisual) && abas}
      {(!fixtureVisual || fichaVisual) && <div className="bn-view" hidden={secao === "inventario"}><BandoFicha fixtureVisual={fichaVisual} campaignId={campaignId} visivel={visivel && secao !== "inventario"} secao={secao === "inventario" ? "visao" : secao}/></div>}
      <div className="bn-view bn-inventory" hidden={secao !== "inventario"}>
      {dados && (<header className="bn-armory-header"><PackageOpen size={28}/><div><span className="bn-eyebrow">Reserva compartilhada</span><h2>Inventário do bando</h2><p>{totalVisivel} itens <span> / </span> {categoriasVisiveis} categorias <span> / </span> {unidadesVisiveis} unidades</p></div></header>)}

      <div className="rv-pn-dossie" data-detalhe={detalhe ? "true" : undefined}>
        <div className="rv-pn-dossie-lista">
          <BuscaDiretorio valor={consulta} onMudar={setConsulta} rotulo="Buscar item do bando" placeholder="Buscar item…" testId="painel-bando-busca"/>

          <div {...veuDaLista.atributos} className="rv-pn-scroll" data-testid="painel-bando-scroll">
            {estado.fase === "carregando" && <EsqueletoLista rotulo="Carregando o bando" testId="painel-bando-carregando"/>}
            {estado.fase === "erro" && (<EstadoErro mensagem={estado.mensagem} onTentarDeNovo={carregar} testId="painel-bando-erro"/>)}
            {dados && totalVisivel === 0 && estado.fase !== "carregando" && (<EstadoVazio testId="painel-bando-vazio">
                {consulta.trim() ? "Nenhum item com esse nome no bando." : "O bando ainda não tem nenhum item."}
              </EstadoVazio>)}
            {grupos.map((grupo) => (<div key={grupo.categoria} className="rv-pn-no">
                <CabecalhoGrupo rotulo={grupo.rotulo} contagem={grupo.itens.length} glifo={<PackageOpen size={13}/>} testId="painel-bando-grupo"/>
                <ul className="rv-pn-lista">
                  {grupo.itens.map((item) => (<LinhaDiretorio key={item.id} face={item.nome.slice(0, 2).toUpperCase()} nome={item.nome} acento="var(--rv-am)" subtitulo={item.subtipo ?? undefined} marca={item.quantidade > 1 ? <span className="rv-pn-tag">×{item.quantidade}</span> : undefined} selecionado={detalheId === item.id} onAbrir={() => setDetalheId(item.id)} arrastavel={!!dados?.podeAdministrar} onArrastarInicio={(e) => {
                    e.dataTransfer.setData(MIME_ITEM_BANDO, serializarItemBando({ id: item.id, nome: item.nome, quantidade: item.quantidade }));
                    e.dataTransfer.effectAllowed = "move";
                }} testId="painel-bando-linha" atributos={{ "data-row-id": item.id }}/>))}
                </ul>
              </div>))}
          </div>

          <RodapeAcoes>
            {onAbrirJanela && (<BotaoAba onClick={onAbrirJanela} testId="painel-bando-abrir">
                <ExternalLink size={13}/> Abrir Bando
              </BotaoAba>)}
            <BotaoAba desabilitado={estado.fase === "carregando"} onClick={carregar} testId="painel-bando-atualizar">
              <RefreshCw size={13}/> Atualizar
            </BotaoAba>
          </RodapeAcoes>
        </div>

        <div className="rv-pn-dossie-detalhe">
          {!detalhe && (<div className="rv-pn-dossie-vazio">
              <PackageOpen size={22} aria-hidden="true" style={{ opacity: 0.4 }}/>
              <strong>Selecione um item</strong>
              <span>Escolha um item do bando para ver o detalhe.</span>
            </div>)}
          {detalhe && (<div className="rv-fg-card" data-testid="painel-bando-detalhe" style={{ "--fg-a": "var(--rv-am)" } as React.CSSProperties}>
              <div className="rv-fg-espinha">
                <span className="rv-fg-espinha-topo">{detalhe.nome.slice(0, 2).toUpperCase()}</span>
                <span className="rv-fg-espinha-rotulo">Item</span>
                <span className="rv-fg-espinha-ponto"/>
              </div>
              <div className="rv-fg-corpo">
                <div className="rv-fg-cab">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <button type="button" className="rv-pn-voltar" onClick={() => setDetalheId(null)} data-testid="painel-bando-voltar" style={{ marginBottom: 8 }}>
                      <ArrowLeft size={13}/> Bando
                    </button>
                    <h3 className="rv-pn-detalhe-titulo">{detalhe.nome}</h3>
                    <div className="rv-pn-detalhe-sub">
                      <i />
                      {detalhe.categoria ?? "sem categoria"}
                      {detalhe.quantidade > 1 ? ` · ×${detalhe.quantidade}` : ""}

                    </div>
                  </div>
                </div>
                <div className="rv-fg-scroll">
                  {(() => {
                const linhas = detalhesDaInstancia(detalhe);
                return linhas.length === 0 ? (<EstadoVazio>Nenhum detalhe adicional registrado para este item.</EstadoVazio>) : (<SecaoDossie n="01" titulo="Condição do item">
                        <div className="rv-fg-statgrid" style={{ "--rv-fg-cols": linhas.length >= 3 ? 3 : 2 } as React.CSSProperties}>
                          {linhas.map((l) => (<div key={l.rotulo} className="rv-fg-statcell"><b>{l.valor}</b><span>{l.rotulo}</span></div>))}
                        </div>
                      </SecaoDossie>);
            })()}
                </div>
                {dados?.podeAdministrar && (<RodapeAcoes>
                    <BotaoAba desabilitado={ocupado} onClick={() => onEnviarParaPersonagem({ id: detalhe.id, nome: detalhe.nome, quantidade: detalhe.quantidade })} testId="painel-bando-enviar">
                      <Send size={13}/> Enviar para…
                    </BotaoAba>
                    <BotaoAba desabilitado={ocupado} onClick={() => setConfirmarRemocao(detalhe)} testId="painel-bando-remover">
                      <Trash2 size={13}/> Remover
                    </BotaoAba>
                  </RodapeAcoes>)}
              </div>
            </div>)}
        </div>
      </div>

      </div>
      <DialogoConfirmar aberto={confirmarRemocao !== null} titulo="Remover item do bando" mensagem={`Remover "${confirmarRemocao?.nome ?? ""}" do bando? Esta ação não pode ser desfeita.`} rotuloConfirmar="Remover" onConfirmar={() => {
            const alvo = confirmarRemocao;
            setConfirmarRemocao(null);
            if (alvo)
                void remover(alvo);
        }} onCancelar={() => setConfirmarRemocao(null)} testId="painel-bando-confirmar-remocao"/>
    </div>);
}
