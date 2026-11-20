"use client";

/**
 * ESTUDO da entrada da marca RUPTURA no login — /dev/login-titulo.
 * Três entradas de uma vez só ao carregar, inspiradas no React Bits
 * (DecryptedText, BlurText, varredura), refeitas em CSS/WAAPI sem
 * dependência nova. O eco laranja só começa a falhar depois que a
 * entrada termina. A tela real (`LoginForm.tsx`) segue intocada.
 */

import { useEffect, useRef, useState } from "react";
import { AuthMoldura, Decodifica } from "../../LoginForm";
import { oxanium } from "../../_design/oxanium";
import "../../_design/marca.css";
import "./titulo.css";

type Opcao = "atual" | "decodifica" | "foco" | "varredura";

const OPCOES: Array<[Opcao, string, string]> = [
  ["atual", "Atual", "Sem entrada: a marca já está lá."],
  ["decodifica", "A · Decodifica", "Glifos assentam letra a letra, da esquerda pra direita (~550ms)."],
  ["foco", "B · Foco", "Cada letra sobe e sai do desfoque, em cascata (~600ms)."],
  ["varredura", "C · Varredura", "Uma linha ciano passa e revela a marca, como a varredura da Forja (~500ms)."],
];

const TEXTO = "RUPTURA";
const GLIFOS = "ABCDEFGHJKLMNPRSTUVXZ0123456789/#%<>";
/** Quando a entrada termina e o eco pode começar a falhar. */
const DURACAO: Record<Opcao, number> = { atual: 0, decodifica: 560, foco: 620, varredura: 520 };

function MarcaEstudo({ opcao }: { opcao: Opcao }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [pronto, setPronto] = useState(opcao === "atual");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const calmo = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (calmo || opcao === "atual") { setPronto(true); return; }

    let raf = 0;
    if (opcao === "decodifica") {
      const letras = Array.from(el.querySelectorAll<HTMLElement>(".te-letra"));
      const inicio = performance.now() + 120;
      let ultimo = 0;
      const passo = (t: number) => {
        raf = requestAnimationFrame(passo);
        if (t - ultimo < 40) return;
        ultimo = t;
        let todas = true;
        letras.forEach((l, i) => {
          const fixa = t >= inicio + i * 60 + 60;
          l.dataset.fixa = fixa ? "1" : "0";
          if (!fixa) {
            todas = false;
            l.dataset.glifo = GLIFOS[Math.floor(Math.random() * GLIFOS.length)];
          }
        });
        if (todas) cancelAnimationFrame(raf);
      };
      raf = requestAnimationFrame(passo);
    }
    const fim = window.setTimeout(() => setPronto(true), DURACAO[opcao] + 60);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(fim); };
  }, [opcao]);

  return (
    <h1
      ref={ref}
      className={`ds-marca ${oxanium.variable} rv-marca te-marca`}
      data-entrada={opcao}
      data-pronto={pronto ? "1" : "0"}
      aria-label={TEXTO}
    >
      <span className="ds-marca__logo" aria-hidden="true">
        {TEXTO.split("").map((c, i) => (
          <span key={i} className="te-letra" data-fixa="0" style={{ ["--i" as string]: i }}>{c}</span>
        ))}
      </span>
      <span aria-hidden="true" className="ds-marca__eco">{TEXTO}</span>
    </h1>
  );
}

export function TituloEstudo() {
  const [opcao, setOpcao] = useState<Opcao>("decodifica");
  const [rodada, setRodada] = useState(0);
  const descricao = OPCOES.find(([id]) => id === opcao)?.[2];

  return (
    <>
      <AuthMoldura rodape={<>ESTUDO · ENTRADA DA MARCA</>}>
        <div className="rv-header" key={`${opcao}-${rodada}`}>
          <div className="rv-brand">
            <MarcaEstudo opcao={opcao} />
            <p className="rv-subtitle"><Decodifica texto="VIRTUAL TABLETOP" atraso={650} /></p>
          </div>
        </div>
        <p className="te-nota">{descricao}</p>
      </AuthMoldura>

      <nav className="te-controles" aria-label="Opções de entrada">
        {OPCOES.map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            className="te-botao"
            aria-pressed={opcao === id}
            onClick={() => { setOpcao(id); setRodada((r) => r + 1); }}
          >
            {rotulo}
          </button>
        ))}
        <span className="te-sep" aria-hidden="true" />
        <button type="button" className="te-botao" onClick={() => setRodada((r) => r + 1)}>
          Repetir
        </button>
      </nav>
    </>
  );
}
