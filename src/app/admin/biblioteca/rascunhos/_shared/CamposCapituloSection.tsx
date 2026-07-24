"use client";

/**
 * Editor de blocos de capítulo (Etapa 11, correção do drag-and-drop
 * editorial). Único destino REAL de drop deste projeto: um card
 * encontrado na busca embutida da Biblioteca pode ser arrastado para a
 * lista de blocos abaixo — mas TODO controle também tem um botão
 * equivalente (o drag nunca é a ÚNICA forma de realizar a operação,
 * requisito de acessibilidade explícito desta correção).
 *
 * Contrato de drag (tipado, nunca o payload completo da entidade):
 *   { tipo: "book_entity", contentType, slug, nome }
 * transportado via `dataTransfer` sob o MIME "application/x-ruptura-book-entity".
 *
 * A validação de verdade (existência, duplicidade, auto-referência)
 * acontece no SERVIDOR em `validarCamposCapitulo` (draftValidation.ts) —
 * este componente só monta o array `blocos`, nunca decide sozinho se um
 * bloco é válido.
 */

import { useId, useState } from "react";
import type { BlocoCapitulo, CamposCapitulo } from "../../../../../lib/contentSchema/draftTypes";
import { buscarConteudoParaVinculoCapitulo, type ItemBuscaVinculo } from "../../../../../lib/contentSchema/bookDragServerActions";
import { buttonStyle, inputStyle, labelStyle, sectionStyle } from "./formStyles";

const DRAG_MIME = "application/x-ruptura-book-entity";

interface DragPayload {
  tipo: "book_entity";
  contentType: string;
  slug: string;
  nome: string;
}

function novoId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `bloco_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function moverItem<T>(lista: T[], indice: number, direcao: -1 | 1): T[] {
  const alvo = indice + direcao;
  if (alvo < 0 || alvo >= lista.length) return lista;
  const copia = [...lista];
  [copia[indice], copia[alvo]] = [copia[alvo], copia[indice]];
  return copia;
}

/** Painel de busca — origem do drag. Cada resultado é `draggable` E tem um botão "+" equivalente (alternativa sem mouse/sem drag). */
function BibliotecaPickerPanel({ onAdicionar }: { onAdicionar: (item: ItemBuscaVinculo) => void }) {
  const inputId = useId();
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ItemBuscaVinculo[]>([]);
  const [buscando, setBuscando] = useState(false);

  async function buscar(valor: string) {
    setTermo(valor);
    if (valor.trim().length < 2) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const itens = await buscarConteudoParaVinculoCapitulo(valor);
    setBuscando(false);
    setResultados(itens);
  }

  function iniciarDrag(e: React.DragEvent<HTMLLIElement>, item: ItemBuscaVinculo) {
    const payload: DragPayload = { tipo: "book_entity", contentType: item.contentType, slug: item.slug, nome: item.nome };
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "copy";
  }

  return (
    <div style={{ border: "1px solid #2a2b33", borderRadius: 8, padding: 12 }}>
      <label style={labelStyle} htmlFor={inputId}>
        Buscar na Biblioteca (arraste um resultado para o capítulo, ou clique em “+”)
        <input
          id={inputId}
          data-testid="capitulo-buscar-biblioteca"
          value={termo}
          onChange={(e) => buscar(e.target.value)}
          placeholder="nome ou slug (mín. 2 caracteres)"
          style={inputStyle}
        />
      </label>
      {buscando && <p style={{ fontSize: 12, color: "#7d7d8a" }}>Buscando…</p>}
      <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "flex", flexDirection: "column", gap: 6 }}>
        {resultados.map((item) => (
          <li
            key={`${item.contentType}:${item.slug}`}
            draggable
            onDragStart={(e) => iniciarDrag(e, item)}
            data-testid={`capitulo-picker-item-${item.contentType}-${item.slug}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "6px 10px",
              border: "1px solid #34343e",
              borderRadius: 6,
              cursor: "grab",
              fontSize: 13,
              background: "#1b1c22",
            }}
          >
            <span>
              <strong>{item.nome}</strong> <span style={{ color: "#7d7d8a" }}>({item.contentType}:{item.slug})</span>
            </span>
            <button
              type="button"
              data-testid={`capitulo-picker-adicionar-${item.contentType}-${item.slug}`}
              onClick={() => onAdicionar(item)}
              style={{ ...buttonStyle, padding: "4px 10px" }}
              aria-label={`Adicionar ${item.nome} ao capítulo`}
              title="Adicionar sem arrastar (alternativa por teclado/clique)"
            >
              + adicionar
            </button>
          </li>
        ))}
        {termo.trim().length >= 2 && !buscando && resultados.length === 0 && <li style={{ fontSize: 12, color: "#7d7d8a" }}>Nenhum resultado publicado encontrado.</li>}
      </ul>
    </div>
  );
}

