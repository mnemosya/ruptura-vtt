"use client";

/**
 * Janelas internas de administração: "Jogadores e convites" e
 * "Configurar acesso".
 *
 * As duas eram LINKS que tiravam a pessoa do VTT. Agora abrem na mesma
 * moldura do Console, com mapa e cena intactos por baixo.
 *
 * Confirmação destrutiva (revogar convite, remover participante) é
 * INLINE: o botão vira "Confirmar?" no próprio lugar. Nada de
 * `window.confirm` — a spec proíbe, e um diálogo do sistema
 * operacional quebra a estação diegética.
 */

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Link2, Loader2, ShieldCheck, Trash2, UserMinus } from "lucide-react";
import { JanelaInterna } from "../ui/JanelaInterna";
import { BotaoTecnico, Caption, Chip, Chips, PainelTecnico, Pip } from "../ui/primitivas";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "../Estados";
import {
  criarConviteAction,
  definirControleAction,
  lerAcessoPersonagemAction,
  lerJogadoresConvitesAction,
  removerParticipanteAction,
  revogarConviteAction,
  type DadosAcessoPersonagem,
  type DadosJogadoresConvites,
} from "../acoes/administracaoPainel";

/** Botão destrutivo com confirmação INLINE (dois toques no mesmo lugar). */
function BotaoConfirma({
  rotulo,
  onConfirmar,
  ocupado,
  testId,
}: {
  rotulo: string;
  onConfirmar: () => void;
  ocupado?: boolean;
  testId?: string;
}) {
  const [armado, setArmado] = useState(false);
  useEffect(() => {
    if (!armado) return;
    const t = setTimeout(() => setArmado(false), 4000);
    return () => clearTimeout(t);
  }, [armado]);
  return (
    <BotaoTecnico
      acento="perigo"
      ocupado={ocupado}
      onClick={() => {
        if (armado) {
          setArmado(false);
          onConfirmar();
        } else {
          setArmado(true);
        }
      }}
      icone={ocupado ? <Loader2 className="rv-spin" /> : <Trash2 />}
      testId={testId}
    >
      {armado ? "Confirmar?" : rotulo}
    </BotaoTecnico>
  );
}

