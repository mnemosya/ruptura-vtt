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
import { ArrowLeft, Shield, Users, Fingerprint, Wallet, Radar, Crosshair, Flag, RefreshCw } from "lucide-react";
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
export function BandoFicha({ campaignId, visivel, secao = "visao", fixtureVisual }: {
    campaignId: string;
    visivel: boolean;
    secao?: "visao" | "operacao" | "recursos";
    fixtureVisual?: FichaBandoPainel;
}) {
    const [dados, setDados] = useState<FichaBandoPainel | null>(null);
    const [erroLeitura, setErroLeitura] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    // Rascunhos locais dos formulários.
    const [identidade, setIdentidade] = useState<Identidade>({ nome: "", simbolo: "", principio: "", contato_inicial: "", inimigo_ou_divida: "" });
    const [base, setBase] = useState<"" | "nenhum" | "parcial" | "cumprido">("");
    const [alertaOperacao, setAlertaOperacao] = useState(0);
    const [recurso, setRecurso] = useState<string | null>(null);
    const [ajuste, setAjuste] = useState<"" | "repercussao" | "quebra_publica" | "traicao_confirmada">("");
    const [pistas, setPistas] = useState(["", ""]);
    const [causaOperacao, setCausaOperacao] = useState("");
    const edicaoRevision = useRef(0);
    const [notasAlerta, setNotasAlerta] = useState("");
    const [causaAlerta, setCausaAlerta] = useState("");
    const [melhoria, setMelhoria] = useState("");
    const [novoQg, setNovoQg] = useState("");
    const [qgComprometido, setQgComprometido] = useState(false);
    const [especialista, setEspecialista] = useState("");
    const [nomeEspecialista, setNomeEspecialista] = useState("");
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
      {secao === "visao" && <>
        <header className="bn-hero">
          <span className="bn-eyebrow">Bando refratário / Central de operações</span>
          <div className="bn-identity"><div className="bn-rank" data-testid="painel-bando-ranking">{ranking}</div><div><h2>{estado.nome}</h2><span>{rankingInfo?.titulo}</span></div></div>
          {estado.principio && <p className="bn-principle">{estado.principio}</p>}
          {estado.simbolo && <span className="bn-eyebrow">{estado.simbolo}</span>}
          <div className="bn-progress-label"><strong>{estado.cobalto} <small>Cobalto</small></strong><span>{proximo ? `Ranking ${proximo.ranking} / ${proximo.cobalto}` : "Ranking máximo"}</span></div>
          <progress aria-label="Progressão Cobalto" value={proximo ? estado.cobalto - (rankingInfo?.cobalto ?? 0) : 1} max={proximo ? proximo.cobalto - (rankingInfo?.cobalto ?? 0) : 1}/>
          <p className="bn-benefit">{rankingInfo?.beneficio}</p>
        </header>
        <div className="bn-pressure-grid">
          {[{ nome: "Exposição", valor: exposicao, max: 6, estagio: exposureStageV12(exposicao) }, { nome: "Alerta imperial", valor: estado.alerta, max: 5, estagio: alertStageV12(estado.alerta) }].map(t => <article className="bn-pressure" key={t.nome} data-active={t.valor > 0}><span className="bn-eyebrow">{t.nome}</span><strong>{t.valor}<small>/{t.max}</small></strong><div className="bn-track" aria-hidden="true">{Array.from({ length: t.max }, (_, i) => <i key={i} data-lit={i < t.valor}/>)}</div><span>{t.estagio}</span></article>)}
        </div>
        <section className="bn-overview"><span className="bn-eyebrow">Base de operações</span><h3>{tipoQg?.nome ?? estado.qg.slug}</h3><div className="bn-facts"><span><b>{stats?.usados}/{stats?.capacidade}</b> instalações</span><span><b>{stats?.seguranca}/3</b> segurança</span><span><b>{aretz(estado.caixa)}</b> caixa</span></div></section>
        <section className="bn-overview"><span className="bn-eyebrow">Rastros ativos</span>{estado.exposicao_pistas.length ? <ul className="bn-clues">{estado.exposicao_pistas.map((p, i) => <li key={i}>{p.origem}</li>)}</ul> : <p>Nenhuma pista leva ao QG.</p>}</section>
      </>}
      {secao === "recursos" && !recurso && <nav className="bn-resource-menu" aria-label="Recursos do bando">{[
                ["03", "Quartel-general", tipoQg?.nome ?? "Instalações"], ["06", "Especialistas", `${estado.especialistas.length} contratos`], ["07", "Coberturas", `${estado.coberturas.filter(c => !c.comprometida).length} ativas`], ["08", "Caixa coletivo", aretz(estado.caixa)], ["04", "Exposição", exposureStageV12(exposicao)], ["05", "Alerta imperial", alertStageV12(estado.alerta)], ["01", "Identidade", estado.nome],
            ].map(([id, nome, sub]) => <button type="button" key={id} aria-expanded={recurso === id} onClick={() => { setRecurso(recurso === id ? null : id); edicaoRevision.current = registro?.revision ?? 0; if (id === "05")
                setNotasAlerta(estado.alerta_notas); if (id === "01")
                setIdentidade({ nome: estado.nome, simbolo: estado.simbolo, principio: estado.principio, contato_inicial: estado.contato_inicial, inimigo_ou_divida: estado.inimigo_ou_divida }); }}><span className="bn-resource-icon">{id === "03" ? <Shield /> : id === "06" ? <Users /> : id === "07" ? <Fingerprint /> : id === "08" ? <Wallet /> : id === "04" ? <Radar /> : id === "05" ? <Crosshair /> : <Flag />}</span><span><strong>{nome}</strong><small>{sub}</small></span><b>{recurso === id ? "−" : "+"}</b></button>)}</nav>}
      {secao === "recursos" && recurso && <button className="bn-back" type="button" onClick={() => setRecurso(null)}><ArrowLeft size={14}/> Todos os recursos</button>}
      {secao === "recursos" && recurso === "01" && (<SecaoDossie n="01" titulo="Identidade">
        {CAMPOS_IDENTIDADE.map((c) => (<Campo key={c.id} rotulo={c.rotulo} valor={identidade[c.id]} onMudar={(v) => setIdentidade((s) => ({ ...s, [c.id]: v }))} testId={`painel-bando-${c.id}`}/>))}
        <BotaoTecnico primario ocupado={ocupado} desabilitado={!identidade.nome.trim()} onClick={() => void salvarEdicao({ ...estado, ...Object.fromEntries(Object.entries(identidade).map(([k, v]) => [k, v.trim()])) }, "Identidade atualizada.")}>Salvar identidade</BotaoTecnico>
      </SecaoDossie>)}

      {secao === "operacao" && (<SecaoDossie n="02" titulo="Encerrar operação">
        <p className="rv-pn-detalhe-sub" style={{ margin: 0 }}>Registre o resultado e os rastros deixados. Confira as consequências antes de concluir.</p>
        <Linha>
          <Select label="Resultado da operação" value={base} onChange={(v) => setBase(v as typeof base)} options={[
                { id: "", rotulo: "Escolher resultado…" }, { id: "nenhum", rotulo: "Nenhum objetivo (0)" }, { id: "parcial", rotulo: "Parcial / objetivo próprio (+1)" }, { id: "cumprido", rotulo: "Objetivo cumprido (+2)" },
            ]} testId="painel-bando-base"/>
          <Select label="Ajuste (no máximo um)" value={ajuste} onChange={(v) => setAjuste(v as typeof ajuste)} options={[
                { id: "", rotulo: "Sem ajuste" }, { id: "repercussao", rotulo: "Repercussão (+1)" }, { id: "quebra_publica", rotulo: "Quebra pública (−1)" }, { id: "traicao_confirmada", rotulo: "Traição confirmada (−2)" },
            ]} testId="painel-bando-ajuste"/>
          <Campo rotulo="Nova pista do QG" valor={pistas[0]} onMudar={v => setPistas([v, pistas[1]])}/>
          <Campo rotulo="Segunda pista independente" valor={pistas[1]} onMudar={v => setPistas([pistas[0], v])}/>
          <Select label="Alerta gerado" value={String(alertaOperacao)} onChange={v => setAlertaOperacao(Number(v))} options={[{ id: "0", rotulo: "Sem aumento" }, { id: "1", rotulo: "+1 Alerta" }, { id: "2", rotulo: "+2 · causa grave e independente" }]}/>
          {alertaOperacao > 0 && <Campo rotulo="Causa do alerta" valor={causaOperacao} onMudar={setCausaOperacao} placeholder="O que chamou a atenção do Império?"/>}
          {base && <div className="bn-operation-preview"><span className="bn-eyebrow">Após a operação</span><div className="bn-facts"><span><b>{resolveOperationCobaltoV12(estado.cobalto, base, ajuste || undefined).cobalto}</b> Cobalto</span><span><b>{Math.min(6, exposicao + pistas.filter(p => p.trim()).length)}/6</b> Exposição</span><span><b>{Math.min(5, estado.alerta + alertaOperacao)}/5</b> Alerta</span></div></div>}
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
        </Linha>
      </SecaoDossie>)}

      {secao === "recursos" && recurso === "03" && (<SecaoDossie n="03" titulo={`QG · ${tipoQg?.nome ?? estado.qg.slug}`}>
        {stats && (<div className="rv-fg-statgrid" style={{ "--rv-fg-cols": 3 } as React.CSSProperties}>
            <div className="rv-fg-statcell"><b>{stats.usados}/{stats.capacidade}</b><span>Capacidade</span></div>
            <div className="rv-fg-statcell"><b>{stats.seguranca}</b><span>Segurança (máx. 3)</span></div>
            <div className="rv-fg-statcell"><b>{aretz(estado.caixa)}</b><span>Caixa</span></div>
          </div>)}
        {estado.qg.melhorias.map((m) => {
                const def = catalogo.melhorias.find((x) => x.slug === m.slug);
                return (<Linha key={m.slug}>
              <span style={{ flex: 1 }}>{def?.nome ?? m.slug}{m.aprimorada ? " (aprimorada)" : ""} · {def?.transferencia === "portatil" ? "portátil" : "fixa"}</span>
              {!m.aprimorada && def && (<BotaoTecnico ocupado={ocupado} onClick={() => void aplicar(improveUpgradeV12(estado, m.slug, catalogo), `${def.nome} aprimorada.`)}>
                  Aprimorar ({aretz(def.aprimoramento)})
                </BotaoTecnico>)}
            </Linha>);
            })}
        {melhoriasLivres.length > 0 && (<Linha>
            <Select label="Nova melhoria" value={melhoria} onChange={setMelhoria} options={[
                    { id: "", rotulo: "Escolher…" },
                    ...melhoriasLivres.map((m) => ({ id: m.slug, rotulo: `${m.nome} · ${m.ranking_minimo} · ${aretz(m.custo)}` })),
                ]} testId="painel-bando-melhoria"/>
            <BotaoTecnico ocupado={ocupado} desabilitado={!melhoria} testId="painel-bando-instalar" onClick={() => void aplicar(installUpgradeV12(estado, melhoria, catalogo), "Melhoria instalada.").then((ok) => ok && setMelhoria(""))}>
              Instalar
            </BotaoTecnico>
          </Linha>)}
        <Linha>
          <Select label="Trocar de QG" value={novoQg} onChange={setNovoQg} options={[
                { id: "", rotulo: "Escolher…" },
                ...catalogo.qgs.filter((q) => q.slug !== estado.qg.slug).map((q) => ({ id: q.slug, rotulo: `${q.nome} · ${q.ranking_minimo} · ${aretz(q.custo)}` })),
            ]} testId="painel-bando-novo-qg"/>
          <label className="rv-pn-check"><input type="checkbox" checked={qgComprometido} onChange={(e) => setQgComprometido(e.target.checked)}/> QG atual comprometido</label>
          <BotaoTecnico ocupado={ocupado} desabilitado={!novoQg} testId="painel-bando-mudar-qg" onClick={() => void aplicar(moveHeadquartersV12(estado, novoQg, catalogo, { comprometido: qgComprometido }), "QG trocado. A Exposição voltou a 0.").then((ok) => ok && setNovoQg(""))}>
            Mudar
          </BotaoTecnico>
        </Linha>
      </SecaoDossie>)}

      {secao === "recursos" && recurso === "04" && (<SecaoDossie n="04" titulo={`Exposição · ${exposureStageV12(exposicao)}`}>
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

      {secao === "recursos" && recurso === "05" && (<SecaoDossie n="05" titulo={`Alerta Imperial · ${alertStageV12(estado.alerta)}`}>
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

      {secao === "recursos" && recurso === "06" && (<SecaoDossie n="06" titulo="Especialistas">
        {estado.especialistas.length === 0 && <p className="rv-pn-detalhe-sub" style={{ margin: 0 }}>Nenhum especialista contratado.</p>}
        {estado.especialistas.map((e, i) => {
                const def = catalogo.especialistas.find((x) => x.slug === e.slug);
                return (<Linha key={`${e.slug}-${i}`}>
              <span style={{ flex: 1 }}>{e.nome ? `${e.nome} · ` : ""}{def?.nome ?? e.slug} · salário {aretz(def?.salario ?? 0)}{e.intervalos_sem_salario > 0 ? " · sem salário (indisponível)" : ""}</span>
              <BotaoTecnico ocupado={ocupado} onClick={() => void aplicar(dismissSpecialistV12(estado, i), "Contrato encerrado.")}>Dispensar</BotaoTecnico>
            </Linha>);
            })}
        <Linha>
          <Select label="Recrutar" value={especialista} onChange={setEspecialista} options={[
                { id: "", rotulo: "Escolher…" },
                ...catalogo.especialistas.map((e) => ({ id: e.slug, rotulo: `${e.nome} · ${e.ranking_minimo} · ${aretz(e.recrutamento)} / ${aretz(e.salario)}` })),
            ]} testId="painel-bando-especialista"/>
          <Campo rotulo="Nome (opcional)" valor={nomeEspecialista} onMudar={setNomeEspecialista}/>
          <BotaoTecnico ocupado={ocupado} desabilitado={!especialista} testId="painel-bando-recrutar" onClick={() => void aplicar(recruitSpecialistV12(estado, especialista, catalogo, nomeEspecialista), "Especialista recrutado.").then((ok) => { if (ok) {
            setEspecialista("");
            setNomeEspecialista("");
        } })}>
            Recrutar
          </BotaoTecnico>
        </Linha>
        {estado.especialistas.length > 0 && (<Linha>
            <BotaoTecnico ocupado={ocupado} testId="painel-bando-pagar" onClick={() => {
                    const r = payIntervalV12(estado, catalogo);
                    const partes = [`Pagos ${aretz(r.pagos)}`];
                    if (r.semSalario.length)
                        partes.push(`sem salário: ${r.semSalario.join(", ")}`);
                    if (r.encerrados.length)
                        partes.push(`contrato encerrado: ${r.encerrados.join(", ")}`);
                    void gravar(r.estado, `${partes.join("; ")}.`);
                }}>
              Pagar a retaguarda (intervalo)
            </BotaoTecnico>
          </Linha>)}
      </SecaoDossie>)}

      {secao === "recursos" && recurso === "07" && (<SecaoDossie n="07" titulo="Coberturas">
        {estado.coberturas.map((c, i) => (<Linha key={`${c.slug}-${i}`}>
            <span style={{ flex: 1, opacity: c.comprometida ? 0.55 : 1 }}>
              {catalogo.coberturas.find((x) => x.slug === c.slug)?.nome ?? c.slug} · {c.descricao}{c.comprometida ? " · comprometida" : ""}
            </span>
            {!c.comprometida && (<BotaoTecnico ocupado={ocupado} onClick={() => void gravar({ ...estado, coberturas: estado.coberturas.map((x, j) => (j === i ? { ...x, comprometida: true } : x)) })}>
                Comprometida
              </BotaoTecnico>)}
          </Linha>))}
        <Linha>
          <Select label="Nova cobertura" value={cobertura} onChange={setCobertura} options={catalogo.coberturas.map((c) => ({ id: c.slug, rotulo: `${c.nome} · ${aretz(c.custo)}` }))} testId="painel-bando-cobertura"/>
          <Campo rotulo="Identidade ou finalidade" valor={descCobertura} onMudar={setDescCobertura} testId="painel-bando-cobertura-desc"/>
          <BotaoTecnico ocupado={ocupado} desabilitado={!descCobertura.trim()} testId="painel-bando-criar-cobertura" onClick={() => void aplicar(addCoverV12(estado, cobertura, descCobertura, custosCobertura), "Cobertura criada.").then((ok) => ok && setDescCobertura(""))}>
            Criar
          </BotaoTecnico>
        </Linha>
      </SecaoDossie>)}

      {secao === "recursos" && recurso === "08" && (<SecaoDossie n="08" titulo={`Caixa coletivo · ${aretz(estado.caixa)}`}>
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
