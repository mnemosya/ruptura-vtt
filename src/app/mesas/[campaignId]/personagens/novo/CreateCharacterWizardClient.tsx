"use client";

/**
 * Assistente de criação de personagem — checkpoint v0.41 (PRD 3.2),
 * concluído no checkpoint pós-v0.94 (fase 3): vertentes/magias, talento
 * inicial e inventário agora usam os motores reais já existentes
 * (`learnSpell`, `acquireTalentLevel`, `purchaseItem` — nenhum
 * reimplementado), não mais placeholders de texto.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createCharacterForCampaign } from "../../../../../lib/character/storage";
import { setCampaignProfileActiveCharacter } from "../../../../../lib/table/storage";
import type { Campaign, CampaignProfile } from "../../../../../lib/table";
import {
  learnSpell,
  acquireTalentLevel,
  purchaseItem,
  removeItemFromInventory,
  type Character,
  type CharacterRulesPayload,
  type TalentContent,
  type SpellContent,
  type ItemContent,
} from "../../../../../lib/character";

/** PRD 3.2, Etapa 4 — "3 pontos entre as 6 vertentes" (literal do texto, sem contrato em `regras.criacao_personagem` ainda). */
const PONTOS_VERTENTE_CRIACAO = 3;

const btn: React.CSSProperties = { background: "#1d1e24", color: "inherit", border: "1px solid #333", borderRadius: 6, padding: "8px 14px", fontSize: 13, cursor: "pointer" };
const btnAtivo: React.CSSProperties = { ...btn, background: "#2d4a2f", border: "1px solid #4caf50", fontWeight: 700 };
const input: React.CSSProperties = { background: "#0f1014", color: "inherit", border: "1px solid #333", borderRadius: 4, padding: "6px 8px", fontSize: 13, width: "100%" };
const h2: React.CSSProperties = { fontSize: 14, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 12 };

const ETAPAS = [
  { id: 1, nome: "Conceito e identidade" },
  { id: 2, nome: "Atributos" },
  { id: 3, nome: "Perícias" },
  { id: 4, nome: "Vertentes" },
  { id: 5, nome: "Talento inicial" },
  { id: 6, nome: "Inventário" },
  { id: 7, nome: "Revisão" },
] as const;

const ORIGENS = ["Vastra", "Beldran", "Talesh", "Kravus", "Torvash"] as const;

interface Identidade {
  nome: string;
  alcunha: string;
  conceito: string;
  origem: string;
  idioma: string;
  afiliacao: string;
}

