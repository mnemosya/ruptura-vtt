"use client";

/**
 * ESTUDO da tela "Entrar na campanha?" do convite — /dev/convite-estudo.
 * Só visual: o botão não faz nada. A tela real é `TelaJoinConfirmar`
 * (`join/[token]/JoinTelas.tsx`), intocada.
 *   Atual          título-pergunta + cartão + e-mail solto + botão
 *   A · Campanha   o nome da campanha vira o título; o resto vira uma linha
 *   B · Credencial cartão único com os dados em linhas e o botão encaixado
 */

import { useState } from "react";
import { AuthMoldura, Decodifica } from "../../LoginForm";
import { TelaJoinConfirmar } from "../../join/[token]/JoinTelas";
import { oxanium } from "../../_design/oxanium";
import "../../_design/auth.css";
import "./convite.css";

type Opcao = "atual" | "a" | "b";

const CAMPANHA = "Os Ecos de Vosek";
const EMAIL = "jogadora@exemplo.com";

const OPCOES: Array<[Opcao, string]> = [
  ["atual", "Atual"],
  ["a", "A · Campanha"],
  ["b", "B · Credencial"],
];

function OpcaoA() {
  return (
    <AuthMoldura>
      <div className="rv-header">
        <div className="rv-brand">
          <p className="rv-subtitle"><Decodifica texto="CONVITE PARA" atraso={150} /></p>
          <h1 className={`ce-a-nome ${oxanium.variable}`}>{CAMPANHA}</h1>
          <p className="ce-a-meta">
            <span>ACESSO <span className="rv-val--amber">JOGADOR</span></span>
            <span className="ce-a-sep" aria-hidden="true" />
            <span>{EMAIL}</span>
          </p>
        </div>
      </div>
      <div className="rv-join-acoes ce-a-acoes">
        <button type="button" className="auth-submit-btn auth-submit-btn--cyan">ENTRAR NA CAMPANHA</button>
        <a href="#" className="rv-join-voltar">AGORA NÃO</a>
      </div>
    </AuthMoldura>
  );
}

function OpcaoB() {
  return (
    <AuthMoldura>
      <div className="rv-header">
        <div className="rv-brand">
          <h1 className="rv-join-titulo">Entrar na campanha?</h1>
          <p className="rv-subtitle"><Decodifica texto="CONVITE RECEBIDO" atraso={250} /></p>
        </div>
      </div>
      <div className="ce-b">
        <div className="ce-b-cartao">
          <span className="rv-label">CAMPANHA</span>
          <strong className="ce-b-nome">{CAMPANHA}</strong>
          <dl className="ce-b-linhas">
            <div><dt>ACESSO</dt><dd className="rv-val--amber">JOGADOR</dd></div>
            <div><dt>ENTRAR COMO</dt><dd>{EMAIL}</dd></div>
          </dl>
        </div>
        <button type="button" className="auth-submit-btn auth-submit-btn--cyan ce-b-botao">ENTRAR NA CAMPANHA</button>
      </div>
      <a href="#" className="rv-join-voltar">AGORA NÃO</a>
    </AuthMoldura>
  );
}

export function ConviteEstudo() {
  const [opcao, setOpcao] = useState<Opcao>("a");
  return (
    <>
      {opcao === "atual" && <TelaJoinConfirmar token="demo" campanha={CAMPANHA} email={EMAIL} demo />}
      {opcao === "a" && <OpcaoA />}
      {opcao === "b" && <OpcaoB />}
      <nav className="ce-controles" aria-label="Opções de design">
        {OPCOES.map(([id, rotulo]) => (
          <button key={id} type="button" className="ce-botao" aria-pressed={opcao === id} onClick={() => setOpcao(id)}>
            {rotulo}
          </button>
        ))}
      </nav>
    </>
  );
}
