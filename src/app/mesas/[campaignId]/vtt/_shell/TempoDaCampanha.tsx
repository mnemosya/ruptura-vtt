"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronUp, CloudSun, Dices } from "lucide-react";
import { getBrowserSupabaseClient } from "../../../../../lib/supabase/browserClient";
import { lerTempoCampanhaAction, salvarTempoCampanhaAction } from "../_acoes/tempoActions";
import {
  CONDICOES_CLIMATICAS, MESES_IMPERIAIS, REGIOES, VENTOS, NOMES_VENTO, TEMPO_VAZIO,
  ajustarContextoManual, avancarTempoImperial, condicaoEspecial, dataDeMinutoImperial, definirClimaManual,
  diaDaSemanaImperial, estacaoDoMes, minutoImperial, mudarMesImperial, nomeCondicao,
  sortearClima, validarTempo, type Condicao, type TempoCampanha,
} from "../_dominio/tempoCampanha";
import { JanelaFerramenta } from "./JanelaFerramenta";

const DIAS = Array.from({ length: 30 }, (_, i) => i + 1);
const SEMANA = [1, 2, 3, 4, 5, 6];
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
  const mudarMes = (deslocamento: number) => {
    const proximo = mudarMesImperial(rascunho.ano ?? 186, rascunho.mes ?? 1, deslocamento);
    if (proximo) mudarData(proximo);
  };
  const avancar = (minutos: number) => {
    const proximo = avancarTempoImperial(rascunho, minutos);
    if (proximo) { setRascunho(proximo); setPreview(null); setErro(null); void salvar(proximo); }
  };
  const selecionarClima = (id: Condicao) => { setRascunho((anterior) => definirClimaManual(anterior, id)); setPreview(null); setErro(null); };
  const existeEstado = atual.revision > 0;
  const temMudancas = JSON.stringify({ ...rascunho, revision: 0 }) !== JSON.stringify({ ...rascunhoInicial(atual), revision: 0 });
  const mesVisivel = rascunho.mes ?? 1, anoVisivel = rascunho.ano ?? 186;
  const visto = ehNarrador ? rascunho : atual;
  const resumo = ehNarrador && existeEstado ? rascunho : atual;
  return <>
    <button ref={chipRef} type="button" className="rv-tempo-chip" onClick={() => { setAberto((v) => !v); setErro(null); }}
      aria-label={`Tempo da campanha: ${tituloData(resumo)}. ${existeEstado ? nomeCondicao(resumo.condicao) : "Clima não definido"}.${temMudancas && existeEstado ? " Alterações não publicadas." : ""} Abrir detalhes`}
      data-pendente={temMudancas && existeEstado && ehNarrador}
      aria-expanded={aberto} data-testid="tempo-campanha-chip">
      <CloudSun size={15} aria-hidden="true" />
      {carregando ? <span className="rv-tempo-chip-carregando">Carregando…</span> : <>
        <strong className="rv-tempo-chip-hora">{resumo.hora ?? "––:––"}</strong>
        <span className="rv-tempo-chip-separador" aria-hidden="true" />
        <span className="rv-tempo-chip-data">{dataPronta(resumo) && existeEstado ? `${resumo.dia} ${MESES_IMPERIAIS[resumo.mes! - 1]} · ${resumo.ano} CI` : "Definir data"}</span>
        <span className="rv-tempo-chip-separador" aria-hidden="true" />
        <span className="rv-tempo-chip-temp">{existeEstado && resumo.temperaturaC !== null ? `${resumo.temperaturaC}°C` : "—°C"}</span>
      </>}
      <ChevronUp size={14} className="rv-tempo-chip-seta" data-aberto={aberto} aria-hidden="true" />
    </button>
    {aberto && <JanelaFerramenta id="tempo" icone={<CloudSun size={16} />} titulo="Tempo e clima"
      modo="Calendário Imperial · campanha" rotulo="Tempo e clima da campanha"
      rotuloFechar="Fechar tempo e clima" aoFechar={() => setAberto(false)} className="rv-tempo-janela" ancoraAcimaDe={chipRef}>
      <div className="rv-fp-corpo rv-tempo-corpo">
        <section className="rv-tempo-secao" aria-label="Calendário Imperial">
          <div className="rv-tempo-mes-cab">
            <span className="rv-tempo-mes">{MESES_IMPERIAIS[mesVisivel - 1]}</span>
            <span className="rv-tempo-ano">{anoVisivel} CI · {estacaoDoMes(mesVisivel)}</span>
            {ehNarrador && <div className="rv-tempo-mes-nav">
              <button type="button" aria-label="Mês anterior" disabled={anoVisivel === 0 && mesVisivel === 1 || salvando} onClick={() => mudarMes(-1)}><ChevronLeft size={15} /></button>
              <button type="button" aria-label="Próximo mês" disabled={anoVisivel === 9999 && mesVisivel === 12 || salvando} onClick={() => mudarMes(1)}><ChevronRight size={15} /></button>
            </div>}
          </div>
          <div className="rv-tempo-calendario" role="group" aria-label={`Dias de ${MESES_IMPERIAIS[mesVisivel - 1]}`}>
            {SEMANA.map((d) => <span key={`cab-${d}`} className="rv-tempo-dia-semana">D{d}</span>)}
            {DIAS.map((dia) => ehNarrador ? <button key={dia} type="button" className="rv-tempo-dia"
              aria-label={`Dia ${dia} de ${MESES_IMPERIAIS[mesVisivel - 1]}`} aria-pressed={rascunho.dia === dia}
              disabled={salvando} onClick={() => mudarData({ dia })}>{dia}</button>
              : <span key={dia} className="rv-tempo-dia" data-atual={atual.dia === dia}>{dia}</span>)}
          </div>
          <div className="rv-tempo-calendario-rodape"><span>{dataPronta(visto) ? `D${diaDaSemanaImperial(visto.mes!, visto.dia!)} · Dia ${visto.dia}` : "Data não definida"}</span><span className="rv-tempo-horario">{visto.hora ?? "––:––"}</span></div>
          {ehNarrador && <>
            <div className="rv-tempo-atalhos"><button type="button" onClick={() => avancar(10)} disabled={salvando}>+10 min</button><button type="button" onClick={() => avancar(60)} disabled={salvando}>+1 hora</button><button type="button" onClick={() => avancar(1440)} disabled={salvando}>+1 dia</button></div>
          </>}
        </section>
        <section className="rv-tempo-secao" aria-label="Condições climáticas">
          <h3 className="rv-tempo-rotulo">Condições atuais</h3>
          <div className="rv-tempo-condicao" data-especial={condicaoEspecial(visto.condicao)}>
            <CloudSun size={23} aria-hidden="true" />
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
          <label className="rv-tempo-campo-clima">Condição
            <select value={rascunho.condicao} onChange={(e) => selecionarClima(e.target.value as Condicao)}>
              {CONDICOES_CLIMATICAS.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <div className="rv-tempo-editar-data">
            <label>Região<select value={rascunho.regiao} onChange={(e) => mudarData({ regiao: e.target.value as TempoCampanha["regiao"] })}>{REGIOES.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
            <label>Temperatura °C<input type="number" min={-100} max={100} step="0.1" value={rascunho.temperaturaC ?? ""} onChange={(e) => alterar({ temperaturaC: e.target.value === "" ? null : Number(e.target.value) })} /></label>
            <label>Vento<select value={rascunho.vento} onChange={(e) => alterar({ vento: e.target.value as TempoCampanha["vento"] })}>{VENTOS.map((v) => <option key={v} value={v}>{NOMES_VENTO[v]}</option>)}</select></label>
            <label>Temperatura alvo °C<input type="number" min={-100} max={100} step="0.1" value={rascunho.temperaturaAlvoC ?? ""} onChange={(e) => alterar({ temperaturaAlvoC: e.target.value === "" ? null : Number(e.target.value) })} /></label>
            <label>Duração restante (h)<input type="number" min={1} max={720} value={rascunho.climaAteMinuto === null || minutoImperial(rascunho) === null ? "" : Math.max(0, Math.round((rascunho.climaAteMinuto - minutoImperial(rascunho)!) / 60))} onChange={(e) => { const agora = minutoImperial(rascunho); if (agora !== null && e.target.value !== "") alterar({ climaAteMinuto: Math.min(agora + Number(e.target.value) * 60, 10000 * 360 * 1440 - 1) }); }} /></label>
          </div>
          <label className="rv-tempo-aurora-controle"><input type="checkbox" checked={rascunho.aurora} onChange={(e) => alterar({ aurora: e.target.checked })} /> Aurora visível</label>
          <label>Observação<textarea maxLength={300} value={rascunho.descricao} onChange={(e) => alterar({ descricao: e.target.value })} /></label>
        </section>}
        {ehNarrador && <>
          {preview && <div className="rv-tempo-preview" role="status"><strong>Prévia privada · seed {seed}</strong>
            <span>{nomeCondicao(preview.condicao)} · alvo {preview.temperaturaAlvoC} °C · vento {preview.vento}</span>
            <span>Duração prevista: {Math.round(((preview.climaAteMinuto ?? 0) - (preview.climaDesdeMinuto ?? 0)) / 60)} h</span>
            <div className="rv-tempo-preview-acoes"><button type="button" disabled={salvando} onClick={() => void salvar(preview)}>Aplicar clima</button><button type="button" onClick={() => setPreview(null)}>Descartar</button></div>
          </div>}
          <div className="rv-tempo-publicar"><span>{!existeEstado ? "Defina a data inicial da campanha" : temMudancas ? "Alterações ainda não publicadas" : "Todos veem o estado da campanha"}</span><button type="button" disabled={salvando || (existeEstado && !temMudancas)} onClick={() => void salvar(rascunho)}>{salvando ? "Salvando…" : "Publicar alterações"}</button></div>
        </>}
        {erro && <p role="alert" className="rv-tempo-erro">{erro} <button type="button" onClick={() => void recarregar()}>Recarregar</button></p>}
      </div>
    </JanelaFerramenta>}
  </>;
}
