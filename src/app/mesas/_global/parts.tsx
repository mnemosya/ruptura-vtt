/**
 * Peças visuais compartilhadas pelas telas da área autenticada global.
 *
 * O protótipo do Figma Make trazia capas de campanha vindas de banco de
 * imagens (mock). Campanhas reais não têm capa no banco — em vez de
 * inventar um campo ou puxar foto de terceiros, a "arte" de cada
 * campanha é derivada do próprio id: o mesmo fundo HUD da marca, com
 * enquadramento e tintura estáveis por campanha. Mesma linguagem
 * visual, zero dado inventado.
 */

import type { CSSProperties } from "react";
import { REGIOES_V12, regiaoValida } from "../../../lib/rulesetV12";
import type { Campaign } from "../../../lib/table";

export type Role = "narrator" | "player";

export function RoleBadge({ role, style }: { role: Role; style?: CSSProperties }) {
  const narrator = role === "narrator";
  return (
    <span className={`ra-role ra-role--${narrator ? "narrator" : "player"}`} style={style}>
      <span className="ra-diamond" aria-hidden="true" />
      {narrator ? "Narrador" : "Jogador"}
    </span>
  );
}

export function OnlineTag({ label = "Online" }: { label?: string }) {
  return (
    <span className="ra-online">
      <span className="ra-online-dot" aria-hidden="true" />
      <span className="ra-online-txt">{label}</span>
    </span>
  );
}

/** Hash estável e barato (djb2) — só para escolher enquadramento/tintura. */
function hashCode(value: string): number {
  let h = 5381;
  for (let i = 0; i < value.length; i += 1) h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const ACCENTS = [
  "rgba(0,212,255,0.20)",
  "rgba(245,162,0,0.18)",
  "rgba(139,92,246,0.18)",
  "rgba(34,211,170,0.18)",
  "rgba(255,92,122,0.16)",
  "rgba(77,159,255,0.18)",
];

/** Cor de acento estável da campanha (usada em detalhes finos). */
export function campaignAccent(id: string): string {
  return ACCENTS[hashCode(id) % ACCENTS.length];
}

/** Estilo de "capa" da campanha: fundo da marca + enquadramento/tintura estáveis. */
export function campaignCoverStyle(id: string): CSSProperties {
  const h = hashCode(id);
  const posX = 12 + (h % 76);
  const posY = 20 + ((h >> 3) % 60);
  const scale = 130 + ((h >> 6) % 60);
  return {
    // `.jpg`, não `.png`: o arquivo em `public/brand/` sempre foi
    // `app-hud.jpg`, e os outros dois lugares que usam essa textura
    // (`app.css`, `mesa.css`) já pediam a extensão certa. Só aqui pedia
    // `.png` — a textura não carregava nos cards de campanha, e cada
    // render deixava um 404 no console. Achado por um check que
    // afirmava "console sem erros" e vinha reprovando por isto.
    backgroundImage: `linear-gradient(140deg, ${campaignAccent(id)}, rgba(7,9,15,0.1)), url('/brand/app-hud.jpg')`,
    backgroundSize: `auto, ${scale}% auto`,
    backgroundPosition: `center, ${posX}% ${posY}%`,
  };
}

/** Nome da região da campanha, quando o narrador definiu. */
export function nomeDaRegiao(campaign: Pick<Campaign, "regiao">): string | null {
  const id = regiaoValida(campaign.regiao);
  return id ? REGIOES_V12[id].nome : null;
}

/**
 * Capa da campanha: a arte da REGIÃO onde ela começa (as mesmas imagens
 * da Forja, `public/forja/regioes/`). Sem região definida, cai na capa
 * derivada do id (`campaignCoverStyle`) — nada de foto inventada.
 */
export function capaDaCampanha(campaign: Pick<Campaign, "id" | "regiao">): CSSProperties {
  const id = regiaoValida(campaign.regiao);
  if (!id) return campaignCoverStyle(campaign.id);
  return { backgroundImage: `url('/forja/regioes/${id}.webp')`, backgroundSize: "cover", backgroundPosition: "center" };
}

/** "há 2 dias", "agora mesmo" — a partir de um timestamp ISO do banco. */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "sem atividade registrada";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "sem atividade registrada";
  const diffMin = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (diffMin < 1) return "agora mesmo";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `há ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 30) return `há ${diffD} ${diffD === 1 ? "dia" : "dias"}`;
  const diffMo = Math.round(diffD / 30);
  if (diffMo < 12) return `há ${diffMo} ${diffMo === 1 ? "mês" : "meses"}`;
  const diffY = Math.round(diffMo / 12);
  return `há ${diffY} ${diffY === 1 ? "ano" : "anos"}`;
}

export function DecoTop() {
  return (
    <div className="ra-deco-top" aria-hidden="true">
      <div className="ra-deco-a" />
      <div className="ra-deco-b" />
    </div>
  );
}

export function DecoBottom() {
  return (
    <div className="ra-deco-bottom" aria-hidden="true">
      <div className="ra-deco-b" />
      <div className="ra-deco-c" />
    </div>
  );
}

export function PageHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="ra-page-head">
      <span className="ra-eyebrow">{eyebrow}</span>
      <h1 className="ra-h1">{title}</h1>
    </div>
  );
}

export function SectionHead({ title, count, unit = "REGISTRO" }: { title: string; count: number; unit?: string }) {
  return (
    <div className="ra-section-head">
      <h2 className="ra-h2" style={{ whiteSpace: "nowrap" }}>{title}</h2>
      <span className="ra-line" aria-hidden="true" />
      <span className="ra-section-count">{count} {count === 1 ? unit : `${unit}S`}</span>
    </div>
  );
}
