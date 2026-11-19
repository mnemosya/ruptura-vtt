"use client";

/**
 * O Compêndio na tela de acesso: quem ainda não entrou pode ler o livro.
 *
 * Ficha compacta no canto superior direito (a capa em miniatura, o nome e
 * a tecla L), no recorte dos controles do login. Abrir mostra o livro de
 * verdade (`LivroCodex`, sem campanha), com a mesma entrada que ele tem na
 * mesa. A leitura sem conta é liberada em `_compendio/acoes.ts`.
 *
 * L abre e fecha fora dos campos (digitando o e-mail, L é só uma letra);
 * Esc fecha. O livro é carregado sob demanda, e começa a baixar quando o
 * ponteiro chega à ficha.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import capa from "../../../content/v12/capas/sylvain-sarrailh-g2-esports.jpg";

const carregarLivro = () => import("../mesas/[campaignId]/vtt/_compendio/LivroCodex").then((m) => m.LivroCodex);
const LivroCodex = dynamic(carregarLivro, { ssr: false });

export function CompendioAcesso() {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setAberto(false); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== "l") return;
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      setAberto((a) => !a);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  return (
    <>
      <button
        type="button"
        className="rv-compendio"
        onClick={() => setAberto(true)}
        onPointerEnter={() => void carregarLivro()}
        onFocus={() => void carregarLivro()}
        aria-label="Abrir o Compêndio"
        aria-keyshortcuts="L"
        data-testid="acesso-compendio"
      >
        <span className="rv-compendio-capa" aria-hidden="true">
          <Image src={capa} alt="" fill sizes="192px" className="rv-compendio-arte" />
        </span>
        <span className="rv-compendio-texto">
          <span className="rv-compendio-kicker">Compêndio · v1.2</span>
          <span className="rv-compendio-titulo">Ler o livro</span>
        </span>
        <kbd className="rv-compendio-tecla" aria-hidden="true">L</kbd>
      </button>
      {aberto && <LivroCodex campaignId={null} onClose={() => setAberto(false)} />}
    </>
  );
}
