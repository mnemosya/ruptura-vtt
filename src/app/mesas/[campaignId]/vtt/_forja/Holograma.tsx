"use client";

import { REGIOES } from "./acervo/regioes";
import { CLASSES_ACERVO } from "./acervo/classes";
import { VERTENTES_ACERVO } from "./acervo/vertentes";
import type { DraftV12 } from "../../../../../lib/rulesetV12";

/**
 * O personagem projetado como registro holográfico. Instável (cinza,
 * piscando) enquanto a sincronia é baixa; ganha a cor da Vertente
 * (`--vc`, `--vc-brilho`, definidas na raiz da Forja) e os fragmentos
 * de origem, antecedente, classe e vertente conforme o jogador escolhe.
 */
export function Holograma({ d, avatar, progress, size = "lg", solid = false, nomeAntecedente }: { d: DraftV12; avatar: string; progress: number; size?: "md" | "lg"; solid?: boolean; nomeAntecedente?: string }) {
  const reg = REGIOES.find((r) => r.id === d.regiaoId);
  const cls = CLASSES_ACERVO.find((c) => c.id === d.classeSlug);
  const vt = VERTENTES_ACERVO.find((v) => v.id === d.vertente);
  return (
    <div className={`fj-holo fj-holo--${size}`}>
      <div className="fj-holo__cone" />

      <div className={`fj-holo__retrato ${!solid && progress < 0.5 ? "fj-flick" : ""}`}>
        <div className="fj-ch-shield fj-holo__moldura">
          <div className="fj-ch-shield fj-holo__tela">
            {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) ou URL externa; next/image não serve aqui */}
            <img
              src={avatar}
              alt={`Avatar de ${d.nome || "personagem sem nome"}`}
              className="fj-holo__foto"
              style={{
                filter: solid ? "contrast(1.05)" : `grayscale(1) contrast(1.25) brightness(${0.8 + progress * 0.4})`,
                opacity: solid ? 1 : 0.55 + progress * 0.4,
              }}
            />
            {!solid && <div className="fj-holo__tinta" />}
            {!solid && <div className="fj-holo__sobreposicao" />}
            <div className="fj-scan fj-cobre" style={{ opacity: solid ? 0.4 : 1 }} />
            <div className="fj-holo__base" />
            {!solid && <div className="fj-beam fj-holo__feixe" />}
            <div className="fj-holo__legenda">
              <div className="fj-holo__nome fj-glow">{d.nome || "———"}</div>
              {d.codinome && <div className="fj-holo__codinome">«{d.codinome}»</div>}
            </div>
          </div>
        </div>

        <Fragmento on={!!reg} lugar="origem" label="ORIGEM" value={reg?.nome} sub={reg?.sector} />
        <Fragmento on={!!d.antecedenteId} lugar="antecedente" label="ANTECEDENTE" value={nomeAntecedente} />
        {cls && (
          <div className="fj-boot fj-holo__classe">
            <span className="fj-spin fj-holo__classe-anel" />
            <span className="fj-ch-hex fj-holo__classe-hex" />
            <div className="fj-holo__classe-texto">
              <div className="fj-holo__classe-sigla">{cls.sigla}</div>
              <div className="fj-holo__classe-rotulo">CLASSE</div>
            </div>
          </div>
        )}
        {vt && (
          <div className="fj-boot fj-holo__vertente">
            <span className="fj-ch-hex fj-holo__vertente-hex" style={{ background: vt.cor }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- arte estática pequena, sem otimização */}
              <img src={vt.arte} alt="" />
            </span>
            <span className="fj-holo__vertente-nome" style={{ color: vt.brilho }}>{vt.nome}</span>
          </div>
        )}
      </div>

      <div className="fj-holo__pedestal">
        <div className="fj-holo__anel1" />
        <div className="fj-holo__anel2" />
        <div className="fj-holo__luz" />
        <div className="fj-holo__chao" />
      </div>
      <div className="fj-holo__rodape">
        <span>{solid ? "REGISTRO MATERIALIZADO" : "PROJEÇÃO INSTÁVEL"}</span>
        <span className="fj-holo__sinc">SINC {Math.round(progress * 100)}%</span>
      </div>
    </div>
  );
}

function Fragmento({ on, lugar, label, value, sub }: { on: boolean; lugar: "origem" | "antecedente"; label: string; value?: string; sub?: string }) {
  if (!on) return null;
  return (
    <div className={`fj-boot fj-holo__fragmento fj-holo__fragmento--${lugar}`}>
      <div className="fj-holo__fragmento-linha">
        <div className="fj-ch-l fj-holo__fragmento-caixa">
          <div className="fj-holo__fragmento-rotulo">{label}</div>
          <div className="fj-holo__fragmento-valor">{value}</div>
          {sub && <div className="fj-holo__fragmento-sub">{sub}</div>}
        </div>
        <span className="fj-holo__fragmento-fio" />
      </div>
    </div>
  );
}
