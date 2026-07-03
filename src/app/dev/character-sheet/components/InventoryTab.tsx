"use client";

import { useState } from "react";
import { Section } from "./Section";
import { buttonStyle } from "./styles";
import {
  WALLET_LABELS,
  ITEM_LOADOUT_STATES,
  type ItemContent,
  type InventoryItemInstance,
  type Wallet,
  type WalletId,
  type ItemLoadoutState,
} from "../../../../lib/character";

const input: React.CSSProperties = { background: "#0f1014", color: "inherit", border: "1px solid #333", borderRadius: 4, padding: "6px 8px", fontSize: 13 };

const CATEGORIA_FILTROS = ["todos", "arma", "armadura", "escudo", "explosivo", "farmacia", "vertina", "ferramenta", "dispositivo", "veiculo", "municao"] as const;

const ESTADO_LABELS: Record<ItemLoadoutState, string> = {
  equipado: "Equipado",
  empunhado: "Empunhado",
  acesso_rapido: "Acesso rápido",
  mochila: "Mochila",
};

/**
 * Aba "Inventário" — checkpoint v0.49 (PRD 13). Catálogo da loja vem
 * inteiro da Biblioteca (`items` prop, já normalizado) — nunca uma
 * lista manual. Escopo: carteira (3 saldos), comprar item (desconta
 * carteira, cria instância), loadout simples (equipado/empunhado/
 * acesso rápido/mochila). Sem MIT/PD/munição/Rajada/propriedades em
 * crítico/runas/kravita/ações de item automáticas — ver relatório.
 */
export function InventoryTab({
  items,
  catalogError,
  carteira,
  inventario,
  onBuy,
  onChangeCarteira,
  onSetEstado,
  onRemoveItem,
}: {
  items: ItemContent[];
  catalogError: string | null;
  carteira: Wallet;
  inventario: InventoryItemInstance[];
  onBuy: (itemSlug: string, quantidade: number, walletId: WalletId, precoUnitario: number) => void;
  onChangeCarteira: (walletId: WalletId, value: number) => void;
  onSetEstado: (instanceId: string, estado: ItemLoadoutState) => void;
  onRemoveItem: (instanceId: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<(typeof CATEGORIA_FILTROS)[number]>("todos");
  const [walletId, setWalletId] = useState<WalletId>("aretz_informal");
  const [quantidades, setQuantidades] = useState<Record<string, number>>({});
  const [precos, setPrecos] = useState<Record<string, number>>({});

  const filtrados = items
    .filter((i) => i.status === "published")
    .filter((i) => categoria === "todos" || i.categoria === categoria)
    .filter((i) => !busca.trim() || i.nome.toLowerCase().includes(busca.trim().toLowerCase()));

  function quantidadeDe(slug: string) {
    return quantidades[slug] ?? 1;
  }
  function precoDe(item: ItemContent) {
    return precos[item.slug] ?? item.preco;
  }

  return (
    <>
      <Section title="Carteira">
        <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 10 }}>
          Três saldos separados (PRD 13.1) — nunca uma soma única.
        </p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {(Object.keys(WALLET_LABELS) as WalletId[]).map((id) => (
            <div key={id} data-testid={`carteira-${id}`}>
              <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>{WALLET_LABELS[id]}</div>
              <input
                data-testid={`carteira-input-${id}`}
                type="number"
                value={carteira[id]}
                onChange={(e) => onChangeCarteira(id, Number(e.target.value))}
                style={{ ...input, width: 100 }}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Loja do Mercado Noturno">
        <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 10 }}>
          Catálogo inteiro da Biblioteca do Sistema ({items.length} itens). Preço do livro editável
          por compra (PRD 13.2). Sem desconto/fiado do Mercador, sem envio para o bando ainda.
        </p>
        {catalogError && (
          <p style={{ fontSize: 13, color: "#ff6b6b", background: "#2a1717", borderRadius: 8, padding: "10px 12px" }}>
            Catálogo de itens indisponível. Nenhuma lista local foi usada.
          </p>
        )}
        {!catalogError && (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <input data-testid="loja-busca" type="text" placeholder="Buscar item…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ ...input, flex: 1, minWidth: 160 }} />
              <select data-testid="loja-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value as (typeof CATEGORIA_FILTROS)[number])} style={input}>
                {CATEGORIA_FILTROS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select data-testid="loja-carteira-select" value={walletId} onChange={(e) => setWalletId(e.target.value as WalletId)} style={input}>
                {(Object.keys(WALLET_LABELS) as WalletId[]).map((id) => (
                  <option key={id} value={id}>{WALLET_LABELS[id]}</option>
                ))}
              </select>
            </div>
            <div data-testid="loja-lista" style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflowY: "auto" }}>
              {filtrados.map((item) => (
                <div key={item.id} data-testid={`loja-item-${item.slug}`} style={{ background: "#1d1e24", borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
                  <strong style={{ minWidth: 140 }}>{item.nome}</strong>
                  <span style={{ opacity: 0.6 }}>[{item.categoria_label ?? item.categoria}]</span>
                  <input
                    data-testid={`loja-quantidade-${item.slug}`}
                    type="number"
                    min={1}
                    value={quantidadeDe(item.slug)}
                    onChange={(e) => setQuantidades((prev) => ({ ...prev, [item.slug]: Math.max(1, Number(e.target.value)) }))}
                    style={{ ...input, width: 60 }}
                  />
                  <input
                    data-testid={`loja-preco-${item.slug}`}
                    type="number"
                    value={precoDe(item)}
                    onChange={(e) => setPrecos((prev) => ({ ...prev, [item.slug]: Number(e.target.value) }))}
                    style={{ ...input, width: 80 }}
                  />
                  <button
                    data-testid={`loja-comprar-${item.slug}`}
                    onClick={() => onBuy(item.slug, quantidadeDe(item.slug), walletId, precoDe(item))}
                    style={{ ...buttonStyle, fontSize: 11, padding: "3px 10px" }}
                  >
                    Comprar
                  </button>
                </div>
              ))}
              {filtrados.length === 0 && <p style={{ fontSize: 12, opacity: 0.6 }}>Nenhum item nesta busca/categoria.</p>}
            </div>
          </>
        )}
      </Section>

      <Section title={`Inventário (${inventario.length})`}>
        {inventario.length === 0 && <p style={{ fontSize: 12, opacity: 0.6 }}>Nenhum item ainda.</p>}
        <div data-testid="inventario-lista" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {inventario.map((instance) => (
            <div key={instance.id} data-testid={`inventario-item-${instance.id}`} style={{ background: "#1d1e24", borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
              <strong>{instance.itemNome}</strong>
              <span style={{ opacity: 0.6 }}>x{instance.quantidade}</span>
              <select
                data-testid={`inventario-estado-${instance.id}`}
                value={instance.estado}
                onChange={(e) => onSetEstado(instance.id, e.target.value as ItemLoadoutState)}
                style={input}
              >
                {ITEM_LOADOUT_STATES.map((estado) => (
                  <option key={estado} value={estado}>{ESTADO_LABELS[estado]}</option>
                ))}
              </select>
              <button
                data-testid={`inventario-remover-${instance.id}`}
                onClick={() => onRemoveItem(instance.id)}
                style={{ ...buttonStyle, fontSize: 11, padding: "3px 10px" }}
              >
                Remover
              </button>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
