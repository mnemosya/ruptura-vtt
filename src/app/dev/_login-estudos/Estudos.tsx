"use client";

/**
 * ESTUDOS de composição da tela de acesso — três direções tiradas de
 * clients reais de jogo, uma por rota:
 *   /dev/login-a  coluna lateral  (Riot Client, launcher do Star Citizen)
 *   /dev/login-b  tela de título  (Destiny 2, Warframe)
 *   /dev/login-c  launcher        (EVE Online, Battle.net)
 *
 * Só visual. Os campos aceitam digitação, mas nenhum formulário é
 * enviado, e a conta do estudo C é dado de exemplo. A tela real segue
 * em `LoginForm.tsx`, intocada.
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { MarcaRuptura } from "../../_design/Marca";
import { oxanium } from "../../_design/oxanium";
import { Eye, EyeOff } from "../../_design/icons";
import "./estudos.css";

type Modo = "entrar" | "criar";

function Trocador({ atual }: { atual: "a" | "b" | "c" }) {
  const itens: Array<[string, string, string]> = [
    ["a", "/dev/login-a", "A · Coluna"],
    ["b", "/dev/login-b", "B · Título"],
    ["c", "/dev/login-c", "C · Launcher"],
    ["atual", "/dev/login", "Tela atual"],
  ];
  return (
    <nav className="le-trocador" aria-label="Estudos da tela de acesso">
      <span className="le-trocador-tag">Estudo</span>
      {itens.map(([id, href, rotulo]) => (
        <Link key={id} href={href} className="le-trocador-link" aria-current={id === atual ? "page" : undefined}>
          {rotulo}
        </Link>
      ))}
    </nav>
  );
}

function Campo({ id, rotulo, tipo = "text", placeholder, autoComplete }: {
  id: string; rotulo: string; tipo?: string; placeholder?: string; autoComplete?: string;
}) {
  return (
    <div className="le-campo">
      <label htmlFor={id}>{rotulo}</label>
      <input id={id} type={tipo} placeholder={placeholder} autoComplete={autoComplete} />
    </div>
  );
}

function CampoSenha({ id, rotulo, acao, semRotulo }: { id: string; rotulo: string; acao?: ReactNode; semRotulo?: boolean }) {
  const [ver, setVer] = useState(false);
  return (
    <div className="le-campo">
      {!semRotulo && (
        <div className="le-campo-topo">
          <label htmlFor={id}>{rotulo}</label>
          {acao}
        </div>
      )}
      <div className="le-campo-senha">
        <input
          id={id}
          type={ver ? "text" : "password"}
          autoComplete="off"
          placeholder={semRotulo ? rotulo : undefined}
          aria-label={semRotulo ? rotulo : undefined}
        />
        <button type="button" className="le-olho" onClick={() => setVer((v) => !v)} aria-label={ver ? "Ocultar senha" : "Mostrar senha"}>
          {ver ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

/** Formulário comum aos estudos A e B: um só modo por vez, troca por link. */
function Formulario({ prefixo, modo }: { prefixo: string; modo: Modo }) {
  return (
    <form className="le-form" onSubmit={(e) => e.preventDefault()} noValidate>
      {modo === "criar" && <Campo id={`${prefixo}-nome`} rotulo="Nome de exibição" autoComplete="off" />}
      <Campo id={`${prefixo}-email`} rotulo="E-mail" tipo="email" autoComplete="off" />
      <CampoSenha
        id={`${prefixo}-senha`}
        rotulo="Senha"
        acao={modo === "entrar" && <button type="button" className="le-link">Recuperar senha</button>}
      />
      <button type="submit" className={`le-botao${modo === "criar" ? " le-botao--ambar" : ""}`}>
        {modo === "entrar" ? "Iniciar sessão" : "Criar conta"}
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ A */

const REGIOES = [
  { nome: "Kravus", arte: "/forja/regioes/kravus.webp" },
  { nome: "Vastra", arte: "/forja/regioes/vastra.webp" },
  { nome: "Talesh", arte: "/forja/regioes/talesh.webp" },
];

/** Coluna lateral: formulário quieto numa coluna sólida, arte descoberta no resto. */
export function EstudoA() {
  const [modo, setModo] = useState<Modo>("entrar");
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setI((n) => (n + 1) % REGIOES.length), 9000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className={`le-root le-a ${oxanium.variable}`}>
      <Trocador atual="a" />

      <main className="le-a-coluna">
        <header className="le-a-marca">
          <MarcaRuptura style={{ "--ds-marca-tamanho": "34px" } as CSSProperties} />
          <span className="le-meta">Virtual Tabletop</span>
        </header>

        <section className="le-a-meio" key={modo}>
          <h2 className="le-titulo">{modo === "entrar" ? "Entrar" : "Criar conta"}</h2>
          <Formulario prefixo="a" modo={modo} />
          <p className="le-troca">
            {modo === "entrar" ? "Ainda não tem conta?" : "Já tem conta?"}{" "}
            <button type="button" className="le-link le-link--forte" onClick={() => setModo(modo === "entrar" ? "criar" : "entrar")}>
              {modo === "entrar" ? "Criar conta" : "Entrar"}
            </button>
          </p>
        </section>

        <footer className="le-a-pe">
          <span className="le-meta">Ruptura VTT v0.0.1</span>
          <span className="le-meta">Acesso restrito</span>
        </footer>
      </main>

      <div className="le-a-arte" aria-hidden="true">
        {REGIOES.map((r, n) => (
          <div key={r.nome} className="le-a-quadro" data-ativo={n === i || undefined} style={{ backgroundImage: `url(${r.arte})` }} />
        ))}
        <div className="le-a-veu" />
        <div className="le-a-legenda">
          <span className="le-a-legenda-nome" key={i}>{REGIOES[i].nome}</span>
          <span className="le-a-marcas">
            {REGIOES.map((r, n) => <i key={r.nome} data-ativo={n === i || undefined} />)}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ B */

/** Tela de título: a marca é o centro da tela, direto sobre a arte, sem painel. */
export function EstudoB() {
  const [modo, setModo] = useState<Modo>("entrar");
  return (
    <div className={`le-root le-b ${oxanium.variable}`}>
      <Trocador atual="b" />
      <div className="le-b-arte" aria-hidden="true" />

      <main className="le-b-palco">
        <header className="le-b-marca">
          <MarcaRuptura style={{ "--ds-marca-tamanho": "clamp(72px, 12.5vw, 196px)" } as CSSProperties} />
          <span className="le-b-sub">Virtual Tabletop</span>
        </header>

        <section className="le-b-form" key={modo}>
          <Formulario prefixo="b" modo={modo} />
          <p className="le-troca">
            {modo === "entrar" ? "Ainda não tem conta?" : "Já tem conta?"}{" "}
            <button type="button" className="le-link le-link--forte" onClick={() => setModo(modo === "entrar" ? "criar" : "entrar")}>
              {modo === "entrar" ? "Criar conta" : "Entrar"}
            </button>
          </p>
        </section>
      </main>

      <footer className="le-b-barra">
        <span className="le-meta"><i className="le-ponto" aria-hidden="true" />Malha online</span>
        <span className="le-meta">Ruptura VTT v0.0.1</span>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ C */

/** Launcher: quem já entrou neste navegador só confirma a senha, numa doca ao pé da arte. */
export function EstudoC() {
  return (
    <div className={`le-root le-c ${oxanium.variable}`}>
      <Trocador atual="c" />
      <div className="le-c-arte" aria-hidden="true" />
      <div className="le-c-veu" aria-hidden="true" />

      <header className="le-c-topo">
        <MarcaRuptura style={{ "--ds-marca-tamanho": "clamp(44px, 5.4vw, 76px)" } as CSSProperties} />
        <span className="le-meta">Virtual Tabletop</span>
      </header>

      <main className="le-c-doca">
        <div className="le-c-conta">
          <span className="le-c-avatar" aria-hidden="true">K</span>
          <div className="le-c-quem">
            <span className="le-meta">De volta à malha</span>
            <strong className="le-c-nome">Kelsier Al&apos;vere</strong>
            <span className="le-c-email">kelsier@scriptorium.de</span>
          </div>
        </div>

        <form className="le-c-form" onSubmit={(e) => e.preventDefault()} noValidate>
          <CampoSenha id="c-senha" rotulo="Senha" semRotulo />
          <button type="submit" className="le-botao">Iniciar sessão</button>
        </form>

        <div className="le-c-links">
          <button type="button" className="le-link">Recuperar senha</button>
          <button type="button" className="le-link">Entrar com outra conta</button>
        </div>
      </main>
    </div>
  );
}
