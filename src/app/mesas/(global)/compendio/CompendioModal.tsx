"use client";

/**
 * O livro aberto no modal do Códex, fora de qualquer mesa (sem chat, então sem
 * "Enviar ao chat"). Fechar volta para onde a pessoa estava; entrando direto pelo
 * link, vai para as Campanhas.
 */

import { useRouter } from "next/navigation";
import { LivroCodex } from "../../[campaignId]/vtt/_compendio/LivroCodex";

export function CompendioModal() {
  const router = useRouter();
  const fechar = () => {
    if (window.history.length > 1) router.back();
    else router.push("/mesas");
  };
  return <LivroCodex campaignId={null} onClose={fechar} />;
}
