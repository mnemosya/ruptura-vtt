"use server";

/**
 * Complemento da aba Participantes: quais personagens cada conta
 * controla NESTA campanha.
 *
 * O roster, a presença e o status do canal já vêm do
 * `CampaignRealtimeProvider` — esta ação existe só para a decoração
 * "personagens controlados", que precisa de uma leitura própria.
 *
 * FONTE SEGURA, nunca inferência: `character_controllers` (RLS da
 * migration 0051 — o narrador dono vê todas as linhas da campanha; o
 * jogador, só as próprias) cruzado com o nome do personagem lido pela
 * RLS de `characters`. Nada é derivado do token selecionado no mapa
 * nem de qualquer outra coincidência.
 *
 * Consequência esperada e correta: o jogador só vê os PRÓPRIOS
 * personagens listados sob o próprio nome; as outras linhas do roster
 * ficam sem decoração nenhuma, em vez de mostrarem uma lista vazia que
 * pareceria "esta pessoa não controla ninguém".
 */

import {
  listCharacterControllers,
  listCharactersForNarratorCampaign,
  listControlledCharacters,
} from "../../../../../../lib/character/storage";
import { getCurrentUser } from "../../../../../../lib/auth/session";
import { exigirAcessoPainel, mensagemDeErro, type ResultadoPainel } from "./comum";

export interface ControlesDeParticipantes {
  /** userId → personagens controlados (id + nome). Só contém as contas sobre as quais a leitura é autorizada. */
  porUsuario: Record<string, { id: string; nome: string }[]>;
  /**
   * `true` quando a leitura cobre a campanha inteira (narrador). Para o
   * jogador é `false` — a interface então não afirma nada sobre as
   * outras linhas do roster.
   */
  completo: boolean;
}

export async function lerControlesParticipantesAction(campaignId: string): Promise<ResultadoPainel<ControlesDeParticipantes>> {
  const v = await exigirAcessoPainel(campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };

  try {
    if (v.acesso.role === "narrator") {
      const [controles, personagens] = await Promise.all([
        listCharacterControllers(campaignId),
        listCharactersForNarratorCampaign(campaignId),
      ]);
      const nomePorId = new Map(personagens.filter((p) => !p.archived_at).map((p) => [p.id, p.name]));
      const porUsuario: Record<string, { id: string; nome: string }[]> = {};
      for (const c of controles) {
        const nome = nomePorId.get(c.character_id);
        if (!nome) continue; // arquivado ou fora da campanha — não decora
        (porUsuario[c.user_id] ??= []).push({ id: c.character_id, nome });
      }
      for (const lista of Object.values(porUsuario)) {
        lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
      }
      return { ok: true, dados: { porUsuario, completo: true } };
    }

    const usuario = await getCurrentUser();
    if (!usuario) return { ok: true, dados: { porUsuario: {}, completo: false } };
    const meus = await listControlledCharacters(campaignId);
    return {
      ok: true,
      dados: {
        completo: false,
        porUsuario: {
          [usuario.id]: meus
            .filter((c) => !c.archived_at)
            .map((c) => ({ id: c.id, nome: c.name }))
            .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })),
        },
      },
    };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao carregar os personagens dos participantes.") };
  }
}
