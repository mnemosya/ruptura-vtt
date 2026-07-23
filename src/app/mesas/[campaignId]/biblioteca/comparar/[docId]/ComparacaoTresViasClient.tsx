"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CampaignContentDocumentRow } from "../../../../../../lib/campaignContent";
import type { ComparacaoTresVias } from "../../../../../../lib/campaignContent/campaignContentDiff";
import {
  adotarOficialAtual,
  criarRascunhoReconciliacao,
  manterOverrideAposRevisao,
} from "../../../../../../lib/campaignContent/campaignContentServerActions";

function ListaAlteracoes({ titulo, itens }: { titulo: string; itens: { caminho: string; valorAnterior?: unknown; valorNovo: unknown }[] }) {
  if (itens.length === 0) return <p style={{ fontSize: 13, color: "#7d7d8a" }}>{titulo}: nenhuma alteração.</p>;
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, marginBottom: 6 }}>{titulo} ({itens.length})</h3>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, fontFamily: "monospace" }}>
        {itens.map((i) => (
          <li key={i.caminho} style={{ marginBottom: 4 }}>
            <strong>{i.caminho}</strong>: {JSON.stringify(i.valorAnterior)} → {JSON.stringify(i.valorNovo)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ComparacaoTresViasClient({
  campaignId,
  doc,
  comparacao,
  oficialExiste,
}: {
  campaignId: string;
  doc: CampaignContentDocumentRow;
  comparacao: ComparacaoTresVias;
  oficialExiste: boolean;
}) {
  const router = useRouter();
  const [carregando, setCarregando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);

  async function manter() {
    setErro(null);
    setCarregando("manter");
    const resultado = await manterOverrideAposRevisao(doc.id);
    setCarregando(null);
    if (!resultado.ok) setErro(resultado.erro ?? "Falha ao registrar revisão.");
    else setFeito("Override mantido — revisão registrada no histórico.");
  }

  async function adotar() {
    if (!confirm("Adotar o oficial atual e remover o override desta mesa?")) return;
    setErro(null);
    setCarregando("adotar");
    const resultado = await adotarOficialAtual(doc.id, doc.local_version);
    setCarregando(null);
    if (!resultado.ok) setErro(resultado.erro ?? "Falha ao adotar o oficial.");
    else router.push(`/mesas/${campaignId}/biblioteca`);
  }

  async function reconciliar() {
    setErro(null);
    setCarregando("reconciliar");
    const resultado = await criarRascunhoReconciliacao(doc.id);
    setCarregando(null);
    if (!resultado.ok) setErro(resultado.erro ?? "Falha ao criar rascunho de reconciliação.");
    else if (resultado.draftId) router.push(`/mesas/${campaignId}/biblioteca/rascunho/${resultado.draftId}`);
  }

  return (
    <div>
      {!oficialExiste && (
        <div style={{ marginBottom: 16, padding: "8px 12px", borderRadius: 8, background: "#2a1818", border: "1px solid #5c2626", fontSize: 13, color: "#e08a8a" }}>
          O conteúdo oficial não existe mais publicado (ausente ou arquivado) — "Adotar oficial atual" fica bloqueado até haver um oficial válido.
        </div>
      )}

      {comparacao.conflitos.length > 0 && (
        <div style={{ marginBottom: 16, padding: "8px 12px", borderRadius: 8, background: "#2a2818", border: "1px solid #5c5426", fontSize: 13, color: "#e0c56b" }}>
          <strong>{comparacao.conflitos.length} conflito(s)</strong> — o oficial e a campanha alteraram o(s) mesmo(s) caminho(s):
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontFamily: "monospace", fontSize: 12 }}>
            {comparacao.conflitos.map((c) => (
              <li key={c.caminho}>
                {c.caminho}: oficial atual = {JSON.stringify(c.valorOficialAtual)} — campanha = {JSON.stringify(c.valorCampanha)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ border: "1px solid #26262e", borderRadius: 10, padding: 18, marginBottom: 16 }}>
        <ListaAlteracoes titulo="Mudanças do oficial (base → atual)" itens={comparacao.mudancasOficial} />
        <ListaAlteracoes titulo="Mudanças da campanha (base → override atual)" itens={comparacao.mudancasCampanha} />
      </div>

      {erro && <p style={{ color: "#e08a8a", fontSize: 13 }}>{erro}</p>}
      {feito && <p style={{ color: "#7fd39a", fontSize: 13 }}>{feito}</p>}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={manter} disabled={carregando !== null} style={btn}>
          {carregando === "manter" ? "Registrando..." : "Manter override atual"}
        </button>
        <button onClick={adotar} disabled={carregando !== null || !oficialExiste} style={btn}>
          {carregando === "adotar" ? "Adotando..." : "Adotar oficial atual"}
        </button>
        <button onClick={reconciliar} disabled={carregando !== null} style={btn}>
          {carregando === "reconciliar" ? "Criando..." : "Criar rascunho de reconciliação"}
        </button>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = { background: "#2a5a3a", color: "#e4e4ea", border: "1px solid #3d7a4f", borderRadius: 6, padding: "8px 14px", cursor: "pointer" };