export default function CreateCharacterWizardClient({
  campaign,
  regras,
  perfisIniciais,
  talentos,
  magias,
  itensLoja,
  travarSelecaoDePerfil = false,
}: {
  campaign: Campaign;
  regras: CharacterRulesPayload;
  perfisIniciais: CampaignProfile[];
  talentos: TalentContent[];
  magias: SpellContent[];
  itensLoja: ItemContent[];
  /** Jogador (não-narrador): só tem o próprio perfil na lista e não pode trocar (checkpoint pós-v0.94, fase 2). */
  travarSelecaoDePerfil?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [identidade, setIdentidade] = useState<Identidade>({
    nome: "",
    alcunha: "",
    conceito: "",
    origem: ORIGENS[0],
    idioma: "Vastrano",
    afiliacao: "",
  });

  const criacao = regras.criacao_personagem;
  const atributoValorInicial = criacao?.atributos?.valor_inicial ?? 1;
  const atributoPontosAdicionais = criacao?.atributos?.pontos_adicionais ?? 3;
  const atributoTeto = criacao?.atributos?.maximo_na_criacao ?? 3;
  const periciaPontosTotais = criacao?.pericias?.pontos_totais ?? 25;
  const periciaTeto = criacao?.pericias?.maximo_na_criacao ?? 3;
  const aretzIniciais = criacao?.inventario?.aretz_iniciais ?? 5000;

  const [atributos, setAtributos] = useState<Record<string, number>>(() =>
    Object.fromEntries(regras.atributos.map((a) => [a.id, atributoValorInicial])),
  );
  const [pericias, setPericias] = useState<Record<string, number>>(() =>
    Object.fromEntries(regras.pericias.map((p) => [p.id, 0])),
  );
  const [niveisVertente, setNiveisVertente] = useState<Record<string, number>>({});
  const [magiasEscolhidas, setMagiasEscolhidas] = useState<Set<string>>(new Set());
  const [talentoNivelIdEscolhido, setTalentoNivelIdEscolhido] = useState<string>("");
  const [carteira, setCarteira] = useState({ aretz_informal: aretzIniciais, cdi: 0, cdi_craqueada: 0 });
  const [inventario, setInventario] = useState<NonNullable<Character["inventario"]>>([]);
  const [perfisState] = useState(perfisIniciais);
  const [profileIdSelecionado, setProfileIdSelecionado] = useState<string>(
    travarSelecaoDePerfil ? (perfisIniciais[0]?.id ?? "") : "",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  const pontosAtributoGastos = regras.atributos.reduce((soma, a) => soma + ((atributos[a.id] ?? atributoValorInicial) - atributoValorInicial), 0);
  const pontosAtributoRestantes = atributoPontosAdicionais - pontosAtributoGastos;
  const atributosValidos =
    pontosAtributoRestantes === 0 && regras.atributos.every((a) => (atributos[a.id] ?? 0) <= atributoTeto && (atributos[a.id] ?? 0) >= atributoValorInicial);

  const pontosPericiaGastos = Object.values(pericias).reduce((soma, v) => soma + v, 0);
  const pontosPericiaRestantes = periciaPontosTotais - pontosPericiaGastos;
  const periciasValidas = pontosPericiaRestantes >= 0 && regras.pericias.every((p) => (pericias[p.id] ?? 0) <= periciaTeto && (pericias[p.id] ?? 0) >= 0);

  // Etapa 4 (Vertentes) — nunca lista hardcoded: as 6 (ou quantas a
  // Biblioteca tiver publicado) vertentes vêm dos slugs distintos das
  // magias publicadas para esta mesa.
  const vertentesDisponiveis = useMemo(() => {
    const porSlug = new Map<string, string>();
    for (const magia of magias) {
      if (!porSlug.has(magia.vertente)) porSlug.set(magia.vertente, magia.vertente_label ?? magia.vertente);
    }
    return [...porSlug.entries()].map(([slug, label]) => ({ slug, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [magias]);
  const pontosVertenteGastos = Object.values(niveisVertente).reduce((soma, v) => soma + v, 0);
  const pontosVertenteRestantes = PONTOS_VERTENTE_CRIACAO - pontosVertenteGastos;
  const vertentesValidas = pontosVertenteRestantes === 0;

  // Etapa 4b (Magias) — só elegível magia de uma vertente com nível
  // investido >0 e cujo `estatisticas.nivel` não ultrapasse o nível
  // investido (PRD 3.2: "libera magias daquele nível"; nunca permite
  // magia acima do nível).
  function magiaElegivel(magia: SpellContent): boolean {
    const nivelInvestido = niveisVertente[magia.vertente] ?? 0;
    return nivelInvestido > 0 && magia.estatisticas.nivel <= nivelInvestido;
  }
  const magiasElegiveis = useMemo(() => magias.filter(magiaElegivel), [magias, niveisVertente]);
  // Uma magia escolhida deixa de ser elegível se o jogador reduzir o
  // nível da vertente depois — nunca contada na revisão/gravação.
  const magiasEscolhidasValidas = [...magiasEscolhidas].filter((slug) => magiasElegiveis.some((m) => m.slug === slug));

  // Etapa 5 (Talento inicial) — só nível 1, achatado a partir do
  // conteúdo publicado (nunca lista hardcoded).
  const talentoOptions = useMemo(
    () =>
      talentos.flatMap((talento) =>
        talento.niveis
          .filter((n) => n.nivel === 1)
          .map((n) => ({ nivelId: n.id, talentoId: talento.id, nome: `${talento.nome} — ${n.nome}`, descricaoCurta: n.descricao_curta })),
      ),
    [talentos],
  );
  const talentoSelecionado = talentoOptions.find((t) => t.nivelId === talentoNivelIdEscolhido) ?? null;

  const podeFinalizar =
    atributosValidos &&
    periciasValidas &&
    vertentesValidas &&
    identidade.nome.trim().length > 0 &&
    (!travarSelecaoDePerfil || Boolean(profileIdSelecionado));

  function ajustarAtributo(id: string, delta: number) {
    setAtributos((prev) => {
      const atual = prev[id] ?? atributoValorInicial;
      const novo = Math.max(atributoValorInicial, Math.min(atributoTeto, atual + delta));
      return { ...prev, [id]: novo };
    });
  }

  function ajustarPericia(id: string, delta: number) {
    setPericias((prev) => {
      const atual = prev[id] ?? 0;
      const novo = Math.max(0, Math.min(periciaTeto, atual + delta));
      return { ...prev, [id]: novo };
    });
  }

  function ajustarVertente(slug: string, delta: number) {
    setNiveisVertente((prev) => {
      const atual = prev[slug] ?? 0;
      const novo = Math.max(0, atual + delta);
      if (delta > 0 && pontosVertenteRestantes <= 0) return prev;
      return { ...prev, [slug]: novo };
    });
  }

  function toggleMagia(slug: string) {
    setMagiasEscolhidas((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  /** Monta o personagem-em-construção com o que já foi escolhido até aqui — usado só para alimentar os motores reais (purchaseItem/learnSpell/acquireTalentLevel), nunca gravado como está. */
  function personagemParcial(): Character {
    return {
      nome: identidade.nome.trim() || "(sem nome)",
      atributos: { corpo: atributos.corpo ?? 1, mente: atributos.mente ?? 1, animo: atributos.animo ?? 1 },
      pericias,
      metadados: { schema_version: 1, criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() },
      estado_jogo: { pa_gastos: 0, reacoes_usadas: 0 },
      carteira,
      inventario,
    };
  }

  function handleComprarItem(item: ItemContent) {
    setErrorMessage(null);
    const nowIso = new Date().toISOString();
    const resultado = purchaseItem({
      character: personagemParcial(),
      item,
      quantidade: 1,
      walletId: "aretz_informal",
      nowIso,
    });
    if (!resultado.ok) {
      setErrorMessage(resultado.reason ?? "Não foi possível comprar este item.");
      return;
    }
    setCarteira(resultado.character.carteira ?? carteira);
    setInventario(resultado.character.inventario ?? []);
  }

  function handleRemoverItem(instanceId: string) {
    const instancia = inventario.find((i) => i.id === instanceId);
    const reembolso = instancia?.precoPago ?? 0;
    const proximo = removeItemFromInventory(personagemParcial(), instanceId);
    setInventario(proximo.inventario ?? []);
    if (reembolso > 0) {
      setCarteira((prev) => ({ ...prev, aretz_informal: prev.aretz_informal + reembolso }));
    }
  }

  async function finalizar() {
    if (!podeFinalizar) return;
    setCriando(true);
    setErrorMessage(null);
    try {
      const nowIso = new Date().toISOString();
      let character: Character = {
        nome: identidade.nome.trim(),
        atributos: { corpo: atributos.corpo ?? 1, mente: atributos.mente ?? 1, animo: atributos.animo ?? 1 },
        pericias,
        metadados: {
          schema_version: 1,
          criado_em: nowIso,
          atualizado_em: nowIso,
          alcunha: identidade.alcunha || undefined,
          conceito: identidade.conceito || undefined,
          origem: identidade.origem || undefined,
          idioma: identidade.idioma || undefined,
          afiliacao: identidade.afiliacao || undefined,
        },
        estado_jogo: { pa_gastos: 0, reacoes_usadas: 0 },
        niveis_vertente: niveisVertente,
        carteira,
        inventario,
      };

      // Etapa 4b — cada magia elegível escolhida é APRENDIDA de verdade
      // (learnSpell, não um rótulo) — a vertente "conhecida" é derivada
      // disso, nunca gravada à parte.
      for (const spellSlug of magiasEscolhidasValidas) {
        character = learnSpell(character, spellSlug, nowIso);
      }

      // Etapa 5 — talento inicial aplicado pelo motor real (acquireTalentLevel).
      if (talentoSelecionado) {
        character = acquireTalentLevel(character, {
          talentoId: talentoSelecionado.talentoId,
          nivelId: talentoSelecionado.nivelId,
          nivel: 1,
          nowIso,
        });
      }

      const record = await createCharacterForCampaign(campaign.id, character, {
        profileId: profileIdSelecionado || null,
      });
      if (profileIdSelecionado) {
        await setCampaignProfileActiveCharacter(profileIdSelecionado, record.id);
      }
      router.push(`/mesas/${campaign.id}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao criar personagem.");
      setCriando(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" }}>
      <a href={`/mesas/${campaign.id}`} style={{ color: "#5ec8ff", fontSize: 12 }}>← {campaign.name}</a>
      <h1 style={{ fontSize: 22, margin: "8px 0 16px" }}>Novo personagem</h1>

      {errorMessage && <p style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 16 }}>Erro: {errorMessage}</p>}

      <nav style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
        {ETAPAS.map((e) => (
          <button key={e.id} onClick={() => setStep(e.id)} style={step === e.id ? btnAtivo : btn}>
            {e.id}. {e.nome}
          </button>
        ))}
      </nav>

      {step === 1 && (
        <section>
          <h2 style={h2}>Etapa 1 — Conceito e identidade</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}>
            <label style={{ fontSize: 12 }}>
              Nome *
              <input data-testid="wizard-nome" value={identidade.nome} onChange={(e) => setIdentidade({ ...identidade, nome: e.target.value })} style={{ ...input, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 12 }}>
              Alcunha
              <input value={identidade.alcunha} onChange={(e) => setIdentidade({ ...identidade, alcunha: e.target.value })} style={{ ...input, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 12 }}>
              Conceito
              <input value={identidade.conceito} onChange={(e) => setIdentidade({ ...identidade, conceito: e.target.value })} style={{ ...input, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 12 }}>
              Origem
              <select data-testid="wizard-origem" value={identidade.origem} onChange={(e) => setIdentidade({ ...identidade, origem: e.target.value })} style={{ ...input, marginTop: 4 }}>
                {ORIGENS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12 }}>
              Idioma (regional + vastrano)
              <input value={identidade.idioma} onChange={(e) => setIdentidade({ ...identidade, idioma: e.target.value })} style={{ ...input, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 12 }}>
              Afiliação
              <input value={identidade.afiliacao} onChange={(e) => setIdentidade({ ...identidade, afiliacao: e.target.value })} style={{ ...input, marginTop: 4 }} />
            </label>
          </div>
        </section>
      )}

      {step === 2 && (
        <section>
          <h2 style={h2}>Etapa 2 — Atributos</h2>
          <p data-testid="wizard-atributos-pontos-restantes" style={{ fontSize: 13, marginBottom: 12, color: pontosAtributoRestantes === 0 ? "#4caf50" : "#f5a623" }}>
            Pontos restantes: {pontosAtributoRestantes} / {atributoPontosAdicionais} (teto de criação: {atributoTeto})
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {regras.atributos.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 80, fontSize: 13 }}>{a.nome}</span>
                <button data-testid={`wizard-atributo-${a.id}-menos`} onClick={() => ajustarAtributo(a.id, -1)} style={btn}>-</button>
                <span data-testid={`wizard-atributo-${a.id}-valor`} style={{ width: 24, textAlign: "center" }}>{atributos[a.id] ?? atributoValorInicial}</span>
                <button data-testid={`wizard-atributo-${a.id}-mais`} onClick={() => ajustarAtributo(a.id, 1)} style={btn}>+</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {step === 3 && (
        <section>
          <h2 style={h2}>Etapa 3 — Perícias</h2>
          <p data-testid="wizard-pericias-pontos-restantes" style={{ fontSize: 13, marginBottom: 12, color: pontosPericiaRestantes >= 0 ? "#4caf50" : "#ff6b6b" }}>
            Pontos restantes: {pontosPericiaRestantes} / {periciaPontosTotais} (teto de criação: {periciaTeto})
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
            {regras.pericias.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, fontSize: 12 }}>{p.nome}</span>
                <button data-testid={`wizard-pericia-${p.id}-menos`} onClick={() => ajustarPericia(p.id, -1)} style={btn}>-</button>
                <span data-testid={`wizard-pericia-${p.id}-valor`} style={{ width: 20, textAlign: "center" }}>{pericias[p.id] ?? 0}</span>
                <button data-testid={`wizard-pericia-${p.id}-mais`} onClick={() => ajustarPericia(p.id, 1)} style={btn}>+</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {step === 4 && (
        <section>
          <h2 style={h2}>Etapa 4 — Vertentes e magias</h2>
          {vertentesDisponiveis.length === 0 ? (
            <p style={{ fontSize: 13, opacity: 0.7 }}>
              Nenhuma magia publicada nesta mesa ainda — não há vertentes para investir. Avance sem preencher nada.
            </p>
          ) : (
            <>
              <p data-testid="wizard-vertentes-pontos-restantes" style={{ fontSize: 13, marginBottom: 12, color: pontosVertenteRestantes === 0 ? "#4caf50" : "#f5a623" }}>
                Pontos restantes: {pontosVertenteRestantes} / {PONTOS_VERTENTE_CRIACAO}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {vertentesDisponiveis.map((v) => (
                  <div key={v.slug} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 140, fontSize: 13 }}>{v.label}</span>
                    <button data-testid={`wizard-vertente-${v.slug}-menos`} onClick={() => ajustarVertente(v.slug, -1)} style={btn}>-</button>
                    <span data-testid={`wizard-vertente-${v.slug}-valor`} style={{ width: 24, textAlign: "center" }}>{niveisVertente[v.slug] ?? 0}</span>
                    <button data-testid={`wizard-vertente-${v.slug}-mais`} onClick={() => ajustarVertente(v.slug, 1)} style={btn}>+</button>
                    {(niveisVertente[v.slug] ?? 0) > 0 && (
                      <span style={{ fontSize: 11, opacity: 0.6 }}>CD de resistência: {6 + (niveisVertente[v.slug] ?? 0)}</span>
                    )}
                  </div>
                ))}
              </div>

              <h3 style={{ fontSize: 13, marginBottom: 8, opacity: 0.8 }}>Magias liberadas pelo nível investido</h3>
              {magiasElegiveis.length === 0 ? (
                <p style={{ fontSize: 12, opacity: 0.6 }}>Invista pontos numa vertente para liberar magias.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {magiasElegiveis.map((magia) => (
                    <label key={magia.slug} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        data-testid={`wizard-magia-${magia.slug}`}
                        checked={magiasEscolhidas.has(magia.slug)}
                        onChange={() => toggleMagia(magia.slug)}
                      />
                      {magia.nome} <span style={{ opacity: 0.5 }}>({magia.vertente_label ?? magia.vertente}, nível {magia.estatisticas.nivel})</span>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {step === 5 && (
        <section>
          <h2 style={h2}>Etapa 5 — Talento inicial</h2>
          {talentoOptions.length > 0 ? (
            <>
              <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>Escolha 1 talento de nível 1 (da Biblioteca).</p>
              <select
                data-testid="wizard-talento-select"
                value={talentoNivelIdEscolhido}
                onChange={(e) => setTalentoNivelIdEscolhido(e.target.value)}
                style={{ ...input, maxWidth: 420 }}
              >
                <option value="">— nenhum —</option>
                {talentoOptions.map((t) => (
                  <option key={t.nivelId} value={t.nivelId}>{t.nome}</option>
                ))}
              </select>
            </>
          ) : (
            <p style={{ fontSize: 13, opacity: 0.7 }}>
              Nenhum talento de nível 1 publicado nesta mesa ainda. Avance sem escolher.
            </p>
          )}
        </section>
      )}

      {step === 6 && (
        <section>
          <h2 style={h2}>Etapa 6 — Inventário</h2>
          <p style={{ fontSize: 13, marginBottom: 12 }}>
            Aretz: <strong data-testid="wizard-aretz-restante">{carteira.aretz_informal}</strong> / {aretzIniciais}
          </p>
          <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>
            Loja restrita a itens de raridade até incomum na criação (PRD 3.2) — raros e muito raros liberados só em jogo.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8, marginBottom: 20 }}>
            {itensLoja.map((item) => (
              <div key={item.slug} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: "#1d1e24", borderRadius: 6, padding: "6px 10px" }}>
                <span style={{ fontSize: 12 }}>{item.nome} — {item.preco} aretz</span>
                <button data-testid={`wizard-comprar-${item.slug}`} onClick={() => handleComprarItem(item)} style={btn}>Comprar</button>
              </div>
            ))}
          </div>

          <h3 style={{ fontSize: 13, marginBottom: 8, opacity: 0.8 }}>Inventário inicial ({inventario.length})</h3>
          {inventario.length === 0 ? (
            <p style={{ fontSize: 12, opacity: 0.6 }}>Nenhum item comprado ainda.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {inventario.map((instancia) => (
                <div key={instancia.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
                  <span>{instancia.itemNome} × {instancia.quantidade}</span>
                  <button data-testid={`wizard-remover-${instancia.id}`} onClick={() => handleRemoverItem(instancia.id)} style={{ ...btn, fontSize: 11 }}>Remover</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {step === 7 && (
        <section>
          <h2 style={h2}>Etapa 7 — Revisão</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, marginBottom: 16 }}>
            <span><strong>Nome:</strong> {identidade.nome || "(vazio)"}</span>
            <span><strong>Alcunha:</strong> {identidade.alcunha || "—"}</span>
            <span><strong>Conceito:</strong> {identidade.conceito || "—"}</span>
            <span><strong>Origem:</strong> {identidade.origem}</span>
            <span><strong>Idioma:</strong> {identidade.idioma || "—"}</span>
            <span><strong>Afiliação:</strong> {identidade.afiliacao || "—"}</span>
            <span>
              <strong>Atributos:</strong>{" "}
              {regras.atributos.map((a) => `${a.nome} ${atributos[a.id] ?? atributoValorInicial}`).join(" · ")}
            </span>
            <span>
              <strong>Perícias investidas:</strong>{" "}
              {regras.pericias.filter((p) => (pericias[p.id] ?? 0) > 0).map((p) => `${p.nome} ${pericias[p.id]}`).join(" · ") || "nenhuma"}
            </span>
            <span>
              <strong>Vertentes:</strong>{" "}
              {vertentesDisponiveis
                .filter((v) => (niveisVertente[v.slug] ?? 0) > 0)
                .map((v) => `${v.label} ${niveisVertente[v.slug]}`)
                .join(" · ") || "nenhuma"}
            </span>
            <span>
              <strong>Magias conhecidas:</strong>{" "}
              {magiasEscolhidasValidas.map((slug) => magiasElegiveis.find((m) => m.slug === slug)?.nome ?? slug).join(" · ") || "nenhuma"}
            </span>
            <span><strong>Talento inicial:</strong> {talentoSelecionado?.nome ?? "nenhum"}</span>
            <span><strong>Inventário:</strong> {inventario.map((i) => `${i.itemNome} ×${i.quantidade}`).join(" · ") || "nenhum item"}</span>
            <span><strong>Aretz restante:</strong> {carteira.aretz_informal} / {aretzIniciais}</span>
          </div>

          {!vertentesValidas && vertentesDisponiveis.length > 0 && (
            <p style={{ color: "#ff6b6b", fontSize: 12, marginBottom: 8 }}>
              Vertentes inválidas — volte à Etapa 4 e distribua exatamente {PONTOS_VERTENTE_CRIACAO} pontos.
            </p>
          )}

          {travarSelecaoDePerfil ? (
            <p style={{ fontSize: 12, marginBottom: 16 }}>
              <strong>Perfil:</strong> {perfisState[0]?.nickname ?? "(nenhum perfil reivindicado — não é possível criar)"}
            </p>
          ) : (
            perfisState.length > 0 && (
              <label style={{ fontSize: 12, display: "block", marginBottom: 16 }}>
                Vincular a um perfil desta mesa (opcional — define como personagem ativo)
                <select
                  data-testid="wizard-perfil-select"
                  value={profileIdSelecionado}
                  onChange={(e) => setProfileIdSelecionado(e.target.value)}
                  style={{ ...input, marginTop: 4, maxWidth: 320 }}
                >
                  <option value="">— nenhum —</option>
                  {perfisState.map((p) => (
                    <option key={p.id} value={p.id}>{p.nickname}</option>
                  ))}
                </select>
              </label>
            )
          )}

          {!atributosValidos && (
            <p style={{ color: "#ff6b6b", fontSize: 12, marginBottom: 8 }}>
              Atributos inválidos — volte à Etapa 2 e distribua exatamente {atributoPontosAdicionais} pontos (teto {atributoTeto}).
            </p>
          )}
          {!periciasValidas && (
            <p style={{ color: "#ff6b6b", fontSize: 12, marginBottom: 8 }}>
              Perícias inválidas — volte à Etapa 3 (máximo {periciaPontosTotais} pontos, teto {periciaTeto} por perícia).
            </p>
          )}
          {!identidade.nome.trim() && (
            <p style={{ color: "#ff6b6b", fontSize: 12, marginBottom: 8 }}>Nome é obrigatório (Etapa 1).</p>
          )}
          {travarSelecaoDePerfil && !profileIdSelecionado && (
            <p style={{ color: "#ff6b6b", fontSize: 12, marginBottom: 8 }}>
              Nenhum perfil reivindicado nesta mesa — entre por um convite antes de criar seu personagem.
            </p>
          )}

          <button data-testid="wizard-finalizar-button" onClick={finalizar} disabled={!podeFinalizar || criando} style={{ ...btn, opacity: podeFinalizar && !criando ? 1 : 0.5 }}>
            {criando ? "Criando…" : "Criar personagem"}
          </button>
        </section>
      )}
    </main>
  );
}
