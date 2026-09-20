"use client";

/**
 * Participantes de um registro de sessão (CONT-04).
 *
 * A lista vem acumulada dos batimentos durante a sessão — não é uma
 * foto do fim, que teria registrado só quem ficou até o fim. Quem
 * estava com "Aparecer offline" não está aqui, por PRES-01.
 *
 * O narrador pode corrigir, e a correção fica auditada no banco. Por
 * isso a origem aparece na tela: distinguir o que o sistema VIU do que
 * alguém afirmou depois é o que dá valor ao registro.
 */

import { useCallback, useEffect, useState } from "react";
import { Check, Clock, PenLine, X } from "lucide-react";
import { Caption } from "../../ui/primitivas";
import {
  listSessionParticipants, setSessionParticipant, type SessionParticipant,
} from "../../../../../../../lib/campaign/narrativeActions";

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function ParticipantesDaSessao({
  campaignId, sessionId, pessoas, ocupado,
}: {
  campaignId: string;
  sessionId: string;
  /** Nome por conta. `null` enquanto o elenco não chegou — ver abaixo. */
  pessoas: Map<string, string> | null;
  ocupado: boolean;
}) {
  const [lista, setLista] = useState<SessionParticipant[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await listSessionParticipants(sessionId);
    setLista(r.participants);
    setErro(r.error ?? null);
  }, [sessionId]);
  useEffect(() => { void carregar(); }, [carregar]);

  async function alternar(userId: string, incluir: boolean) {
    if (salvando || ocupado) return;
    setSalvando(true);
    const r = await setSessionParticipant(campaignId, sessionId, userId, incluir);
    setSalvando(false);
    if (!r.ok) { setErro(r.error); return; }
    await carregar();
  }

  if (erro) return <p className="rv-org-nota" role="alert">{erro}</p>;
  if (lista === null) return null;

  return (
    <>
      <Caption>Participantes</Caption>
      {lista.length === 0 ? (
        <p className="rv-org-nota">Ninguém registrado nesta sessão.</p>
      ) : (
        <ul className="rv-org-participantes" data-testid="organizador-participantes">
          {lista.map((p) => (
            <li key={p.user_id} data-incluido={p.incluido} data-testid="organizador-participante">
              {/* "Conta sem nome" é um nome REAL, que o servidor devolve
                  para quem nunca escolheu um. Dizê-lo enquanto a resposta
                  está em trânsito seria afirmar algo falso sobre alguém
                  que tem nome — por isso o traço enquanto não se sabe. */}
              <span className="rv-org-part-nome" data-carregando={pessoas === null || undefined}>
                {pessoas === null ? "—" : pessoas.get(p.user_id) ?? "Conta sem nome"}
              </span>
              <span className="rv-org-part-horas">
                <Clock size={11} aria-hidden="true" />
                {hora(p.primeiro_visto)}–{hora(p.ultimo_visto)}
              </span>
              {/* A origem é informação, não enfeite: um nome que o
                  narrador acrescentou à mão não tem o mesmo peso de um
                  que os batimentos viram. */}
              {p.origem === "manual" && (
                <span className="rv-org-part-manual" title="Corrigido à mão pelo narrador">
                  <PenLine size={10} aria-hidden="true" /> manual
                </span>
              )}
              <button type="button" className="rv-org-part-btn" disabled={salvando || ocupado}
                onClick={() => void alternar(p.user_id, !p.incluido)}
                data-testid="organizador-participante-alternar"
                aria-label={p.incluido
                  ? `Tirar ${pessoas?.get(p.user_id) ?? "participante"} do registro`
                  : `Devolver ${pessoas?.get(p.user_id) ?? "participante"} ao registro`}>
                {p.incluido ? <X size={12} /> : <Check size={12} />}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="rv-org-nota">
        Registrado automaticamente durante a sessão. Quem estava aparecendo offline não entra.
      </p>
    </>
  );
}
