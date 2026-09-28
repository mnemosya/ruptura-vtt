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
  getItemMitBase,
  getItemPdAtual,
  getItemPdBase,
  getItemPdTemporaryRemaining,
  deriveModoMunicao,
  getWeaponAmmoAtual,
  ALJAVA_ITEM_SLUG,
  deriveItemUseKind,
  getItemUseEffects,
  getItemChargesAtual,
  getConditionRemovalOptions,
  getItemUsePreview,
  canSplitInstanceQuantity,
  hasSobregravacaoAccess,
  getSlotsRunaMaxEfetivo,
  isRaridadeDentroDoLimite,
  type Character,
  type ItemContent,
  type InventoryItemInstance,
  type Wallet,
  type WalletId,
  type ItemLoadoutState,
  type Aljava,
  type ActiveCondition,
} from "../../../../lib/character";
import type { TechnicalContentItem } from "../../../../lib/content";

const input: React.CSSProperties = { background: "#0f1014", color: "inherit", border: "1px solid #333", borderRadius: 4, padding: "6px 8px", fontSize: 13 };
const widgetBox2: React.CSSProperties = { background: "#15161b", borderRadius: 6, padding: "6px 8px", display: "flex", flexDirection: "column", gap: 4, fontSize: 11 };

const CATEGORIA_FILTROS = ["todos", "arma", "armadura", "escudo", "explosivo", "farmacia", "vertina", "ferramenta", "dispositivo", "veiculo", "municao"] as const;

