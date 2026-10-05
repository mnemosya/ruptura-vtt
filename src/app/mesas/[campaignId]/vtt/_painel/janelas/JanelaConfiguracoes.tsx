"use client";

/**
 * CONFIGURAÇÕES DA MESA — o que a rota `/configuracoes` era, sem sair
 * da mesa.
 *
 * Hoje são duas coisas, e de verdade (não placeholder): o nome da
 * campanha e a região onde ela começa (usada pela Forja e pelo cartão
 * da campanha em Minhas Campanhas). Permissões de criação de personagem e configuração de
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
import { definirRegiaoCampanhaAction, renomearCampanhaAction } from "../../_acoes/campanhaActions";
import { RANKINGS_V12, REGIOES_V12, regiaoValida, type RankingV12, type RegiaoIdV12 } from "../../../../../../lib/rulesetV12";
import { useCampaignSession } from "../../../_shell/CampaignRealtimeProvider";
import { setCampaignCover, setCampaignDescription, setCampaignInitialRanking } from "../../../../../../lib/campaign/metadataActions";

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
  const [regiao, setRegiao] = useState<RegiaoIdV12 | null>(regiaoValida(campaign.regiao));
  const [estadoRegiao, setEstadoRegiao] = useState<EstadoSalvar>({ tipo: "parado" });
  const [rankingInicial, setRankingInicial] = useState<RankingV12>(campaign.initial_ranking ?? "F");
  const [estadoRanking, setEstadoRanking] = useState<EstadoSalvar>({ tipo: "parado" });
  const [descricao, setDescricao] = useState(campaign.description ?? "");
  const [estadoDescricao, setEstadoDescricao] = useState<EstadoSalvar>({ tipo: "parado" });
  const [estadoCapa, setEstadoCapa] = useState<EstadoSalvar>({ tipo: "parado" });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descriptionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (descriptionTimeoutRef.current) clearTimeout(descriptionTimeoutRef.current);
  }, []);

  function agendarDescricao(value: string) {
    setDescricao(value);
    if (descriptionTimeoutRef.current) clearTimeout(descriptionTimeoutRef.current);
    descriptionTimeoutRef.current = setTimeout(async () => {
      setEstadoDescricao({ tipo: "salvando" });
      try {
        await setCampaignDescription(campaignId, value);
        setEstadoDescricao({ tipo: "salvo" });
        void reloadCampaign?.();
      } catch (error) {
        setEstadoDescricao({ tipo: "erro", mensagem: error instanceof Error ? error.message : "Erro ao salvar." });
      }
    }, ESPERA_AUTOSAVE_MS);
  }

  async function trocarCapa(file: File | null) {
    setEstadoCapa({ tipo: "salvando" });
    try {
      await setCampaignCover(campaignId, file);
      setEstadoCapa({ tipo: "salvo" });
      void reloadCampaign?.();
    } catch (error) {
      setEstadoCapa({ tipo: "erro", mensagem: error instanceof Error ? error.message : "Erro ao alterar capa." });
    }
  }

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

  async function trocarRegiao(valor: RegiaoIdV12 | null) {
    const anterior = regiao;
    setRegiao(valor);
    setEstadoRegiao({ tipo: "salvando" });
    const r = await definirRegiaoCampanhaAction(campaignId, valor);
    if (!r.ok) {
      setRegiao(anterior);
      setEstadoRegiao({ tipo: "erro", mensagem: r.erro ?? "Erro ao definir a região." });
      return;
    }
    setEstadoRegiao({ tipo: "salvo" });
    void reloadCampaign?.();
  }

  async function trocarRanking(valor: RankingV12) {
    const anterior = rankingInicial;
    setRankingInicial(valor);
    setEstadoRanking({ tipo: "salvando" });
    try {
      await setCampaignInitialRanking(campaignId, valor);
      setEstadoRanking({ tipo: "salvo" });
      void reloadCampaign?.();
    } catch (error) {
      setRankingInicial(anterior);
      setEstadoRanking({ tipo: "erro", mensagem: error instanceof Error ? error.message : "Erro ao definir o ranking." });
    }
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
      altura={620}
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

        <label className="rv-config-rotulo" htmlFor="rv-config-regiao">Região onde a campanha começa</label>
        <select
          id="rv-config-regiao"
          className="rv-cena-campo"
          value={regiao ?? ""}
          data-testid="config-regiao-campanha"
          onChange={(e) => void trocarRegiao(regiaoValida(e.target.value))}
        >
          <option value="">Não definida (a Forja pergunta)</option>
          {(Object.keys(REGIOES_V12) as RegiaoIdV12[]).map((id) => <option key={id} value={id}>{REGIOES_V12[id].nome}</option>)}
        </select>
        <p className="rv-config-estado" aria-live="polite">
          {estadoRegiao.tipo === "salvando" && "Salvando…"}
          {estadoRegiao.tipo === "salvo" && <span data-ok="true">✓ Salvo</span>}
          {estadoRegiao.tipo === "erro" && <span data-erro="true">Falha ao salvar: {estadoRegiao.mensagem}</span>}
        </p>

        <label className="rv-config-rotulo" htmlFor="rv-config-ranking">Ranking inicial dos personagens</label>
        <select id="rv-config-ranking" className="rv-cena-campo" value={rankingInicial}
          data-testid="config-ranking-campanha" onChange={(e) => void trocarRanking(e.target.value as RankingV12)}>
          {RANKINGS_V12.map((rank) => <option key={rank} value={rank}>Rank {rank}</option>)}
        </select>
        <p className="rv-config-estado" aria-live="polite">
          {estadoRanking.tipo === "salvando" && "Salvando…"}
          {estadoRanking.tipo === "salvo" && <span data-ok="true">✓ Salvo</span>}
          {estadoRanking.tipo === "erro" && <span data-erro="true">Falha ao salvar: {estadoRanking.mensagem}</span>}
        </p>

        <label className="rv-config-rotulo" htmlFor="rv-config-descricao">Descrição</label>
        <textarea id="rv-config-descricao" className="rv-cena-campo" rows={3} maxLength={1000}
          value={descricao} onChange={(e) => agendarDescricao(e.target.value)} />
        <p className="rv-config-estado" aria-live="polite">
          {estadoDescricao.tipo === "salvando" && "Salvando…"}
          {estadoDescricao.tipo === "salvo" && <span data-ok="true">✓ Salvo</span>}
          {estadoDescricao.tipo === "erro" && <span data-erro="true">{estadoDescricao.mensagem}</span>}
        </p>

        <label className="rv-config-rotulo" htmlFor="rv-config-capa">Arte de capa</label>
        {campaign.cover_path && <div role="img" aria-label="Capa atual da campanha" style={{ height: 130, backgroundImage: `url('/api/campaigns/${campaignId}/cover?v=${encodeURIComponent(campaign.cover_path)}')`, backgroundSize: "cover", backgroundPosition: "center", marginBottom: 10 }} />}
        <input id="rv-config-capa" type="file" accept="image/png,image/jpeg,image/webp"
          disabled={estadoCapa.tipo === "salvando"} onChange={(e) => { const file = e.target.files?.[0]; if (file) void trocarCapa(file); }} />
        {campaign.cover_path && <button type="button" disabled={estadoCapa.tipo === "salvando"} onClick={() => void trocarCapa(null)}>Remover capa</button>}
        <p className="rv-config-estado" aria-live="polite">
          {estadoCapa.tipo === "salvando" && "Salvando…"}
          {estadoCapa.tipo === "salvo" && <span data-ok="true">✓ Salvo</span>}
          {estadoCapa.tipo === "erro" && <span data-erro="true">{estadoCapa.mensagem}</span>}
        </p>

        <p className="rv-config-nota">
          Permissões de criação de personagem e configuração de convites ainda
          não estão disponíveis nesta versão.
        </p>
      </div>
    </JanelaInterna>
  );
}
