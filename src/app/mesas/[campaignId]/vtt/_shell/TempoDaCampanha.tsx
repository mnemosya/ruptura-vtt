"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudRainWind, CloudSnow, CloudSun,
  CloudSunRain, Gem, Snowflake, Sun, Wind, Zap, type LucideIcon,
} from "lucide-react";
import { getBrowserSupabaseClient } from "../../../../../lib/supabase/browserClient";
import { lerTempoCampanhaAction, salvarTempoCampanhaAction } from "../_acoes/tempoActions";
import {
  CONDICOES_CLIMATICAS, MESES_IMPERIAIS, TEMPO_VAZIO, ajustarContextoManual, avancarTempoImperial, definirClimaManual,
  diaDaSemanaImperial, minutoImperial, nomeCondicao, sortearClima, validarTempo, type Condicao, type TempoCampanha,
} from "../_dominio/tempoCampanha";
import { listarTodasMarcacoesAction, criarMarcacaoAction } from "../_acoes/marcacoesCalendarioActions";
import type { MarcacaoCalendario, NovaMarcacao } from "../_dominio/marcacoesCalendario";
import { JanelaTempo } from "./tempo/JanelaTempo";

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
function dataPronta(t: TempoCampanha) { return minutoImperial(t) !== null; }
function tituloData(t: TempoCampanha) {
  if (!dataPronta(t)) return "Data não definida";
  return `D${diaDaSemanaImperial(t.mes!, t.dia!)} · ${t.dia} de ${MESES_IMPERIAIS[t.mes! - 1]} de ${t.ano} CI · ${t.hora}`;
}
function rascunhoInicial(t: TempoCampanha): TempoCampanha {
  return dataPronta(t) ? t : definirClimaManual({ ...t, ano: 186, mes: 1, dia: 1, hora: "12:00" }, t.condicao);
}
/** Largura do modo completo (o maior); a janela cresce pra cima a partir do chip. */
const LARGURA = 420, MARGEM = 8;

