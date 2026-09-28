"use client";

/**
 * Boundary de erro DA MESA — que é a campanha inteira.
 *
 * Ele nasceu um nível abaixo, quando a mesa era uma das oito rotas da
 * campanha: sem ele, a falha subia pro boundary da campanha e o que
 * aparecia por baixo era a casca antiga (barra lateral, topo, faixa de
 * combate), com efeito de "caí numa versão antiga do produto". As
 * outras sete rotas não existem mais e a casca não desenha nada, então
 * ele subiu e tomou o lugar daquele — restou um só, que é o certo:
 * a campanha tem uma tela.
 *
 * Ocupa a tela inteira, como a mesa ocupa, e fala a
 * língua dela. O erro continua indo pro logger central, com escopo
 * próprio — `mesas.vtt` distingue, no log, uma falha da MESA de uma
 * falha de outra rota da campanha.
 *
 * NÃO importa `vtt.css` daqui. Quem importa é a `page.tsx` do segmento:
 * um boundary é um cliente que quase nunca monta, e o chunk de CSS
 * pendurado nele fica sem `<link>` no documento — o dev derrubava a
 * mesa inteira com "No link element found for chunk". Importada pela
 * página, a folha entra no segmento e vale para os dois.
 */

import { useEffect } from "react";
import Link from "next/link";
import { logError } from "../../../lib/logger";

export default function VttError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logError("mesas.vtt", error);
  }, [error]);

  return (
    <div className="rv-mesa rv-mesa--erro" role="alert">
      <div className="rv-erro-mesa">
        <p className="rv-erro-mesa__selo">Mesa indisponível</p>
        <h1 className="rv-erro-mesa__titulo">A mesa não carregou</h1>
        <p className="rv-erro-mesa__texto">
          O mapa, as cenas e os tokens continuam salvos — foi esta tela que falhou ao montar.
          Tentar de novo costuma bastar; se não, recarregue a página.
        </p>
        {error.digest && <p className="rv-erro-mesa__digest">Referência: {error.digest}</p>}
        <div className="rv-erro-mesa__acoes">
          <button type="button" className="rv-btn rv-btn--pri" onClick={reset}>Tentar de novo</button>
          <Link href="/mesas" className="rv-btn rv-btn--ghost">Minhas campanhas</Link>
        </div>
      </div>
    </div>
  );
}
