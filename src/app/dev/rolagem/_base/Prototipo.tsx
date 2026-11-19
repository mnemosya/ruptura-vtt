"use client";

/**
 * CASCA DE UM PROTÓTIPO — a mesa simulada: `.rv-mesa` com o tema Forja
 * (o mesmo `useTemaVtt` do VTT), um `.rv-palco` com tokens clicáveis, a
 * janela "Rolar Dados", o painel do chat e a bancada. A camada dos
 * dados cai por cima de tudo, atravessável, como no VTT.
 */

import { useEffect, useState } from "react";
import { Dices } from "lucide-react";
import { useTemaVtt } from "../../../mesas/[campaignId]/vtt/_tema/useTemaVtt";
import { ProvedorJanelasFerramenta } from "../../../mesas/[campaignId]/vtt/_shell/JanelaFerramenta";
import { ProvedorMesa } from "./MesaDupla";
import { ProvedorProto, useProto, type Proposta } from "./estado";
import { JanelaRolar } from "./Janela";
import { ChatFalso } from "./Chat";
import { Bancada } from "./Bancada";

function usePrefereMenosMovimento() {
  const [reduz, setReduz] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const ler = () => setReduz(mq.matches);
    ler();
    mq.addEventListener("change", ler);
    return () => mq.removeEventListener("change", ler);
  }, []);
  return reduz;
}

const TOKENS = [
  { id: "t1", sigla: "ILY", x: 46, y: 44, lado: "pj" },
  { id: "t2", sigla: "DOR", x: 52, y: 57, lado: "pj" },
  { id: "t3", sigla: "SEN", x: 63, y: 38, lado: "pn" },
] as const;

/** Mapa de mentira: só o que prova que a mesa continua clicável enquanto os dados caem. */
function MapaFalso() {
  const [sel, setSel] = useState<string | null>(null);
  return (
    <div className="rp-mapa" onClick={() => setSel(null)}>
      {TOKENS.map((t) => (
        <button key={t.id} type="button" className="rp-token" data-lado={t.lado} aria-pressed={sel === t.id}
          style={{ left: `${t.x}%`, top: `${t.y}%` }}
          onClick={(e) => { e.stopPropagation(); setSel(sel === t.id ? null : t.id); }}
          aria-label={`Token ${t.sigla}`}>
          {t.sigla}
        </button>
      ))}
      <p className="rp-mapa-sel" aria-live="polite">{sel ? `Token selecionado: ${TOKENS.find((t) => t.id === sel)?.sigla}` : ""}</p>
    </div>
  );
}

function Mesa() {
  const s = useProto();
  const { proposta } = s;
  return (
    <div className={`rv-mesa rp-raiz ${proposta.classe}`} data-papel={s.papel} data-proposta={proposta.id}>
      <Bancada />
      <main className="rv-palco rp-palco">
        <MapaFalso />
        {proposta.Superficie && <proposta.Superficie />}
        {!proposta.Superficie && s.papel === "rola" && s.janelaAberta && <JanelaRolar />}
        {!proposta.Superficie && s.papel === "rola" && !s.janelaAberta && (
          <button type="button" className="rp-reabrir" onClick={() => s.setJanelaAberta(true)}>
            <Dices size={16} aria-hidden="true" /> Rolar Dados
          </button>
        )}
        {s.papel === "observa" && !proposta.Superficie && (
          <p className="rp-observando" role="status">
            Vendo como outro jogador da mesa · a janela de quem rola não aparece aqui
          </p>
        )}
        <ChatFalso />
      </main>
      {proposta.Extras && <proposta.Extras />}
    </div>
  );
}

export function Prototipo({ proposta }: { proposta: Proposta }) {
  useTemaVtt();
  const prefere = usePrefereMenosMovimento();
  const [simulado, setSimulado] = useState(false);
  const reduzido = prefere || simulado;
  return (
    <ProvedorMesa reduzido={reduzido}>
      <ProvedorProto proposta={proposta} reduzidoSimulado={simulado} setReduzidoSimulado={setSimulado}>
        <ProvedorJanelasFerramenta campaignId="prototipo-rolagem" usuarioId={null}>
          <div data-reduzido={reduzido || undefined} className="rp-escopo">
            <Mesa />
          </div>
        </ProvedorJanelasFerramenta>
      </ProvedorProto>
    </ProvedorMesa>
  );
}
