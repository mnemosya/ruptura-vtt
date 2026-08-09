/**
 * Ícones e polígono do Card Nome/Ranking/Atributos/Integridade — SVGs
 * exatos do prompt, sem reinterpretação (mesmo princípio do avatar em
 * `avatarIcons.tsx`).
 *
 * O polígono de cada atributo usa o `d` EXATO do path externo do
 * Figma (cantos levemente arredondados via bezier) — não um hexágono
 * de cantos retos aproximado por `clip-path`/`polygon()`. `stroke` faz
 * o papel da faixa de borda que no Figma vem de uma máscara separada.
 */

import type { CharacterAttributes } from "../../../lib/character";

const HEX_D =
  "M38 1.51953L74.01 24.0258C74.3024 24.2085 74.48 24.529 74.48 24.8738V63.2853C74.48 63.6301 74.3024 63.9505 74.01 64.1333L38.53 86.3083C38.2057 86.5109 37.7943 86.5109 37.47 86.3083L1.99002 64.1333C1.69764 63.9505 1.52002 63.6301 1.52002 63.2853V24.8738C1.52002 24.529 1.69764 24.2085 1.99002 24.0258L38 1.51953Z";

export const ATTR_HEX_STYLE: Record<keyof CharacterAttributes, { fill: string; stroke: string; strokeOpacity: number }> = {
  corpo: { fill: "#0D2324", stroke: "#26FF00", strokeOpacity: 0.14 },
  mente: { fill: "#1B2339", stroke: "#6A4ABD", strokeOpacity: 0.55 },
  animo: { fill: "#0E2431", stroke: "#00D4FF", strokeOpacity: 0.14 },
};

/** Fill + borda no hover — valores exatos do prompt (cores sólidas, não
 * a mesma cor do estado padrão com opacidade maior). */
export const ATTR_HEX_HOVER: Record<keyof CharacterAttributes, { fill: string; stroke: string }> = {
  corpo: { fill: "#123433", stroke: "#206C32" },
  mente: { fill: "#202B49", stroke: "#5E41AF" },
  animo: { fill: "#102E40", stroke: "#108BAC" },
};

export function AttrHexPolygon({ attr }: { attr: keyof CharacterAttributes }) {
  const { fill, stroke, strokeOpacity } = ATTR_HEX_STYLE[attr];
  const hover = ATTR_HEX_HOVER[attr];
  return (
    <svg className="rc-nric-attr-poly" viewBox="0 0 76 89" fill="none" aria-hidden="true">
      <path
        className="rc-nric-attr-poly-path"
        d={HEX_D}
        strokeWidth="1.52"
        style={{
          ["--rc-attr-fill" as string]: fill,
          ["--rc-attr-stroke" as string]: stroke,
          ["--rc-attr-stroke-op" as string]: strokeOpacity,
          ["--rc-attr-hover-fill" as string]: hover.fill,
          ["--rc-attr-hover-stroke" as string]: hover.stroke,
        }}
      />
    </svg>
  );
}

export function CorpoIcon() {
  return (
    <svg viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path
        d="M9.13441 0.25H6.32984C6.22054 0.25 6.11946 0.303994 6.06527 0.391558L4.80517 2.42765C4.70561 2.58823 4.68156 2.7821 4.7391 2.95891C4.79755 3.13824 4.92938 3.28399 5.11022 3.36904L6.27747 3.91932C6.56792 4.05585 6.91468 4.00493 7.13997 3.79315C7.37835 3.56907 7.98695 3.05767 8.4768 3.14131C8.72706 3.18412 8.9423 3.3945 9.11675 3.7663C9.76187 5.14439 9.30642 7.39422 9.06377 8.35323C8.26825 7.70783 7.42159 7.38051 6.53595 7.38051C6.52377 7.38051 6.51159 7.38051 6.49942 7.38051C5.61926 7.38946 4.85144 7.7193 4.26203 8.09138C2.86553 6.34064 0.612926 6.60194 0.513372 6.61509C0.347144 6.63635 0.231454 6.77735 0.254287 6.9301C0.277121 7.08312 0.430562 7.19083 0.59679 7.16901C0.681731 7.15894 2.59914 6.94464 3.77918 8.4324C3.32068 8.79189 3.04637 9.11278 3.0211 9.14327C2.91881 9.26581 2.94347 9.44066 3.07651 9.53493C3.20925 9.62949 3.40045 9.60655 3.50335 9.4843C3.51614 9.46891 4.80973 7.95513 6.50885 7.93975C6.51738 7.93975 6.5259 7.93975 6.53443 7.93975C7.53423 7.93975 8.4975 8.46066 9.39775 9.48877C9.45803 9.55732 9.54602 9.59312 9.63522 9.59312C9.7022 9.59312 9.76979 9.57298 9.82581 9.5313C9.95672 9.43422 9.97773 9.25825 9.87208 9.13796C9.77162 9.02326 9.66932 8.91863 9.56703 8.81511C9.76431 8.12942 10.4959 5.29826 9.67511 3.54473C9.41572 2.99108 9.04977 2.66992 8.58731 2.59103C7.83746 2.4601 7.08456 3.04368 6.7037 3.40149C6.66656 3.43674 6.60475 3.44429 6.55422 3.42079L5.38696 2.87051C5.34404 2.85036 5.3276 2.81679 5.32151 2.79833C5.31542 2.77986 5.30903 2.74294 5.33338 2.70349L6.50611 0.808959H9.13349C9.37401 0.808959 9.60052 0.897363 9.77161 1.05795C10.7918 2.01864 14.0625 5.56543 13.5961 11.1083C12.6587 11.7059 6.08171 15.6891 2.59305 12.3555C2.52516 12.2906 2.42682 12.2604 2.3297 12.2727C2.23259 12.2858 2.14795 12.3412 2.10289 12.4215C2.0968 12.4321 1.48425 13.503 0.495714 13.6835C0.330704 13.7134 0.223538 13.8609 0.256418 14.0122C0.289299 14.1638 0.448829 14.2631 0.614449 14.2321C1.50983 14.0687 2.13151 13.399 2.43443 12.993C3.53806 13.9101 4.85236 14.2503 6.19405 14.25C9.91257 14.25 13.8409 11.6404 14.0683 11.4868C14.1389 11.4393 14.1837 11.3657 14.1913 11.2854C14.7432 5.43198 11.282 1.67845 10.2079 0.667401C9.9214 0.398272 9.53993 0.25 9.13441 0.25Z"
        fill="#207834"
        stroke="#207834"
        strokeWidth="0.5"
      />
    </svg>
  );
}

