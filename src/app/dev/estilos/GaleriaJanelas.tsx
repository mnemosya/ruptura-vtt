"use client";

/**
 * JANELAS DE FERRAMENTA — as peças flutuantes que abrem sobre o palco.
 *
 * Todas nascem da mesma casca (`_shell/JanelaFerramenta.tsx`): espinha
 * com índice e código vertical, cantos em bracket, cabeçalho que é a
 * alça de arrasto, e um corpo próprio. O que muda de uma pra outra é o
 * corpo — e é isso que a galeria põe lado a lado.
 *
 * Duas coisas são obrigatórias e fáceis de esquecer:
 *
 *   · `ProvedorJanelasFerramenta` — sem ele a janela nunca resolve a
 *     posição de abertura e fica em `visibility: hidden`. Ela lê a
 *     âncora lembrada por usuário/campanha.
 *   · um palco alto — a janela é `position: absolute` e se ancora no
 *     alto; num bloco curto ela vaza pela borda.
 */

import { useState } from "react";
import { ProvedorJanelasFerramenta } from "../../mesas/[campaignId]/vtt/_shell/JanelaFerramenta";
import { PainelMedir } from "../../mesas/[campaignId]/vtt/_shell/PainelMedir";
import { type ModoMedicao, MODO_MEDICAO_PADRAO } from "../../mesas/[campaignId]/vtt/_dominio/medicaoRegua";
import { PainelMarcar } from "../../mesas/[campaignId]/vtt/_shell/PainelMarcar";
import { CAMADAS_PADRAO, PainelCamadas } from "../../mesas/[campaignId]/vtt/_shell/PainelCamadas";
import { PainelDados } from "../../mesas/[campaignId]/vtt/_shell/PainelDados";
import { JanelaFerramenta } from "../../mesas/[campaignId]/vtt/_shell/JanelaFerramenta";
import { ProvedorMesaDados } from "../../mesas/[campaignId]/vtt/_dados3d/ContextoMesaDados";
import { MesaDadosOverlay } from "../../mesas/[campaignId]/vtt/_dados3d/MesaDadosOverlay";
import { Ruler } from "lucide-react";

const SEM_EFEITO = () => {};

/**
 * Palco de janela — provedor + altura.
 *
 * `key` no provedor força a janela a remontar quando o exemplo muda:
 * a posição de abertura é resolvida UMA vez por montagem, então sem
 * isso a segunda variação herdaria a âncora da primeira.
 */
function PalcoJanela({ chave, children }: { chave: string; children: React.ReactNode }) {
  return (
    <div className="gal-palco gal-palco--alto">
      <ProvedorJanelasFerramenta key={chave} campaignId="galeria" usuarioId="galeria">
        {children}
      </ProvedorJanelasFerramenta>
    </div>
  );
}

/* ── medir ───────────────────────────────────────────────────────── */

export function VitrineMedir() {
  const [modo, setModo] = useState<ModoMedicao>(MODO_MEDICAO_PADRAO);
  const [medindo, setMedindo] = useState(true);

  return (
    <>
      <div className="gal-abas" role="group" aria-label="Estado da medição">
        <button type="button" className="gal-aba" aria-selected={medindo} onClick={() => setMedindo(true)}>Medindo</button>
        <button type="button" className="gal-aba" aria-selected={!medindo} onClick={() => setMedindo(false)}>Sem régua</button>
      </div>
      <PalcoJanela chave={`medir-${medindo}`}>
        <PainelMedir
          modo={modo}
          onModo={setModo}
          /* Régua de dois trechos (uma dobra fixada) atravessando
             terreno difícil: o custo sai maior que a distância, que é
             exatamente a diferença que o painel existe pra mostrar. */
          resumo={medindo ? { trechos: [4, 3], metros: 7, custo: 9, atravessaBloqueio: false } : null}
          dobras={medindo ? 1 : 0}
          permanentesNaCena={2}
          permanentesQuePodeLimpar={2}
          limpando={false}
          onLimpar={SEM_EFEITO}
          onFechar={SEM_EFEITO}
        />
      </PalcoJanela>
    </>
  );
}

/* ── marcar ──────────────────────────────────────────────────────── */

