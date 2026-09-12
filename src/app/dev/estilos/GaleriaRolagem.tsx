"use client";

/**
 * ROLAGEM — o vocabulário de `_dados3d/ResultadoRolagem.tsx`.
 *
 * Aquele arquivo exporta VINTE E TRÊS peças, e é o módulo mais
 * reaproveitado do produto: a ferramenta da mesa, o Console do
 * Personagem (em `/ficha`, fora do VTT) e o card de teste do Chat
 * desenham todos a partir dele. Uma peça que muda aqui muda em três
 * superfícies de uma vez — daí a bancada.
 *
 * O que NÃO cabe em bancada fica no palco: o rolador inteiro e a mesa
 * 3D precisam do `ProvedorMesaDados`, porque quem rola pede a física
 * pro palco e espera o resultado dele.
 */

import { useState } from "react";
import { Bancada } from "./GaleriaVocabulario";
import { PolyDie } from "../../mesas/[campaignId]/vtt/_dados3d/PolyDie";
import {
  ACCENTS, CampoCD, DadosRolados, FaixaResultado, GroupLabel, Leitura, MolduraRolagem,
  RESULTS, RollButton, Select, SeletorVisibilidade, Stepper, VISIBILIDADES,
  type ResultKey,
} from "../../mesas/[campaignId]/vtt/_dados3d/ResultadoRolagem";
import { BandejaDados, RoladorDados } from "../../mesas/[campaignId]/vtt/_dados3d/RoladorDados";
import { ProvedorMesaDados } from "../../mesas/[campaignId]/vtt/_dados3d/ContextoMesaDados";
import { MesaDadosOverlay } from "../../mesas/[campaignId]/vtt/_dados3d/MesaDadosOverlay";
import type { TableLogVisibility } from "../../../lib/table";

const SEM_EFEITO = () => {};

/** As seis faixas na ordem da régua, do melhor pro pior. */
const FAIXAS: ResultKey[] = [
  "sucesso_critico", "sucesso_padrao", "sucesso_limitado",
  "falha_limitada", "falha", "falha_critica",
];

/**
 * Palco de mentira com o provedor da mesa.
 *
 * `ProvedorMesaDados` conta palcos montados: sem nenhum, quem pede uma
 * rolagem fica esperando para sempre, porque não existe onde os corpos
 * caiam. É por isso que o palco vem junto do rolador aqui, e não como
 * uma peça separada que se possa esquecer de abrir.
 */
function Palco({ children }: { children: React.ReactNode }) {
  return (
    <ProvedorMesaDados>
      <div className="gal-rolagem">
        <div className="gal-rolagem-controles">{children}</div>
        <div className="rv-palco gal-rolagem-palco" data-testid="palco-simulado">
          <span className="gal-rolagem-etiqueta">palco (simulado)</span>
          <MesaDadosOverlay />
        </div>
      </div>
    </ProvedorMesaDados>
  );
}

/* ── peças puras ─────────────────────────────────────────────────── */

