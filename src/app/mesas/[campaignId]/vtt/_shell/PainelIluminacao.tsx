"use client";

import { useEffect, useState } from "react";
import { Lightbulb, Trash2 } from "lucide-react";
import type { FonteLuz, IluminacaoCena, ModoLuz, ParedeLuz } from "../../../../../lib/vtt/lightStorage";
import { JanelaFerramenta } from "./JanelaFerramenta";

export type GestoIluminacao = "selecionar" | "parede" | "porta" | "fonte";
export function PainelIluminacao(p: {
  estado: IluminacaoCena | null; erro: string | null; carregando: boolean;
  gesto: GestoIluminacao; primeiroPonto: { q: number; r: number } | null;
  paredeSelecionadaId: string | null;
  onSelecionarParede: (id: string | null) => void;
  onCancelarTraco: () => void;
  onGesto: (v: GestoIluminacao) => void;
  onModo: (v: ModoLuz) => Promise<unknown>;
  onParede: (v: ParedeLuz) => Promise<unknown>; onApagarParede: (id: string) => Promise<unknown>;
  onFonte: (v: FonteLuz) => Promise<unknown>; onApagarFonte: (id: string) => Promise<unknown>;
  tokens: { id: string; nome: string; visaoNoturna: boolean; revision: number }[];
  onVisaoNoturna: (id: string, revision: number, ativa: boolean) => Promise<unknown>;
  onAbrirPrevia: () => void;
  onFechar: () => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const [fonteId, setFonteId] = useState<string | null>(null);
  const fonte = p.estado?.fontes.find((f) => f.id === fonteId) ?? null;
  const parede = p.estado?.paredes.find((w) => w.id === p.paredeSelecionadaId) ?? null;
  const [rascunhoFonte, setRascunhoFonte] = useState<FonteLuz | null>(null);
  useEffect(() => { setRascunhoFonte(fonte); }, [fonte]);
  const executar = async (fn: () => Promise<unknown>) => { setSalvando(true); try { await fn(); } finally { setSalvando(false); } };

  return <JanelaFerramenta id="iluminacao" icone={<Lightbulb size={16} />} titulo="Iluminação"
    modo="Camada de iluminação" rotulo="Ferramenta Iluminação" rotuloFechar="Fechar ferramenta Iluminação" aoFechar={p.onFechar}>
    <div className="rv-fp-corpo rv-luz-painel">
      {p.carregando && <p role="status">Carregando iluminação…</p>}
      {p.erro && <p role="alert" className="rv-fp-erro">{p.erro}</p>}
      <fieldset disabled={salvando || !p.estado}>
        <legend>Desenhar no mapa</legend>
        <div className="rv-luz-modos" role="group" aria-label="Ferramenta de iluminação">
          {([ ["selecionar", "Selecionar"], ["parede", "Parede"], ["porta", "Porta"], ["fonte", "Luz"] ] as const).map(([id, rotulo]) =>
            <button key={id} type="button" aria-pressed={p.gesto === id} onClick={() => p.onGesto(id)}>{rotulo}</button>)}
        </div>
        <p>{p.gesto === "selecionar" ? "Clique em uma linha no mapa. Arraste as pontas para ajustar." :
          p.gesto === "fonte" ? "Clique no mapa para colocar uma luz." :
          p.primeiroPonto ? "Clique no próximo ponto para continuar a linha." : "Clique no primeiro ponto da linha."}</p>
        {p.primeiroPonto && <button type="button" className="rv-luz-cancelar" onClick={p.onCancelarTraco}>Terminar linha</button>}
      </fieldset>
      <section aria-label="Paredes">
        <h3>Paredes e portas <span>{p.estado?.paredes.length ?? 0}/600</span></h3>
        {!parede && <p>Selecione um segmento diretamente no mapa para editar.</p>}
        {parede && <div className="rv-luz-edicao">
          <strong>{parede.porta ? "Porta selecionada" : "Parede selecionada"}</strong>
          <label><input type="checkbox" checked={parede.porta} disabled={salvando} onChange={(e) => void executar(() => p.onParede({ ...parede, porta: e.target.checked, aberta: false }))} /> Porta</label>
          {parede.porta && <label><input type="checkbox" checked={parede.aberta} disabled={salvando} onChange={(e) => void executar(() => p.onParede({ ...parede, aberta: e.target.checked }))} /> Aberta</label>}
          <label><input type="checkbox" checked={parede.bloqueiaVisao} disabled={salvando} onChange={(e) => void executar(() => p.onParede({ ...parede, bloqueiaVisao: e.target.checked }))} /> Bloqueia visão</label>
          <label><input type="checkbox" checked={parede.bloqueiaLuz} disabled={salvando} onChange={(e) => void executar(() => p.onParede({ ...parede, bloqueiaLuz: e.target.checked }))} /> Bloqueia luz</label>
          <label><input type="checkbox" checked={parede.visivel} disabled={salvando} onChange={(e) => void executar(() => p.onParede({ ...parede, visivel: e.target.checked }))} /> Visível ao jogador</label>
          <button type="button" disabled={salvando} onClick={() => void executar(() => p.onApagarParede(parede.id))}><Trash2 size={13} /> Remover segmento</button>
        </div>}
      </section>
      <fieldset disabled={salvando || !p.estado}>
        <legend>Iluminação da cena</legend>
        <select aria-label="Iluminação ambiente" value={p.estado?.modo ?? "claro"}
          onChange={(e) => void executar(() => p.onModo(e.target.value as ModoLuz))}>
          <option value="claro">Luz do dia</option><option value="penumbra">Penumbra</option><option value="escuro">Escuro</option>
        </select>
      </fieldset>
      <section aria-label="Fontes de luz">
        <h3>Fontes ({p.estado?.fontes.length ?? 0}/16)</h3>
        <div className="rv-luz-lista">{p.estado?.fontes.map((f, i) => <button type="button" key={f.id}
          aria-pressed={fonteId === f.id} onClick={() => { setFonteId(f.id); p.onSelecionarParede(null); }}>
          Luz {i + 1} · {f.raioM} m{f.ativa ? "" : " · apagada"}
        </button>)}</div>
        {rascunhoFonte && <div className="rv-luz-edicao">
          <label>Raio (1–12 m)<input type="number" min={1} max={12} step={0.5} value={rascunhoFonte.raioM}
            onChange={(e) => setRascunhoFonte({ ...rascunhoFonte, raioM: Number(e.target.value) })} /></label>
          <label>Formato<select value={rascunhoFonte.formato} onChange={(e) => setRascunhoFonte({ ...rascunhoFonte,
            formato: e.target.value as FonteLuz["formato"], aberturaGraus: e.target.value === "cone" ? 45 : null })}>
            <option value="radial">Radial</option><option value="cone">Cone</option></select></label>
          {rascunhoFonte.formato === "cone" && <>
            <label>Abertura (°)<input type="number" min={1} max={180} value={rascunhoFonte.aberturaGraus ?? 45}
              onChange={(e) => setRascunhoFonte({ ...rascunhoFonte, aberturaGraus: Number(e.target.value) })} /></label>
            <label>Direção (°)<input type="number" min={0} max={359} value={rascunhoFonte.direcaoGraus}
              onChange={(e) => setRascunhoFonte({ ...rascunhoFonte, direcaoGraus: Number(e.target.value) })} /></label>
          </>}
          <label>Cor<input type="color" value={rascunhoFonte.cor} onChange={(e) => setRascunhoFonte({ ...rascunhoFonte, cor: e.target.value })} /></label>
          <label><input type="checkbox" checked={rascunhoFonte.ativa} onChange={(e) => setRascunhoFonte({ ...rascunhoFonte, ativa: e.target.checked })} /> Ligada</label>
          <label><input type="checkbox" checked={rascunhoFonte.visivel} onChange={(e) => setRascunhoFonte({ ...rascunhoFonte, visivel: e.target.checked })} /> Visível ao jogador</label>
          <button type="button" disabled={salvando} onClick={() => void executar(() => p.onFonte(rascunhoFonte))}>Salvar fonte</button>
          <button type="button" disabled={salvando} onClick={() => void executar(async () => { await p.onApagarFonte(rascunhoFonte.id); setFonteId(null); })}><Trash2 size={13} /> Remover fonte</button>
        </div>}
      </section>
      <section aria-label="Visão noturna">
        <h3>Visão noturna</h3>
        <p>Revela até 12 m para quem controla o token; paredes continuam bloqueando.</p>
        <div className="rv-luz-lista">{p.tokens.map((t) => <label key={t.id}>
          <input type="checkbox" checked={t.visaoNoturna} disabled={salvando}
            onChange={(e) => void executar(() => p.onVisaoNoturna(t.id, t.revision, e.target.checked))} /> {t.nome}
        </label>)}</div>
      </section>
      <button type="button" onClick={p.onAbrirPrevia}>Prévia da visão de um jogador</button>
    </div>
  </JanelaFerramenta>;
}