export function TempoDaCampanha({ campaignId, ehNarrador }: { campaignId: string; ehNarrador: boolean }) {
  const chipRef = useRef<HTMLButtonElement | null>(null);
  const [atual, setAtual] = useState<TempoCampanha>(TEMPO_VAZIO);
  const [rascunho, setRascunho] = useState<TempoCampanha>(() => rascunhoInicial(TEMPO_VAZIO));
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [marcacoes, setMarcacoes] = useState<MarcacaoCalendario[]>([]);
  const [posicao, setPosicao] = useState<{ left: number; bottom: number } | null>(null);
  const recarregar = useCallback(async () => {
    const resultado = await lerTempoCampanhaAction(campaignId);
    if (resultado.ok) {
      const valor = resultado.dados ?? TEMPO_VAZIO;
      setAtual(valor); setRascunho(rascunhoInicial(valor)); setErro(null);
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
  // Marcações: todas as visíveis da campanha (a grade filtra o mês; a agenda usa todas).
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    const carregar = async () => {
      const resultado = await listarTodasMarcacoesAction(campaignId);
      if (vivo && resultado.ok) setMarcacoes(resultado.dados);
    };
    const client = getBrowserSupabaseClient();
    const channel = client?.channel(`campaign:${campaignId}:calendar-marks`).on("postgres_changes", {
      event: "*", schema: "public", table: "vtt_calendar_marks", filter: `campaign_id=eq.${campaignId}`,
    }, () => { void carregar(); }).subscribe();
    void carregar();
    return () => { vivo = false; if (client && channel) void client.removeChannel(channel); };
  }, [aberto, campaignId]);
  // A janela abre logo acima do chip, presa à tela.
  useLayoutEffect(() => {
    if (!aberto) { setPosicao(null); return; }
    const posicionar = () => {
      const r = chipRef.current?.getBoundingClientRect();
      if (!r) return;
      const left = Math.max(MARGEM, Math.min(r.left, window.innerWidth - LARGURA - MARGEM));
      setPosicao({ left, bottom: Math.max(MARGEM, window.innerHeight - r.top + MARGEM) });
    };
    posicionar();
    window.addEventListener("resize", posicionar);
    return () => window.removeEventListener("resize", posicionar);
  }, [aberto]);
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector(".tb .menu, .tb [role=dialog] [role=dialog]")) return;
      setAberto(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  const alterar = (campos: Partial<TempoCampanha>) => { setRascunho((anterior) => ({ ...anterior, ...campos })); setErro(null); };
  const mudarData = (campos: Partial<TempoCampanha>) => { setRascunho((anterior) => ajustarContextoManual(anterior, campos)); setErro(null); };
  const salvar = async (valor: TempoCampanha): Promise<boolean> => {
    const erroLocal = validarTempo(valor);
    if (erroLocal) { setErro(erroLocal); return false; }
    setSalvando(true);
    const resultado = await salvarTempoCampanhaAction(campaignId, { ...valor, revision: atual.revision });
    setSalvando(false);
    if (!resultado.ok) { setErro(resultado.erro); return false; }
    const novo = resultado.dados ?? TEMPO_VAZIO;
    setAtual(novo); setRascunho(rascunhoInicial(novo)); setErro(null);
    return true;
  };
  // Como na prancheta: o sorteio vai direto pro rascunho; publicar leva pra mesa.
  const sortear = (): string | null => {
    try {
      const sorteado = sortearClima(crypto.getRandomValues(new Uint32Array(1))[0], rascunho);
      setRascunho({ ...sorteado, temperaturaC: sorteado.temperaturaAlvoC }); setErro(null);
      return nomeCondicao(sorteado.condicao);
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível sortear o clima."); return null; }
  };
  const ciclarCondicao = (passo: number) => {
    const i = CONDICOES_CLIMATICAS.findIndex((c) => c.id === rascunho.condicao);
    const n = CONDICOES_CLIMATICAS.length;
    setRascunho((anterior) => definirClimaManual(anterior, CONDICOES_CLIMATICAS[(i + passo + n) % n].id)); setErro(null);
  };
  const avancar = (minutos: number) => {
    const proximo = avancarTempoImperial(rascunho, minutos);
    if (proximo) { setRascunho(proximo); void salvar(proximo); }
  };
  const tornarDiaAtual = (data: { ano: number; mes: number; dia: number }) => {
    const proximo = ajustarContextoManual(rascunho, data);
    setRascunho(proximo); void salvar(proximo);
  };
  const criarMarcacao = async (nova: NovaMarcacao): Promise<string | null> => {
    const resultado = await criarMarcacaoAction(campaignId, nova);
    if (!resultado.ok) return resultado.erro;
    // O realtime recarrega a lista com o autor resolvido; isto só evita o vão até lá.
    setMarcacoes((lista) => [...lista, { ...nova, id: `local-${Date.now()}`, oficial: ehNarrador, autorId: "", autorNome: "Você" }]);
    return null;
  };
  const existeEstado = atual.revision > 0;
  const temMudancas = JSON.stringify({ ...rascunho, revision: 0 }) !== JSON.stringify({ ...rascunhoInicial(atual), revision: 0 });
  const visto = ehNarrador ? rascunho : atual;
  const resumo = ehNarrador && existeEstado ? rascunho : atual;
  const IconeResumo = ICONES_CONDICAO[resumo.condicao];
  return <>
    <button ref={chipRef} type="button" className="rv-tempo-chip" onClick={() => { setAberto((v) => !v); setErro(null); }}
      aria-label={`Tempo da campanha: ${tituloData(resumo)}. ${existeEstado ? nomeCondicao(resumo.condicao) : "Clima não definido"}.${temMudancas && existeEstado ? " Alterações não publicadas." : ""} Abrir detalhes`}
      data-pendente={temMudancas && existeEstado && ehNarrador}
      aria-expanded={aberto} data-testid="tempo-campanha-chip">
      <IconeResumo size={15} aria-hidden="true" />
      {carregando ? <span className="rv-tempo-chip-carregando">Carregando…</span> : <>
        <strong className="rv-tempo-chip-hora">{resumo.hora ?? "––:––"}</strong>
        <span className="rv-tempo-chip-temp">{existeEstado && resumo.temperaturaC !== null ? `${resumo.temperaturaC}°C` : "—°C"}</span>
        <span className="rv-tempo-chip-separador" aria-hidden="true" />
        <span className="rv-tempo-chip-data">{dataPronta(resumo) && existeEstado ? `D${diaDaSemanaImperial(resumo.mes!, resumo.dia!)} · ${String(resumo.dia).padStart(2, "0")}/${String(resumo.mes).padStart(2, "0")}/${resumo.ano}` : "Definir data"}</span>
      </>}
      <ChevronDown size={14} className="rv-tempo-chip-seta" data-aberto={aberto} aria-hidden="true" />
    </button>
    {aberto && posicao && createPortal(<JanelaTempo tempo={visto} existeEstado={existeEstado} ehNarrador={ehNarrador}
      temMudancas={temMudancas && existeEstado} salvando={salvando} marcacoes={marcacoes} erro={erro}
      estilo={{ position: "fixed", left: posicao.left, bottom: posicao.bottom, maxHeight: `calc(100vh - ${posicao.bottom + MARGEM}px)`, zIndex: 60, boxShadow: "0 24px 70px rgba(0,0,0,.7)" }}
      aoFechar={() => setAberto(false)}
      aoEscolherDia={(data) => mudarData(data)}
      aoAvancar={avancar} aoSortear={sortear} aoCiclarCondicao={ciclarCondicao}
      aoMudarData={mudarData} aoAlterar={alterar}
      aoPublicar={() => salvar(rascunho)}
      aoTornarDiaAtual={tornarDiaAtual} aoCriarMarcacao={criarMarcacao} />,
      // Dentro da mesa: tokens, chanfro e botões (`.rv-btn`) são os do VTT.
      chipRef.current?.closest(".rv-mesa") ?? document.body)}
  </>;
}
