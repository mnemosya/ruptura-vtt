"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IluminacaoCena } from "../../../../../lib/vtt/lightStorage";
import { PRESETS_OBJETO } from "../_dominio/presetsObjeto";
import { tokenApresentacaoDe, type TokenApresentacao } from "../_dominio/tokenApresentacao";
import { HEX_COR_AREA, origemDeAura, regiaoDaArea } from "../_dominio/areaEfeito";
import { corValida, parametrosDaAreaPersistida } from "../_dominio/areaPersistida";
import { origemMecanica, pegadaEfetiva } from "../_dominio/pegada";
import { MapaHex, TAM, type CenaMapa, type EstadoVisualToken } from "../_mapa/MapaHex";
import type { AreaDesenhavel } from "../_mapa/CamadaAreas";
import { lerPreviaJogadorAction, listarJogadoresPreviaAction, type PreviaJogadorLuz } from "../_acoes/lightActions";

const estadoNeutro = (_t: TokenApresentacao): EstadoVisualToken => ({
  selecionado: false, sobCursor: false, turnoAtual: false, podeAgir: false,
  jaAgiu: false, fragmentado: false, alvo: false, origemDeAura: false,
});
const ignorar = () => {};

export function PreviaJogadorMapa(p: {
  campaignId: string; sceneId: string; nomeCena: string; largura: number; altura: number;
  iluminacao: IluminacaoCena | null; urls: Record<string, string>; versaoTokens: unknown;
  onFechar: () => void;
}) {
  const [jogadores, setJogadores] = useState<{ id: string; nome: string }[]>([]);
  const [jogadorId, setJogadorId] = useState("");
  const [dados, setDados] = useState<PreviaJogadorLuz | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [zoom, setZoom] = useState(1);
  const leitura = useRef(0);
  const fecharRef = useRef(p.onFechar);
  fecharRef.current = p.onFechar;

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === "Escape") fecharRef.current(); };
    window.addEventListener("keydown", aoTeclar);
    return () => { leitura.current++; window.removeEventListener("keydown", aoTeclar); };
  }, []);

  useEffect(() => {
    let ativo = true;
    void listarJogadoresPreviaAction(p.campaignId).then((r) => {
      if (!ativo) return;
      if (!r.ok) { setErro(r.erro); return; }
      setJogadores(r.dados);
      setJogadorId((id) => id || r.dados[0]?.id || "");
    });
    return () => { ativo = false; };
  }, [p.campaignId]);

  const recarregar = useCallback(async () => {
    if (!jogadorId) return;
    const atual = ++leitura.current;
    setCarregando(true);
    setDados(null);
    const r = await lerPreviaJogadorAction({ campaignId: p.campaignId, sceneId: p.sceneId, playerId: jogadorId });
    if (atual !== leitura.current) return;
    if (r.ok) { setDados(r.dados); setErro(null); }
    else setErro(r.erro);
    setCarregando(false);
  }, [jogadorId, p.campaignId, p.sceneId]);
  useEffect(() => { void recarregar(); }, [recarregar, p.iluminacao, p.versaoTokens]);

  const tokens = useMemo(() => (dados?.tokens ?? []).map((t) => tokenApresentacaoDe(t, p.urls)), [dados?.tokens, p.urls]);
  const cena = useMemo<CenaMapa>(() => ({
    nome: p.nomeCena, largura: p.largura, altura: p.altura, tokens,
    objetos: (dados?.objetos ?? []).map((o) => {
      const preset = PRESETS_OBJETO[o.preset] ?? PRESETS_OBJETO.personalizado;
      return { id: o.id, nome: o.nome, celulas: o.celulas,
        grau: (o.grauCobertura ?? preset.grauCobertura ?? "parcial") as CenaMapa["objetos"][number]["grau"],
        categoria: (o.categoria ?? preset.categoria ?? "media") as CenaMapa["objetos"][number]["categoria"],
        pd: o.pd, pdMax: o.pdMax, tipo: preset.aparencia };
    }),
  }), [dados?.objetos, p.nomeCena, p.largura, p.altura, tokens]);
  const areas = useMemo<AreaDesenhavel[]>(() => (dados?.areas ?? []).flatMap((a) => {
    const token = a.tokenId ? tokens.find((t) => t.id === a.tokenId) : null;
    const origem = token ? origemDeAura(token.pos, origemMecanica(pegadaEfetiva({
      categoria: token.tamanho, orientacao: token.orientacao, pegadaPersonalizada: token.pegadaPersonalizada,
    }))) : null;
    const params = parametrosDaAreaPersistida(a, origem);
    const regiao = params ? regiaoDaArea(params, TAM) : null;
    return regiao ? [{ id: a.id, tipo: a.tipo, regiao,
      cor: HEX_COR_AREA[corValida(a.cor)], opacidade: a.opacidade, rotulo: a.rotulo,
      estado: "persistida" as const, celulasAfetadas: [], pegadasAfetadas: [],
    }] : [];
  }), [dados?.areas, tokens]);

  return <div className="rv-luz-previa-fundo" role="presentation" onClick={p.onFechar}>
    <section className="rv-luz-previa" role="dialog" aria-modal="true" aria-label="Prévia da visão do jogador" onClick={(e) => e.stopPropagation()}>
      <header className="rv-luz-previa-cabecalho">
        <strong>Prévia da visão do jogador</strong>
        <label>Participante <select value={jogadorId} onChange={(e) => setJogadorId(e.target.value)}>
          {jogadores.map((j) => <option key={j.id} value={j.id}>{j.nome}</option>)}
        </select></label>
        <button type="button" onClick={() => void recarregar()} disabled={!jogadorId || carregando}>Atualizar</button>
        <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Reduzir zoom">−</button>
        <button type="button" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} aria-label="Aumentar zoom">+</button>
        <button type="button" onClick={p.onFechar}>Fechar</button>
      </header>
      {erro && <p role="alert">{erro}</p>}
      {!jogadores.length && !erro && <p>Nenhum jogador ativo nesta campanha.</p>}
      <div className="rv-luz-previa-mapa">
        {carregando && <p role="status">Carregando projeção autorizada…</p>}
        {dados && <MapaHex cena={cena} zoom={zoom} pan={{ x: 0, y: 0 }} selecionadoId={null} hoverId={null}
          alvoIds={[]} estadoPorToken={estadoNeutro} celulasRealce={[]} tipoRealce={null}
          onSelecionarToken={ignorar} onHoverToken={ignorar} onAtivarCartaoToken={ignorar} onFecharCartaoToken={ignorar}
          ferramenta="interagir" podeMoverToken={() => false} areas={areas}
          imagensCena={dados.imagens} urlsImagens={p.urls} iluminacao={p.iluminacao} verCamadasOcultas={false} />}
      </div>
    </section>
  </div>;
}
