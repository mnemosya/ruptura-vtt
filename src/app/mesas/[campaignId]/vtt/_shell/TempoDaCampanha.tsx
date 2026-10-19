"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft, ChevronRight, ChevronUp, Cloud, CloudDrizzle, CloudFog, CloudLightning,
  CloudRain, CloudRainWind, CloudSnow, CloudSun, CloudSunRain, Clock, Dices, Gem, Plus, Snowflake, X,
  Sun, Wind, Zap, type LucideIcon,
} from "lucide-react";
import { getBrowserSupabaseClient } from "../../../../../lib/supabase/browserClient";
import { lerTempoCampanhaAction, salvarTempoCampanhaAction } from "../_acoes/tempoActions";
import {
  CONDICOES_CLIMATICAS, MESES_IMPERIAIS, REGIOES, VENTOS, NOMES_VENTO, TEMPO_VAZIO,
  ajustarContextoManual, avancarTempoImperial, condicaoEspecial, dataDeMinutoImperial, definirClimaManual,
  diaDaSemanaImperial, estacaoDoMes, minutoImperial, mudarMesImperial, nomeCondicao,
  sortearClima, validarTempo, type Condicao, type TempoCampanha,
} from "../_dominio/tempoCampanha";
import { listarMarcacoesAction, criarMarcacaoAction } from "../_acoes/marcacoesCalendarioActions";
import {
  NOMES_TIPO_MARCACAO, NOMES_VISIBILIDADE, TIPOS_MARCACAO, TITULO_MARCACAO_MAX, VISIBILIDADES_MARCACAO,
  diasEntre, distanciaRelativa, type MarcacaoCalendario, type TipoMarcacao, type VisibilidadeMarcacao,
} from "../_dominio/marcacoesCalendario";
import { JanelaFerramenta } from "./JanelaFerramenta";
import { MenuContextual } from "./MenuContextual";
import { Select } from "../_dados3d/ResultadoRolagem";

