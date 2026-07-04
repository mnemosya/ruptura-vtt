"use client";

import { useState } from "react";
import { Section } from "./Section";
import { buttonStyle } from "./styles";
import {
  WALLET_LABELS,
  ITEM_LOADOUT_STATES,
  getRuneCompatibility,
  countInstalledRunes,
  deriveItemProperties,
  getItemMit,
  getItemPdMax,
  getItemMitAtual,
  getItemPdAtual,
  deriveModoMunicao,
  getWeaponAmmoAtual,
  type ItemContent,
  type InventoryItemInstance,
  type Wallet,
  type WalletId,
  type ItemLoadoutState,
} from "../../../../lib/character";
import type { TechnicalContentItem } from "../../../../lib/content";

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
  runes,
  runesError,
  onInstallRune,
  onRemoveRune,
  installedRuneIdsWithEffect,
  properties,
  onEquipDefensive,
  onUnequipDefensive,
  onSetMitAtual,
  onSetPdAtual,
  onSetMunicaoAtual,
  onSetFlechaQuantidade,
  onStoreFletchas,
  onWithdrawFletchas,
  onReloadWeapon,
  selectedFlechaSlugPerBow,
  onSelectFlechaAtiva,
}: {
  items: ItemContent[];
  catalogError: string | null;
  carteira: Wallet;
  inventario: InventoryItemInstance[];
  onBuy: (itemSlug: string, quantidade: number, walletId: WalletId, precoUnitario: number) => void;
  onChangeCarteira: (walletId: WalletId, value: number) => void;
  onSetEstado: (instanceId: string, estado: ItemLoadoutState) => void;
  onRemoveItem: (instanceId: string) => void;
  /** Runas publicadas na Biblioteca (checkpoint v0.56) — mesma fonte da aba Biblioteca. */
  runes: TechnicalContentItem[];
  runesError: string | null;
  onInstallRune: (instanceId: string, runeSlug: string) => void;
  onRemoveRune: (instanceId: string, runeInstallationId: string) => void;
  /** runeInstallationIds com pelo menos 1 ActiveEffect derivado (checkpoint v0.57) — ver `deriveInstalledRuneEffects`. */
  installedRuneIdsWithEffect: Set<string>;
  /** Catálogo publicado de propriedades; nunca substituído por lista local. */
  properties: TechnicalContentItem[];
  /** Equipar/desequipar armadura/escudo ativo (checkpoint v0.58) — sem aplicar dano ainda. */
  onEquipDefensive: (instanceId: string) => void;
  onUnequipDefensive: (instanceId: string) => void;
  onSetMitAtual: (instanceId: string, value: number) => void;
  onSetPdAtual: (instanceId: string, value: number) => void;
  onSetMunicaoAtual: (instanceId: string, value: number) => void;
  onSetFlechaQuantidade: (instanceId: string, contentSlug: string, value: number) => void;
  onStoreFletchas: (bowInstanceId: string, ammoInstanceId: string, contentSlug: string, nome: string, quantidade: number) => void;
  onWithdrawFletchas: (bowInstanceId: string, contentSlug: string, quantidade: number, nomeFlexa: string) => void;
  onReloadWeapon: (instanceId: string) => void;
  /** Slug da flecha ativa por instância de arco. */
  selectedFlechaSlugPerBow: Record<string, string>;
  onSelectFlechaAtiva: (instanceId: string, slug: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<(typeof CATEGORIA_FILTROS)[number]>("todos");
  const [walletId, setWalletId] = useState<WalletId>("aretz_informal");
  const [quantidades, setQuantidades] = useState<Record<string, number>>({});
  const [precos, setPrecos] = useState<Record<string, number>>({});
  const [runaSelecionada, setRunaSelecionada] = useState<Record<string, string>>({});
  // guardarQtd[bowId][ammoInstanceId] = quanto guardar
  const [guardarQtd, setGuardarQtd] = useState<Record<string, Record<string, number>>>({});
  // retirarQtd[bowId][contentSlug] = quanto retirar
  const [retirarQtd, setRetirarQtd] = useState<Record<string, Record<string, number>>>({});

  const runasPublicadas = runes.filter((r) => r.status === "published");
  const runaBySlug = new Map(runasPublicadas.map((r) => [r.slug, r]));
  const itemBySlug = new Map(items.map((i) => [i.slug, i]));

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
          {inventario.map((instance) => {
            const itemModelo = itemBySlug.get(instance.itemSlug);
            const runasInstaladas = instance.runasInstaladas ?? [];
            const slotsMax = itemModelo?.slotsRunaMax ?? null;
            const slotsUsados = countInstalledRunes(instance);
            const runaEscolhida = runaSelecionada[instance.id] ?? "";
            const runaEscolhidaContent = runaEscolhida ? runaBySlug.get(runaEscolhida) : undefined;
            const compatibilidade = runaEscolhidaContent
              ? getRuneCompatibility({ categoria: instance.categoria, subtipo: instance.subtipo }, runaEscolhidaContent)
              : null;
            const resolvedProperties = deriveItemProperties({
              instance,
              item: itemModelo,
              properties,
              runes: runasPublicadas,
            });
            const estadosTecnicos = instance.estadosTecnicos ?? [];
            const modoMunicao = itemModelo
              ? deriveModoMunicao(itemModelo.subtipo, itemModelo.municaoMax ?? null, itemModelo.municaoCompativelSlug ?? null)
              : null;
            const slotDefensivo: "armadura" | "escudo" | null =
              instance.categoria === "armadura" ? "armadura" : instance.categoria === "escudo" ? "escudo" : null;
            const mitMax = itemModelo ? getItemMit(itemModelo) : null;
            const pdMax = itemModelo ? getItemPdMax(itemModelo) : null;
            return (
              <div key={instance.id} data-testid={`inventario-item-${instance.id}`} style={{ background: "#1d1e24", borderRadius: 8, padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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

                {(resolvedProperties.length > 0 || estadosTecnicos.length > 0) && (
                  <div
                    data-testid={`inventario-propriedades-tecnicas-${instance.id}`}
                    style={{ borderTop: "1px solid #2a2b33", paddingTop: 6, marginTop: 2 }}
                  >
                    <p style={{ fontSize: 11, opacity: 0.7, margin: "0 0 4px" }}>Propriedades técnicas</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {resolvedProperties.map((property) => (
                        <div
                          key={property.key}
                          data-testid={`inventario-propriedade-${instance.id}-${property.key}`}
                          style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}
                        >
                          <strong>{property.label}</strong>
                          {property.value != null && property.value !== true && (
                            <span style={{ opacity: 0.7 }}>{String(property.value)}</span>
                          )}
                          <span style={{ fontSize: 10, color: property.critical ? "#5ec8ff" : "#b8b8c8" }}>
                            {property.classificationLabel}
                          </span>
                          <span style={{ fontSize: 10, opacity: 0.55 }}>
                            {property.sources.length === 1 ? "Origem" : "Origens"}:{" "}
                            {property.sources.map((source) => source.label).join(" · ")}
                          </span>
                          <span style={{ fontSize: 10, color: "#f5a623" }}>sem efeito mecânico automatizado</span>
                          {property.description && <span style={{ fontSize: 10, opacity: 0.6 }}>{property.description}</span>}
                        </div>
                      ))}
                      {estadosTecnicos.map((state) => (
                        <div key={state.id} style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                          <strong>{state.label}</strong>
                          <span>{state.active ? (state.activeLabel ?? "Ativo") : (state.inactiveLabel ?? "Inativo")}</span>
                          <span style={{ fontSize: 10, opacity: 0.55 }}>
                            Origem: {state.sourceLabel ?? state.sourceContentId}
                          </span>
                          <span style={{ fontSize: 10, color: "#f5a623" }}>sem efeito mecânico automatizado</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Munição (checkpoint v0.59) — carregador/virote/aljava. */}
                {modoMunicao === "carregador" || modoMunicao === "virote" ? (
                  <div data-testid={`inventario-municao-${instance.id}`} style={{ borderTop: "1px solid #2a2b33", paddingTop: 6, marginTop: 2 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <p style={{ fontSize: 11, opacity: 0.6, margin: 0 }}>
                        {modoMunicao === "virote" ? "Virote" : "Munição"}:{" "}
                        {getWeaponAmmoAtual(instance)} {itemModelo?.municaoMax != null ? `/ ${itemModelo.municaoMax}` : ""}
                      </p>
                      <button
                        data-testid={`inventario-recarregar-${instance.id}`}
                        onClick={() => onReloadWeapon(instance.id)}
                        style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}
                      >
                        Recarregar
                      </button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                      <span style={{ fontSize: 10, opacity: 0.5 }}>Ajuste manual:</span>
                      <input
                        data-testid={`inventario-municao-input-${instance.id}`}
                        type="number"
                        min={0}
                        max={itemModelo?.municaoMax ?? undefined}
                        value={getWeaponAmmoAtual(instance)}
                        onChange={(e) => onSetMunicaoAtual(instance.id, Number(e.target.value))}
                        style={{ ...input, width: 60, fontSize: 11 }}
                      />
                      <button
                        data-testid={`inventario-municao-restaurar-${instance.id}`}
                        onClick={() => onSetMunicaoAtual(instance.id, itemModelo?.municaoMax ?? 0)}
                        style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", opacity: 0.7 }}
                      >
                        Restaurar ao máximo
                      </button>
                    </div>
                    <p style={{ fontSize: 10, opacity: 0.4, margin: "4px 0 0" }}>
                      {modoMunicao === "virote" ? "Besta — 1 virote por câmara." : "Arma de fogo — carregador."}{" "}
                      Recarregar consome estoque compatível do inventário.
                    </p>
                  </div>
                ) : modoMunicao === "aljava" ? (() => {
                  type AljavaInst = InventoryItemInstance & { aljava?: { capacidade: number; stacks: { contentSlug: string; nome: string; quantidade: number }[] } };
                  const inst_ = instance as AljavaInst;
                  const aljava_ = inst_.aljava;
                  const capacidade = aljava_?.capacidade ?? 15;
                  const totalFlechas = aljava_?.stacks.reduce((s, x) => s + x.quantidade, 0) ?? 0;
                  const stacksComFlechas = (aljava_?.stacks ?? []).filter((s) => s.quantidade > 0);
                  const flechaAtiva = selectedFlechaSlugPerBow[instance.id] ?? "";
                  // Flechas no inventário (excluindo a própria arma)
                  const flechasEstoque = inventario.filter((inst) => {
                    if (inst.id === instance.id) return false;
                    const m = itemBySlug.get(inst.itemSlug);
                    return m?.categoria === "municao" && (m?.ammoFamilia?.startsWith("flecha") ?? false);
                  });
                  const bowGuardarQtd = guardarQtd[instance.id] ?? {};
                  const bowRetirarQtd = retirarQtd[instance.id] ?? {};
                  return (
                    <div data-testid={`inventario-aljava-${instance.id}`} style={{ borderTop: "1px solid #2a2b33", paddingTop: 6, marginTop: 2 }}>
                      {/* Cabeçalho */}
                      <p style={{ fontSize: 11, opacity: 0.6, margin: "0 0 6px" }}>
                        Aljava ({totalFlechas} / {capacidade})
                      </p>

                      {/* Conteúdo — uma linha por stack */}
                      {stacksComFlechas.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 8, marginBottom: 8 }}>
                          <p style={{ fontSize: 10, opacity: 0.45, margin: "0 0 2px" }}>Conteúdo — ajuste manual:</p>
                          {stacksComFlechas.map((stack) => {
                            const totalOutras = stacksComFlechas.filter((s) => s.contentSlug !== stack.contentSlug).reduce((sum, s) => sum + s.quantidade, 0);
                            const maxEsta = Math.max(0, capacidade - totalOutras);
                            const retirarVal = bowRetirarQtd[stack.contentSlug] ?? 1;
                            return (
                              <div key={stack.contentSlug} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                <span style={{ fontSize: 11, opacity: 0.85, minWidth: 120 }}>◆ {stack.nome}</span>
                                <input
                                  data-testid={`inventario-flecha-qtd-${instance.id}-${stack.contentSlug}`}
                                  type="number"
                                  min={0}
                                  max={maxEsta}
                                  value={stack.quantidade}
                                  onChange={(e) => onSetFlechaQuantidade(instance.id, stack.contentSlug, Number(e.target.value))}
                                  style={{ ...input, width: 52, fontSize: 11 }}
                                />
                                <span style={{ fontSize: 10, opacity: 0.4 }}>/ {maxEsta} máx</span>
                                <span style={{ fontSize: 10, opacity: 0.35, marginLeft: 4 }}>|</span>
                                <input
                                  data-testid={`inventario-flecha-retirar-qtd-${instance.id}-${stack.contentSlug}`}
                                  type="number"
                                  min={1}
                                  max={stack.quantidade}
                                  value={retirarVal}
                                  onChange={(e) => setRetirarQtd((prev) => ({ ...prev, [instance.id]: { ...bowRetirarQtd, [stack.contentSlug]: Math.max(1, Number(e.target.value)) } }))}
                                  style={{ ...input, width: 48, fontSize: 11 }}
                                />
                                <button
                                  data-testid={`inventario-flecha-retirar-${instance.id}-${stack.contentSlug}`}
                                  onClick={() => onWithdrawFletchas(instance.id, stack.contentSlug, retirarVal, stack.nome)}
                                  style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}
                                >
                                  Retirar
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {!aljava_ && (
                        <p style={{ fontSize: 10, opacity: 0.4, margin: "0 0 6px" }}>Aljava não inicializada — recarregue o personagem.</p>
                      )}

                      {/* Flecha ativa para ataque */}
                      {stacksComFlechas.length > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10, opacity: 0.6 }}>Flecha ativa para ataque:</span>
                          <select
                            data-testid={`inventario-flecha-ativa-${instance.id}`}
                            value={flechaAtiva}
                            onChange={(e) => onSelectFlechaAtiva(instance.id, e.target.value)}
                            style={{ ...input, fontSize: 11 }}
                          >
                            {stacksComFlechas.length > 1 && <option value="">— selecionar —</option>}
                            {stacksComFlechas.map((s) => (
                              <option key={s.contentSlug} value={s.contentSlug}>{s.nome} (x{s.quantidade})</option>
                            ))}
                          </select>
                          {stacksComFlechas.length === 1 && !flechaAtiva && (
                            <span style={{ fontSize: 10, opacity: 0.5 }}>(auto)</span>
                          )}
                        </div>
                      )}

                      {/* Guardar flechas do inventário */}
                      {flechasEstoque.length > 0 && totalFlechas < capacidade && (
                        <div style={{ borderTop: "1px dashed #2a2b33", paddingTop: 6, marginBottom: 6 }}>
                          <p style={{ fontSize: 10, opacity: 0.45, margin: "0 0 4px" }}>Guardar flechas (do inventário):</p>
                          {flechasEstoque.map((ammoInst) => {
                            const ammoModelo = itemBySlug.get(ammoInst.itemSlug);
                            const guardarVal = bowGuardarQtd[ammoInst.id] ?? 1;
                            return (
                              <div key={ammoInst.id} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 4, fontSize: 11 }}>
                                <span style={{ minWidth: 120, opacity: 0.85 }}>{ammoModelo?.nome ?? ammoInst.itemNome}</span>
                                <span style={{ opacity: 0.5 }}>estoque: {ammoInst.quantidade}</span>
                                <input
                                  data-testid={`inventario-guardar-qtd-${instance.id}-${ammoInst.id}`}
                                  type="number"
                                  min={1}
                                  max={Math.min(ammoInst.quantidade, capacidade - totalFlechas)}
                                  value={guardarVal}
                                  onChange={(e) => setGuardarQtd((prev) => ({ ...prev, [instance.id]: { ...bowGuardarQtd, [ammoInst.id]: Math.max(1, Number(e.target.value)) } }))}
                                  style={{ ...input, width: 52, fontSize: 11 }}
                                />
                                <button
                                  data-testid={`inventario-guardar-${instance.id}-${ammoInst.id}`}
                                  onClick={() => onStoreFletchas(instance.id, ammoInst.id, ammoInst.itemSlug, ammoModelo?.nome ?? ammoInst.itemNome, guardarVal)}
                                  style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}
                                >
                                  Guardar
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Recarregar automático */}
                      <button
                        data-testid={`inventario-recarregar-aljava-${instance.id}`}
                        onClick={() => onReloadWeapon(instance.id)}
                        style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}
                      >
                        Recarregar aljava
                      </button>
                      <p style={{ fontSize: 10, opacity: 0.35, margin: "4px 0 0" }}>
                        Guardar/Retirar = transferência real · Recarregar aljava = atalho automático · ajuste manual = override direto.
                        {" "}Efeitos especiais são sugestões ao mestre.
                      </p>
                    </div>
                  );
                })() : null}

                {/* Equipamento defensivo (checkpoint v0.58) — MIT/PD atual, sem aplicar dano ainda. */}
                {slotDefensivo && (mitMax != null || pdMax != null) && (
                  <div data-testid={`inventario-defensivo-${instance.id}`} style={{ borderTop: "1px solid #2a2b33", paddingTop: 6, marginTop: 2 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <p style={{ fontSize: 11, opacity: 0.6, margin: 0 }}>
                        {slotDefensivo === "armadura" ? "MIT" : "PD"}:{" "}
                        {slotDefensivo === "armadura" ? getItemMitAtual(instance, itemModelo) : getItemPdAtual(instance, itemModelo)}
                        {(slotDefensivo === "armadura" ? mitMax : pdMax) != null && ` / ${slotDefensivo === "armadura" ? mitMax : pdMax}`}
                      </p>
                      <input
                        data-testid={`inventario-defensivo-valor-${instance.id}`}
                        type="number"
                        min={0}
                        value={slotDefensivo === "armadura" ? getItemMitAtual(instance, itemModelo) : getItemPdAtual(instance, itemModelo)}
                        onChange={(e) =>
                          slotDefensivo === "armadura"
                            ? onSetMitAtual(instance.id, Number(e.target.value))
                            : onSetPdAtual(instance.id, Number(e.target.value))
                        }
                        style={{ ...input, width: 60, fontSize: 11 }}
                      />
                      <button
                        data-testid={`inventario-defensivo-restaurar-${instance.id}`}
                        onClick={() =>
                          slotDefensivo === "armadura"
                            ? onSetMitAtual(instance.id, mitMax ?? 0)
                            : onSetPdAtual(instance.id, pdMax ?? 0)
                        }
                        style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}
                      >
                        Restaurar ao máximo
                      </button>
                      {instance.equipadoDefensivo ? (
                        <button
                          data-testid={`inventario-desequipar-${instance.id}`}
                          onClick={() => onUnequipDefensive(instance.id)}
                          style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", marginLeft: "auto" }}
                        >
                          Desequipar
                        </button>
                      ) : (
                        <button
                          data-testid={`inventario-equipar-${instance.id}`}
                          onClick={() => onEquipDefensive(instance.id)}
                          style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", marginLeft: "auto" }}
                        >
                          Equipar como {slotDefensivo === "armadura" ? "armadura ativa" : "escudo ativo"}
                        </button>
                      )}
                    </div>
                    <p style={{ fontSize: 10, opacity: 0.4, margin: "4px 0 0" }}>
                      {instance.equipadoDefensivo
                        ? `${slotDefensivo === "armadura" ? "Armadura" : "Escudo"} ativo — só 1 por vez (sem sobreposição por região ainda).`
                        : "Não equipado — MIT/PD não conta na defesa enquanto não for equipado."}{" "}
                      Ainda não aplica dano automaticamente.
                    </p>
                  </div>
                )}

                {/* Runas instaladas (checkpoint v0.56) — referência passiva, sem efeito mecânico. */}
                <div style={{ borderTop: "1px solid #2a2b33", paddingTop: 6, marginTop: 2 }}>
                  <p style={{ fontSize: 11, opacity: 0.6, margin: "0 0 4px" }}>
                    Runas instaladas ({slotsUsados}{slotsMax != null ? `/${slotsMax}` : ""})
                    {slotsMax == null && " — limite de slots ainda não automatizado para este item"}
                  </p>
                  {runasInstaladas.length > 0 && (
                    <div data-testid={`inventario-runas-lista-${instance.id}`} style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
                      {runasInstaladas.map((runa) => {
                        const modelo = runaBySlug.get(runa.runeContentId);
                        const automatizada = installedRuneIdsWithEffect.has(runa.id);
                        return (
                          <div key={runa.id} data-testid={`inventario-runa-instalada-${runa.id}`} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ opacity: 0.5 }}>◆</span>
                            <span>{modelo?.nome ?? `Conteúdo não encontrado (${runa.runeContentId})`}</span>
                            {automatizada && <span style={{ fontSize: 10, color: "#4caf50" }}>modificador aplicado</span>}
                            <button
                              data-testid={`inventario-runa-remover-${runa.id}`}
                              onClick={() => onRemoveRune(instance.id, runa.id)}
                              style={{ ...buttonStyle, fontSize: 10, padding: "1px 6px", marginLeft: "auto" }}
                            >
                              Remover
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {runesError && <p style={{ fontSize: 11, color: "#ff6b6b" }}>Catálogo de runas indisponível.</p>}
                  {!runesError && (
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <select
                        data-testid={`inventario-runa-select-${instance.id}`}
                        value={runaEscolhida}
                        onChange={(e) => setRunaSelecionada((prev) => ({ ...prev, [instance.id]: e.target.value }))}
                        style={{ ...input, fontSize: 11 }}
                      >
                        <option value="">— escolher runa —</option>
                        {runasPublicadas.map((r) => (
                          <option key={r.slug} value={r.slug}>{r.nome}</option>
                        ))}
                      </select>
                      <button
                        data-testid={`inventario-runa-instalar-${instance.id}`}
                        disabled={!runaEscolhida}
                        onClick={() => {
                          if (!runaEscolhida) return;
                          onInstallRune(instance.id, runaEscolhida);
                          setRunaSelecionada((prev) => ({ ...prev, [instance.id]: "" }));
                        }}
                        style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", opacity: runaEscolhida ? 1 : 0.5 }}
                      >
                        Instalar
                      </button>
                      {compatibilidade === "incompatible" && (
                        <span style={{ fontSize: 10, color: "#ff6b6b" }}>Incompatível com este item.</span>
                      )}
                      {compatibilidade === "unknown" && (
                        <span style={{ fontSize: 10, color: "#f5a623" }}>Compatibilidade incerta — dado insuficiente na fonte.</span>
                      )}
                    </div>
                  )}
                  <p style={{ fontSize: 10, opacity: 0.4, margin: "4px 0 0" }}>
                    Modificadores passivos claramente estruturados são aplicados automaticamente (ver
                    chip acima); o restante do payload de cada runa continua só leitura na Biblioteca.
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}
