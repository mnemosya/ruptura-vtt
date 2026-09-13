"use client";

/**
 * Boundary de erro DO VTT.
 *
 * Sem ele, quem pegava uma falha da mesa era o boundary da campanha
 * (`../error.tsx`), um nível acima — e aí acontecia uma coisa que
 * parecia bug de roteamento e não era: a mesa é `position: fixed;
 * inset: 0` (`.rv-mesa`), ou seja, ela COBRE a casca da campanha
 * (barra lateral, topo, faixa de combate). Quando a mesa some, o que
 * aparece por baixo é essa casca — que continua viva e servindo as
 * outras sete rotas da campanha (Bando, Biblioteca, Configurações,
 * Jogadores, Livro, Mercado, Personagens). Na tela, o efeito era
 * "caí numa versão antiga do produto".
 *
 * Este boundary ocupa a tela inteira, como a mesa ocupa, e fala a
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
import { logError } from "../../../../lib/logger";

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
