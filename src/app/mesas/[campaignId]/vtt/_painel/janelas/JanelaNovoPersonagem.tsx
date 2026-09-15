"use client";

/**
 * O ASSISTENTE DE CRIAÇÃO, dentro da mesa.
 *
 * Era a rota `/personagens/novo`, e o wizard inteiro (identidade,
 * atributos, perícias, talentos, magias, inventário) continua sendo o
 * mesmo componente — o que mudou é que ele não navega mais: terminar
 * abre a ficha por cima, sair fecha a janela, e o rascunho continua
 * sendo salvo do mesmo jeito.
 *
 * Diferente do "+ Personagem" da aba, que cria um personagem só com o
 * nome: aquilo é atalho de narrador montando a cena; isto é a criação
 * completa, de quem vai jogar com ele.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { JanelaInterna } from "../ui/JanelaInterna";
import AssistenteDeCriacao from "./AssistenteDeCriacao";
import { lerCatalogosDaCriacaoAction, type CatalogosDaCriacao } from "../../_acoes/campanhaActions";
import { useCampaignSession } from "../../../_shell/CampaignRealtimeProvider";

export function JanelaNovoPersonagem({
  campaignId,
  onAbrirFicha,
  onFechar,
}: {
  campaignId: string;
  onAbrirFicha: (characterId: string) => void;
  onFechar: () => void;
}) {
  const { campaign } = useCampaignSession();
  const [catalogos, setCatalogos] = useState<CatalogosDaCriacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void lerCatalogosDaCriacaoAction(campaignId).then((r) => {
      if (!vivo) return;
      if (!r.ok || !r.dados) { setErro(r.erro ?? "Falha ao preparar o assistente."); return; }
      setCatalogos(r.dados);
    });
    return () => { vivo = false; };
  }, [campaignId]);

  return (
    <JanelaInterna
      aberta
      titulo="Novo personagem"
      largura={760}
      altura={680}
      onFechar={onFechar}
      testId="painel-janela-novo-personagem"
    >
      <div className="rv-novo-personagem rm-root">
        {erro && (
          <p className="rv-cena-estado" data-tipo="erro" role="alert">
            <AlertTriangle size={14} aria-hidden="true" /> {erro}
          </p>
        )}

        {!catalogos && !erro && (
          <p className="rv-cena-estado">
            <Loader2 size={14} className="rv-girando" aria-hidden="true" /> Preparando o assistente…
          </p>
        )}

        {/* SEM REGRAS NÃO HÁ ASSISTENTE, e isso não é um erro de rede a
            ser tentado de novo: `regras_personagem` é o documento que
            define atributos e perícias. Montar o wizard sem ele seria
            oferecer escolhas inventadas. */}
        {catalogos && !catalogos.regras && (
          <p className="rv-cena-estado" data-tipo="erro" role="alert">
            <AlertTriangle size={14} aria-hidden="true" />
            As regras de personagem não vieram do banco — sem elas não dá para montar o assistente.
          </p>
        )}

        {catalogos?.regras && (
          <AssistenteDeCriacao
            campaign={campaign}
            regras={catalogos.regras}
            talentos={catalogos.talentos}
            talentosErro={catalogos.talentosErro}
            magias={catalogos.magias}
            magiasErro={catalogos.magiasErro}
            itensLoja={catalogos.itensLoja}
            itensLojaErro={catalogos.itensLojaErro}
            onSair={onFechar}
            onConcluir={(characterId) => { onFechar(); onAbrirFicha(characterId); }}
          />
        )}
      </div>
    </JanelaInterna>
  );
}
