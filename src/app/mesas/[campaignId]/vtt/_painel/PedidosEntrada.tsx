"use client";

/**
 * PEDIDOS DE ENTRADA — personagens que jogadores criaram sem campanha e
 * enviaram para esta. Só o narrador vê; aceitar coloca o personagem no
 * diretório (o jogador vira controlador), recusar devolve o pedido.
 *
 * Mora no topo da aba Personagens, acima da lista: pedido pendente é
 * coisa a decidir, não mais um item do diretório. Some quando não há
 * nenhum.
 */

import { useCallback, useEffect, useState } from "react";
import { Label, BotaoTecnico } from "./ui/primitivas";
import {
  aceitarPedidoEntradaAction,
  lerPedidosEntradaAction,
  recusarPedidoEntradaAction,
  type PedidoEntradaPainel,
} from "./acoes/personagensPainel";

const NOME_CLASSE: Record<string, string> = {
  ancora: "Âncora", cacador: "Caçador", combatente: "Combatente", face: "Face",
  infiltrador: "Infiltrador", tecnico: "Técnico", vanguarda: "Vanguarda",
};

export function PedidosEntrada({ campaignId, visivel, onAceito }: {
  campaignId: string;
  visivel: boolean;
  /** Recarrega o diretório: o personagem aceito passa a fazer parte dele. */
  onAceito: () => void;
}) {
  const [pedidos, setPedidos] = useState<PedidoEntradaPainel[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const r = await lerPedidosEntradaAction(campaignId);
    if (r.ok) setPedidos(r.dados ?? []);
  }, [campaignId]);

  // Mesma cadência do diretório: ao abrir a aba e ao voltar o foco para a janela.
  useEffect(() => {
    if (!visivel) return;
    void carregar();
    const aoFocar = () => void carregar();
    window.addEventListener("focus", aoFocar);
    return () => window.removeEventListener("focus", aoFocar);
  }, [visivel, carregar]);

  if (pedidos.length === 0) return null;

  const decidir = async (p: PedidoEntradaPainel, aceitar: boolean) => {
    setOcupado(p.characterId);
    setErro(null);
    const r = aceitar
      ? await aceitarPedidoEntradaAction(campaignId, p.characterId)
      : await recusarPedidoEntradaAction(campaignId, p.characterId);
    setOcupado(null);
    if (!r.ok) { setErro(r.erro ?? "Falha ao decidir o pedido."); return; }
    setPedidos((lista) => lista.filter((x) => x.characterId !== p.characterId));
    if (aceitar) onAceito();
  };

  return (
    <section className="rv-pn-pedidos" aria-label="Pedidos de entrada" data-testid="painel-personagens-pedidos">
      <Label acento="am">Pedidos de entrada · {pedidos.length}</Label>
      <ul className="rv-pn-pedidos-lista">
        {pedidos.map((p) => (
          <li key={p.characterId} className="rv-pn-pedido" data-testid="painel-personagens-pedido">
            <span className="rv-pn-pedido-texto">
              <span className="rv-pn-pedido-nome">{p.nome}</span>
              <span className="rv-pn-pedido-meta">
                {p.jogador}
                {p.classe ? ` · ${NOME_CLASSE[p.classe] ?? p.classe}` : ""}
                {p.ranking ? ` · Ranking ${p.ranking}` : ""}
              </span>
            </span>
            <span className="rv-pn-pedido-acoes">
              <BotaoTecnico acento="am" primario ocupado={ocupado === p.characterId} desabilitado={!!ocupado}
                onClick={() => void decidir(p, true)} testId="painel-personagens-pedido-aceitar">
                Aceitar
              </BotaoTecnico>
              <BotaoTecnico desabilitado={!!ocupado} onClick={() => void decidir(p, false)}
                testId="painel-personagens-pedido-recusar">
                Recusar
              </BotaoTecnico>
            </span>
          </li>
        ))}
      </ul>
      {erro && <p role="alert" className="rv-pn-pedidos-erro">{erro}</p>}
    </section>
  );
}
