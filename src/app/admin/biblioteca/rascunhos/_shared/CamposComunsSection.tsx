"use client";

import type { CamposComuns } from "../../../../../lib/contentSchema/draftTypes";
import { slugify, isValidSlug } from "../../../../../lib/contentSchema/slug";
import { fieldGridStyle, inputStyle, labelStyle } from "./formStyles";
import { StringListEditor } from "./StringListEditor";

/**
 * Base compartilhada por magia/talento/item (aditivo §8.1). `slugTravado`
 * é usado quando o rascunho já nasceu de um conteúdo publicado — o slug
 * deve permanecer o mesmo enquanto o vínculo existir (alterar o slug de
 * um rascunho de edição quebraria o vínculo com o publicado de origem).
 */
export function CamposComunsSection({
  campos,
  onChange,
  slugTravado,
  onAutoSlug,
}: {
  campos: CamposComuns;
  onChange: (novos: Partial<CamposComuns>) => void;
  slugTravado?: boolean;
  onAutoSlug?: boolean;
}) {
  const slugInvalido = campos.slug.length > 0 && !isValidSlug(campos.slug);

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={fieldGridStyle}>
        <label style={labelStyle}>
          Nome *
          <input
            value={campos.nome}
            onChange={(e) => {
              const nome = e.target.value;
              const atualizacao: Partial<CamposComuns> = { nome };
              if (onAutoSlug && !slugTravado) atualizacao.slug = slugify(nome);
              onChange(atualizacao);
            }}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Slug * {slugTravado ? "(travado — vínculo com o publicado)" : ""}
          <input
            value={campos.slug}
            disabled={slugTravado}
            onChange={(e) => onChange({ slug: e.target.value.toLowerCase() })}
            style={{ ...inputStyle, opacity: slugTravado ? 0.6 : 1 }}
          />
          {slugInvalido && <span style={{ color: "#e08a8a", fontSize: 11 }}>slug inválido</span>}
        </label>
        <label style={labelStyle}>
          Categoria
          <input value={campos.categoria ?? ""} onChange={(e) => onChange({ categoria: e.target.value || undefined })} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Subtipo
          <input value={campos.subtipo ?? ""} onChange={(e) => onChange({ subtipo: e.target.value || undefined })} style={inputStyle} />
        </label>
      </div>

      <label style={{ ...labelStyle, marginBottom: 12 }}>
        Descrição curta
        <textarea
          value={campos.descricaoCurta ?? ""}
          onChange={(e) => onChange({ descricaoCurta: e.target.value || undefined })}
          rows={2}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </label>

      <label style={{ ...labelStyle, marginBottom: 12 }}>
        Descrição completa
        <textarea
          value={campos.descricaoLonga ?? ""}
          onChange={(e) => onChange({ descricaoLonga: e.target.value || undefined })}
          rows={4}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </label>

      <StringListEditor label="Tags" valores={campos.tags} onChange={(tags) => onChange({ tags })} placeholder="nova tag" />
    </div>
  );
}
