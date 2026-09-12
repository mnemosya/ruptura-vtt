"use client";

/**
 * PAINEL FLUTUANTE “ROLAR DADOS”.
 *
 * A moldura — espinha vertical com índice + código, cantos em bracket e
 * cabeçalho com estado — é a de `JanelaFerramenta`, compartilhada com
 * todas as outras ferramentas. Aqui sobra só o CORPO: o rolador do
 * design, sem adaptação.
 *
 * A rolagem acontece na MESA do próprio painel — é ali que o design
 * coloca a arena 3D, e é dela que sai o valor lido da face superior.
 */

import { Dices } from "lucide-react";
import { RoladorDados, type PersonagemSugerido } from "../_dados3d/RoladorDados";
import { JanelaFerramenta } from "./JanelaFerramenta";

export function PainelDados({ onFechar, campaignId, personagemSugerido }: {
  onFechar: () => void;
  /** `null` só no harness `/dev/dados`: sem mesa, a rolagem é ensaio e não vira registro. */
  campaignId: string | null;
  /** Personagem do token selecionado — sugestão de identidade; o servidor revalida. */
  personagemSugerido: PersonagemSugerido | null;
}) {
  return (
    <JanelaFerramenta
      id="dados"
      icone={<Dices size={16} />}
      titulo="Rolar Dados"
      modo="d8 · maior dado + perícia + modificadores"
      rotulo="Ferramenta Rolar Dados"
      rotuloFechar="Fechar ferramenta Rolar Dados"
      aoFechar={onFechar}
      className="rv-dados-painel"
      testId="painel-dados"
      atributos={{ "data-design": "ferramenta-flutuante" }}
    >
      <div className="rv-dados-corpo rup-scroll">
        <RoladorDados campaignId={campaignId} personagemSugerido={personagemSugerido} />
      </div>
    </JanelaFerramenta>
  );
}