const ESTADO_LABELS: Record<ItemLoadoutState, string> = {
  equipado: "Equipado",
  empunhado: "Empunhado",
  acesso_rapido: "Acesso rápido",
  mochila: "Mochila",
  abrigo: "Abrigo",
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
  condicoesAtivas,
  colapso,
  onBuy,
  onChangeCarteira,
  onSetEstado,
  onRemoveItem,
  onUseItem,
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
  onSelectAljava,
  onSelectFlechaAtiva,
  isConnectedToCampaign,
  onSendToCrew,
  allies,
  onUseItemOnAlly,
  onRefreshAllies,
  toqueDeMidasAvailable = false,
  onApplyToqueDeMidas,
  onEndToqueDeMidas,
  onApplyShieldDamage,
  onRollToolTest,
  runicoGatilhoAvailable = false,
  onToggleRuneActive,
  entalheRapidoAvailable = false,
  entalheAttempts = {},
  onStartEntalheRapido,
  onConfirmEntalheRapido,
  sobregravacaoAvailable = false,
  currentCharacterId = null,
  onApplySobregravacao,
  onSetSobregravacaoAllies,
  sobregravacaoTestPending = {},
  onStartSobregravacaoTest,
  onConfirmSobregravacaoTest,
  garimpoDeRuaStatus,
  onActivateGarimpoDeRua,
  cadernetaDeDividaStatus,
  onBuyFiado,
  dividasMercador = [],
  onQuitarDivida,
}: {
  items: ItemContent[];
  catalogError: string | null;
  carteira: Wallet;
  inventario: InventoryItemInstance[];
  /** Condições do personagem (checkpoint pós-v0.61) — usadas pelo seletor/bloqueio de itens com `remover_condicao`. */
  condicoesAtivas: ActiveCondition[];
  /** Colapso atual do personagem (checkpoint pós-v0.62) — usado pelo preview/bloqueio de itens de estabilização. */
  colapso: Character["colapso"];
  onBuy: (itemSlug: string, quantidade: number, walletId: WalletId, precoUnitario: number) => void;
  onChangeCarteira: (walletId: WalletId, value: number) => void;
  onSetEstado: (instanceId: string, estado: ItemLoadoutState) => void;
  onRemoveItem: (instanceId: string) => void;
  /** Usar item consumível (farmácia/granadas, checkpoint pós-v0.58) — só chamado quando `deriveItemUseKind` detecta uso possível. */
  onUseItem: (instanceId: string, options?: { selectedConditionInstanceId?: string }) => void;
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
  /** Ajuste manual de um stack DENTRO de uma Aljava específica (`aljavaInstanceId`). */
  onSetFlechaQuantidade: (aljavaInstanceId: string, contentSlug: string, value: number) => void;
  /** Guarda flechas do estoque em UMA Aljava específica (`aljavaInstanceId`). */
  onStoreFletchas: (aljavaInstanceId: string, ammoInstanceId: string, contentSlug: string, nome: string, quantidade: number) => void;
  /** Retira flechas de UMA Aljava específica (`aljavaInstanceId`) de volta ao estoque. */
  onWithdrawFletchas: (aljavaInstanceId: string, contentSlug: string, quantidade: number, nomeFlexa: string) => void;
  onReloadWeapon: (instanceId: string) => void;
  /** Arco escolhe qual instância de Aljava usa para atacar (null = limpar seleção). */
  onSelectAljava: (bowInstanceId: string, aljavaInstanceId: string | null) => void;
  /** Arco escolhe qual tipo de flecha (dentro da Aljava selecionada) usa para atacar. */
  onSelectFlechaAtiva: (bowInstanceId: string, flechaSlug: string | null) => void;
  /** `true` só com personagem salvo + mesa conectada (checkpoint pós-v0.68) — "Enviar ao bando" exige as duas coisas. */
  isConnectedToCampaign: boolean;
  /** Envia `quantidade` unidades da instância ao inventário do bando da mesa (checkpoint pós-v0.68, CP7). */
  onSendToCrew: (instanceId: string, quantidade: number) => void;
  /** Outros personagens ATIVOS na mesa (checkpoint pós-v0.71 — uso de item em aliado) — vazio se não conectado ou sem outros ativos. */
  allies: { id: string; nome: string; character: Character }[];
  /** Usa 1 unidade do item do personagem atual aplicando o efeito no personagem `targetCharacterId`. */
  onUseItemOnAlly: (instanceId: string, targetCharacterId: string, options?: { selectedConditionInstanceId?: string }) => void;
  /** Recarrega `allies` sob demanda (ex.: ao abrir o painel "Usar em aliado") — mantém PV/condições do alvo atualizados no momento do uso. */
  onRefreshAllies: () => void;
  /** Artífice › Toque de Midas disponível (adquirido + 1/dia não usado). */
  toqueDeMidasAvailable?: boolean;
  /** Aplica Toque de Midas à instância (o alvo é derivado da categoria; `pericia` só p/ ferramenta/dispositivo). */
  onApplyToqueDeMidas?: (instanceId: string, pericia?: string) => void;
  /** Encerra manualmente o Toque de Midas da instância. */
  onEndToqueDeMidas?: (instanceId: string) => void;
  /** Aplica dano ao escudo (consome PD temporário de Toque de Midas antes do PD-base). */
  onApplyShieldDamage?: (instanceId: string, amount: number) => void;
  /** Prepara na aba Rolagens um teste de ferramenta/dispositivo com o +1 de Toque de Midas escopado a esta instância. */
  onRollToolTest?: (instanceId: string, relatedSkill: string) => void;
  /** Rúnico › Gatilho Rúnico — mostra o botão Ativar/Desativar por runa instalada (sem PA). */
  runicoGatilhoAvailable?: boolean;
  onToggleRuneActive?: (instanceId: string, runeInstallationId: string) => void;
  /** Rúnico › Entalhe Rápido — mostra o fluxo de instalar/remover com 1 PA + teste real de Engenharia. */
  entalheRapidoAvailable?: boolean;
  /** Tentativa pendente de confirmação por instância (após gastar PA e preparar a rolagem). */
  entalheAttempts?: Record<string, { mode: "instalar" | "remover"; alvo: string; cd: number }>;
  onStartEntalheRapido?: (instanceId: string, mode: "instalar" | "remover", alvo: string, cd: number) => void;
  onConfirmEntalheRapido?: (instanceId: string, resultado: number) => void;
  /** Rúnico › Sobregravação — personagem tem o talento (pode aplicar a instâncias do próprio inventário). */
  sobregravacaoAvailable?: boolean;
  /** Id do personagem atualmente com a ficha aberta — usado para checar `hasSobregravacaoAccess` (dono/aliado/terceiro testado). */
  currentCharacterId?: string | null;
  /** Aplica Sobregravação a uma instância do próprio inventário (dono do talento). */
  onApplySobregravacao?: (instanceId: string) => void;
  /** Dono edita a lista de aliados instruídos (substitui a lista inteira). */
  onSetSobregravacaoAllies?: (instanceId: string, allyIds: string[]) => void;
  /** Instâncias com teste de Tecnomagia/Arcanismo CD 8 pendente de confirmação. */
  sobregravacaoTestPending?: Record<string, true>;
  /** Terceiro sem acesso inicia o teste CD 8 para acessar o espaço extra. */
  onStartSobregravacaoTest?: (instanceId: string) => void;
  onConfirmSobregravacaoTest?: (instanceId: string, resultado: number) => void;
  /** Mercador › Garimpo de Rua (checkpoint talentos, Fase 8). */
  garimpoDeRuaStatus?: { acquired: boolean; percentual: number; ativoHoje: boolean };
  onActivateGarimpoDeRua?: () => void;
  /** Mercador › Caderneta de Dívida (checkpoint talentos, Fase 12). */
  cadernetaDeDividaStatus?: { acquired: boolean; usedThisSession: boolean; raridadeMaxima: string };
  /** Confirma a compra fiada — saldo insuficiente vira dívida real (`fornecedor` é texto livre do jogador/narrador). */
  onBuyFiado?: (itemSlug: string, quantidade: number, walletId: WalletId, precoUnitario: number, fornecedor: string) => void;
  /** Dívidas registradas por Caderneta de Dívida — persistidas no personagem. */
  dividasMercador?: Character["dividas_mercador"];
  /** Marca uma dívida como quitada manualmente. */
  onQuitarDivida?: (dividaId: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<(typeof CATEGORIA_FILTROS)[number]>("todos");
  const [walletId, setWalletId] = useState<WalletId>("aretz_informal");
  const [quantidades, setQuantidades] = useState<Record<string, number>>({});
  const [precos, setPrecos] = useState<Record<string, number>>({});
  // fornecedorFiado[slug] = nome do fornecedor digitado para a compra fiada (Caderneta de Dívida)
  const [fornecedorFiado, setFornecedorFiado] = useState<Record<string, string>>({});
  const [runaSelecionada, setRunaSelecionada] = useState<Record<string, string>>({});
  const [toqueMidasPericia, setToqueMidasPericia] = useState<Record<string, string>>({});
  const [escudoDanoInput, setEscudoDanoInput] = useState<Record<string, string>>({});
  const [entalheCd, setEntalheCd] = useState<Record<string, string>>({});
  const [entalheRemoverAlvo, setEntalheRemoverAlvo] = useState<Record<string, string>>({});
  const [entalheResultado, setEntalheResultado] = useState<Record<string, string>>({});
  const [sobregravacaoAliadosInput, setSobregravacaoAliadosInput] = useState<Record<string, string>>({});
  const [sobregravacaoTestResultado, setSobregravacaoTestResultado] = useState<Record<string, string>>({});
  // guardarQtd[`${aljavaInstanceId}:${ammoInstanceId}`] = quanto guardar nesta Aljava
  const [guardarQtd, setGuardarQtd] = useState<Record<string, number>>({});
  // retirarQtd[`${aljavaInstanceId}:${contentSlug}`] = quanto retirar desta Aljava
  const [retirarQtd, setRetirarQtd] = useState<Record<string, number>>({});
  // condicaoRemocao[instanceId] = id da ActiveCondition escolhida no seletor de remover_condicao (checkpoint pós-v0.61)
  const [condicaoRemocao, setCondicaoRemocao] = useState<Record<string, string>>({});
  // enviarBandoQtd[instanceId] = quantidade a enviar ao bando (checkpoint pós-v0.68)
  const [enviarBandoQtd, setEnviarBandoQtd] = useState<Record<string, number>>({});
  // usarEmAliadoAberto[instanceId] = painel "Usar em aliado" expandido (checkpoint pós-v0.71)
  const [usarEmAliadoAberto, setUsarEmAliadoAberto] = useState<Record<string, boolean>>({});
  // aliadoAlvo[instanceId] = id do personagem alvo escolhido
  const [aliadoAlvo, setAliadoAlvo] = useState<Record<string, string>>({});
  // aliadoCondicaoRemocao[instanceId] = id da ActiveCondition do ALVO escolhida no seletor
  const [aliadoCondicaoRemocao, setAliadoCondicaoRemocao] = useState<Record<string, string>>({});

  const runasPublicadas = runes.filter((r) => r.status === "published");
  const runaBySlug = new Map(runasPublicadas.map((r) => [r.slug, r]));
  const itemBySlug = new Map(items.map((i) => [i.slug, i]));

  // Todas as instâncias de Aljava do personagem, na ordem do inventário —
  // um personagem pode ter várias; numeradas "Aljava 1", "Aljava 2"... para exibição.
  const aljavaInstances = inventario.filter(
    (i): i is InventoryItemInstance & { aljava: Aljava } => i.itemSlug === ALJAVA_ITEM_SLUG && i.aljava != null,
  );
  const aljavaIndexById = new Map(aljavaInstances.map((inst, idx) => [inst.id, idx + 1]));

  const filtrados = items
    .filter((i) => i.status === "published")
    .filter((i) => categoria === "todos" || i.categoria === categoria)
    .filter((i) => !busca.trim() || i.nome.toLowerCase().includes(busca.trim().toLowerCase()));

  function quantidadeDe(slug: string) {
    return quantidades[slug] ?? 1;
  }
  function precoDe(item: ItemContent) {
    const base = precos[item.slug] ?? item.preco;
    if (garimpoDeRuaStatus?.ativoHoje && garimpoDeRuaStatus.percentual > 0) {
      return Math.max(0, Math.round(base * (1 - garimpoDeRuaStatus.percentual / 100)));
    }
    return base;
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
          por compra (PRD 13.2). Sem fiado do Mercador, sem envio para o bando ainda.
        </p>
        {garimpoDeRuaStatus?.acquired && (
          <div data-testid="garimpo-de-rua-widget" style={{ ...widgetBox2, marginBottom: 10 }}>
            {garimpoDeRuaStatus.ativoHoje ? (
              <span style={{ color: "#4caf50" }}>
                Garimpo de Rua ativo hoje — preços da loja com -{garimpoDeRuaStatus.percentual}% (reseta em Novo Dia/descanso longo).
              </span>
            ) : (
              <>
                <span style={{ opacity: 0.7 }}>Garimpo de Rua: -{garimpoDeRuaStatus.percentual}% nas compras de hoje (1/dia).</span>
                <button
                  data-testid="garimpo-de-rua-ativar"
                  onClick={onActivateGarimpoDeRua}
                  style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", alignSelf: "flex-start" }}
                >
                  Ativar desconto de hoje
                </button>
              </>
            )}
          </div>
        )}
        {cadernetaDeDividaStatus?.acquired && (
          <div data-testid="caderneta-de-divida-widget" style={{ ...widgetBox2, marginBottom: 10 }}>
            {cadernetaDeDividaStatus.usedThisSession ? (
              <span style={{ opacity: 0.6 }}>Caderneta de Dívida já usada nesta sessão (reseta na próxima sessão).</span>
            ) : (
              <span style={{ opacity: 0.7 }}>
                Caderneta de Dívida: 1x/sessão, garante um item até raridade "{cadernetaDeDividaStatus.raridadeMaxima}" mesmo sem saldo — preencha o
                fornecedor e use "Comprar fiado".
              </span>
            )}
          </div>
        )}
        {dividasMercador.length > 0 && (
          <div data-testid="dividas-mercador-lista" style={{ ...widgetBox2, marginBottom: 10 }}>
            <strong style={{ fontSize: 11 }}>Dívidas com fornecedores</strong>
            {dividasMercador.map((d) => (
              <div key={d.id} data-testid={`divida-${d.id}`} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ opacity: d.quitada ? 0.5 : 1 }}>
                  {d.itemNome} — devendo {d.saldoDevido} a {d.fornecedor} (pago {d.valorPago}/{d.precoTotal}){d.quitada ? " — quitada" : ""}
                </span>
                {!d.quitada && (
                  <button
                    data-testid={`divida-quitar-${d.id}`}
                    onClick={() => onQuitarDivida?.(d.id)}
                    style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}
                  >
                    Marcar quitada
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
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
                  {cadernetaDeDividaStatus?.acquired &&
                    !cadernetaDeDividaStatus.usedThisSession &&
                    isRaridadeDentroDoLimite(item.raridade, cadernetaDeDividaStatus.raridadeMaxima) && (
                      <>
                        <input
                          data-testid={`loja-fiado-fornecedor-${item.slug}`}
                          type="text"
                          placeholder="Fornecedor"
                          value={fornecedorFiado[item.slug] ?? ""}
                          onChange={(e) => setFornecedorFiado((prev) => ({ ...prev, [item.slug]: e.target.value }))}
                          style={{ ...input, width: 100 }}
                        />
                        <button
                          data-testid={`loja-comprar-fiado-${item.slug}`}
                          disabled={!fornecedorFiado[item.slug]?.trim()}
                          onClick={() =>
                            onBuyFiado?.(item.slug, quantidadeDe(item.slug), walletId, precoDe(item), fornecedorFiado[item.slug]!.trim())
                          }
                          style={{ ...buttonStyle, fontSize: 11, padding: "3px 10px", opacity: fornecedorFiado[item.slug]?.trim() ? 1 : 0.5 }}
                          title="Caderneta de Dívida — 1x/sessão, item até raridade limite; o saldo devido vira dívida com o fornecedor."
                        >
                          Comprar fiado
                        </button>
                      </>
                    )}
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
            const slotsMax = getSlotsRunaMaxEfetivo(instance, itemModelo, currentCharacterId);
            const slotsUsados = countInstalledRunes(instance);
            const sobregravacaoAcesso = hasSobregravacaoAccess(instance, currentCharacterId);
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
            // Uso de item consumível (farmácia/granadas, checkpoint pós-v0.58) — data-driven via `deriveItemUseKind`; "Usar" só aparece com algum indício de uso no conteúdo publicado.
            const useKind = itemModelo ? deriveItemUseKind(itemModelo) : null;
            const useEffects = itemModelo ? getItemUseEffects(itemModelo) : [];
            const chargesAtual = itemModelo ? getItemChargesAtual(instance, itemModelo) : null;
            const useAvailable = itemModelo?.cargasMax != null ? (chargesAtual ?? 0) > 0 : instance.quantidade > 0;
            // Remoção de condição (checkpoint pós-v0.61) — opções calculadas do payload + condições ativas, nunca por nome de item.
            const removalOptions =
              itemModelo && useKind === "pharmacy"
                ? getConditionRemovalOptions(itemModelo, { condicoes_ativas: condicoesAtivas })
                : { possibleSlugs: [], compatibleActive: [] };
            const removalNeedsChoice = removalOptions.compatibleActive.length > 1;
            const condicaoEscolhida = condicaoRemocao[instance.id] ?? "";
            const condicaoEscolhidaValida = removalOptions.compatibleActive.some((c) => c.id === condicaoEscolhida);
            // Preview automático/manual + bloqueio (checkpoint pós-v0.62) — espelha useItemOnCharacter sem aplicar nada.
            const usePreview = itemModelo && useKind
              ? getItemUsePreview(itemModelo, { condicoes_ativas: condicoesAtivas, colapso })
              : null;
            const useBlocked = usePreview?.blockedReason != null;
            const temCuraImediata = useEffects.some((e) => e.tipo === "cura" && typeof e.gatilho !== "string");
            // Uso em aliado (checkpoint pós-v0.71) — só farmácia; preview/bloqueio calculados contra
            // o ALVO escolhido (condições/colapso DELE, nunca do usuário). Nunca por nome de item.
            const aliadoAlvoId = aliadoAlvo[instance.id] ?? "";
            const aliadoSelecionado = allies.find((a) => a.id === aliadoAlvoId);
            const allyRemovalOptions =
              itemModelo && useKind === "pharmacy" && aliadoSelecionado
                ? getConditionRemovalOptions(itemModelo, aliadoSelecionado.character)
                : { possibleSlugs: [], compatibleActive: [] };
            const allyRemovalNeedsChoice = allyRemovalOptions.compatibleActive.length > 1;
            const allyCondicaoEscolhida = aliadoCondicaoRemocao[instance.id] ?? "";
            const allyCondicaoEscolhidaValida = allyRemovalOptions.compatibleActive.some((c) => c.id === allyCondicaoEscolhida);
            const allyPreview =
              itemModelo && useKind === "pharmacy" && aliadoSelecionado
                ? getItemUsePreview(itemModelo, { condicoes_ativas: aliadoSelecionado.character.condicoes_ativas ?? [], colapso: aliadoSelecionado.character.colapso })
                : null;
            const allyBlocked = allyPreview?.blockedReason != null;
            const allyUseDisabled = !aliadoAlvoId || !useAvailable || allyBlocked || (allyRemovalNeedsChoice && !allyCondicaoEscolhidaValida);
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

                {/* Toque de Midas (Artífice N2) — efeito temporário na instância real. */}
                {(() => {
                  const nowIso = new Date().toISOString();
                  const midas = instance.toqueDeMidas;
                  const midasAtivo = midas?.active && nowIso < midas.expiresAt ? midas : null;
                  const midasExpiradoNaoLimpo = midas?.active && nowIso >= midas.expiresAt;
                  const alvoDerivado =
                    instance.categoria === "arma"
                      ? "arma"
                      : instance.categoria === "armadura"
                        ? "armadura"
                        : instance.categoria === "escudo"
                          ? "escudo"
                          : "ferramenta_dispositivo";
                  if (midasAtivo) {
                    const mods = midasAtivo.modifiers;
                    const efeitoTexto =
                      alvoDerivado === "arma"
                        ? `+${mods.ataque ?? 0} ataque e +${mods.dano ?? 0} dano`
                        : alvoDerivado === "armadura"
                          ? `+${mods.mit ?? 0} MIT`
                          : alvoDerivado === "escudo"
                            ? `+${midasAtivo.temporaryPdGranted ?? 0} PD temporário`
                            : `+${mods.testeRelacionado ?? 0} no teste${midasAtivo.relatedSkill ? ` (${midasAtivo.relatedSkill})` : ""}`;
                    return (
                      <div data-testid={`toque-de-midas-ativo-${instance.id}`} style={{ background: "#241f14", border: "1px solid #6b5a2a", borderRadius: 6, padding: "6px 8px", fontSize: 11, display: "flex", flexDirection: "column", gap: 4 }}>
                        <div>
                          <span style={{ color: "#e0a03c" }}>✦ Toque de Midas ativo</span> — {efeitoTexto} · aplicado {new Date(midasAtivo.appliedAt).toLocaleTimeString()} · expira {new Date(midasAtivo.expiresAt).toLocaleTimeString()}
                          <button
                            data-testid={`toque-de-midas-encerrar-${instance.id}`}
                            onClick={() => onEndToqueDeMidas?.(instance.id)}
                            style={{ ...buttonStyle, fontSize: 10, padding: "1px 8px", marginLeft: 8 }}
                          >
                            Encerrar efeito
                          </button>
                        </div>
                        {alvoDerivado === "arma" && (
                          <span data-testid={`toque-de-midas-escopo-arma-${instance.id}`} style={{ opacity: 0.6 }}>
                            Selecione esta arma em "Atacar" e clique "Rolar" — o +{mods.ataque ?? 0} entra como chip só nesse teste.
                          </span>
                        )}
                        {alvoDerivado === "armadura" && (
                          <span data-testid={`toque-de-midas-mit-comparacao-${instance.id}`} style={{ opacity: 0.6 }}>
                            MIT-base {getItemMitBase(instance, itemModelo)} → MIT ajustado {getItemMitAtual(instance, itemModelo, nowIso)}
                          </span>
                        )}
                        {alvoDerivado === "escudo" && (
                          <span data-testid={`toque-de-midas-pd-detalhe-${instance.id}`} style={{ opacity: 0.6 }}>
                            PD-base {getItemPdBase(instance, itemModelo)} + PD temporário {getItemPdTemporaryRemaining(instance, nowIso)}/{midasAtivo.temporaryPdGranted ?? 0} = PD total {getItemPdAtual(instance, itemModelo, nowIso)}
                          </span>
                        )}
                        {alvoDerivado === "ferramenta_dispositivo" && (
                          <button
                            data-testid={`toque-de-midas-rolar-ferramenta-${instance.id}`}
                            onClick={() => onRollToolTest?.(instance.id, midasAtivo.relatedSkill ?? "")}
                            style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", alignSelf: "flex-start" }}
                          >
                            Rolar teste relacionado (+{mods.testeRelacionado ?? 0})
                          </button>
                        )}
                      </div>
                    );
                  }
                  if (midasExpiradoNaoLimpo) {
                    return (
                      <div data-testid={`toque-de-midas-expirado-${instance.id}`} style={{ fontSize: 11, color: "#888", background: "#1a1a1a", borderRadius: 6, padding: "4px 8px" }}>
                        Toque de Midas expirou (bônus não conta mais no cálculo) — sincroniza ao recarregar/salvar.
                      </div>
                    );
                  }
                  if (!toqueDeMidasAvailable) return null;
                  const efeitoLabel =
                    alvoDerivado === "arma" ? "arma" : alvoDerivado === "armadura" ? "armadura" : alvoDerivado === "escudo" ? "escudo" : "ferramenta/dispositivo";
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 11 }}>
                      {alvoDerivado === "ferramenta_dispositivo" && (
                        <input
                          data-testid={`toque-de-midas-pericia-${instance.id}`}
                          placeholder="perícia/contexto"
                          value={toqueMidasPericia[instance.id] ?? ""}
                          onChange={(e) => setToqueMidasPericia((prev) => ({ ...prev, [instance.id]: e.target.value }))}
                          style={{ ...input, width: 130 }}
                        />
                      )}
                      <button
                        data-testid={`toque-de-midas-aplicar-${instance.id}`}
                        onClick={() => onApplyToqueDeMidas?.(instance.id, toqueMidasPericia[instance.id] || undefined)}
                        style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}
                        title="1/dia (renova no descanso longo) · 1 hora · efeito na instância real"
                      >
                        Aplicar Toque de Midas ({efeitoLabel})
                      </button>
                    </div>
                  );
                })()}

                {/* Aplicar dano ao escudo (checkpoint talentos) — consome PD temporário (Toque de Midas) antes do PD-base. */}
                {instance.categoria === "escudo" && instance.equipadoDefensivo && (getItemPdAtual(instance, itemModelo) > 0) && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                    <input
                      data-testid={`escudo-dano-valor-${instance.id}`}
                      type="number"
                      min={1}
                      value={escudoDanoInput[instance.id] ?? ""}
                      onChange={(e) => setEscudoDanoInput((prev) => ({ ...prev, [instance.id]: e.target.value }))}
                      style={{ ...input, width: 60 }}
                      placeholder="dano"
                    />
                    <button
                      data-testid={`escudo-aplicar-dano-${instance.id}`}
                      onClick={() => {
                        const v = Math.max(0, Math.trunc(Number(escudoDanoInput[instance.id]) || 0));
                        if (v > 0) onApplyShieldDamage?.(instance.id, v);
                      }}
                      style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}
                    >
                      Aplicar dano ao escudo (temporário primeiro)
                    </button>
                  </div>
                )}

                {/* Enviar ao bando (checkpoint pós-v0.68, CP7) — só com mesa conectada + personagem salvo. */}
                {isConnectedToCampaign ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {canSplitInstanceQuantity(instance) && (
                      <input
                        data-testid={`inventario-bando-enviar-qtd-${instance.id}`}
                        type="number"
                        min={1}
                        max={instance.quantidade}
                        value={enviarBandoQtd[instance.id] ?? instance.quantidade}
                        onChange={(e) =>
                          setEnviarBandoQtd((prev) => ({ ...prev, [instance.id]: Math.max(1, Math.min(instance.quantidade, Number(e.target.value))) }))
                        }
                        style={{ ...input, width: 60, fontSize: 11 }}
                      />
                    )}
                    <button
                      data-testid={`inventario-bando-enviar-${instance.id}`}
                      onClick={() => onSendToCrew(instance.id, enviarBandoQtd[instance.id] ?? instance.quantidade)}
                      style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", opacity: 0.85 }}
                      title="Move para o inventário do bando da mesa (campaign_inventory_items)"
                    >
                      Enviar ao bando
                    </button>
                  </div>
                ) : (
                  <p style={{ fontSize: 10, opacity: 0.4, margin: 0 }}>Enviar ao bando: disponível apenas em mesa conectada.</p>
                )}

                {useKind && itemModelo && (
                  <div
                    data-testid={`inventario-usar-secao-${instance.id}`}
                    style={{ borderTop: "1px solid #2a2b33", paddingTop: 6, marginTop: 2, display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    <p style={{ fontSize: 11, opacity: 0.7, margin: 0 }}>
                      {useKind === "pharmacy" ? "Uso (farmácia)" : useKind === "grenade" ? "Uso (granada)" : useKind === "explosive" ? "Uso (explosivo)" : "Uso"}
                    </p>
                    <div data-testid={`inventario-usar-preview-${instance.id}`} style={{ fontSize: 11, opacity: 0.75, display: "flex", flexDirection: "column", gap: 2 }}>
                      {usePreview?.automatic.map((texto, i) => (
                        <span key={`auto-${i}`} data-testid={`inventario-usar-auto-${instance.id}-${i}`} style={{ color: "#7bc67e" }}>
                          Automático: {texto}
                        </span>
                      ))}
                      {usePreview?.manual.map((texto, i) => (
                        <span key={`manual-${i}`} data-testid={`inventario-usar-manual-${instance.id}-${i}`} style={{ color: "#f5a623" }}>
                          Manual: {texto}
                        </span>
                      ))}
                      {(itemModelo.areaMetros != null || itemModelo.alcanceArremessoMetros != null) && (
                        <span>
                          {itemModelo.areaMetros != null ? `Área: ${itemModelo.areaMetros}m. ` : ""}
                          {itemModelo.alcanceArremessoMetros != null ? `Alcance de arremesso: ${itemModelo.alcanceArremessoMetros}m.` : ""}
                        </span>
                      )}
                      <span>
                        Custo: {itemModelo.custoPaUso != null ? `${itemModelo.custoPaUso} PA` : itemModelo.custoPaUsoTexto ? `não estruturado (${itemModelo.custoPaUsoTexto.replace(/_/g, " ")}) — sem gasto automático de PA` : useKind === "pharmacy" && temCuraImediata ? "1 PA (padrão de Interagir)" : "não estruturado — sem gasto automático de PA"}.
                      </span>
                      <span data-testid={`inventario-usar-cargas-${instance.id}`}>
                        {itemModelo.cargasMax != null
                          ? `Cargas: ${chargesAtual ?? itemModelo.cargasMax}/${itemModelo.cargasMax} (x${instance.quantidade} no inventário).`
                          : `Quantidade: ${instance.quantidade}.`}
                      </span>
                      {(useKind === "grenade" || useKind === "explosive") && (
                        <span style={{ color: "#f5a623" }}>
                          Alvo, área e resolução de dano ficam a cargo do narrador em /dev/table — nenhum dano é aplicado automaticamente.
                        </span>
                      )}
                    </div>
                    {!useAvailable && (
                      <p data-testid={`inventario-usar-indisponivel-${instance.id}`} style={{ fontSize: 11, color: "#ff6b6b", margin: 0 }}>
                        Sem cargas/quantidade disponíveis.
                      </p>
                    )}
                    {useBlocked && (
                      <p data-testid={`inventario-usar-sem-condicao-${instance.id}`} style={{ fontSize: 11, color: "#ff6b6b", margin: 0 }}>
                        {usePreview?.blockedReason}
                      </p>
                    )}
                    {removalNeedsChoice && (
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, opacity: 0.6 }}>Condição a remover:</span>
                        <select
                          data-testid={`inventario-usar-condicao-${instance.id}`}
                          value={condicaoEscolhidaValida ? condicaoEscolhida : ""}
                          onChange={(e) => setCondicaoRemocao((prev) => ({ ...prev, [instance.id]: e.target.value }))}
                          style={{ ...input, fontSize: 11 }}
                        >
                          <option value="">— escolher —</option>
                          {removalOptions.compatibleActive.map((c) => (
                            <option key={c.id} value={c.id}>{c.nome}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <button
                      data-testid={`inventario-usar-${instance.id}`}
                      onClick={() => {
                        onUseItem(
                          instance.id,
                          condicaoEscolhidaValida ? { selectedConditionInstanceId: condicaoEscolhida } : undefined,
                        );
                        setCondicaoRemocao((prev) => ({ ...prev, [instance.id]: "" }));
                      }}
                      disabled={!useAvailable || useBlocked || (removalNeedsChoice && !condicaoEscolhidaValida)}
                      style={{
                        ...buttonStyle,
                        fontSize: 11,
                        padding: "3px 10px",
                        alignSelf: "flex-start",
                        opacity: !useAvailable || useBlocked || (removalNeedsChoice && !condicaoEscolhidaValida) ? 0.5 : 1,
                      }}
                    >
                      Usar item
                    </button>

                    {/* Usar em aliado (checkpoint pós-v0.71) — só farmácia; granadas/explosivos continuam sem alvo direto. */}
                    {useKind === "pharmacy" && (
                      <div
                        data-testid={`inventario-usar-aliado-secao-${instance.id}`}
                        style={{ borderTop: "1px solid #2a2b33", paddingTop: 6, marginTop: 4, display: "flex", flexDirection: "column", gap: 4 }}
                      >
                        {!isConnectedToCampaign ? (
                          <p style={{ fontSize: 10, opacity: 0.4, margin: 0 }}>Usar em aliado: disponível apenas em mesa conectada.</p>
                        ) : (
                          <>
                            <button
                              data-testid={`inventario-usar-aliado-toggle-${instance.id}`}
                              onClick={() => {
                                const abrindo = !(usarEmAliadoAberto[instance.id] ?? false);
                                setUsarEmAliadoAberto((prev) => ({ ...prev, [instance.id]: abrindo }));
                                if (abrindo) onRefreshAllies();
                              }}
                              style={{ ...buttonStyle, fontSize: 11, padding: "3px 10px", alignSelf: "flex-start" }}
                            >
                              {usarEmAliadoAberto[instance.id] ? "Usar em aliado ▲" : "Usar em aliado ▼"}
                            </button>
                            {usarEmAliadoAberto[instance.id] && (
                              allies.length === 0 ? (
                                <p data-testid={`inventario-usar-aliado-sem-alvo-${instance.id}`} style={{ fontSize: 11, color: "#f5a623", margin: 0 }}>
                                  Nenhum outro personagem ativo na mesa.
                                </p>
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                  <select
                                    data-testid={`inventario-usar-aliado-select-${instance.id}`}
                                    value={aliadoAlvoId}
                                    onChange={(e) => setAliadoAlvo((prev) => ({ ...prev, [instance.id]: e.target.value }))}
                                    style={{ ...input, fontSize: 11 }}
                                  >
                                    <option value="">— escolher alvo —</option>
                                    {allies.map((a) => (
                                      <option key={a.id} value={a.id}>{a.nome}</option>
                                    ))}
                                  </select>
                                  {aliadoSelecionado && (
                                    <div data-testid={`inventario-usar-aliado-preview-${instance.id}`} style={{ fontSize: 11, opacity: 0.75, display: "flex", flexDirection: "column", gap: 2 }}>
                                      {allyPreview?.automatic.map((texto, i) => (
                                        <span key={`aa-${i}`} data-testid={`inventario-usar-aliado-auto-${instance.id}-${i}`} style={{ color: "#7bc67e" }}>
                                          Automático no alvo: {texto}
                                        </span>
                                      ))}
                                      {allyPreview?.manual.map((texto, i) => (
                                        <span key={`am-${i}`} data-testid={`inventario-usar-aliado-manual-${instance.id}-${i}`} style={{ color: "#f5a623" }}>
                                          Manual: {texto}
                                        </span>
                                      ))}
                                      {allyBlocked && (
                                        <span data-testid={`inventario-usar-aliado-bloqueado-${instance.id}`} style={{ color: "#ff6b6b" }}>
                                          {allyPreview?.blockedReason}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {allyRemovalNeedsChoice && (
                                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                      <span style={{ fontSize: 11, opacity: 0.6 }}>Condição do alvo a remover:</span>
                                      <select
                                        data-testid={`inventario-usar-aliado-condicao-${instance.id}`}
                                        value={allyCondicaoEscolhidaValida ? allyCondicaoEscolhida : ""}
                                        onChange={(e) => setAliadoCondicaoRemocao((prev) => ({ ...prev, [instance.id]: e.target.value }))}
                                        style={{ ...input, fontSize: 11 }}
                                      >
                                        <option value="">— escolher —</option>
                                        {allyRemovalOptions.compatibleActive.map((c) => (
                                          <option key={c.id} value={c.id}>{c.nome}</option>
                                        ))}
                                      </select>
                                    </div>
                                  )}
                                  <button
                                    data-testid={`inventario-usar-aliado-${instance.id}`}
                                    onClick={() => {
                                      onUseItemOnAlly(
                                        instance.id,
                                        aliadoAlvoId,
                                        allyCondicaoEscolhidaValida ? { selectedConditionInstanceId: allyCondicaoEscolhida } : undefined,
                                      );
                                      setAliadoCondicaoRemocao((prev) => ({ ...prev, [instance.id]: "" }));
                                    }}
                                    disabled={allyUseDisabled}
                                    style={{ ...buttonStyle, fontSize: 11, padding: "3px 10px", alignSelf: "flex-start", opacity: allyUseDisabled ? 0.5 : 1 }}
                                  >
                                    Usar em aliado
                                  </button>
                                </div>
                              )
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

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
                  const selectedAljavaId = instance.selectedAljavaInstanceId ?? "";
                  const aljavaResolvida =
                    aljavaInstances.find((a) => a.id === selectedAljavaId) ??
                    (aljavaInstances.length === 1 ? aljavaInstances[0] : undefined);
                  const capacidade = aljavaResolvida?.aljava.capacidade ?? 0;
                  const totalFlechas = aljavaResolvida ? aljavaResolvida.aljava.stacks.reduce((s, x) => s + x.quantidade, 0) : 0;
                  const stacksComFlechas = aljavaResolvida ? aljavaResolvida.aljava.stacks.filter((s) => s.quantidade > 0) : [];
                  const flechaAtivaDesteArco = instance.selectedFlechaSlug ?? "";
                  return (
                    <div data-testid={`inventario-aljava-ref-${instance.id}`} style={{ borderTop: "1px solid #2a2b33", paddingTop: 6, marginTop: 2 }}>
                      {aljavaInstances.length === 0 ? (
                        <p style={{ fontSize: 10, opacity: 0.4, margin: 0 }}>Nenhuma Aljava no inventário — compre uma na loja.</p>
                      ) : (
                        <>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                            <span style={{ fontSize: 10, opacity: 0.6 }}>Aljava usada:</span>
                            {aljavaInstances.length > 1 ? (
                              <select
                                data-testid={`inventario-aljava-usada-${instance.id}`}
                                value={selectedAljavaId}
                                onChange={(e) => onSelectAljava(instance.id, e.target.value || null)}
                                style={{ ...input, fontSize: 11 }}
                              >
                                <option value="">— selecionar —</option>
                                {aljavaInstances.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    Aljava {aljavaIndexById.get(a.id)} ({a.aljava.stacks.reduce((s, x) => s + x.quantidade, 0)}/{a.aljava.capacidade})
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <>
                                <span style={{ fontSize: 11 }}>Aljava {aljavaIndexById.get(aljavaInstances[0].id)} ({totalFlechas} / {capacidade})</span>
                                <span style={{ fontSize: 10, opacity: 0.5 }}>(auto)</span>
                              </>
                            )}
                          </div>
                          {!aljavaResolvida ? (
                            <p style={{ fontSize: 10, opacity: 0.4, margin: 0 }}>Selecione qual Aljava este arco usa para atacar.</p>
                          ) : stacksComFlechas.length > 0 ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 10, opacity: 0.6 }}>Flecha para ataque:</span>
                              <select
                                data-testid={`inventario-flecha-ativa-${instance.id}`}
                                value={flechaAtivaDesteArco}
                                onChange={(e) => onSelectFlechaAtiva(instance.id, e.target.value || null)}
                                style={{ ...input, fontSize: 11 }}
                              >
                                {stacksComFlechas.length > 1 && <option value="">— selecionar —</option>}
                                {stacksComFlechas.map((s) => (
                                  <option key={s.contentSlug} value={s.contentSlug}>{s.nome} (x{s.quantidade})</option>
                                ))}
                              </select>
                              {stacksComFlechas.length === 1 && !flechaAtivaDesteArco && (
                                <span style={{ fontSize: 10, opacity: 0.5 }}>(auto)</span>
                              )}
                            </div>
                          ) : (
                            <p style={{ fontSize: 10, opacity: 0.4, margin: 0 }}>Aljava selecionada está vazia — recarregue ou guarde flechas nela.</p>
                          )}
                        </>
                      )}
                    </div>
                  );
                })() : null}

                {/* Aljava — cada instância é sua PRÓPRIA Aljava (um personagem pode ter várias). */}
                {instance.itemSlug === ALJAVA_ITEM_SLUG && (() => {
                  const aljava_ = (instance as InventoryItemInstance & { aljava?: Aljava }).aljava;
                  const capacidade = aljava_?.capacidade ?? 15;
                  const totalFlechas = aljava_?.stacks.reduce((s, x) => s + x.quantidade, 0) ?? 0;
                  const stacksComFlechas = (aljava_?.stacks ?? []).filter((s) => s.quantidade > 0);
                  const flechasEstoque = inventario.filter((inst) => {
                    if (inst.itemSlug === ALJAVA_ITEM_SLUG) return false;
                    const m = itemBySlug.get(inst.itemSlug);
                    return m?.categoria === "municao" && (m?.ammoFamilia?.startsWith("flecha") ?? false);
                  });
                  const nsKey = (suffix: string) => `${instance.id}:${suffix}`;
                  return (
                    <div data-testid={`inventario-aljava-${instance.id}`} style={{ borderTop: "1px solid #2a2b33", paddingTop: 6, marginTop: 2 }}>
                      <p style={{ fontSize: 11, opacity: 0.6, margin: "0 0 6px" }}>
                        Aljava {aljavaIndexById.get(instance.id)} ({totalFlechas} / {capacidade}). Cada arco escolhe, no
                        próprio card, qual Aljava usa para atacar.
                      </p>

                      {stacksComFlechas.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 8, marginBottom: 8 }}>
                          <p style={{ fontSize: 10, opacity: 0.45, margin: "0 0 2px" }}>Conteúdo — ajuste manual:</p>
                          {stacksComFlechas.map((stack) => {
                            const totalOutras = stacksComFlechas.filter((s) => s.contentSlug !== stack.contentSlug).reduce((sum, s) => sum + s.quantidade, 0);
                            const maxEsta = Math.max(0, capacidade - totalOutras);
                            const retirarVal = retirarQtd[nsKey(stack.contentSlug)] ?? 1;
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
                                  onChange={(e) => setRetirarQtd((prev) => ({ ...prev, [nsKey(stack.contentSlug)]: Math.max(1, Number(e.target.value)) }))}
                                  style={{ ...input, width: 48, fontSize: 11 }}
                                />
                                <button
                                  data-testid={`inventario-flecha-retirar-${instance.id}-${stack.contentSlug}`}
                                  onClick={() => onWithdrawFletchas(instance.id, stack.contentSlug, retirarVal, stack.nome)}
                                  style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}
                                >
                                  Retirar
                                </button>
                                <button
                                  data-testid={`inventario-retirar-tudo-${instance.id}-${stack.contentSlug}`}
                                  onClick={() => onWithdrawFletchas(instance.id, stack.contentSlug, stack.quantidade, stack.nome)}
                                  style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", opacity: 0.7 }}
                                >
                                  Retirar tudo
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {!aljava_ && (
                        <p style={{ fontSize: 10, opacity: 0.4, margin: "0 0 6px" }}>Aljava não inicializada — recarregue o personagem.</p>
                      )}

                      {flechasEstoque.length > 0 && totalFlechas < capacidade && (
                        <div style={{ borderTop: "1px dashed #2a2b33", paddingTop: 6, marginBottom: 6 }}>
                          <p style={{ fontSize: 10, opacity: 0.45, margin: "0 0 4px" }}>Guardar flechas (do inventário):</p>
                          {flechasEstoque.map((ammoInst) => {
                            const ammoModelo = itemBySlug.get(ammoInst.itemSlug);
                            const guardarVal = guardarQtd[nsKey(ammoInst.id)] ?? 1;
                            const maxGuardavel = Math.min(ammoInst.quantidade, capacidade - totalFlechas);
                            return (
                              <div key={ammoInst.id} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 4, fontSize: 11 }}>
                                <span style={{ minWidth: 120, opacity: 0.85 }}>{ammoModelo?.nome ?? ammoInst.itemNome}</span>
                                <span style={{ opacity: 0.5 }}>estoque: {ammoInst.quantidade}</span>
                                <input
                                  data-testid={`inventario-guardar-qtd-${instance.id}-${ammoInst.id}`}
                                  type="number"
                                  min={1}
                                  max={maxGuardavel}
                                  value={guardarVal}
                                  onChange={(e) => setGuardarQtd((prev) => ({ ...prev, [nsKey(ammoInst.id)]: Math.max(1, Number(e.target.value)) }))}
                                  style={{ ...input, width: 52, fontSize: 11 }}
                                />
                                <button
                                  data-testid={`inventario-guardar-${instance.id}-${ammoInst.id}`}
                                  onClick={() => onStoreFletchas(instance.id, ammoInst.id, ammoInst.itemSlug, ammoModelo?.nome ?? ammoInst.itemNome, guardarVal)}
                                  style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}
                                >
                                  Guardar
                                </button>
                                <button
                                  data-testid={`inventario-guardar-tudo-${instance.id}-${ammoInst.id}`}
                                  onClick={() => onStoreFletchas(instance.id, ammoInst.id, ammoInst.itemSlug, ammoModelo?.nome ?? ammoInst.itemNome, maxGuardavel)}
                                  style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", opacity: 0.7 }}
                                >
                                  Guardar tudo
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <button
                        data-testid={`inventario-recarregar-aljava-${instance.id}`}
                        onClick={() => onReloadWeapon(instance.id)}
                        style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}
                      >
                        Recarregar aljava
                      </button>
                      <p style={{ fontSize: 10, opacity: 0.35, margin: "4px 0 0" }}>
                        Guardar/Retirar = transferência real (use "tudo" para mover tudo de uma vez) · Recarregar aljava = atalho
                        automático · ajuste manual = override direto. A flecha usada em cada ataque é escolhida no card do arco.
                        {" "}Efeitos especiais são sugestões ao mestre.
                      </p>
                    </div>
                  );
                })()}

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
                    {instance.sobregravacao && itemModelo?.slotsRunaMax != null && (
                      <span data-testid={`inventario-sobregravacao-${instance.id}`} style={{ color: sobregravacaoAcesso ? "#5ec8ff" : "#f5a623" }}>
                        {" "}— Sobregravação: {itemModelo.slotsRunaMax} base × {instance.sobregravacao.multiplicador}
                        {sobregravacaoAcesso
                          ? ` = ${Math.floor(itemModelo.slotsRunaMax * instance.sobregravacao.multiplicador)} (você tem acesso ao espaço extra)`
                          : ` — inscrição visível, mas você NÃO tem acesso ao espaço extra (só ${itemModelo.slotsRunaMax} slots utilizáveis)`}
                      </span>
                    )}
                  </p>
                  {/* Rúnico › Sobregravação — dono aplica/gerencia; terceiro sem acesso testa CD 8. */}
                  {sobregravacaoAvailable && !instance.sobregravacao && (
                    <button
                      data-testid={`sobregravacao-aplicar-${instance.id}`}
                      onClick={() => onApplySobregravacao?.(instance.id)}
                      style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", marginBottom: 6 }}
                    >
                      Aplicar Sobregravação a este item
                    </button>
                  )}
                  {instance.sobregravacao && currentCharacterId === instance.sobregravacao.ownerCharacterId && (
                    <div style={{ ...widgetBox2, marginBottom: 6 }}>
                      <span style={{ opacity: 0.7 }}>Aliados instruídos (acessam o espaço extra sem teste):</span>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input
                          data-testid={`sobregravacao-aliados-${instance.id}`}
                          placeholder="ids de personagem separados por vírgula"
                          value={sobregravacaoAliadosInput[instance.id] ?? instance.sobregravacao.instructedAllyIds.join(",")}
                          onChange={(e) => setSobregravacaoAliadosInput((prev) => ({ ...prev, [instance.id]: e.target.value }))}
                          style={{ ...input, flex: 1, fontSize: 11 }}
                        />
                        <button
                          data-testid={`sobregravacao-aliados-salvar-${instance.id}`}
                          onClick={() =>
                            onSetSobregravacaoAllies?.(
                              instance.id,
                              (sobregravacaoAliadosInput[instance.id] ?? "")
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean),
                            )
                          }
                          style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}
                        >
                          Salvar
                        </button>
                      </div>
                    </div>
                  )}
                  {instance.sobregravacao && !sobregravacaoAcesso && (
                    sobregravacaoTestPending[instance.id] ? (
                      <div data-testid={`sobregravacao-teste-confirmar-${instance.id}`} style={{ ...widgetBox2, marginBottom: 6 }}>
                        <span>Teste de Tecnomagia/Arcanismo rolado — CD 8. Informe o resultado:</span>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input
                            data-testid={`sobregravacao-teste-resultado-${instance.id}`}
                            type="number"
                            placeholder="total rolado"
                            value={sobregravacaoTestResultado[instance.id] ?? ""}
                            onChange={(e) => setSobregravacaoTestResultado((prev) => ({ ...prev, [instance.id]: e.target.value }))}
                            style={{ ...input, width: 80, fontSize: 11 }}
                          />
                          <button
                            data-testid={`sobregravacao-teste-confirmar-btn-${instance.id}`}
                            onClick={() => onConfirmSobregravacaoTest?.(instance.id, Number(sobregravacaoTestResultado[instance.id]) || 0)}
                            style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}
                          >
                            Confirmar resultado
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        data-testid={`sobregravacao-testar-${instance.id}`}
                        onClick={() => onStartSobregravacaoTest?.(instance.id)}
                        style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", marginBottom: 6 }}
                      >
                        Testar acesso ao espaço extra (Tecnomagia/Arcanismo CD 8)
                      </button>
                    )
                  )}
                  {runasInstaladas.length > 0 && (
                    <div data-testid={`inventario-runas-lista-${instance.id}`} style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
                      {runasInstaladas.map((runa) => {
                        const modelo = runaBySlug.get(runa.runeContentId);
                        const automatizada = installedRuneIdsWithEffect.has(runa.id);
                        const ativa = runa.ativa ?? true;
                        return (
                          <div key={runa.id} data-testid={`inventario-runa-instalada-${runa.id}`} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ opacity: ativa ? 0.5 : 0.25 }}>◆</span>
                            <span style={{ opacity: ativa ? 1 : 0.5 }}>{modelo?.nome ?? `Conteúdo não encontrado (${runa.runeContentId})`}</span>
                            {automatizada && ativa && <span style={{ fontSize: 10, color: "#4caf50" }}>modificador aplicado</span>}
                            {!ativa && <span style={{ fontSize: 10, color: "#888" }}>inativa — sem efeito</span>}
                            {runicoGatilhoAvailable && (
                              <button
                                data-testid={`inventario-runa-toggle-${runa.id}`}
                                onClick={() => onToggleRuneActive?.(instance.id, runa.id)}
                                style={{ ...buttonStyle, fontSize: 10, padding: "1px 6px" }}
                                title="Ativar/desativar sem PA (Gatilho Rúnico)"
                              >
                                {ativa ? "Desativar" : "Ativar"}
                              </button>
                            )}
                            <button
                              data-testid={`inventario-runa-remover-${runa.id}`}
                              onClick={() => onRemoveRune(instance.id, runa.id)}
                              style={{ ...buttonStyle, fontSize: 10, padding: "1px 6px", marginLeft: runicoGatilhoAvailable ? undefined : "auto" }}
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

                  {/* Entalhe Rápido (Rúnico N2) — 1 PA + teste real de Engenharia, aplica só em sucesso. */}
                  {entalheRapidoAvailable && !runesError && (() => {
                    const attempt = entalheAttempts[instance.id];
                    if (attempt) {
                      return (
                        <div data-testid={`entalhe-rapido-confirmar-${instance.id}`} style={{ ...widgetBox2, marginTop: 6 }}>
                          <span>Teste de Engenharia rolado — CD {attempt.cd}. Informe o resultado:</span>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <input
                              data-testid={`entalhe-rapido-resultado-${instance.id}`}
                              type="number"
                              placeholder="total rolado"
                              value={entalheResultado[instance.id] ?? ""}
                              onChange={(e) => setEntalheResultado((prev) => ({ ...prev, [instance.id]: e.target.value }))}
                              style={{ ...input, width: 80, fontSize: 11 }}
                            />
                            <button
                              data-testid={`entalhe-rapido-confirmar-sucesso-${instance.id}`}
                              onClick={() => onConfirmEntalheRapido?.(instance.id, Number(entalheResultado[instance.id]) || 0)}
                              style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}
                            >
                              Confirmar resultado
                            </button>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div data-testid={`entalhe-rapido-form-${instance.id}`} style={{ ...widgetBox2, marginTop: 6 }}>
                        <span style={{ opacity: 0.7 }}>Entalhe Rápido — 1 PA + teste de Engenharia (CD do narrador):</span>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          <input
                            data-testid={`entalhe-rapido-cd-${instance.id}`}
                            type="number"
                            placeholder="CD"
                            value={entalheCd[instance.id] ?? ""}
                            onChange={(e) => setEntalheCd((prev) => ({ ...prev, [instance.id]: e.target.value }))}
                            style={{ ...input, width: 60, fontSize: 11 }}
                          />
                          <button
                            data-testid={`entalhe-rapido-instalar-${instance.id}`}
                            disabled={!runaEscolhida || !entalheCd[instance.id]}
                            onClick={() => onStartEntalheRapido?.(instance.id, "instalar", runaEscolhida, Number(entalheCd[instance.id]) || 0)}
                            style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", opacity: !runaEscolhida || !entalheCd[instance.id] ? 0.5 : 1 }}
                          >
                            Instalar (selecionada acima)
                          </button>
                          {runasInstaladas.length > 0 && (
                            <select
                              data-testid={`entalhe-rapido-remover-select-${instance.id}`}
                              value={entalheRemoverAlvo[instance.id] ?? ""}
                              onChange={(e) => setEntalheRemoverAlvo((prev) => ({ ...prev, [instance.id]: e.target.value }))}
                              style={{ ...input, fontSize: 11 }}
                            >
                              <option value="">— runa a remover —</option>
                              {runasInstaladas.map((r) => (
                                <option key={r.id} value={r.id}>{runaBySlug.get(r.runeContentId)?.nome ?? r.runeContentId}</option>
                              ))}
                            </select>
                          )}
                          {runasInstaladas.length > 0 && (
                            <button
                              data-testid={`entalhe-rapido-remover-${instance.id}`}
                              disabled={!entalheRemoverAlvo[instance.id] || !entalheCd[instance.id]}
                              onClick={() => onStartEntalheRapido?.(instance.id, "remover", entalheRemoverAlvo[instance.id], Number(entalheCd[instance.id]) || 0)}
                              style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", opacity: !entalheRemoverAlvo[instance.id] || !entalheCd[instance.id] ? 0.5 : 1 }}
                            >
                              Remover (selecionada)
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}
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