function BlocoRow({
  bloco,
  indice,
  total,
  onMover,
  onRemover,
  onEditarTexto,
}: {
  bloco: BlocoCapitulo;
  indice: number;
  total: number;
  onMover: (direcao: -1 | 1) => void;
  onRemover: () => void;
  onEditarTexto: (texto: string) => void;
}) {
  return (
    <li
      data-testid={`capitulo-bloco-${indice}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "10px 12px",
        border: "1px solid #34343e",
        borderRadius: 8,
        background: "#17181d",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 12, color: "#7d7d8a", textTransform: "uppercase" }}>
          {bloco.tipo === "texto" ? "Texto" : `Entidade — ${bloco.entidade.contentType}:${bloco.entidade.slug}`}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            type="button"
            data-testid={`capitulo-bloco-${indice}-subir`}
            onClick={() => onMover(-1)}
            disabled={indice === 0}
            style={{ ...buttonStyle, padding: "2px 8px" }}
            aria-label="Mover bloco para cima"
            title="Mover para cima (alternativa por teclado ao arrastar)"
          >
            ▲
          </button>
          <button
            type="button"
            data-testid={`capitulo-bloco-${indice}-descer`}
            onClick={() => onMover(1)}
            disabled={indice === total - 1}
            style={{ ...buttonStyle, padding: "2px 8px" }}
            aria-label="Mover bloco para baixo"
            title="Mover para baixo (alternativa por teclado ao arrastar)"
          >
            ▼
          </button>
          <button
            type="button"
            data-testid={`capitulo-bloco-${indice}-remover`}
            onClick={onRemover}
            style={{ ...buttonStyle, padding: "2px 8px", color: "#e08a8a" }}
            aria-label="Remover bloco"
          >
            ✕
          </button>
        </div>
      </div>
      {bloco.tipo === "texto" ? (
        <textarea
          data-testid={`capitulo-bloco-${indice}-texto`}
          value={bloco.texto}
          onChange={(e) => onEditarTexto(e.target.value)}
          rows={3}
          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
        />
      ) : (
        <p style={{ fontSize: 13, color: "#c9c9d1", margin: 0 }}>Referência estruturada — resolvida a partir da Biblioteca ao publicar/ler (nunca copia o payload).</p>
      )}
    </li>
  );
}

export function CamposCapituloSection({ campos, onChange }: { campos: CamposCapitulo; onChange: (novos: Partial<CamposCapitulo>) => void }) {
  const [dragOver, setDragOver] = useState(false);

  function adicionarBlocoEntidade(item: ItemBuscaVinculo) {
    const bloco: BlocoCapitulo = { id: novoId(), tipo: "entidade", entidade: { contentType: item.contentType, slug: item.slug } };
    onChange({ blocos: [...campos.blocos, bloco] });
  }

  function adicionarBlocoTexto() {
    const bloco: BlocoCapitulo = { id: novoId(), tipo: "texto", texto: "" };
    onChange({ blocos: [...campos.blocos, bloco] });
  }

  function atualizarBloco(indice: number, patch: Partial<BlocoCapitulo>) {
    onChange({ blocos: campos.blocos.map((b, i) => (i === indice ? ({ ...b, ...patch } as BlocoCapitulo) : b)) });
  }

  function moverBloco(indice: number, direcao: -1 | 1) {
    onChange({ blocos: moverItem(campos.blocos, indice, direcao) });
  }

  function removerBloco(indice: number) {
    onChange({ blocos: campos.blocos.filter((_, i) => i !== indice) });
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const bruto = e.dataTransfer.getData(DRAG_MIME);
    if (!bruto) return;
    try {
      const payload = JSON.parse(bruto) as DragPayload;
      if (payload.tipo !== "book_entity" || !payload.contentType || !payload.slug) return;
      adicionarBlocoEntidade({ contentType: payload.contentType as ItemBuscaVinculo["contentType"], slug: payload.slug, nome: payload.nome });
    } catch {
      // Payload de drag não reconhecido — ignorado silenciosamente (nunca confiado sem validação server-side de qualquer forma).
    }
  }

  return (
    <div>
      <label style={labelStyle}>
        Texto introdutório do capítulo
        <textarea
          data-testid="capitulo-corpo"
          value={campos.corpo ?? ""}
          onChange={(e) => onChange({ corpo: e.target.value })}
          rows={4}
          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
        />
      </label>

      <div style={{ marginTop: 14 }}>
        <BibliotecaPickerPanel onAdicionar={adicionarBlocoEntidade} />
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        data-testid="capitulo-drop-alvo"
        style={{
          ...sectionStyle,
          marginTop: 14,
          marginBottom: 0,
          borderStyle: "dashed",
          borderColor: dragOver ? "#5aa06a" : "#34343e",
          background: dragOver ? "#152018" : undefined,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <h4 style={{ margin: 0, fontSize: 13 }}>Blocos do capítulo ({campos.blocos.length})</h4>
          <button type="button" data-testid="capitulo-adicionar-bloco-texto" onClick={adicionarBlocoTexto} style={buttonStyle}>
            + bloco de texto
          </button>
        </div>
        <p style={{ fontSize: 12, color: "#7d7d8a", marginTop: 0 }}>
          Arraste um resultado da busca acima para cá, ou use o botão “+ adicionar” de cada resultado — as duas formas fazem exatamente a mesma coisa.
        </p>
        {campos.blocos.length === 0 ? (
          <p style={{ fontSize: 13, color: "#7d7d8a" }}>Nenhum bloco ainda.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {campos.blocos.map((bloco, indice) => (
              <BlocoRow
                key={bloco.id}
                bloco={bloco}
                indice={indice}
                total={campos.blocos.length}
                onMover={(direcao) => moverBloco(indice, direcao)}
                onRemover={() => removerBloco(indice)}
                onEditarTexto={(texto) => atualizarBloco(indice, { texto } as Partial<BlocoCapitulo>)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