export function VitrineCampos() {
  const [atributo, setAtributo] = useState("corpo");
  const [pericia, setPericia] = useState("luta");
  const [mods, setMods] = useState(0);
  const [cd, setCd] = useState("10");
  const [visibilidade, setVisibilidade] = useState<TableLogVisibility>("public");

  return (
    <div className="rv-painel gal-vitrine">
      <Bancada nome="GroupLabel" nota="cabeçalho de grupo, com e sem peça à direita">
        <div className="gal-empilha">
          <GroupLabel>Teste de Ruptura</GroupLabel>
          <GroupLabel right={<span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#4f6285" }}>3d8</span>}>
            Avançado
          </GroupLabel>
        </div>
      </Bancada>

      <Bancada nome="Select" nota="dropdown do rolador; habilitado e desabilitado">
        <div className="gal-grade2">
          <Select
            label="Atributo · nº d8"
            value={atributo}
            onChange={setAtributo}
            options={[
              { id: "corpo", rotulo: "Corpo · 4d8" },
              { id: "mente", rotulo: "Mente · 3d8" },
              { id: "animo", rotulo: "Ânimo · 2d8" },
            ]}
          />
          <Select
            label="Perícia · bônus"
            value={pericia}
            onChange={setPericia}
            disabled
            options={[{ id: "luta", rotulo: "Luta · +2" }]}
          />
        </div>
      </Bancada>

      <Bancada nome="Leitura" nota="o gêmeo somente-leitura do Select — quem mostra resultado não pode mudá-lo">
        <div className="gal-grade2">
          <Leitura label="Atributo · nº d8">Corpo · 4d8</Leitura>
          <Leitura label="Perícia · bônus">Luta · +2</Leitura>
        </div>
      </Bancada>

      <Bancada nome="Stepper" nota="zero é cinza, positivo é verde, negativo é vermelho">
        <div className="gal-linha">
          <Stepper value={mods} onChange={setMods} />
          <Stepper value={0} onChange={SEM_EFEITO} />
          <Stepper value={3} onChange={SEM_EFEITO} />
          <Stepper value={-2} onChange={SEM_EFEITO} />
        </div>
      </Bancada>

      <Bancada nome="CampoCD" nota="vazio = rolagem aberta, sem sucesso nem margem">
        <div className="gal-empilha">
          <CampoCD value={cd} onChange={setCd} />
          <CampoCD value="" onChange={SEM_EFEITO} />
        </div>
      </Bancada>

      <Bancada nome="SeletorVisibilidade" nota="narrador vê as três opções; jogador não vê 'Narrador'">
        <div className="gal-empilha">
          <SeletorVisibilidade valor={visibilidade} onChange={setVisibilidade} ehNarrador />
          <SeletorVisibilidade valor="private" onChange={SEM_EFEITO} ehNarrador={false} />
        </div>
        <span className="gal-nota">
          {VISIBILIDADES.map((v) => `${v.label}: ${v.dica}`).join(" · ")}
        </span>
      </Bancada>

      <Bancada nome="RollButton" nota="segura pra carregar; solta pra lançar. Sólido, contornado e desabilitado">
        <div className="gal-empilha gal-empilha--largo">
          <RollButton label="Rolar 4d8" solid onRoll={SEM_EFEITO} />
          <RollButton label="Rolar 4d8" onRoll={SEM_EFEITO} />
          <RollButton label="Escolha dados" disabled onRoll={SEM_EFEITO} />
        </div>
      </Bancada>
    </div>
  );
}

export function VitrineDadosEFaixa() {
  return (
    <div className="rv-painel gal-vitrine">
      <Bancada nome="PolyDie" nota="os seis formatos, no estado normal">
        <div className="gal-linha">
          {[4, 6, 8, 10, 12, 20].map((s) => <PolyDie key={s} sides={s} size={46} />)}
        </div>
      </Bancada>

      <Bancada nome="PolyDie · estados" nota="normal, aceso, apagado (pool não rolado) e com rótulo">
        <div className="gal-linha">
          <PolyDie sides={8} value={5} size={46} />
          <PolyDie sides={8} value={8} active size={46} />
          <PolyDie sides={8} dim size={46} />
          <PolyDie sides={8} value={7} size={46} label="d8" />
          <PolyDie sides={8} semValor size={46} />
        </div>
      </Bancada>

      <Bancada nome="DadosRolados" nota="a fileira parada: o que valeu acende. Sem acento é o ciano do chassi">
        <div className="gal-empilha">
          <DadosRolados dados={[6, 8, 3, 8]} maiorDado={8} size={40} landed />
          <DadosRolados dados={[2, 5]} maiorDado={-1} size={40} dim />
        </div>
      </Bancada>

      <Bancada nome="DadosRolados · acento por faixa" nota="com classificação, o dado aceso segue o veredito">
        <div className="gal-empilha">
          {FAIXAS.map((f) => (
            <div key={f} className="gal-linha">
              <DadosRolados dados={[4, 7]} maiorDado={7} size={36} landed acento={RESULTS[f].accent} />
              <span className="gal-nota">{RESULTS[f].label}</span>
            </div>
          ))}
        </div>
      </Bancada>

      <Bancada nome="FaixaResultado" nota="as seis faixas, mais o caso sem CD e a nota de promoção por talento">
        <div className="gal-empilha gal-empilha--largo">
          {FAIXAS.map((f, i) => (
            <FaixaResultado
              key={f}
              r={{
                maiorDado: 8 - i, pericia: i % 2 ? "Luta" : null, periciaValor: i % 2 ? 2 : 0,
                modificador: i === 0 ? 3 : 0, total: 13 - i * 2, cd: 10, classificacao: f,
              }}
            />
          ))}
          <FaixaResultado r={{ maiorDado: 2, pericia: null, periciaValor: 0, modificador: 0, total: 2, cd: null, classificacao: null }} />
          <FaixaResultado
            r={{ maiorDado: 7, pericia: "Arcana", periciaValor: 4, modificador: 0, total: 11, cd: 10, classificacao: "sucesso_critico" }}
            nota={
              <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: ACCENTS.arcane.hex }}>
                margem promovida por Foco Sináptico
              </div>
            }
          />
        </div>
      </Bancada>
    </div>
  );
}

export function VitrineMoldura() {
  return (
    <div className="gal-empilha gal-empilha--largo">
      <MolduraRolagem
        indice="01"
        codigo="Rolagem"
        titulo="Rolar Dados"
        modo="d8 · maior dado + perícia + modificadores"
        aoFechar={SEM_EFEITO}
        rotuloFechar="Fechar"
        largura={470}
      >
        <p className="pn-texto">Corpo da janela. A moldura desenha a espinha, os cantos e o cabeçalho.</p>
      </MolduraRolagem>

      <MolduraRolagem
        indice="02"
        codigo="Console"
        titulo="Teste de Perícia"
        acento={ACCENTS.arcane.hex}
        aoFechar={SEM_EFEITO}
        rotuloFechar="Fechar"
        largura={380}
      >
        <p className="pn-texto">Outra largura, outro acento, sem a linha de modo.</p>
      </MolduraRolagem>
    </div>
  );
}

/* ── peças de palco ──────────────────────────────────────────────── */

export function VitrineRolador() {
  return (
    <Palco>
      <RoladorDados />
    </Palco>
  );
}

export function VitrineBandeja() {
  return (
    <Palco>
      <BandejaDados />
    </Palco>
  );
}

export function VitrineMesa3D() {
  return (
    <Palco>
      <p className="pn-texto">
        A mesa desenha quando alguém pede uma rolagem. Use o rolador ao lado — a arena aparece
        sobre o palco, os corpos caem e o valor sai da face que ficou para cima.
      </p>
      <RoladorDados />
    </Palco>
  );
}
