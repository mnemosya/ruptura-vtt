"use client";

/**
 * CONFIGURAÇÕES DA MESA — o que a rota `/configuracoes` era, sem sair
 * da mesa.
 *
 * Hoje é uma coisa só, e de verdade (não um placeholder): o nome da
 * campanha. Permissões de criação de personagem e configuração de
 * convites continuam sendo decisão de produto pendente — registradas,
 * não inventadas aqui.
 *
 * SALVAMENTO AUTOMÁTICO, sem botão "Salvar": grava em segundo plano
 * quando a digitação para, com estados discretos. Era assim na página
 * e continua sendo — o que muda é que o nome novo aparece na hora no
 * menu da mesa, que lê a campanha do mesmo contexto.
 */

import { useEffect, useRef, useState } from "react";
import { JanelaInterna } from "../ui/JanelaInterna";
import { renomearCampanhaAction } from "../../_acoes/campanhaActions";
import { useCampaignSession } from "../../../_shell/CampaignRealtimeProvider";

type EstadoSalvar =
  | { tipo: "parado" }
  | { tipo: "salvando" }
  | { tipo: "salvo" }
  | { tipo: "erro"; mensagem: string };

const ESPERA_AUTOSAVE_MS = 700;

export function JanelaConfiguracoes({ campaignId, onFechar }: { campaignId: string; onFechar: () => void }) {
  const { campaign, reloadCampaign } = useCampaignSession();
  const [nome, setNome] = useState(campaign.name);
  const [estado, setEstado] = useState<EstadoSalvar>({ tipo: "parado" });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  async function gravar(valor: string) {
    setEstado({ tipo: "salvando" });
    const r = await renomearCampanhaAction(campaignId, valor);
    if (!r.ok) {
      setEstado({ tipo: "erro", mensagem: r.erro ?? "Erro ao renomear a mesa." });
      return;
    }
    setEstado({ tipo: "salvo" });
    // O nome vive no contexto da sessão (cabeçalho do menu da mesa, log,
    // participantes) — sem esta releitura ele só mudaria no campo.
    void reloadCampaign?.();
  }

  function agendar(valor: string) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (!valor.trim()) {
      setEstado({ tipo: "erro", mensagem: "O nome da campanha não pode ficar vazio." });
      return;
    }
    timeoutRef.current = setTimeout(() => void gravar(valor), ESPERA_AUTOSAVE_MS);
  }

  return (
    <JanelaInterna
      aberta
      titulo="Configurações da mesa"
      largura={520}
      altura={380}
      onFechar={onFechar}
      testId="painel-janela-configuracoes"
    >
      <div className="rv-config-mesa">
        <label className="rv-config-rotulo" htmlFor="rv-config-nome">Nome da campanha</label>
        <input
          id="rv-config-nome"
          className="rv-cena-campo"
          type="text"
          value={nome}
          maxLength={120}
          data-testid="config-nome-campanha"
          onChange={(e) => { setNome(e.target.value); agendar(e.target.value); }}
        />
        <p className="rv-config-estado" aria-live="polite">
          {estado.tipo === "salvando" && "Salvando…"}
          {estado.tipo === "salvo" && <span data-ok="true">✓ Salvo</span>}
          {estado.tipo === "erro" && <span data-erro="true">Falha ao salvar: {estado.mensagem}</span>}
        </p>

        <p className="rv-config-nota">
          Permissões de criação de personagem e configuração de convites ainda
          não estão disponíveis nesta versão.
        </p>
      </div>
    </JanelaInterna>
  );
}
