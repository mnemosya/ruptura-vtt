"use client";

/**
 * Janelas internas de administração: "Jogadores e convites" e
 * "Configurar permissões".
 *
 * As duas eram LINKS que tiravam a pessoa do VTT. Agora abrem na mesma
 * moldura do Console, com mapa e cena intactos por baixo.
 *
 * Confirmação destrutiva (revogar convite, remover participante) é
 * INLINE: o botão vira "Confirmar?" no próprio lugar. Nada de
 * `window.confirm` — a spec proíbe, e um diálogo do sistema
 * operacional quebra a estação diegética.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Copy, Eye, Link2, Loader2, Pencil, ShieldCheck, Trash2, UserMinus, UserPlus, UserRound } from "lucide-react";
import { MenuAncorado } from "../ui/MenuAncorado";
import { useDicaPortal } from "../ui/DicaPortal";
import type { PermissaoPersonagem } from "../../../../../../lib/character/storage";
import { JanelaInterna } from "../ui/JanelaInterna";
import { BotaoTecnico, Caption, Chip, Chips, PainelTecnico, Pip } from "../ui/primitivas";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "../Estados";
import {
  criarConviteAction,
  definirPermissaoAction,
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
  const [ancoraAdicionar, setAncoraAdicionar] = useState<HTMLElement | null>(null);
  const caixaAdicionar = useRef<HTMLSpanElement>(null);

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

  async function aplicar(userId: string, permissao: PermissaoPersonagem | null) {
    if (!characterId) return;
    setOcupado(userId);
    try {
      const r = await definirPermissaoAction(campaignId, characterId, userId, permissao);
      if (!r.ok) setErro(r.erro ?? "A operação foi recusada.");
      else await carregar();
    } finally {
      setOcupado(null);
    }
  }

  const nomeDe = (userId: string) => dados?.jogadores.find((j) => j.userId === userId)?.displayName ?? "Jogador";
  const candidatos = dados ? dados.jogadores.filter((j) => !dados.controladores.some((c) => c.userId === j.userId)) : [];

  return (
    <JanelaInterna
      aberta
      titulo="Configurar permissões"
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
          <div className="rv-perm-cab">
            <Chips>
              <Chip acento="cy" icone={<ShieldCheck size={10} />}>
                {dados.controladores.length} com acesso
              </Chip>
            </Chips>
            {/* Adicionar escolhe o JOGADOR; entra como Editar (o que
                "dar um personagem" sempre significou) e a permissão se
                ajusta na própria linha depois. */}
            <span ref={caixaAdicionar} style={{ display: "inline-flex" }}>
              <BotaoTecnico
                acento="cy"
                icone={<UserPlus />}
                onClick={() => setAncoraAdicionar(ancoraAdicionar ? null : caixaAdicionar.current)}
                testId="painel-acesso-adicionar"
              >
                Adicionar
              </BotaoTecnico>
            </span>
          </div>
          <MenuAncorado
            ancora={ancoraAdicionar}
            aberto={ancoraAdicionar !== null}
            onFechar={() => setAncoraAdicionar(null)}
            rotulo="Dar acesso a"
            testId="painel-acesso-adicionar-menu"
            comDescricao
            alinhar="fim"
            // O botão fica SEMPRE — sumir quando todos já têm acesso
            // fazia parecer que adicionar não existia. Sem candidatos, o
            // menu diz por quê e pra onde ir.
            itens={candidatos.length > 0
              ? candidatos.map((j) => ({
                  id: j.userId,
                  rotulo: j.displayName,
                  descricao: "Entra com permissão de editar.",
                  icone: <UserRound />,
                  onSelecionar: () => void aplicar(j.userId, "editar"),
                }))
              : [{
                  id: "ninguem",
                  rotulo: "Todos já têm acesso",
                  descricao: "Convide mais jogadores em Jogadores e convites.",
                  icone: <UserRound />,
                  desabilitado: true,
                  onSelecionar: () => {},
                }]}
          />

          {dados.controladores.length === 0 ? (
            <EstadoVazio testId="painel-acesso-ninguem">Ninguém tem acesso a este personagem ainda.</EstadoVazio>
          ) : (
            <ul className="rv-pn-lista" style={{ marginTop: 10 }} data-testid="painel-acesso-lista">
              {dados.controladores.map((c) => {
                const nome = nomeDe(c.userId);
                return (
                  <li key={c.userId} className="rv-pn-linha rv-perm-linha" data-sel="true">
                    <span className="rv-pn-face" aria-hidden="true">{nome.slice(0, 2).toUpperCase()}</span>
                    <span className="rv-pn-linha-texto">
                      <strong className="rv-pn-linha-nome">{nome}</strong>
                      <span className="rv-pn-linha-sub">Jogador</span>
                    </span>
                    <ChipPermissao
                      valor={c.permissao}
                      ocupado={ocupado === c.userId}
                      onMudar={(p) => { if (p !== c.permissao) void aplicar(c.userId, p); }}
                    />
                    <BotaoRemoverAcesso
                      ocupado={ocupado === c.userId}
                      onRemover={() => void aplicar(c.userId, null)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </JanelaInterna>
  );
}

const PERMISSOES: { id: PermissaoPersonagem; rotulo: string; descricao: string; Icone: typeof Eye }[] = [
  { id: "visualizar", rotulo: "Visualizar", descricao: "Lê a ficha, sem alterar.", Icone: Eye },
  { id: "editar", rotulo: "Editar", descricao: "Ficha, token e turno.", Icone: Pencil },
];

/**
 * A permissão atual como chip; o clique abre o menu padrão do painel
 * (`MenuAncorado`) com as duas opções e o que cada uma libera — a
 * diferença precisa ser LIDA antes da escolha, não adivinhada por ícone.
 */
function ChipPermissao({ valor, onMudar, ocupado }: {
  valor: PermissaoPersonagem; onMudar: (p: PermissaoPersonagem) => void; ocupado: boolean;
}) {
  const [ancora, setAncora] = useState<HTMLButtonElement | null>(null);
  const atual = PERMISSOES.find((p) => p.id === valor) ?? PERMISSOES[1];
  return (
    <>
      <button
        type="button"
        className="rv-perm-chip"
        aria-haspopup="menu"
        aria-expanded={ancora !== null}
        // Sem `aria-label`: o texto visível já nomeia o botão, e o chassi
        // trata `button[aria-label]:has(svg)` como botão SÓ de ícone (sem
        // chanfro). A pergunta vai no `aria-describedby` implícito do menu.
        title={undefined}
        disabled={ocupado}
        onClick={(e) => setAncora(ancora ? null : e.currentTarget)}
        data-testid="painel-acesso-permissao"
      >
        {ocupado ? <Loader2 size={13} className="rv-girando" /> : <atual.Icone size={13} />}
        <span>{atual.rotulo}</span>
        <ChevronDown size={13} className="rv-perm-chip-seta" />
      </button>
      <MenuAncorado
        ancora={ancora}
        aberto={ancora !== null}
        onFechar={() => setAncora(null)}
        rotulo="Permissão"
        comDescricao
        alinhar="fim"
        testId="painel-acesso-permissao-menu"
        itens={PERMISSOES.map((p) => ({
          id: p.id,
          rotulo: p.rotulo,
          descricao: p.descricao,
          icone: <p.Icone />,
          selecionado: p.id === valor,
          onSelecionar: () => onMudar(p.id),
        }))}
      />
    </>
  );
}

/** Só ícone, com a dica padrão da mesa — flutuante, pra janela não recortá-la. */
function BotaoRemoverAcesso({ onRemover, ocupado }: { onRemover: () => void; ocupado: boolean }) {
  // Portal: dentro da janela, `fixed` não é relativo à tela (ver `DicaPortal`).
  const { alvo, dica } = useDicaPortal("Remover acesso");
  return (
    <>
      <button
        type="button"
        className="rv-perm-remover"
        aria-label="Remover acesso"
        disabled={ocupado}
        onClick={onRemover}
        data-testid="painel-acesso-remover"
        {...alvo}
      >
        <UserMinus size={15} />
      </button>
      {dica}
    </>
  );
}
