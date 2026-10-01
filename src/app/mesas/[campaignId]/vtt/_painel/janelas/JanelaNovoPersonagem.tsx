"use client";

/**
 * O ASSISTENTE DE CRIAÇÃO (RUPTURA v1.2), dentro da mesa.
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
import AssistenteV12 from "./AssistenteV12";
import { lerCatalogosCriacaoV12Action, type CatalogosCriacaoV12 } from "../../_acoes/criacaoV12Actions";
import type { PersonagemACompletar } from "../../_shell/JanelasDaMesa";

export function JanelaNovoPersonagem({
  campaignId,
  completar = null,
  onAbrirFicha,
  onFechar,
}: {
  campaignId: string;
  completar?: PersonagemACompletar | null;
  onAbrirFicha: (characterId: string) => void;
  onFechar: () => void;
}) {
  // Só RUPTURA v1.2: o assistente anterior saiu com o corte de dados (Fase 7).
  const [catalogos, setCatalogos] = useState<CatalogosCriacaoV12 | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setErro(null);
    void lerCatalogosCriacaoV12Action(campaignId).then((r) => {
      if (!vivo) return;
      if (!r.ok || !r.dados) { setErro(r.erro ?? "Falha ao preparar o assistente."); return; }
      setCatalogos(r.dados);
    });
    return () => { vivo = false; };
  }, [campaignId]);

  return (
    <JanelaInterna
      aberta
      titulo={completar ? `Completar ${completar.nome}` : "Novo personagem"}
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

        {catalogos && (
          <AssistenteV12
            campaignId={campaignId}
            catalogos={catalogos}
            completar={completar}
            onSair={onFechar}
            onConcluir={(characterId) => { onFechar(); onAbrirFicha(characterId); }}
          />
        )}
      </div>
    </JanelaInterna>
  );
}