export function MenteIcon() {
  return (
    <svg viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <g stroke="#6A49BC" strokeWidth="1.16667" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 10.5003V2.91699" />
        <path d="M8.75 7.58333C7.71335 7.2803 7.00065 6.33003 7 5.25C6.99935 6.33003 6.28665 7.2803 5.25 7.58333" />
        <path d="M10.2655 3.79118C10.6334 3.15405 10.5635 2.35485 10.0906 1.79125C9.61771 1.22765 8.8428 1.02001 8.15146 1.27165C7.46011 1.52329 6.99998 2.18046 7.00001 2.91618C7.00005 2.18046 6.53991 1.52329 5.84857 1.27165C5.15722 1.02001 4.38231 1.22765 3.90941 1.79125C3.43652 2.35485 3.36662 3.15405 3.73451 3.79118" />
        <path d="M10.498 2.98926C11.1928 3.1679 11.7668 3.65619 12.0545 4.31334C12.3422 4.97048 12.3116 5.72344 11.9715 6.35509" />
        <path d="M10.5 10.5005C11.556 10.5004 12.4804 9.79112 12.7537 8.77107C13.027 7.75102 12.5812 6.67455 11.6667 6.14648" />
        <path d="M11.6476 10.1982C11.759 11.0602 11.3821 11.9127 10.6696 12.4103C9.95699 12.908 9.02688 12.9683 8.25597 12.5669C7.48506 12.1656 7.00114 11.369 7.00021 10.4998C6.99928 11.369 6.51536 12.1656 5.74445 12.5669C4.97354 12.9683 4.04343 12.908 3.33086 12.4103C2.6183 11.9127 2.24138 11.0602 2.35279 10.1982" />
        <path d="M3.49995 10.5005C2.44391 10.5004 1.51955 9.79112 1.24622 8.77107C0.972897 7.75102 1.41875 6.67455 2.33328 6.14648" />
        <path d="M3.50179 2.98926C2.80703 3.1679 2.23305 3.65619 1.94537 4.31334C1.65768 4.97048 1.68826 5.72344 2.02829 6.35509" />
      </g>
    </svg>
  );
}

export function AnimoIcon() {
  return (
    <svg viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M1.1665 5.54211C1.16653 4.21325 1.98576 3.02193 3.22661 2.54635C4.46746 2.07076 5.87306 2.40935 6.76125 3.39778C6.82302 3.46383 6.90941 3.50131 6.99984 3.50131C7.09027 3.50131 7.17665 3.46383 7.23842 3.39778C8.12399 2.40273 9.53303 2.05975 10.7768 2.53648C12.0207 3.0132 12.8395 4.21008 12.8332 5.54211C12.8332 6.87795 11.9582 7.87545 11.0832 8.75045L7.8795 11.8497C7.65963 12.1022 7.34184 12.2481 7.00701 12.2502C6.67217 12.2524 6.35256 12.1105 6.1295 11.8608L2.9165 8.75045C2.0415 7.87545 1.1665 6.88378 1.1665 5.54211"
        stroke="#0596B7"
        strokeOpacity="0.9"
        strokeWidth="1.16667"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const ATTR_ICONS: Record<keyof CharacterAttributes, () => React.JSX.Element> = {
  corpo: CorpoIcon,
  mente: MenteIcon,
  animo: AnimoIcon,
};

export const ATTR_LABEL_COLOR: Record<keyof CharacterAttributes, string> = {
  corpo: "#23903C",
  mente: "#6A49BC",
  animo: "#0596B7",
};
