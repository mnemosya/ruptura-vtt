"use client";

import type { OpcoesDeRegras } from "../../../../../lib/contentSchema/characterRuleOptions";
import type { CamposTalento, CamposTalentoNivel } from "../../../../../lib/contentSchema/draftTypes";
import { EffectsEditorSection } from "./EffectsEditorSection";
import { inputStyle, labelStyle, sectionStyle } from "./formStyles";
import { RequisitosEditor } from "./RequisitosEditor";

/**
 * Edita a estrutura básica dos 3 níveis de uma árvore de talento, um
 * documento só (nunca vira 3 documentos independentes — ver nota em
 * `draftTypes.ts::CamposTalento`). Cada nível deixa claro em qual nível
 * o Construtor de Efeitos está trabalhando — os efeitos de um nível
 * nunca tocam os outros dois. Ativação/gatilho/usos/cadência bespoke
 * que ainda não viraram um dos 6 tipos do MVP permanecem somente
 * leitura (seção de efeitos preservados de cada nível).
 */
export function CamposTalentoSection({
  campos,
  onChange,
  opcoes,
  condicoesDisponiveis,
}: {
  campos: CamposTalento;
  onChange: (novos: Partial<CamposTalento>) => void;
  opcoes: OpcoesDeRegras;
  condicoesDisponiveis: { slug: string; nome: string }[];
}) {
  function atualizarNivel(indice: number, novos: Partial<CamposTalentoNivel>) {
    const niveis = [...campos.niveis] as CamposTalento["niveis"];
    niveis[indice] = { ...niveis[indice], ...novos };
    onChange({ niveis });
  }

  return (
    <div>
      {campos.niveis.map((nivel, indice) => (
        <div key={nivel.nivel} data-testid={`talento-nivel-secao-${nivel.nivel}`} style={sectionStyle}>
          <h4 style={{ marginTop: 0, fontSize: 14, color: "#a8a8b3" }}>Nível {nivel.nivel}</h4>
          <label style={{ ...labelStyle, marginBottom: 10 }}>
            Nome do nível
            <input data-testid={`talento-nivel-nome-${nivel.nivel}`} value={nivel.nomeNivel} onChange={(e) => atualizarNivel(indice, { nomeNivel: e.target.value })} style={inputStyle} />
          </label>
          <label style={{ ...labelStyle, marginBottom: 10 }}>
            Descrição curta
            <textarea
              value={nivel.descricaoCurta ?? ""}
              onChange={(e) => atualizarNivel(indice, { descricaoCurta: e.target.value || undefined })}
              rows={2}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </label>
          <label style={{ ...labelStyle, marginBottom: 10 }}>
            Descrição completa
            <textarea
              value={nivel.descricaoLonga ?? ""}
              onChange={(e) => atualizarNivel(indice, { descricaoLonga: e.target.value || undefined })}
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </label>
          <RequisitosEditor requisitos={nivel.requisitos} onChange={(requisitos) => atualizarNivel(indice, { requisitos })} />

          <h5 style={{ fontSize: 13, color: "#a8a8b3", marginTop: 16, marginBottom: 8 }}>Efeitos do nível {nivel.nivel}</h5>
          <EffectsEditorSection
            efeitos={nivel.efeitos}
            onChange={(efeitos) => atualizarNivel(indice, { efeitos })}
            opcoes={opcoes}
            condicoesDisponiveis={condicoesDisponiveis}
            escopoId={`nivel-${nivel.nivel}`}
          />
        </div>
      ))}
    </div>
  );
}
