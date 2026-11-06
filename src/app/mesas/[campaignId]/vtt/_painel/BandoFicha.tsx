"use client";
/**
 * Central do Bando (RUPTURA v1.2, capítulo 10): visão, operação e recursos.
 *
 * Todos os participantes leem e editam (decisão de 01/10/2026). Cada ação
 * passa pelo motor puro (`lib/rulesetV12/crew.ts`), que aplica os limites do
 * capítulo, e grava o estado inteiro com revisão otimista. Se outra janela
 * gravou antes, a ficha relê e avisa — nunca sobrescreve.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Users, Fingerprint, RefreshCw, ChevronRight, Building2, ChevronDown, Check, Camera } from "lucide-react";
import { addCoverV12, addExposureV12, adjustCashV12, alertStageV12, crewRankingV12, dismissSpecialistV12, exposureStageV12, improveUpgradeV12, installUpgradeV12, lowerAlertV12, moveHeadquartersV12, neutralizePistaV12, newCrewStateV12, payIntervalV12, qgStatsV12, raiseAlertV12, recruitSpecialistV12, resolveOperationCobaltoV12, type CrewResult, type CrewStateV12, } from "../../../../../lib/rulesetV12";
import { lerFichaBandoAction, salvarFichaBandoAction, transferirAretzBandoAction, type FichaBandoPainel } from "./acoes/bandoFichaPainel";
import { subscribeToCampaignCrewRealtime } from "../../../../../lib/realtime/tableRealtime";
import { EstadoCarregando, EstadoErro } from "./Estados";
import { BotaoTecnico, SecaoDossie } from "./ui/primitivas";
import { Select } from "../_dados3d/ResultadoRolagem";
type Identidade = Pick<CrewStateV12, "nome" | "simbolo" | "principio" | "contato_inicial" | "inimigo_ou_divida">;
const CAMPOS_IDENTIDADE: Array<{
    id: keyof Identidade;
    rotulo: string;
}> = [
    { id: "nome", rotulo: "Nome" },
    { id: "simbolo", rotulo: "Símbolo" },
    { id: "principio", rotulo: "Princípio" },
    { id: "contato_inicial", rotulo: "Contato inicial" },
    { id: "inimigo_ou_divida", rotulo: "Inimigo ou dívida" },
];
const aretz = (n: number) => `Ⱥ ${n.toLocaleString("pt-BR")}`;
/** Transcrição de `dialBg` do HTML de referência. */
function dialBg(total: number, cheias: number, cor: string) {
    const seg = 360 / total;
    const stops: string[] = [];
    for (let i = 0; i < total; i++) {
        const inicio = i * seg;
        const fim = (i + 1) * seg;
        const corDoSegmento = i < cheias ? cor : "rgba(127,149,179,.12)";
        stops.push(`${corDoSegmento} ${inicio}deg ${fim - 5}deg`);
        stops.push(`#050d14 ${fim - 5}deg ${fim}deg`);
    }
    return `conic-gradient(from -90deg,${stops.join(",")})`;
}
function Campo({ rotulo, valor, onMudar, onConfirmar, testId, placeholder }: {
    rotulo: string;
    valor: string;
    onMudar: (v: string) => void;
    onConfirmar?: () => void;
    testId?: string;
    placeholder?: string;
}) {
    return (<label className="rv-pn-campo">
      <span>{rotulo}</span>
      <input className="rv-pn-input" value={valor} placeholder={placeholder} onChange={(e) => onMudar(e.target.value)} onBlur={onConfirmar} onKeyDown={(e) => { if (e.key === "Enter") {
        e.preventDefault();
        onConfirmar?.();
    } }} data-testid={testId}/>
    </label>);
}
function Linha({ children }: {
    children: React.ReactNode;
}) {
    return <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginTop: 8 }}>{children}</div>;
}
const ARTE_ESPECIALISTA: Record<string, string> = {
    biomecanico: "/especialistas/biomecanic.png",
    clinico: "/especialistas/clinico.png",
    forjador: "/especialistas/forjador.png",
    informante: "/especialistas/informante.png",
    mecanico: "/especialistas/mecanico.png",
    quimico: "/especialistas/quimico.png",
    tecelao: "/especialistas/tecelão.png",
};
const POSICAO_ESPECIALISTA: Record<string, string> = {
    biomecanico: "58% 26%", clinico: "42% 28%", forjador: "54% 26%", informante: "34% 24%",
    mecanico: "52% 40%", quimico: "46% 30%", tecelao: "52% 34%",
};
function CabecalhoDetalheBando({ codigo, modulo, titulo, subtitulo, icone }: {
    codigo: string; modulo: string; titulo: string; subtitulo: string; icone: React.ReactNode;
}) {
    return <header className="bn-detail-hero"><div className="bn-detail-strip"><span>{codigo}</span><span>{modulo}</span></div><div className="bn-detail-identity"><i>{icone}</i><div><h2>{titulo}</h2><span>{subtitulo}</span></div></div></header>;
}
function TituloListaBando({ titulo, extra, cor = "cyan" }: { titulo: string; extra?: string; cor?: "cyan" | "green" }) {
    return <div className="bn-list-title" data-color={cor}><span>{titulo}</span><span>{extra}</span></div>;
}
function BandoSelect({ numero, rotulo, valor, onMudar, opcoes, perigo = false }: {
    numero: string; rotulo: string; valor: string; onMudar: (v: string) => void;
    opcoes: Array<{ id: string; rotulo: string }>; perigo?: boolean;
}) {
    const [aberto, setAberto] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!aberto) return;
        const fechar = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setAberto(false); };
        const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setAberto(false); };
        document.addEventListener("pointerdown", fechar);
        document.addEventListener("keydown", escape);
        return () => { document.removeEventListener("pointerdown", fechar); document.removeEventListener("keydown", escape); };
    }, [aberto]);
    return <div ref={ref} className="bn-op-select" data-danger={perigo || undefined} data-open={aberto || undefined}>
      <div className="bn-op-label"><b>{numero}</b><span>{rotulo}</span></div>
      <button className="bn-op-trigger" type="button" aria-expanded={aberto} onClick={() => setAberto(v => !v)}><span>{opcoes.find(o => o.id === valor)?.rotulo ?? opcoes[0]?.rotulo}</span><ChevronDown size={15}/></button>
      {aberto && <div className="bn-op-options" role="listbox">{opcoes.map(o => <button type="button" key={o.id} role="option" aria-selected={o.id === valor} onClick={() => { onMudar(o.id); setAberto(false); }}>{o.rotulo}</button>)}</div>}
    </div>;
}
export function BandoFicha({ campaignId, visivel, secao = "visao", fixtureVisual }: {
    campaignId: string;
    visivel: boolean;
    secao?: "visao" | "operacao";
    fixtureVisual?: FichaBandoPainel;
}) {
    const [dados, setDados] = useState<FichaBandoPainel | null>(fixtureVisual ?? null);
    const [erroLeitura, setErroLeitura] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    // Rascunhos locais dos formulários.
    const [identidade, setIdentidade] = useState<Identidade>({ nome: "", simbolo: "", principio: "", contato_inicial: "", inimigo_ou_divida: "" });
    const [base, setBase] = useState<"" | "nenhum" | "parcial" | "cumprido">("");
    const [alertaOperacao, setAlertaOperacao] = useState(0);
    const [recurso, setRecurso] = useState<string | null>(null);
    useEffect(() => { if (secao !== "visao") setRecurso(null); }, [secao]);
    const [ajuste, setAjuste] = useState<"" | "repercussao" | "quebra_publica" | "traicao_confirmada">("");
    const [pistas, setPistas] = useState(["", ""]);
    const [causaOperacao, setCausaOperacao] = useState("");
    const edicaoRevision = useRef(0);
    const [notasAlerta, setNotasAlerta] = useState("");
    const [causaAlerta, setCausaAlerta] = useState("");
    const [novoQg, setNovoQg] = useState("");
    const [qgComprometido, setQgComprometido] = useState(false);
    const [cobertura, setCobertura] = useState("documento_avulso");
    const [descCobertura, setDescCobertura] = useState("");
    const [valorCaixa, setValorCaixa] = useState("");
    const [personagemId, setPersonagemId] = useState("");
    const [valorTransf, setValorTransf] = useState("");
    const carregar = useCallback(async () => {
        if (fixtureVisual) {
            setDados(d => d ?? fixtureVisual);
            return;
        }
        setErroLeitura(null);
        try {
            const r = await lerFichaBandoAction(campaignId);
            if (!r.ok || !r.dados) {
                setErroLeitura(r.erro ?? "Falha ao carregar a ficha do bando.");
                return;
            }
            setDados(r.dados);
        }
        catch {
            setErroLeitura("Não foi possível carregar o bando. Tente novamente.");
        }
    }, [campaignId, fixtureVisual]);
    useEffect(() => { if (visivel)
        void carregar(); }, [visivel, carregar]);
    // Ao vivo: outra pessoa gravou o bando → relê. A própria gravação também
    // chega por aqui; a revisão já conhecida evita a releitura à toa.
    const revisaoRef = useRef(0);
    revisaoRef.current = dados?.registro?.revision ?? 0;
    useEffect(() => {
        if (!visivel || fixtureVisual)
            return;
        return subscribeToCampaignCrewRealtime({
            campaignId,
            onChange: (evento) => {
                const revisao = (evento.new as {
                    revision?: number;
                } | null)?.revision;
                if (revisao !== undefined && revisao === revisaoRef.current)
                    return;
                void carregar();
            },
        });
    }, [visivel, campaignId, carregar, fixtureVisual]);
    useEffect(() => {
        if (!visivel)
            return;
        const aoFocar = () => void carregar();
        window.addEventListener("focus", aoFocar);
        return () => window.removeEventListener("focus", aoFocar);
    }, [visivel, carregar]);
    const catalogo = dados?.catalogo;
    const registro = dados?.registro ?? null;
    const estado = registro?.state ?? null;
    const gravando = useRef(false);
    async function gravar(proximo: CrewStateV12, mensagem?: string) {
        if (gravando.current)
            return false;
        gravando.current = true;
        setOcupado(true);
        try {
            if (fixtureVisual) {
                setDados(d => d ? { ...d, registro: { state: proximo, revision: (d.registro?.revision ?? 0) + 1 } } : d);
                setAviso(mensagem ?? "Alteração local registrada.");
                return true;
            }
            setAviso(null);
            const r = await salvarFichaBandoAction(campaignId, proximo, registro?.revision ?? 0);
            setOcupado(false);
            if (!r.ok || !r.dados) {
                setAviso(r.erro ?? "Falha ao salvar.");
                return false;
            }
            if ("conflito" in r.dados) {
                setAviso("Outra pessoa alterou o bando agora há pouco. A ficha foi recarregada; refaça a ação se ainda fizer sentido.");
                await carregar();
                return false;
            }
            setDados((d) => (d ? { ...d, registro: { state: proximo, revision: (r.dados as {
                        revisao: number;
                    }).revisao } } : d));
            if (mensagem)
                setAviso(mensagem);
            return true;
        }
        catch {
            setAviso("Não foi possível salvar. Tente novamente.");
            return false;
        }
        finally {
            gravando.current = false;
            setOcupado(false);
        }
    }
    async function salvarEdicao(proximo: CrewStateV12, mensagem: string) {
        if (edicaoRevision.current !== registro?.revision) {
            edicaoRevision.current = registro?.revision ?? 0;
            setAviso("O bando mudou durante a edição. Confira seu rascunho antes de salvar novamente.");
            return;
        }
        await gravar(proximo, mensagem);
    }
    async function aplicar(resultado: CrewResult<CrewStateV12>, mensagem?: string) {
        if (!resultado.ok) {
            setAviso(resultado.error);
            return false;
        }
        return gravar(resultado.value, mensagem);
    }
    const stats = useMemo(() => (estado && catalogo ? qgStatsV12(estado, catalogo) : null), [estado, catalogo]);
    const ranking = estado && catalogo ? crewRankingV12(estado.cobalto, catalogo) : "F";
    const rankingInfo = catalogo?.rankings.find((r) => r.ranking === ranking);
    const proximo = catalogo?.rankings.find((r) => r.cobalto > (estado?.cobalto ?? 0));
    async function transferir(paraBando: boolean) {
        const valor = Number(valorTransf);
        if (!personagemId || !Number.isSafeInteger(valor) || valor <= 0 || ocupado)
            return;
        if (fixtureVisual) {
            setAviso("Transferências ficam disponíveis na campanha real.");
            return;
        }
        setOcupado(true);
        setAviso(null);
        try {
            const r = await transferirAretzBandoAction(campaignId, personagemId, valor, paraBando);
            setOcupado(false);
            if (!r.ok || !r.dados) {
                setAviso(r.erro ?? "Falha ao transferir.");
                return;
            }
            const nome = dados?.personagens.find((x) => x.id === personagemId)?.nome ?? "personagem";
            setAviso(`${aretz(valor)} ${paraBando ? `de ${nome} para o caixa` : `do caixa para ${nome}`}. Caixa: ${aretz(r.dados.caixa)}; ${nome}: ${aretz(r.dados.saldoPersonagem)}.`);
            setValorTransf("");
            await carregar();
        }
        catch {
            setAviso("Não foi possível transferir. Tente novamente.");
        }
        finally {
            setOcupado(false);
        }
    }
    if (erroLeitura && !dados)
        return <EstadoErro mensagem={erroLeitura} onTentarDeNovo={carregar} testId="painel-bando-ficha-erro"/>;
    if (!dados || !catalogo)
        return <EstadoCarregando testId="painel-bando-ficha-carregando"/>;
    // ── Fundar o bando ────────────────────────────────────────────────
    if (!estado) {
        return (<div className="rv-pn-scroll" data-testid="painel-bando-ficha-fundar" style={{ padding: "4px 2px" }}>
        <SecaoDossie n="01" titulo="Fundar o bando">
          <p className="rv-pn-detalhe-sub" style={{ margin: "0 0 4px" }}>
            O bando é opcional. Ele começa no Ranking F, com 0 Cobalto, Exposição e Alerta Imperial em 0, num Refúgio Improvisado.
          </p>
          {CAMPOS_IDENTIDADE.map((c) => (<Campo key={c.id} rotulo={c.rotulo} valor={identidade[c.id]} onMudar={(v) => setIdentidade((s) => ({ ...s, [c.id]: v }))} testId={`painel-bando-fundar-${c.id}`}/>))}
          <Linha>
            <BotaoTecnico primario acento="am" ocupado={ocupado} desabilitado={!identidade.nome.trim()} onClick={() => void gravar(newCrewStateV12({
                nome: identidade.nome.trim(), simbolo: identidade.simbolo.trim(), principio: identidade.principio.trim(),
                contato_inicial: identidade.contato_inicial.trim(), inimigo_ou_divida: identidade.inimigo_ou_divida.trim(),
            }), "Bando fundado.")} testId="painel-bando-fundar">
              Fundar bando
            </BotaoTecnico>
          </Linha>
          {aviso && <p role="status" className="rv-pn-detalhe-sub" data-testid="painel-bando-aviso">{aviso}</p>}
        </SecaoDossie>
      </div>);
    }
    const tipoQg = catalogo.qgs.find((q) => q.slug === estado.qg.slug);
    const melhoriasLivres = catalogo.melhorias.filter((m) => !estado.qg.melhorias.some((x) => x.slug === m.slug));
    const exposicao = estado.exposicao_pistas.length;
    const custosCobertura = Object.fromEntries(catalogo.coberturas.map((c) => [c.slug, c.custo]));
    return (<div className="rv-pn-scroll" data-testid="painel-bando-ficha" style={{ padding: "4px 2px" }}>
      {aviso && <p role="status" className="bn-notice" data-testid="painel-bando-aviso">{aviso}</p>}
      {erroLeitura && <p role="alert" className="bn-notice">{erroLeitura}</p>}
      {secao === "visao" && !recurso && <>
        <header className="bn-hero">
          <div className="bn-hero-top"><span>Bando refratário</span><span>Central de operações <i/></span></div>
          <div className="bn-identity"><button type="button" className="bn-emblem" aria-label="Editar identidade do bando" onClick={() => {setRecurso("01");setIdentidade({nome:estado.nome,simbolo:estado.simbolo,principio:estado.principio,contato_inicial:estado.contato_inicial,inimigo_ou_divida:estado.inimigo_ou_divida});edicaoRevision.current=registro?.revision??0}}><span className="bn-emblem-hex"><span><Users size={23}/></span></span><span className="bn-emblem-camera"><Camera size={11}/></span></button><div><button className="bn-name" type="button" onClick={() => {setRecurso("01");setIdentidade({nome:estado.nome,simbolo:estado.simbolo,principio:estado.principio,contato_inicial:estado.contato_inicial,inimigo_ou_divida:estado.inimigo_ou_divida});edicaoRevision.current=registro?.revision??0}}>{estado.nome}</button><span>{rankingInfo?.titulo}</span></div></div>
          <div className="bn-rank-ladder" aria-label={`Ranking ${ranking}`} data-testid="painel-bando-ranking">{["F","E","D","C","B","A","S"].map(letra=><span key={letra} data-active={letra===ranking} data-past={["F","E","D","C","B","A","S"].indexOf(letra)<["F","E","D","C","B","A","S"].indexOf(ranking)}>{letra}</span>)}</div>
          {estado.principio && <p className="bn-principle">{estado.principio}</p>}
          <div className="bn-progress-label"><strong>{estado.cobalto} <small>Cobalto</small></strong><span>{proximo ? `Ranking ${proximo.ranking} · ${proximo.cobalto}` : "Ranking máximo"}</span></div>
          <div className="bn-cobalt-track" role="progressbar" aria-label="Progressão Cobalto" aria-valuenow={estado.cobalto} aria-valuemax={proximo?.cobalto??estado.cobalto}>{Array.from({length:Math.max(1,(proximo?.cobalto??estado.cobalto)-(rankingInfo?.cobalto??0))},(_,i)=><i key={i} data-lit={i<estado.cobalto-(rankingInfo?.cobalto??0)}/>)}</div>
        </header>
        <div className="bn-pressure-grid">
          {[{ nome: "Exposição", valor: exposicao, max: 6, estagio: exposureStageV12(exposicao), id: "04", cor: "#f5a200" }, { nome: "Alerta imperial", valor: estado.alerta, max: 5, estagio: alertStageV12(estado.alerta), id: "05", cor: "#ff6b7d" }].map(t => <button type="button" className="bn-pressure" key={t.nome} onClick={()=>{setRecurso(t.id);if(t.id==="05")setNotasAlerta(estado.alerta_notas);edicaoRevision.current=registro?.revision??0}} data-active={t.valor > 0}><div className="bn-pressure-top"><span>{t.nome}</span><i/></div><div className="bn-pressure-dial" style={{ background: dialBg(t.max, t.valor, t.cor) }}><strong>{t.valor}<small>/{t.max}</small></strong></div><span>{t.estagio}</span></button>)}
        </div>
        <section className="bn-overview bn-base"><div className="bn-section-top"><span>ID://Base de operações</span><span>QG</span></div><button className="bn-base-name" type="button" onClick={()=>setRecurso("09")}><Building2 size={18}/>{tipoQg?.nome ?? estado.qg.slug}</button><div className="bn-facts"><button type="button" onClick={()=>setRecurso("03")}><b>{stats?.usados}/{stats?.capacidade}</b><span>Instalações</span></button><button type="button" onClick={()=>setRecurso("03")}><b>{stats?.seguranca}/3</b><span>Segurança</span></button><button type="button" onClick={()=>setRecurso("08")}><b>{aretz(estado.caixa)}</b><span>Caixa</span></button></div></section>
        <section className="bn-overview bn-assets"><div className="bn-section-top"><span>ID://Ativos do bando</span><span>MOD.ASSET</span></div><div className="bn-asset-list"><button type="button" onClick={() => setRecurso("06")}><i><Users size={16}/></i><strong>Especialistas</strong><small>{estado.especialistas.length} contratos</small><ChevronRight size={14}/></button><button type="button" onClick={() => setRecurso("07")}><i><Fingerprint size={16}/></i><strong>Coberturas</strong><small>{estado.coberturas.filter(c=>!c.comprometida).length} ativas</small><ChevronRight size={14}/></button><button type="button" onClick={() => setRecurso("03")}><i><Building2 size={16}/></i><strong>Melhorias do QG</strong><small>{estado.qg.melhorias.length} instaladas</small><ChevronRight size={14}/></button></div></section>
        <section className="bn-overview bn-traces"><div className="bn-section-top"><span>ID://Rastros ativos</span><span>{String(estado.exposicao_pistas.length).padStart(2,"0")}</span></div>{estado.exposicao_pistas.length ? <div className="bn-clues">{estado.exposicao_pistas.map((p, i) => <div key={i}><i/>{p.origem}</div>)}</div> : <p>Nenhuma pista leva ao QG.</p>}</section>
      </>}
      {secao === "visao" && recurso && <button className="bn-back" type="button" onClick={() => setRecurso(null)}><ArrowLeft size={14}/> Voltar à visão</button>}
      {secao === "visao" && recurso === "01" && (<SecaoDossie n="01" titulo="Identidade">
        {CAMPOS_IDENTIDADE.map((c) => (<Campo key={c.id} rotulo={c.rotulo} valor={identidade[c.id]} onMudar={(v) => setIdentidade((s) => ({ ...s, [c.id]: v }))} testId={`painel-bando-${c.id}`}/>))}
        <BotaoTecnico primario ocupado={ocupado} desabilitado={!identidade.nome.trim()} onClick={() => void salvarEdicao({ ...estado, ...Object.fromEntries(Object.entries(identidade).map(([k, v]) => [k, v.trim()])) }, "Identidade atualizada.")}>Salvar identidade</BotaoTecnico>
      </SecaoDossie>)}

      {secao === "operacao" && (<div className="bn-operation"><div className="bn-operation-head"><h2>Encerrar operação</h2><div className="bn-debrief"><span>Debrief</span><p>Registre o resultado e os rastros. As consequências valem ao concluir.</p></div></div>
        <div className="bn-operation-fields">
          <BandoSelect numero="01" rotulo="Resultado da operação" valor={base} onMudar={(v) => setBase(v as typeof base)} opcoes={[
                { id: "", rotulo: "Escolher resultado…" }, { id: "nenhum", rotulo: "Nenhum objetivo (0)" }, { id: "parcial", rotulo: "Parcial / objetivo próprio (+1)" }, { id: "cumprido", rotulo: "Objetivo cumprido (+2)" },
            ]}/>
          <BandoSelect numero="02" rotulo="Ajuste · no máximo um" valor={ajuste} onMudar={(v) => setAjuste(v as typeof ajuste)} opcoes={[
                { id: "", rotulo: "Sem ajuste" }, { id: "repercussao", rotulo: "Repercussão (+1)" }, { id: "quebra_publica", rotulo: "Quebra pública (−1)" }, { id: "traicao_confirmada", rotulo: "Traição confirmada (−2)" },
            ]}/>
          <div className="bn-op-clues"><div className="bn-op-label"><b>03</b><span>Pistas deixadas</span><em>cada uma +1 à Exposição</em></div>{[0,1].map(i=><div key={i}><button type="button" className="bn-op-toggle" aria-pressed={!!pistas[i]} onClick={()=>setPistas(p=>p.map((v,j)=>j===i?(v?"":"Pista do QG"):v))}><i>{pistas[i]&&<Check size={11}/>}</i><span>{i===0?"Nova pista do QG":"Segunda pista independente"}</span>{pistas[i]&&<b>+1 EXPO.</b>}</button>{pistas[i]&&<input className="bn-op-clue-input" aria-label={i===0?"Descrição da pista do QG":"Descrição da segunda pista"} value={pistas[i]} onChange={e=>setPistas(p=>p.map((v,j)=>j===i?e.target.value:v))}/>}</div>)}</div>
          <BandoSelect numero="04" rotulo="Alerta gerado" perigo valor={String(alertaOperacao)} onMudar={v => setAlertaOperacao(Number(v))} opcoes={[{ id: "0", rotulo: "Sem aumento" }, { id: "1", rotulo: "+1 Alerta" }, { id: "2", rotulo: "+2 · causa grave e independente" }]}/>
          {alertaOperacao > 0 && <Campo rotulo="Causa do alerta" valor={causaOperacao} onMudar={setCausaOperacao} placeholder="O que chamou a atenção do Império?"/>}
          {base && <div className="bn-operation-preview"><span className="bn-eyebrow">Projeção · após a operação</span><div className="bn-facts"><span><b>{resolveOperationCobaltoV12(estado.cobalto, base, ajuste || undefined).cobalto}</b> Cobalto</span><span><b>{Math.min(6, exposicao + pistas.filter(p => p.trim()).length)}/6</b> Exposição</span><span><b>{Math.min(5, estado.alerta + alertaOperacao)}/5</b> Alerta</span></div></div>}
          <BotaoTecnico primario acento="am" ocupado={ocupado} desabilitado={!base || (alertaOperacao > 0 && !causaOperacao.trim())} testId="painel-bando-operacao" onClick={async () => {
                if (!base || (alertaOperacao > 0 && !causaOperacao.trim()))
                    return;
                const r = resolveOperationCobaltoV12(estado.cobalto, base, ajuste || undefined);
                let proximoEstado = { ...estado, cobalto: r.cobalto };
                const novas = pistas.map(p => p.trim()).filter(Boolean);
                if (novas.length) {
                    const e = addExposureV12(proximoEstado, novas, new Date().toISOString());
                    if (!e.ok) {
                        setAviso(e.error);
                        return;
                    }
                    proximoEstado = e.value;
                }
                if (alertaOperacao) {
                    const a = raiseAlertV12(proximoEstado, alertaOperacao);
                    if (!a.ok) {
                        setAviso(a.error);
                        return;
                    }
                    proximoEstado = { ...a.value, alerta_notas: [estado.alerta_notas, causaOperacao.trim()].filter(Boolean).join("\n") };
                }
                if (await gravar(proximoEstado, "Operação registrada. Cobalto, Exposição e Alerta atualizados.")) {
                    setBase("");
                    setAjuste("");
                    setPistas(["", ""]);
                    setAlertaOperacao(0);
                    setCausaOperacao("");
                }
            }}>Concluir operação</BotaoTecnico>
        </div>
      </div>)}

      {secao === "visao" && recurso === "03" && <div className="bn-detail-page">
        <CabecalhoDetalheBando codigo="ID://MELHORIAS DO QG" modulo="QG" titulo="Melhorias do QG" subtitulo={tipoQg?.nome ?? estado.qg.slug} icone={<Building2 size={20}/>}/>
        {stats && <div className="bn-detail-stats"><div><b>{stats.usados}/{stats.capacidade}</b><span>Instalações</span></div><div><b>{stats.seguranca}/3</b><span>Segurança</span></div></div>}
        <TituloListaBando titulo="Instaladas" extra={`${String(estado.qg.melhorias.length).padStart(2,"0")} NO QG`} cor="green"/>
        {estado.qg.melhorias.length === 0 && <div className="bn-detail-empty">◆ Nenhuma melhoria instalada no QG.</div>}
        {estado.qg.melhorias.map(m => { const def=catalogo.melhorias.find(x=>x.slug===m.slug); return <article className="bn-upgrade-card" key={m.slug}><div className="bn-upgrade-top"><strong>{def?.nome??m.slug}</strong><span>Rk {def?.ranking_minimo}</span></div><p>{m.aprimorada ? def?.efeito_aprimorado??def?.efeito : def?.efeito}</p><div className="bn-upgrade-foot"><span>{m.aprimorada?"APRIMORADA":"INSTALADA"} · {def?.transferencia==="portatil"?"Portátil":"Fixa"}</span>{!m.aprimorada&&def&&<button type="button" disabled={ocupado} onClick={()=>void aplicar(improveUpgradeV12(estado,m.slug,catalogo),`${def.nome} aprimorada.`)}>+ APRIMORAR · {aretz(def.aprimoramento)}</button>}</div></article> })}
        <TituloListaBando titulo="Disponíveis" extra="CUSTO · SEG"/>
        {melhoriasLivres.map(m=><article className="bn-upgrade-card" key={m.slug}><div className="bn-upgrade-top"><strong>{m.nome}</strong><span>Rk {m.ranking_minimo}</span></div><p>{m.efeito}</p><div className="bn-upgrade-foot"><span><small>CUSTO</small> {aretz(m.custo)} <small>{m.transferencia==="portatil"?"Portátil":"Fixa"}</small> {m.seguranca>0&&<em>+{m.seguranca} SEG</em>}</span><button type="button" disabled={ocupado} data-testid={`painel-bando-instalar-${m.slug}`} onClick={()=>void aplicar(installUpgradeV12(estado,m.slug,catalogo),"Melhoria instalada.")}>+ INSTALAR</button></div></article>)}
      </div>}

      {secao === "visao" && recurso === "09" && <SecaoDossie n="03" titulo={`QG · ${tipoQg?.nome ?? estado.qg.slug}`}>
        <Select label="Trocar de QG" value={novoQg} onChange={setNovoQg} options={[{id:"",rotulo:"Escolher…"},...catalogo.qgs.filter(q=>q.slug!==estado.qg.slug).map(q=>({id:q.slug,rotulo:`${q.nome} · ${q.ranking_minimo} · ${aretz(q.custo)}`}))]} testId="painel-bando-novo-qg"/>
        <label className="rv-pn-check"><input type="checkbox" checked={qgComprometido} onChange={e=>setQgComprometido(e.target.checked)}/> QG atual comprometido</label>
        <BotaoTecnico ocupado={ocupado} desabilitado={!novoQg} testId="painel-bando-mudar-qg" onClick={()=>void aplicar(moveHeadquartersV12(estado,novoQg,catalogo,{comprometido:qgComprometido}),"QG trocado. A Exposição voltou a 0.").then(ok=>ok&&setNovoQg(""))}>Mudar</BotaoTecnico>
      </SecaoDossie>}

      {secao === "visao" && recurso === "04" && (<SecaoDossie n="04" titulo={`Exposição · ${exposureStageV12(exposicao)}`}>
        {estado.exposicao_pistas.length === 0 && <p className="rv-pn-detalhe-sub" style={{ margin: 0 }}>Nenhuma pista leva ao QG.</p>}
        {estado.exposicao_pistas.map((p, i) => (<Linha key={`${p.origem}-${i}`}>
            <span style={{ flex: 1 }}>{i + 1}. {p.origem}</span>
            <BotaoTecnico ocupado={ocupado} onClick={() => void aplicar(neutralizePistaV12(estado, i), "Pista neutralizada.")}>Neutralizar</BotaoTecnico>
          </Linha>))}
        <Linha>
          <Campo rotulo="Pista nova" valor={pistas[0]} onMudar={(v) => setPistas([v, pistas[1]])} placeholder="o que permite localizar o QG" testId="painel-bando-pista-1"/>
          <Campo rotulo="Segunda pista (independente)" valor={pistas[1]} onMudar={(v) => setPistas([pistas[0], v])} testId="painel-bando-pista-2"/>
          <BotaoTecnico ocupado={ocupado} desabilitado={!pistas[0].trim() && !pistas[1].trim()} testId="painel-bando-registrar-pistas" onClick={() => {
                const novas = pistas.filter((p) => p.trim());
                void aplicar(addExposureV12(estado, novas, new Date().toISOString()), "Exposição registrada.").then((ok) => ok && setPistas(["", ""]));
            }}>
            Registrar
          </BotaoTecnico>
        </Linha>
      </SecaoDossie>)}

      {secao === "visao" && recurso === "05" && (<SecaoDossie n="05" titulo={`Alerta Imperial · ${alertStageV12(estado.alerta)}`}>
        <Linha>
          <BotaoTecnico ocupado={ocupado} desabilitado={estado.alerta >= 5} onClick={() => void aplicar(raiseAlertV12(estado, 1))}>+1</BotaoTecnico>
          <BotaoTecnico ocupado={ocupado} desabilitado={estado.alerta >= 4} onClick={() => void aplicar(raiseAlertV12(estado, 2))}>+2 (causa grave e independente)</BotaoTecnico>
        </Linha>
        <Linha>
          <Campo rotulo="Causa da redução" valor={causaAlerta} onMudar={setCausaAlerta} placeholder="ex.: investigação redirecionada" testId="painel-bando-causa-alerta"/>
          <BotaoTecnico ocupado={ocupado} desabilitado={estado.alerta === 0 || !causaAlerta.trim()} testId="painel-bando-reduzir-alerta" onClick={() => void aplicar(lowerAlertV12(estado, causaAlerta), "Alerta reduzido.").then((ok) => ok && setCausaAlerta(""))}>
            −1
          </BotaoTecnico>
        </Linha>
        <Campo rotulo="Identidades conhecidas e investigação ativa" valor={notasAlerta} onMudar={setNotasAlerta} testId="painel-bando-alerta-notas"/>
        <BotaoTecnico ocupado={ocupado} onClick={() => void salvarEdicao({ ...estado, alerta_notas: notasAlerta }, "Investigação atualizada.")}>Salvar investigação</BotaoTecnico>
      </SecaoDossie>)}

      {secao === "visao" && recurso === "06" && <div className="bn-detail-page">
        <CabecalhoDetalheBando codigo="ID://ESPECIALISTAS" modulo="RETAGUARDA ●" titulo="Especialistas" subtitulo={`RETAGUARDA · ${estado.especialistas.length} EM CONTRATO`} icone={<Users size={20}/>}/>
        <TituloListaBando titulo="No bando" extra={`${estado.especialistas.length} em contrato`} cor="green"/>
        {estado.especialistas.length === 0 && <div className="bn-detail-empty">◆ Nenhum especialista em contrato.</div>}
        {estado.especialistas.map((e,i)=>{const def=catalogo.especialistas.find(x=>x.slug===e.slug);return <article className="bn-hired-card" key={`${e.slug}-${i}`}><div><strong>{e.nome?`${e.nome} · `:""}{def?.nome??e.slug}</strong><span>{def?.area} · salário {aretz(def?.salario??0)}{e.intervalos_sem_salario>0?" · indisponível":""}</span></div><button type="button" disabled={ocupado} onClick={()=>void aplicar(dismissSpecialistV12(estado,i),"Contrato encerrado.")}>DISPENSAR</button></article>})}
        {estado.especialistas.length>0&&<button className="bn-pay-button" type="button" disabled={ocupado} data-testid="painel-bando-pagar" onClick={()=>{const r=payIntervalV12(estado,catalogo);const partes=[`Pagos ${aretz(r.pagos)}`];if(r.semSalario.length)partes.push(`sem salário: ${r.semSalario.join(", ")}`);if(r.encerrados.length)partes.push(`contrato encerrado: ${r.encerrados.join(", ")}`);void gravar(r.estado,`${partes.join("; ")}.`)}}>Pagar a retaguarda · intervalo</button>}
        <TituloListaBando titulo="Disponíveis para recrutar" extra="REC · SAL"/>
        {catalogo.especialistas.map(e=><article className="bn-specialist-card" key={e.slug}>
          <div className="bn-specialist-art"><img src={ARTE_ESPECIALISTA[e.slug]} alt="" loading="lazy" style={{objectPosition:POSICAO_ESPECIALISTA[e.slug]??"center"}}/><span className="bn-specialist-grade" data-kind={e.slug}/></div>
          <div className="bn-specialist-copy"><small>{catalogo.areas_de_apoio.find(a=>a.slug===e.area)?.nome??e.area}</small><strong>{e.nome}</strong><span>REC {aretz(e.recrutamento)} &nbsp; SAL {aretz(e.salario)}</span><button type="button" disabled={ocupado} data-testid={`painel-bando-recrutar-${e.slug}`} onClick={()=>void aplicar(recruitSpecialistV12(estado,e.slug,catalogo),"Especialista recrutado.")}>+ RECRUTAR</button></div>
          <span className="bn-specialist-rank">RK {e.ranking_minimo}</span>
        </article>)}
      </div>}

      {secao === "visao" && recurso === "07" && <div className="bn-detail-page">
        <CabecalhoDetalheBando codigo="ID://COBERTURAS" modulo="IDENTIDADES" titulo="Coberturas" subtitulo={`${estado.coberturas.filter(c=>!c.comprometida).length} ATIVAS · ${estado.coberturas.length} REGISTRADAS`} icone={<Fingerprint size={20}/>}/>
        {estado.coberturas.length===0&&<div className="bn-detail-empty">◆ Nenhuma cobertura registrada.</div>}
        {estado.coberturas.map((c,i)=><article className="bn-cover-registered" key={`${c.slug}-${i}`}><div><strong>{catalogo.coberturas.find(x=>x.slug===c.slug)?.nome??c.slug}</strong><span>{c.descricao} · {c.comprometida?"COMPROMETIDA":"ATIVA"}</span></div>{!c.comprometida&&<button type="button" disabled={ocupado} onClick={()=>void gravar({...estado,coberturas:estado.coberturas.map((x,j)=>j===i?{...x,comprometida:true}:x)})}>COMPROMETER</button>}</article>)}
        <TituloListaBando titulo="Forjar identidade" extra="Custo"/>
        {catalogo.coberturas.map(c=><div className="bn-cover-row" key={c.slug}><div className="bn-cover-main"><i><Fingerprint size={14}/></i><div><strong>{c.nome}</strong><span>NOVA IDENTIDADE</span></div><span className="bn-cover-cost"><small>CUSTO</small>{aretz(c.custo)}</span><button type="button" disabled={ocupado} data-testid={`painel-bando-criar-${c.slug}`} onClick={()=>{if(cobertura!==c.slug){setCobertura(c.slug);setDescCobertura("");return}if(!descCobertura.trim())return;void aplicar(addCoverV12(estado,c.slug,descCobertura,custosCobertura),"Cobertura criada.").then(ok=>{if(ok){setCobertura("");setDescCobertura("")}})}}>+ CRIAR</button></div>{cobertura===c.slug&&<input autoFocus className="bn-cover-purpose" aria-label={`Identidade ou finalidade de ${c.nome}`} placeholder="Identidade ou finalidade" value={descCobertura} onChange={e=>setDescCobertura(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&descCobertura.trim()){e.preventDefault();void aplicar(addCoverV12(estado,c.slug,descCobertura,custosCobertura),"Cobertura criada.").then(ok=>{if(ok){setCobertura("");setDescCobertura("")}})}}}/>}</div>)}
      </div>}

      {secao === "visao" && recurso === "08" && (<SecaoDossie n="08" titulo={`Caixa coletivo · ${aretz(estado.caixa)}`}>
        <Linha>
          <Campo rotulo="Valor (Ⱥ)" valor={valorCaixa} onMudar={(v) => setValorCaixa(v.replace(/[^\d]/g, ""))} testId="painel-bando-caixa-valor"/>
          <BotaoTecnico ocupado={ocupado} desabilitado={!valorCaixa} testId="painel-bando-caixa-entrar" onClick={() => void aplicar(adjustCashV12(estado, Number(valorCaixa))).then((ok) => ok && setValorCaixa(""))}>Depositar</BotaoTecnico>
          <BotaoTecnico ocupado={ocupado} desabilitado={!valorCaixa} testId="painel-bando-caixa-sair" onClick={() => void aplicar(adjustCashV12(estado, -Number(valorCaixa))).then((ok) => ok && setValorCaixa(""))}>Retirar</BotaoTecnico>
          <BotaoTecnico onClick={() => void carregar()} icone={<RefreshCw size={13}/>}>Atualizar</BotaoTecnico>
        </Linha>
        {dados.personagens.length > 0 && (<Linha>
            <Select label="Personagem" value={personagemId} onChange={setPersonagemId} options={[
                    { id: "", rotulo: "Escolher…" },
                    ...dados.personagens.map((x) => ({ id: x.id, rotulo: `${x.nome} · ${aretz(x.aretz)}` })),
                ]} testId="painel-bando-transf-personagem"/>
            <Campo rotulo="Valor (Ⱥ)" valor={valorTransf} onMudar={(v) => setValorTransf(v.replace(/[^\d]/g, ""))} testId="painel-bando-transf-valor"/>
            <BotaoTecnico ocupado={ocupado} desabilitado={!personagemId || !valorTransf} testId="painel-bando-transf-para-bando" onClick={() => void transferir(true)}>Carteira → caixa</BotaoTecnico>
            <BotaoTecnico ocupado={ocupado} desabilitado={!personagemId || !valorTransf} testId="painel-bando-transf-para-personagem" onClick={() => void transferir(false)}>Caixa → carteira</BotaoTecnico>
          </Linha>)}
      </SecaoDossie>)}
    </div>);
}