const DIAS = Array.from({ length: 30 }, (_, i) => i + 1);
const SEMANA = [1, 2, 3, 4, 5, 6];
const ICONES_CONDICAO: Record<Condicao, LucideIcon> = {
  ceu_limpo: Sun,
  parcialmente_nublado: CloudSun,
  nublado: Cloud,
  neblina: CloudFog,
  chuva_leve: CloudDrizzle,
  chuva: CloudRain,
  chuva_forte: CloudRainWind,
  tempestade: CloudLightning,
  neve_leve: Snowflake,
  neve: CloudSnow,
  nevasca: Wind,
  chuva_iridescente: CloudSunRain,
  nevoeiro_cristalino: Gem,
  tempestade_arcana: Zap,
};
const OPCOES_CONDICAO = CONDICOES_CLIMATICAS.map(({ id, nome }) => {
  const Icone = ICONES_CONDICAO[id];
  return { id, rotulo: nome, icone: <Icone size={15} /> };
});
const OPCOES_REGIAO = REGIOES.map((id) => ({ id, rotulo: id }));
const OPCOES_VENTO = VENTOS.map((id) => ({ id, rotulo: NOMES_VENTO[id] }));
function dataPronta(t: TempoCampanha) { return minutoImperial(t) !== null; }
function tituloData(t: TempoCampanha) {
  if (!dataPronta(t)) return "Data não definida";
  return `D${diaDaSemanaImperial(t.mes!, t.dia!)} · ${t.dia} de ${MESES_IMPERIAIS[t.mes! - 1]} de ${t.ano} CI · ${t.hora}`;
}
function rascunhoInicial(t: TempoCampanha): TempoCampanha {
  return dataPronta(t) ? t : definirClimaManual({ ...t, ano: 186, mes: 1, dia: 1, hora: "12:00" }, t.condicao);
}
function desde(t: TempoCampanha): string {
  const data = t.climaDesdeMinuto === null ? null : dataDeMinutoImperial(t.climaDesdeMinuto);
  return data ? `${data.dia} de ${MESES_IMPERIAIS[data.mes! - 1]}, ${data.hora}` : "Não informado";
}
export function TempoDaCampanha({ campaignId, ehNarrador }: { campaignId: string; ehNarrador: boolean }) {
  const chipRef = useRef<HTMLButtonElement | null>(null);
  const [atual, setAtual] = useState<TempoCampanha>(TEMPO_VAZIO);
  const [rascunho, setRascunho] = useState<TempoCampanha>(() => rascunhoInicial(TEMPO_VAZIO));
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [preview, setPreview] = useState<TempoCampanha | null>(null);
  const [seed, setSeed] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const calendarioRef = useRef<HTMLElement | null>(null);
  /** Mês em exibição na grade — só navegação, nunca muda a data da campanha. `null` = segue a data. */
  const [mesNavegado, setMesNavegado] = useState<{ ano: number; mes: number } | null>(null);
  const [marcacoes, setMarcacoes] = useState<MarcacaoCalendario[]>([]);
  const [diaSobre, setDiaSobre] = useState<{ dia: number; el: HTMLElement } | null>(null);
  const [menuDia, setMenuDia] = useState<{ dia: number; x: number; y: number; el: HTMLElement } | null>(null);
  const [compondo, setCompondo] = useState<{ ano: number; mes: number; dia: number; left: number; top: number } | null>(null);
  const recarregar = useCallback(async () => {
    const resultado = await lerTempoCampanhaAction(campaignId);
    if (resultado.ok) {
      const valor = resultado.dados ?? TEMPO_VAZIO;
      setAtual(valor); setRascunho(rascunhoInicial(valor)); setPreview(null); setErro(null);
    } else setErro(resultado.erro);
    setCarregando(false);
  }, [campaignId]);
  useEffect(() => {
    const client = getBrowserSupabaseClient();
    const channel = client?.channel(`campaign:${campaignId}:time`).on("postgres_changes", {
      event: "*", schema: "public", table: "vtt_campaign_time", filter: `campaign_id=eq.${campaignId}`,
    }, () => { void recarregar(); }).subscribe();
    void recarregar();
    return () => { if (client && channel) void client.removeChannel(channel); };
  }, [campaignId, recarregar]);
  const alterar = (campos: Partial<TempoCampanha>) => {
    setRascunho((anterior) => ({ ...anterior, ...campos })); setPreview(null); setErro(null);
  };
  const mudarData = (campos: Partial<TempoCampanha>) => {
    setRascunho((anterior) => ajustarContextoManual(anterior, campos));
    setPreview(null); setErro(null);
  };
  const salvar = async (valor: TempoCampanha) => {
    const erroLocal = validarTempo(valor);
    if (erroLocal) { setErro(erroLocal); return; }
    setSalvando(true);
    const resultado = await salvarTempoCampanhaAction(campaignId, { ...valor, revision: atual.revision });
    setSalvando(false);
    if (!resultado.ok) { setErro(resultado.erro); return; }
    const novo = resultado.dados ?? TEMPO_VAZIO;
    setAtual(novo); setRascunho(rascunhoInicial(novo)); setPreview(null); setErro(null);
  };
  const sortear = () => {
    try {
      const valor = crypto.getRandomValues(new Uint32Array(1))[0];
      const sorteado = sortearClima(valor, rascunho);
      setSeed(valor); setPreview({ ...sorteado, temperaturaC: sorteado.temperaturaAlvoC }); setErro(null);
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível sortear o clima."); }
  };
  const avancar = (minutos: number) => {
    const proximo = avancarTempoImperial(rascunho, minutos);
    if (proximo) { setRascunho(proximo); setPreview(null); setErro(null); void salvar(proximo); }
  };
  const selecionarClima = (id: Condicao) => { setRascunho((anterior) => definirClimaManual(anterior, id)); setPreview(null); setErro(null); };
  const existeEstado = atual.revision > 0;
  const temMudancas = JSON.stringify({ ...rascunho, revision: 0 }) !== JSON.stringify({ ...rascunhoInicial(atual), revision: 0 });
  const visto = ehNarrador ? rascunho : atual;
  const { ano: anoVisivel, mes: mesVisivel } = mesNavegado ?? { ano: visto.ano ?? 186, mes: visto.mes ?? 1 };
  const nomeMes = MESES_IMPERIAIS[mesVisivel - 1];
  const foraDoMes = mesNavegado !== null && (mesNavegado.ano !== (visto.ano ?? 186) || mesNavegado.mes !== (visto.mes ?? 1));
  const navegarMes = (deslocamento: number) => {
    const proximo = mudarMesImperial(anoVisivel, mesVisivel, deslocamento);
    if (proximo) { setMesNavegado(proximo); setDiaSobre(null); setMenuDia(null); setCompondo(null); }
  };
  const hojeData = dataPronta(atual) ? { ano: atual.ano!, mes: atual.mes!, dia: atual.dia! } : null;
  const marcasDoDia = (dia: number) => marcacoes.filter((m) => m.dia === dia);
  const relativoAoHoje = (dia: number) => hojeData ? distanciaRelativa(diasEntre(hojeData, { ano: anoVisivel, mes: mesVisivel, dia })) : "";
  const abrirComposicao = (dia: number, el: HTMLElement) => {
    const janela = calendarioRef.current?.closest(".rv-fp")?.getBoundingClientRect();
    const celula = el.getBoundingClientRect();
    const largura = 320, margem = 12;
    let left = (janela?.right ?? celula.right) + margem;
    if (left + largura > window.innerWidth - 8) left = Math.max(8, (janela?.left ?? celula.left) - largura - margem);
    const top = Math.min(Math.max(8, celula.top - 90), window.innerHeight - 400);
    setCompondo({ ano: anoVisivel, mes: mesVisivel, dia, left, top });
  };
  const tornarDiaAtual = (dia: number) => {
    const proximo = ajustarContextoManual(rascunho, { ano: anoVisivel, mes: mesVisivel, dia });
    setRascunho(proximo); setPreview(null); setErro(null); void salvar(proximo);
  };
  useEffect(() => {
    if (!aberto) { setMesNavegado(null); setDiaSobre(null); setMenuDia(null); setCompondo(null); return; }
    let vivo = true;
    const carregar = async () => {
      const resultado = await listarMarcacoesAction(campaignId, anoVisivel, mesVisivel);
      if (vivo && resultado.ok) setMarcacoes(resultado.dados);
    };
    const client = getBrowserSupabaseClient();
    const channel = client?.channel(`campaign:${campaignId}:calendar-marks`).on("postgres_changes", {
      event: "*", schema: "public", table: "vtt_calendar_marks", filter: `campaign_id=eq.${campaignId}`,
    }, () => { void carregar(); }).subscribe();
    void carregar();
    return () => { vivo = false; if (client && channel) void client.removeChannel(channel); };
  }, [aberto, campaignId, anoVisivel, mesVisivel]);
  const resumo = ehNarrador && existeEstado ? rascunho : atual;
  const IconeResumo = ICONES_CONDICAO[resumo.condicao];
  const IconeCondicao = ICONES_CONDICAO[visto.condicao];
  const IconePreview = ICONES_CONDICAO[preview?.condicao ?? "ceu_limpo"];
  return <>
    <button ref={chipRef} type="button" className="rv-tempo-chip" onClick={() => { setAberto((v) => !v); setErro(null); }}
      aria-label={`Tempo da campanha: ${tituloData(resumo)}. ${existeEstado ? nomeCondicao(resumo.condicao) : "Clima não definido"}.${temMudancas && existeEstado ? " Alterações não publicadas." : ""} Abrir detalhes`}
      data-pendente={temMudancas && existeEstado && ehNarrador}
      aria-expanded={aberto} data-testid="tempo-campanha-chip">
      <IconeResumo size={15} aria-hidden="true" />
      {carregando ? <span className="rv-tempo-chip-carregando">Carregando…</span> : <>
        <strong className="rv-tempo-chip-hora">{resumo.hora ?? "––:––"}</strong>
        <span className="rv-tempo-chip-separador" aria-hidden="true" />
        <span className="rv-tempo-chip-data">{dataPronta(resumo) && existeEstado ? `${resumo.dia} ${MESES_IMPERIAIS[resumo.mes! - 1]} · ${resumo.ano} CI` : "Definir data"}</span>
        <span className="rv-tempo-chip-separador" aria-hidden="true" />
        <span className="rv-tempo-chip-temp">{existeEstado && resumo.temperaturaC !== null ? `${resumo.temperaturaC}°C` : "—°C"}</span>
      </>}
      <ChevronUp size={14} className="rv-tempo-chip-seta" data-aberto={aberto} aria-hidden="true" />
    </button>
    {aberto && <JanelaFerramenta id="tempo" icone={<IconeCondicao size={16} />} titulo="Tempo e clima"
      modo="Calendário Imperial · campanha" rotulo="Tempo e clima da campanha"
      rotuloFechar="Fechar tempo e clima" aoFechar={() => setAberto(false)} className="rv-tempo-janela" ancoraAcimaDe={chipRef}>
      <div className="rv-fp-corpo rv-tempo-corpo">
        <section ref={calendarioRef} className="rv-tempo-secao rv-tempo-secao-calendario" aria-label="Calendário Imperial">
          <div className="rv-tempo-mes-cab">
            <span className="rv-tempo-mes-titulo">
              <span className="rv-tempo-mes">{nomeMes}<span className="rv-tempo-mes-numero">({String(mesVisivel).padStart(2, "0")})</span></span>
              <span className="rv-tempo-ano">{anoVisivel} CI · {estacaoDoMes(mesVisivel)}</span>
            </span>
            <div className="rv-tempo-mes-nav">
              {foraDoMes && <button type="button" className="rv-tempo-mes-hoje" onClick={() => setMesNavegado(null)}>Hoje</button>}
              <button type="button" aria-label="Mês anterior" disabled={anoVisivel === 0 && mesVisivel === 1} onClick={() => navegarMes(-1)}><ChevronLeft size={15} /></button>
              <button type="button" aria-label="Próximo mês" disabled={anoVisivel === 9999 && mesVisivel === 12} onClick={() => navegarMes(1)}><ChevronRight size={15} /></button>
            </div>
          </div>
          <div className="rv-tempo-calendario" role="group" aria-label={`Dias de ${nomeMes}`}>
            {SEMANA.map((d) => <span key={`cab-${d}`} className="rv-tempo-dia-semana">D{d}</span>)}
            {DIAS.map((dia) => {
              const marcas = marcasDoDia(dia);
              const ehHoje = hojeData?.ano === anoVisivel && hojeData.mes === mesVisivel && hojeData.dia === dia;
              const escolhido = ehNarrador && rascunho.ano === anoVisivel && rascunho.mes === mesVisivel && rascunho.dia === dia;
              return <button key={dia} type="button" className="rv-tempo-dia"
                aria-label={`Dia ${dia} de ${nomeMes}${marcas.length ? `, ${marcas.length} ${marcas.length === 1 ? "marcação" : "marcações"}` : ""}`}
                aria-pressed={ehNarrador ? escolhido : undefined} data-atual={!ehNarrador && ehHoje}
                data-alvo={compondo?.ano === anoVisivel && compondo.mes === mesVisivel && compondo.dia === dia}
                disabled={salvando}
                onClick={() => { if (ehNarrador) mudarData({ ano: anoVisivel, mes: mesVisivel, dia }); }}
                onMouseEnter={(e) => { if (!menuDia) setDiaSobre({ dia, el: e.currentTarget }); }}
                onMouseLeave={() => setDiaSobre(null)}
                onContextMenu={(e: ReactMouseEvent<HTMLButtonElement>) => {
                  e.preventDefault(); setDiaSobre(null);
                  setMenuDia({ dia, x: e.clientX, y: e.clientY, el: e.currentTarget });
                }}>
                {dia}
                {marcas.length > 0 && <span className="rv-tempo-dia-marcas" aria-hidden="true">
                  {marcas.slice(0, 3).map((m) => <span key={m.id} className="rv-tempo-marcador" data-tipo={m.tipo} data-oficial={m.oficial} />)}
                  {marcas.length > 3 && <span className="rv-tempo-dia-mais">+</span>}
                </span>}
              </button>;
            })}
          </div>
          {diaSobre && marcasDoDia(diaSobre.dia).length > 0 && <div role="tooltip" className="rv-tempo-balao"
            style={{ left: Math.min(Math.max(0, diaSobre.el.offsetLeft - 30), (calendarioRef.current?.clientWidth ?? 440) - 276), top: diaSobre.el.offsetTop + diaSobre.el.offsetHeight + 8 }}>
            <p className="rv-tempo-balao-cab"><span>{diaSobre.dia} {nomeMes} · D{diaDaSemanaImperial(mesVisivel, diaSobre.dia)}</span><span>{relativoAoHoje(diaSobre.dia)}</span></p>
            {marcasDoDia(diaSobre.dia).map((m) => <div key={m.id} className="rv-tempo-balao-item">
              <span className="rv-tempo-marcador" data-tipo={m.tipo} data-oficial={m.oficial} aria-hidden="true" />
              <span><strong>{m.titulo}</strong><small>{m.autorNome} · {NOMES_VISIBILIDADE[m.visibilidade]}</small></span>
            </div>)}
            <p className="rv-tempo-balao-dica">Botão direito no dia para marcar</p>
          </div>}
          <div className="rv-tempo-calendario-rodape"><span>{dataPronta(visto) ? `D${diaDaSemanaImperial(visto.mes!, visto.dia!)} · Dia ${visto.dia}` : "Data não definida"}</span><span className="rv-tempo-horario">{visto.hora ?? "––:––"}</span></div>
          {ehNarrador && <>
            <div className="rv-tempo-atalhos"><button type="button" onClick={() => avancar(10)} disabled={salvando}>+10 min</button><button type="button" onClick={() => avancar(60)} disabled={salvando}>+1 hora</button><button type="button" onClick={() => avancar(1440)} disabled={salvando}>+1 dia</button></div>
          </>}
        </section>
        <section className="rv-tempo-secao" aria-label="Condições climáticas">
          <h3 className="rv-tempo-rotulo">Condições atuais</h3>
          <div className="rv-tempo-condicao" data-especial={condicaoEspecial(visto.condicao)}>
            <IconeCondicao size={23} aria-hidden="true" />
            <span><strong>{existeEstado ? nomeCondicao(visto.condicao) : "Clima não definido"}</strong><small>{existeEstado ? `${visto.regiao} · vento ${visto.vento}` : "Aguardando o narrador"}</small></span>
            <b>{existeEstado && visto.temperaturaC !== null ? `${visto.temperaturaC} °C` : "—"}</b>
          </div>
          {existeEstado && <div className="rv-tempo-detalhes">
            <span>Região: {visto.regiao}</span><span>Estação: {estacaoDoMes(visto.mes ?? 1)}</span>
            <span>Desde: {desde(visto)}</span><span>Vento: {NOMES_VENTO[visto.vento]}</span>
          </div>}
          {existeEstado && visto.condicao === "tempestade_arcana" && <p className="rv-tempo-saturacao">Saturação atmosférica · criaturas expostas ficam Saturado</p>}
          {existeEstado && visto.aurora && <p className="rv-tempo-aurora">Aurora visível</p>}
          {existeEstado && visto.descricao && <p className="rv-tempo-ajuda">{visto.descricao}</p>}
          {ehNarrador && <div className="rv-tempo-condicao-acoes">
            <button type="button" className="rv-tempo-sortear" disabled={salvando} onClick={sortear}><Dices size={15} /> Sortear clima</button>
            <button type="button" className="rv-tempo-editar-btn" aria-expanded={editando} onClick={() => setEditando((v) => !v)}>{editando ? "Fechar edição" : "Editar valores"}</button>
          </div>}
        </section>
        {ehNarrador && editando && <section className="rv-tempo-secao rv-tempo-editor" aria-label="Editar tempo e clima">
          <h3 className="rv-tempo-rotulo">Editar tempo e clima</h3>
          <div className="rv-tempo-editar-data">
            <label>Ano CI<input type="number" min={0} max={9999} value={rascunho.ano ?? ""} onChange={(e) => mudarData({ ano: e.target.value === "" ? null : Number(e.target.value) })} /></label>
            <label>Horário<input type="time" value={rascunho.hora ?? ""} onChange={(e) => mudarData({ hora: e.target.value || null })} /></label>
          </div>
          <Select label="Condição" className="rv-tempo-campo-clima" value={rascunho.condicao}
            onChange={(id) => selecionarClima(id as Condicao)} options={OPCOES_CONDICAO} />
          <div className="rv-tempo-editar-data">
            <Select label="Região" value={rascunho.regiao} onChange={(id) => mudarData({ regiao: id as TempoCampanha["regiao"] })} options={OPCOES_REGIAO} />
            <label>Temperatura °C<input type="number" min={-100} max={100} step="0.1" value={rascunho.temperaturaC ?? ""} onChange={(e) => alterar({ temperaturaC: e.target.value === "" ? null : Number(e.target.value) })} /></label>
            <Select label="Vento" value={rascunho.vento} onChange={(id) => alterar({ vento: id as TempoCampanha["vento"] })} options={OPCOES_VENTO} />
            <label>Temperatura alvo °C<input type="number" min={-100} max={100} step="0.1" value={rascunho.temperaturaAlvoC ?? ""} onChange={(e) => alterar({ temperaturaAlvoC: e.target.value === "" ? null : Number(e.target.value) })} /></label>
            <label>Duração restante (h)<input type="number" min={1} max={720} value={rascunho.climaAteMinuto === null || minutoImperial(rascunho) === null ? "" : Math.max(0, Math.round((rascunho.climaAteMinuto - minutoImperial(rascunho)!) / 60))} onChange={(e) => { const agora = minutoImperial(rascunho); if (agora !== null && e.target.value !== "") alterar({ climaAteMinuto: Math.min(agora + Number(e.target.value) * 60, 10000 * 360 * 1440 - 1) }); }} /></label>
          </div>
          <label className="rv-tempo-aurora-controle"><input type="checkbox" checked={rascunho.aurora} onChange={(e) => alterar({ aurora: e.target.checked })} /> Aurora visível</label>
          <label>Observação<textarea maxLength={300} value={rascunho.descricao} onChange={(e) => alterar({ descricao: e.target.value })} /></label>
        </section>}
        {ehNarrador && <>
          {preview && <section className="rv-tempo-secao rv-tempo-preview" role="status" aria-label="Prévia privada do clima">
            <h3 className="rv-tempo-rotulo">Prévia do sorteio <span className="rv-tempo-preview-privada">Privada</span></h3>
            <div className="rv-tempo-condicao" data-especial={condicaoEspecial(preview.condicao)}>
              <IconePreview size={23} aria-hidden="true" />
              <span><strong>{nomeCondicao(preview.condicao)}</strong><small>{preview.regiao} · vento {NOMES_VENTO[preview.vento]}</small></span>
              <b>{preview.temperaturaAlvoC} °C</b>
            </div>
            <div className="rv-tempo-preview-meta">
              <span>Duração estimada: {Math.round(((preview.climaAteMinuto ?? 0) - (preview.climaDesdeMinuto ?? 0)) / 60)} h</span>
              <span>Seed {seed}</span>
            </div>
            <div className="rv-tempo-preview-acoes"><button type="button" disabled={salvando} onClick={() => void salvar(preview)}>Aplicar clima</button><button type="button" onClick={() => setPreview(null)}>Descartar</button></div>
          </section>}
          <div className="rv-tempo-publicar"><span>{!existeEstado ? "Defina a data inicial da campanha" : temMudancas ? "Alterações ainda não publicadas" : "Todos veem o estado da campanha"}</span><button type="button" disabled={salvando || (existeEstado && !temMudancas)} onClick={() => void salvar(rascunho)}>{salvando ? "Salvando…" : "Publicar alterações"}</button></div>
        </>}
        {erro && <p role="alert" className="rv-tempo-erro">{erro} <button type="button" onClick={() => void recarregar()}>Recarregar</button></p>}
      </div>
    </JanelaFerramenta>}
    {aberto && <MenuContextual posicao={menuDia ? { x: menuDia.x, y: menuDia.y } : null} codigo="Dia"
      alvo={menuDia ? `${menuDia.dia} ${nomeMes} · ${anoVisivel} CI` : undefined}
      retornarFocoPara={menuDia?.el} onFechar={() => setMenuDia(null)}
      itens={menuDia ? [
        { id: "nova", rotulo: "Nova marcação", icone: <Plus size={14} />, onSelecionar: () => abrirComposicao(menuDia.dia, menuDia.el) },
        ...(ehNarrador ? [{ id: "atual", rotulo: "Tornar dia atual", icone: <Clock size={14} />, separadorAntes: true, onSelecionar: () => tornarDiaAtual(menuDia.dia) }] : []),
      ] : []} />}
    {aberto && compondo && createPortal(<NovaMarcacaoJanela key={`${compondo.ano}-${compondo.mes}-${compondo.dia}`} campaignId={campaignId}
      alvo={compondo} relativo={relativoAoHoje(compondo.dia)} aoFechar={() => setCompondo(null)}
      aoSalvar={(nova) => { setMarcacoes((lista) => [...lista, nova]); setCompondo(null); }} />,
      // Dentro da arena da mesa, onde vivem os tokens de cor/fonte (`--rv-*`).
      calendarioRef.current?.closest(".rv-mesa") ?? document.body)}
  </>;
}

function NovaMarcacaoJanela({ campaignId, alvo, relativo, aoFechar, aoSalvar }: {
  campaignId: string;
  alvo: { ano: number; mes: number; dia: number; left: number; top: number };
  relativo: string;
  aoFechar: () => void;
  aoSalvar: (m: MarcacaoCalendario) => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<TipoMarcacao>("lembrete");
  const [visibilidade, setVisibilidade] = useState<VisibilidadeMarcacao>("mesa");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === "Escape") aoFechar(); };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);
  const salvar = async () => {
    if (!titulo.trim() || salvando) return;
    setSalvando(true);
    const nova = { ano: alvo.ano, mes: alvo.mes, dia: alvo.dia, tipo, titulo: titulo.trim(), visibilidade };
    const resultado = await criarMarcacaoAction(campaignId, nova);
    setSalvando(false);
    if (!resultado.ok) { setErro(resultado.erro); return; }
    // O realtime recarrega a lista com o autor resolvido; isto só evita o vão até lá.
    aoSalvar({ ...nova, id: `local-${Date.now()}`, oficial: false, autorId: "", autorNome: "Você" });
  };
  return <section className="rv-tempo-nova" role="dialog" aria-label={`Nova marcação em ${alvo.dia} de ${MESES_IMPERIAIS[alvo.mes - 1]}`}
    style={{ left: alvo.left, top: alvo.top }}>
    <header className="rv-tempo-nova-cab">
      <div>
        <h2>Nova marcação</h2>
        <span className="rv-tempo-nova-modo">{alvo.dia} {MESES_IMPERIAIS[alvo.mes - 1]}{relativo ? ` · ${relativo}` : ""}</span>
      </div>
      <button type="button" className="rv-tempo-nova-fechar" aria-label="Fechar nova marcação" onClick={aoFechar}><X size={12} /></button>
    </header>
    <form className="rv-tempo-nova-corpo" onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
      <label className="rv-tempo-nova-campo">Título
        <input ref={inputRef} type="text" maxLength={TITULO_MARCACAO_MAX} value={titulo} placeholder="O que acontece neste dia?"
          onChange={(e) => setTitulo(e.target.value)} />
      </label>
      <fieldset className="rv-tempo-nova-campo">
        <legend>Tipo</legend>
        <div className="rv-tempo-nova-opcoes" data-colunas="2">
          {TIPOS_MARCACAO.map((t) => <button key={t} type="button" aria-pressed={tipo === t} onClick={() => setTipo(t)}>
            <span className="rv-tempo-marcador" data-tipo={t} aria-hidden="true" />{NOMES_TIPO_MARCACAO[t]}
          </button>)}
        </div>
      </fieldset>
      <fieldset className="rv-tempo-nova-campo">
        <legend>Quem vê</legend>
        <div className="rv-tempo-nova-opcoes" data-colunas="3">
          {VISIBILIDADES_MARCACAO.map((v) => <button key={v} type="button" aria-pressed={visibilidade === v} onClick={() => setVisibilidade(v)}>{NOMES_VISIBILIDADE[v]}</button>)}
        </div>
      </fieldset>
      {erro && <p role="alert" className="rv-tempo-erro">{erro}</p>}
      <div className="rv-tempo-nova-rodape">
        <span>Enter salva · Esc fecha</span>
        <button type="submit" disabled={!titulo.trim() || salvando}>{salvando ? "Salvando…" : "Salvar marcação"}</button>
      </div>
    </form>
  </section>;
}
