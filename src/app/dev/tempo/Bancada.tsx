"use client";

import { useState } from "react";
import { JanelaTempo } from "../../mesas/[campaignId]/vtt/_shell/tempo/JanelaTempo";
import {
  CONDICOES_CLIMATICAS, ajustarContextoManual, avancarTempoImperial, definirClimaManual, minutoImperial,
  nomeCondicao, sortearClima, type TempoCampanha,
} from "../../mesas/[campaignId]/vtt/_dominio/tempoCampanha";
import type { MarcacaoCalendario } from "../../mesas/[campaignId]/vtt/_dominio/marcacoesCalendario";

const desde = minutoImperial({ ano: 186, mes: 12, dia: 16, hora: "20:00" })!;
const agora = minutoImperial({ ano: 186, mes: 12, dia: 17, hora: "20:00" })!;
const INICIAL: TempoCampanha = {
  ano: 186, mes: 12, dia: 17, hora: "20:00", regiao: "Vastra", condicao: "chuva_iridescente",
  temperaturaC: -10, temperaturaAlvoC: -10, vento: "fraco", aurora: false, descricao: "",
  climaDesdeMinuto: desde, climaAteMinuto: agora + 18 * 60, weatherSeed: 1, revision: 1,
};
const m = (id: string, dia: number, tipo: MarcacaoCalendario["tipo"], titulo: string, autorNome: string, visibilidade: MarcacaoCalendario["visibilidade"]): MarcacaoCalendario =>
  ({ id, ano: 186, mes: 12, dia, tipo, titulo, autorNome, visibilidade, oficial: autorNome === "Narrador", autorId: "" });
const MARCACOES: MarcacaoCalendario[] = [
  m("a", 3, "lembrete", "Reagrupar no cais", "Narrador", "mesa"),
  m("b", 9, "evento", "Festival das Brumas", "Narrador", "mesa"),
  m("c", 16, "lembrete", "Falar com o contato", "Você", "mesa"),
  m("d", 17, "prazo", "Prazo do contrato", "Narrador", "mesa"),
  m("e", 23, "prazo", "Entrega em Talesh", "Narrador", "narrador"),
  m("f", 28, "memoria", "Primeira nevasca", "Você", "privada"),
];

export function Bancada() {
  const [publicado, setPublicado] = useState(INICIAL);
  const [t, setT] = useState(INICIAL);
  const [marcacoes, setMarcacoes] = useState(MARCACOES);
  const mud = JSON.stringify(t) !== JSON.stringify(publicado);
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#02070b" }}>
      <JanelaTempo tempo={t} existeEstado ehNarrador temMudancas={mud} salvando={false} marcacoes={marcacoes}
        aoFechar={() => {}}
        aoEscolherDia={(d) => setT((a) => ajustarContextoManual(a, d))}
        aoAvancar={(min) => setT((a) => avancarTempoImperial(a, min) ?? a)}
        aoSortear={() => { const s = sortearClima(crypto.getRandomValues(new Uint32Array(1))[0], t); setT({ ...s, temperaturaC: s.temperaturaAlvoC }); return nomeCondicao(s.condicao); }}
        aoCiclarCondicao={(passo) => setT((a) => { const n = CONDICOES_CLIMATICAS.length; const i = CONDICOES_CLIMATICAS.findIndex((c) => c.id === a.condicao); return definirClimaManual(a, CONDICOES_CLIMATICAS[(i + passo + n) % n].id); })}
        aoMudarData={(c) => setT((a) => ajustarContextoManual(a, c))}
        aoAlterar={(c) => setT((a) => ({ ...a, ...c }))}
        aoPublicar={async () => { setPublicado(t); return true; }}
        aoTornarDiaAtual={(d) => setT((a) => ajustarContextoManual(a, d))}
        aoCriarMarcacao={async (nova) => { setMarcacoes((l) => [...l, { ...nova, id: `n${Date.now()}`, autorNome: "Você", autorId: "", oficial: true }]); return null; }} />
    </main>
  );
}