export function VitrineMarcar() {
  const [sinal, setSinal] = useState<Parameters<typeof PainelMarcar>[0]["sinal"]>("alvo");
  const [cor, setCor] = useState<Parameters<typeof PainelMarcar>[0]["cor"]>("ciano");
  const [duracao, setDuracao] = useState<Parameters<typeof PainelMarcar>[0]["duracao"]>("persistente");
  const [texto, setTexto] = useState("Escotilha arrombada");
  const [privada, setPrivada] = useState(false);
  const [emCombate, setEmCombate] = useState(true);

  return (
    <>
      <div className="gal-abas" role="group" aria-label="Contexto da marcação">
        <button type="button" className="gal-aba" aria-selected={emCombate} onClick={() => setEmCombate(true)}>Em combate</button>
        <button type="button" className="gal-aba" aria-selected={!emCombate} onClick={() => setEmCombate(false)}>Fora de combate</button>
      </div>
      <span className="gal-nota">
        Fora de combate a duração “esta rodada” some — não há rodada pra contar.
      </span>
      <PalcoJanela chave={`marcar-${emCombate}`}>
        <PainelMarcar
          sinal={sinal} onSinal={setSinal}
          duracao={duracao} onDuracao={setDuracao}
          emCombate={emCombate}
          cor={cor} onCor={setCor}
          texto={texto} onTexto={setTexto}
          privada={privada} onPrivada={setPrivada}
          naCena={4}
          quePodeLimpar={4}
          limpando={false}
          onLimpar={SEM_EFEITO}
          onFechar={SEM_EFEITO}
          ehNarrador
        />
      </PalcoJanela>
    </>
  );
}

/* ── camadas ─────────────────────────────────────────────────────── */

export function VitrineCamadas() {
  const [erro, setErro] = useState(false);
  /* Parte do padrão, com duas mexidas: objetos bloqueados (não dá pra
     arrastar) e a grade escondida — os dois estados que o painel
     desenha diferente. */
  const camadas = {
    ...CAMADAS_PADRAO,
    objetos: { visivel: true, bloqueada: true },
    grade: { visivel: false, bloqueada: false },
  };
  return (
    <>
      <div className="gal-abas" role="group" aria-label="Estado do painel de camadas">
        <button type="button" className="gal-aba" aria-selected={!erro} onClick={() => setErro(false)}>Normal</button>
        <button type="button" className="gal-aba" aria-selected={erro} onClick={() => setErro(true)}>Recusa do servidor</button>
      </div>
      <div className="gal-palco gal-palco--medio">
        <PainelCamadas
          aberto
          camadas={camadas}
          erro={erro ? "Só o narrador pode bloquear a camada de terreno." : null}
          onAlternarVisivel={SEM_EFEITO}
          onAlternarBloqueio={SEM_EFEITO}
          onRestaurarPadrao={SEM_EFEITO}
          onFechar={SEM_EFEITO}
          botaoRef={{ current: null }}
        />
      </div>
    </>
  );
}

/* ── a casca, sozinha ────────────────────────────────────────────── */

/**
 * A moldura sem corpo de ferramenta nenhum.
 *
 * Vale ter isolada porque tudo que é comum a oito janelas mora aqui: se
 * a espinha mudar de largura ou o cabeçalho de altura, muda nas oito de
 * uma vez, e é nesta aba que dá pra ver isso sem abrir as outras.
 */
export function VitrineMoldura() {
  return (
    <PalcoJanela chave="moldura">
      <JanelaFerramenta
        id="medir"
        icone={<Ruler size={16} />}
        titulo="Título da ferramenta"
        modo="linha de estado — o que estou fazendo agora"
        rotulo="Moldura de exemplo"
        rotuloFechar="Fechar"
        aoFechar={SEM_EFEITO}
      >
        <div className="rv-fp-corpo">
          <p className="pn-texto">
            Corpo da janela. A casca entrega espinha, cantos, cabeçalho com alça de arrasto
            e o botão de fechar; o resto é de cada ferramenta.
          </p>
        </div>
      </JanelaFerramenta>
    </PalcoJanela>
  );
}

/* ── dados ───────────────────────────────────────────────────────── */

/**
 * A ferramenta de dados é a moldura + o rolador, e precisa do palco:
 * `campaignId: null` é o modo ensaio (a rolagem não vira registro), o
 * mesmo que o harness `/dev/dados` usa.
 */
export function VitrineDados() {
  return (
    <ProvedorMesaDados>
      <div className="gal-rolagem">
        <div className="gal-palco gal-palco--alto">
          <ProvedorJanelasFerramenta campaignId="galeria" usuarioId="galeria">
            <PainelDados onFechar={SEM_EFEITO} campaignId={null} personagemSugerido={null} />
          </ProvedorJanelasFerramenta>
        </div>
        <div className="rv-palco gal-rolagem-palco">
          <span className="gal-rolagem-etiqueta">palco (simulado)</span>
          <MesaDadosOverlay />
        </div>
      </div>
    </ProvedorMesaDados>
  );
}
