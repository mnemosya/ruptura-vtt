"use client";

/**
 * Os três estados do CARTÃO DE HOVER do token — o que substituiu o HUD
 * de token selecionado.
 *
 * Quem decide o estado é o servidor (`projectHud`): ele entrega só os
 * recursos que esta pessoa pode ver, e diz se ela controla o token. A
 * galeria não tem sessão nem autorização, então usa a prop de fixtura
 * (`dadosFixos`) — mesma saída que o harness do HUD antigo usava, e
 * pelo mesmo motivo.
 *
 * O cartão é `position: fixed` e se ancora num retângulo de tela; aqui
 * cada exemplo recebe a âncora do próprio slot, medida no layout.
 */

import { useLayoutEffect, useRef, useState } from "react";
import { CartaoTokenHover } from "../../mesas/[campaignId]/vtt/_shell/CartaoTokenHover";
import type { SelectedTokenHudData } from "../../../lib/vtt/hudTypes";

const BASE: SelectedTokenHudData = {
  tokenId: "t1", sceneId: "s1", campaignId: "c1",
  name: "Mara Venn", initials: "MV", imageUrl: null,
  canControl: false, resources: {}, tokenRevision: 1,
};

const CASOS: { chave: string; rotulo: string; nota: string; dados: SelectedTokenHudData }[] = [
  {
    chave: "sem",
    rotulo: "Sem permissão nenhuma",
    nota: "Nenhum recurso está público pra quem olha. Só o nome — barras vazias ou um aviso de \"sem permissão\" contariam justamente o que a mesa escolheu não contar.",
    dados: BASE,
  },
  {
    chave: "ver",
    rotulo: "Pode ver, não pode editar",
    nota: "Barras e números; sem pips e sem o clique que abre o campo.",
    dados: {
      ...BASE,
      resources: { pv: { atual: 8, max: 11 }, pe: { atual: 11, max: 11 }, mana: { atual: 12, max: 12 } },
    },
  },
  {
    chave: "editar",
    rotulo: "Controla o token",
    nota: "±1 nos pips e clique no valor pra editar — \"-5\" tira 5, \"+3\" soma 3, \"7\" fixa em 7 (a mesma regra da ficha).",
    dados: {
      ...BASE, canControl: true,
      resources: { pv: { atual: 8, max: 11 }, pe: { atual: 11, max: 11 }, mana: { atual: 12, max: 12 } },
    },
  },
];

function Slot({ caso }: { caso: (typeof CASOS)[number] }) {
  const alvoRef = useRef<HTMLDivElement>(null);
  const [ancora, setAncora] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const medir = () => {
      const el = alvoRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setAncora({ x: r.x, y: r.y, width: r.width, height: r.height });
    };
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
  }, []);

  return (
    <div className="gal-cartao-slot">
      <span className="gal-nota">{caso.rotulo}</span>
      <div className="gal-cartao-alvo" ref={alvoRef} aria-hidden="true" />
      {ancora && (
        <CartaoTokenHover
          campaignId="c1" tokenId={caso.chave}
          ancora={ancora}
          dados={caso.dados}
          dadosFixos={caso.dados}
          onDadosAtualizados={() => {}}
          onEntrar={() => {}}
          onSair={() => {}}
        />
      )}
      <p className="gal-nota">{caso.nota}</p>
    </div>
  );
}

export function VitrineCartaoToken() {
  return (
    <div className="gal-cartao-grade">
      {CASOS.map((caso) => <Slot key={caso.chave} caso={caso} />)}
    </div>
  );
}