export function JanelaJogadoresConvites({
  campaignId,
  aberta,
  onFechar,
}: {
  campaignId: string;
  aberta: boolean;
  onFechar: () => void;
}) {
  const [dados, setDados] = useState<DadosJogadoresConvites | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [rotulo, setRotulo] = useState("");
  const [linkNovo, setLinkNovo] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async () => {
    const r = await lerJogadoresConvitesAction(campaignId);
    if (r.ok && r.dados) {
      setDados(r.dados);
      setErro(null);
    } else setErro(r.erro ?? "Falha ao carregar.");
  }, [campaignId]);

  useEffect(() => {
    if (aberta) void carregar();
  }, [aberta, carregar]);

  async function executar(chave: string, acao: () => Promise<{ ok: boolean; erro?: string }>) {
    setOcupado(chave);
    try {
      const r = await acao();
      if (!r.ok) setErro(r.erro ?? "A operação foi recusada.");
      else await carregar();
    } finally {
      setOcupado(null);
    }
  }

  if (!aberta) return null;

  return (
    <JanelaInterna aberta titulo="Jogadores e convites" largura={620} altura={560} onFechar={onFechar} testId="painel-janela-convites">
      {erro && <EstadoErro mensagem={erro} onTentarDeNovo={carregar} testId="painel-convites-erro" />}
      {!dados ? (
        <EstadoCarregando />
      ) : (
        <>
          <Caption>Participantes</Caption>
          <ul className="rv-pn-lista" style={{ marginTop: 8 }} data-testid="painel-convites-participantes">
            {dados.participantes.map((p) => (
              <li key={p.userId} className="rv-pn-linha">
                <span className="rv-pn-face" aria-hidden="true">
                  {p.displayName.slice(0, 2).toUpperCase()}
                </span>
                <span className="rv-pn-linha-texto">
                  <strong className="rv-pn-linha-nome">{p.displayName}</strong>
                  <span className="rv-pn-linha-sub">{p.role === "narrator" ? "Narrador" : "Jogador"}</span>
                </span>
                {p.role === "player" && (
                  <BotaoConfirma
                    rotulo="Remover"
                    ocupado={ocupado === `m:${p.userId}`}
                    onConfirmar={() => executar(`m:${p.userId}`, () => removerParticipanteAction(campaignId, p.userId))}
                    testId="painel-convites-remover-participante"
                  />
                )}
              </li>
            ))}
          </ul>

          <div style={{ marginTop: 18 }}>
            <Caption>Convites</Caption>
          </div>

          <PainelTecnico className="rv-pn-campo" testId="painel-convites-criar">
            <label className="rv-pn-campo" style={{ marginTop: 0 }}>
              <span>Rótulo do convite (opcional)</span>
              <input
                className="rv-pn-input"
                value={rotulo}
                onChange={(e) => setRotulo(e.target.value)}
                placeholder="Ex.: grupo da terça"
                data-testid="painel-convites-rotulo"
              />
            </label>
            <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <BotaoTecnico
                primario
                acento="cy"
                ocupado={ocupado === "novo"}
                icone={<Link2 />}
                onClick={() =>
                  executar("novo", async () => {
                    const r = await criarConviteAction(campaignId, rotulo, window.location.origin);
                    if (r.ok && r.dados) {
                      setLinkNovo(r.dados.link);
                      setRotulo("");
                      setCopiado(false);
                    }
                    return r;
                  })
                }
                testId="painel-convites-gerar"
              >
                Gerar link de convite
              </BotaoTecnico>
            </div>
            {linkNovo && (
              <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
                <input className="rv-pn-input" readOnly value={linkNovo} style={{ flex: 1 }} data-testid="painel-convites-link" />
                <BotaoTecnico
                  acento={copiado ? "ok" : "cy"}
                  icone={copiado ? <Check /> : <Copy />}
                  onClick={() => {
                    void navigator.clipboard?.writeText(linkNovo).then(() => setCopiado(true));
                  }}
                  testId="painel-convites-copiar"
                >
                  {copiado ? "Copiado" : "Copiar"}
                </BotaoTecnico>
              </div>
            )}
          </PainelTecnico>

          {dados.convites.length === 0 ? (
            <EstadoVazio>Nenhum convite criado ainda.</EstadoVazio>
          ) : (
            <ul className="rv-pn-lista" style={{ marginTop: 10 }} data-testid="painel-convites-lista">
              {dados.convites.map((c) => (
                <li key={c.id} className="rv-pn-linha">
                  <Pip acento={c.ativo ? "ok" : "neutro"} ligado={c.ativo} />
                  <span className="rv-pn-linha-texto">
                    <strong className="rv-pn-linha-nome">{c.label ?? (c.email ?? "Convite sem rótulo")}</strong>
                    <span className="rv-pn-linha-sub">
                      {c.kind === "email" ? "Por e-mail" : "Reutilizável"}
                      {c.ativadoEm ? " · ativado" : c.ativo ? " · ativo" : " · revogado"}
                    </span>
                  </span>
                  {c.ativo && (
                    <BotaoConfirma
                      rotulo="Revogar"
                      ocupado={ocupado === `c:${c.id}`}
                      onConfirmar={() => executar(`c:${c.id}`, () => revogarConviteAction(campaignId, c.id))}
                      testId="painel-convites-revogar"
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </JanelaInterna>
  );
}

export function JanelaAcessoPersonagem({
  campaignId,
  characterId,
  onFechar,
}: {
  campaignId: string;
  characterId: string | null;
  onFechar: () => void;
}) {
  const [dados, setDados] = useState<DadosAcessoPersonagem | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!characterId) return;
    const r = await lerAcessoPersonagemAction(campaignId, characterId);
    if (r.ok && r.dados) {
      setDados(r.dados);
      setErro(null);
    } else setErro(r.erro ?? "Falha ao carregar.");
  }, [campaignId, characterId]);

  useEffect(() => {
    setDados(null);
    void carregar();
  }, [carregar]);

  if (!characterId) return null;

  return (
    <JanelaInterna
      aberta
      titulo="Configurar acesso"
      subtitulo={dados?.personagemNome}
      largura={520}
      altura={460}
      onFechar={onFechar}
      testId="painel-janela-acesso"
    >
      {erro && <EstadoErro mensagem={erro} onTentarDeNovo={carregar} testId="painel-acesso-erro" />}
      {!dados ? (
        <EstadoCarregando />
      ) : dados.jogadores.length === 0 ? (
        <EstadoVazio testId="painel-acesso-vazio">
          Nenhum jogador participa desta campanha ainda. Convide alguém em “Jogadores e convites”.
        </EstadoVazio>
      ) : (
        <>
          <Chips>
            <Chip acento="cy" icone={<ShieldCheck size={10} />}>
              {dados.controladores.length} controlador(es)
            </Chip>
          </Chips>
          <ul className="rv-pn-lista" style={{ marginTop: 10 }} data-testid="painel-acesso-lista">
            {dados.jogadores.map((j) => {
              const controla = dados.controladores.includes(j.userId);
              return (
                <li key={j.userId} className="rv-pn-linha" data-sel={controla ? "true" : undefined}>
                  <span className="rv-pn-face" aria-hidden="true">
                    {j.displayName.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="rv-pn-linha-texto">
                    <strong className="rv-pn-linha-nome">{j.displayName}</strong>
                    <span className="rv-pn-linha-sub">{controla ? "Controla este personagem" : "Sem controle"}</span>
                  </span>
                  <BotaoTecnico
                    acento={controla ? "perigo" : "ok"}
                    ocupado={ocupado === j.userId}
                    icone={controla ? <UserMinus /> : <ShieldCheck />}
                    onClick={async () => {
                      setOcupado(j.userId);
                      try {
                        const r = await definirControleAction(campaignId, characterId, j.userId, !controla);
                        if (!r.ok) setErro(r.erro ?? "A operação foi recusada.");
                        else await carregar();
                      } finally {
                        setOcupado(null);
                      }
                    }}
                    testId="painel-acesso-alternar"
                  >
                    {controla ? "Remover" : "Conceder"}
                  </BotaoTecnico>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </JanelaInterna>
  );
}
