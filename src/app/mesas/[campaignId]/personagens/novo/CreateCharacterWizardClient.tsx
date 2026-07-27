"use client";

/**
 * Assistente de criação de personagem — checkpoint v0.41 (PRD 3.2).
 *
 * Núcleo validado: identidade, atributos, perícias, revisão. Vertentes
 * (etapa 4) e talento inicial (etapa 5, só quando a Biblioteca de
 * talentos responde de verdade) e inventário (etapa 6, só o saldo
 * inicial de aretz) entram como placeholders estruturados — nenhuma
 * mecânica de magia/talento/loja é inventada ou gravada além do que já
 * existe no schema atual de `Character` (ver `logPermanentAdjustment`/
 * `metadados` livre, v0.32-v0.40).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCharacterForCampaign } from "../../../../../lib/character/storage";
import { setCampaignProfileActiveCharacter } from "../../../../../lib/table/storage";
import type { Campaign, CampaignProfile } from "../../../../../lib/table";
import type { Character, CharacterRulesPayload } from "../../../../../lib/character";

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

export interface TalentoNivel1Option {
  slug: string;
  nome: string;
  descricao_curta?: string;
}

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
  talentosNivel1,
  travarSelecaoDePerfil = false,
}: {
  campaign: Campaign;
  regras: CharacterRulesPayload;
  perfisIniciais: CampaignProfile[];
  talentosNivel1: TalentoNivel1Option[];
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
  const [talentoEscolhidoSlug, setTalentoEscolhidoSlug] = useState<string>("");
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

  const podeFinalizar =
    atributosValidos &&
    periciasValidas &&
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

  async function finalizar() {
    if (!podeFinalizar) return;
    setCriando(true);
    setErrorMessage(null);
    try {
      const nowIso = new Date().toISOString();
      const character: Character = {
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
          // Etapa 5 (checkpoint v0.41): só um rótulo de escolha, sem
          // nenhum efeito mecânico — não existe sistema de talentos
          // ainda (fora de escopo explícito).
          talento_inicial_escolhido: talentoEscolhidoSlug || undefined,
          // Etapa 6 — saldo inicial de aretz, sem inventário/loja implementados.
          aretz: aretzIniciais,
        },
        estado_jogo: { pa_gastos: 0, reacoes_usadas: 0 },
      };

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
          <h2 style={h2}>Etapa 4 — Vertentes</h2>
          <p style={{ fontSize: 13, opacity: 0.7 }}>
            Etapa pendente — não existe modelo de vertentes/magias implementado na ficha ainda
            (fora de escopo deste checkpoint). Avance sem preencher nada; nenhuma mecânica de
            magia é gravada.
          </p>
        </section>
      )}

      {step === 5 && (
        <section>
          <h2 style={h2}>Etapa 5 — Talento inicial</h2>
          {talentosNivel1.length > 0 ? (
            <>
              <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>
                Escolha 1 talento de nível 1 (da Biblioteca) — registrado só como rótulo de
                escolha (`metadados.talento_inicial_escolhido`), sem nenhum efeito mecânico ainda
                (sistema de talentos completo fora de escopo).
              </p>
              <select
                data-testid="wizard-talento-select"
                value={talentoEscolhidoSlug}
                onChange={(e) => setTalentoEscolhidoSlug(e.target.value)}
                style={{ ...input, maxWidth: 420 }}
              >
                <option value="">— nenhum —</option>
                {talentosNivel1.map((t) => (
                  <option key={t.slug} value={t.slug}>{t.nome}</option>
                ))}
              </select>
            </>
          ) : (
            <p style={{ fontSize: 13, opacity: 0.7 }}>
              Etapa pendente — a Biblioteca de talentos não retornou nenhum talento de nível 1.
              Avance sem escolher.
            </p>
          )}
        </section>
      )}

      {step === 6 && (
        <section>
          <h2 style={h2}>Etapa 6 — Inventário</h2>
          <p style={{ fontSize: 13, marginBottom: 8 }}>
            Aretz inicial: <strong>{aretzIniciais}</strong>
          </p>
          <p style={{ fontSize: 12, opacity: 0.6 }}>
            Loja e inventário completo não implementados ainda (fora de escopo deste checkpoint)
            — o saldo inicial é só registrado em `metadados.aretz`, sem itens.
          </p>
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
            <span><strong>Talento inicial:</strong> {talentosNivel1.find((t) => t.slug === talentoEscolhidoSlug)?.nome ?? "nenhum"}</span>
            <span><strong>Aretz inicial:</strong> {aretzIniciais}</span>
          </div>

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
