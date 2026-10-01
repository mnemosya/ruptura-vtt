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
import AssistenteV12 from "./AssistenteV12";
import { lerCatalogosDaCriacaoAction, type CatalogosDaCriacao } from "../../_acoes/campanhaActions";
import { lerCatalogosCriacaoV12Action, type CatalogosCriacaoV12 } from "../../_acoes/criacaoV12Actions";
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
  // RUPTURA v1.2 é o padrão; a criação anterior continua disponível até o
  // corte de dados (Fase 7 do plano de migração).
  const [regras, setRegras] = useState<"v12" | "v1">("v12");
  const [catalogos, setCatalogos] = useState<CatalogosDaCriacao | null>(null);
  const [catalogosV12, setCatalogosV12] = useState<CatalogosCriacaoV12 | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setErro(null);
    if (regras === "v12") {
      void lerCatalogosCriacaoV12Action(campaignId).then((r) => {
        if (!vivo) return;
        if (!r.ok || !r.dados) { setErro(r.erro ?? "Falha ao preparar o assistente."); return; }
        setCatalogosV12(r.dados);
      });
    } else {
      void lerCatalogosDaCriacaoAction(campaignId).then((r) => {
        if (!vivo) return;
        if (!r.ok || !r.dados) { setErro(r.erro ?? "Falha ao preparar o assistente."); return; }
        setCatalogos(r.dados);
      });
    }
    return () => { vivo = false; };
  }, [campaignId, regras]);

  const carregando = regras === "v12" ? !catalogosV12 : !catalogos;

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
        <div className="rm-pills" role="group" aria-label="Regras da criação" style={{ margin: "12px 16px 0" }}>
          <button aria-pressed={regras === "v12"} onClick={() => setRegras("v12")} className="rm-pill rv-focusable" data-testid="criacao-regras-v12">
            RUPTURA v1.2
          </button>
          <button aria-pressed={regras === "v1"} onClick={() => setRegras("v1")} className="rm-pill rv-focusable" data-testid="criacao-regras-v1">
            Regras anteriores
          </button>
        </div>

        {erro && (
          <p className="rv-cena-estado" data-tipo="erro" role="alert">
            <AlertTriangle size={14} aria-hidden="true" /> {erro}
          </p>
        )}

        {carregando && !erro && (
          <p className="rv-cena-estado">
            <Loader2 size={14} className="rv-girando" aria-hidden="true" /> Preparando o assistente…
          </p>
        )}

        {/* SEM REGRAS NÃO HÁ ASSISTENTE, e isso não é um erro de rede a
            ser tentado de novo: `regras_personagem` é o documento que
            define atributos e perícias. Montar o wizard sem ele seria
            oferecer escolhas inventadas. */}
        {regras === "v12" && catalogosV12 && (
          <AssistenteV12
            campaignId={campaignId}
            catalogos={catalogosV12}
            onSair={onFechar}
            onConcluir={(characterId) => { onFechar(); onAbrirFicha(characterId); }}
          />
        )}

        {regras === "v1" && catalogos && !catalogos.regras && (
          <p className="rv-cena-estado" data-tipo="erro" role="alert">
            <AlertTriangle size={14} aria-hidden="true" />
            As regras de personagem não vieram do banco — sem elas não dá para montar o assistente.
          </p>
        )}

        {regras === "v1" && catalogos?.regras && (
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
