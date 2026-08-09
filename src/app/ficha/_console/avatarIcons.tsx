/**
 * SVGs exatos do Avatar (spec Figma) — copiados sem reinterpretação:
 * o ícone de usuário (estado padrão) e o ícone de upload (estado de
 * hover), cada um com o próprio gradiente embutido via `<linearGradient>`
 * + `mix-blend-mode: screen`, exatamente como no arquivo original.
 *
 * IDs de gradiente prefixados com `rc-avatar-` para nunca colidir com
 * outro SVG da página (o documento inteiro compartilha um único espaço
 * de IDs).
 */

/**
 * Polígono do avatar — heptágono EXATO do prompt (7 lados, não o
 * hexágono usado antes), viewBox 206×201. Só a borda (`stroke`) vem
 * daqui — o preenchimento é `.rc-avatar-fill` (mesma cor, já
 * recortada no mesmo heptágono via `clip-path`), para não pintar por
 * cima do avatar/ícone quando o SVG fica acima na pilha.
 */
export function AvatarHexPolygon() {
  return (
    <svg className="rc-avatar-poly" viewBox="0 0 206 201" preserveAspectRatio="none" aria-hidden="true">
      <path d="M184.904 40.0664L205.168 128.852L148.389 200.052H57.3208L0.540527 128.852L20.8052 40.0664L102.855 0.553711L184.904 40.0664Z" />
    </svg>
  );
}

export function AvatarUserIcon() {
  return (
    <svg viewBox="0 0 64 66" fill="none" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M39.2442 37.7022C39.6067 40.7531 40.2849 42.788 41.2911 43.7708C53.7008 47.3544 60.8505 50.8586 62.7385 54.2434C63.5104 56.778 63.9198 59.5443 63.9979 62.5653C64.0291 63.4985 63.7135 64.3157 63.101 64.9842C62.4854 65.6691 61.7166 66 60.8323 66H3.16621C2.28492 66 1.51308 65.6658 0.897471 64.9842C0.281842 64.3158 -0.0150161 63.5018 0.000584053 62.5653C0.0787095 59.5476 0.503716 56.778 1.25995 54.2434C3.15061 50.8583 10.2976 47.3575 22.7073 43.7708C23.7167 42.788 24.3917 40.7531 24.7542 37.7022C21.0229 35.151 18.5166 30.717 18.5166 25.6812L18.5198 14.2751C18.5198 6.42304 24.5823 0 32.0015 0C39.4171 0 45.4832 6.41932 45.4832 14.2751V25.6812C45.4801 30.7174 42.9769 35.1516 39.2456 37.7022H39.2442Z"
        fill="url(#rc-avatar-user-grad)"
        fillOpacity="0.36"
        style={{ mixBlendMode: "screen" }}
      />
      <path
        d="M32.002 0.5C39.1148 0.500276 44.9834 6.66866 44.9834 14.2754V25.6816C44.9802 30.4944 42.6146 34.7307 39.0869 37.2021H38.6816L38.748 37.7607C38.9317 39.3065 39.1975 40.6154 39.5527 41.6719C39.9063 42.7232 40.3595 43.5606 40.9414 44.1289L41.0312 44.2168L41.1523 44.251C47.3441 46.039 52.2034 47.8022 55.7412 49.5312C59.2702 51.2561 61.3972 52.9083 62.2764 54.4453C63.022 56.9147 63.4215 59.6166 63.498 62.5781V62.582C63.5248 63.3813 63.2587 64.0722 62.7324 64.6465L62.7295 64.6504C62.2097 65.2287 61.5759 65.5 60.832 65.5H3.16602C2.51854 65.5 1.94956 65.2903 1.46875 64.8516L1.26855 64.6494L1.26562 64.6455L1.08105 64.4268C0.681658 63.903 0.489091 63.2867 0.500977 62.5732L0.5 62.5723C0.576928 59.6186 0.991402 56.9142 1.72266 54.4434C2.60384 52.9065 4.7314 51.256 8.25879 49.5322C11.7962 47.8036 16.6541 46.0405 22.8457 44.251L22.9668 44.2168L23.0557 44.1289C23.6397 43.5602 24.094 42.7226 24.4473 41.6709C24.8021 40.6144 25.0674 39.3061 25.251 37.7607L25.2861 37.46L25.0361 37.2891C21.4396 34.8299 19.0168 30.5499 19.0166 25.6816L19.0195 14.2754C19.0195 6.67204 24.8856 0.5 32.002 0.5Z"
        stroke="#00D4FF"
        strokeOpacity="0.25"
      />
      <defs>
        <linearGradient id="rc-avatar-user-grad" x1="32" y1="0" x2="32" y2="66" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00D4FF" stopOpacity="0.43" />
          <stop offset="1" stopColor="#007F99" stopOpacity="0.71" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function AvatarUploadIcon() {
  return (
    <svg viewBox="0 0 64 57" fill="none" aria-hidden="true">
      <path
        d="M31.9999 0C32.7268 0 33.4262 0.293028 33.9405 0.810144L48.5672 15.5168C49.6404 16.5959 49.6404 18.3402 48.5672 19.4193C47.4974 20.4949 45.7591 20.4949 44.6893 19.4193L34.7428 9.41835V39.5315C34.7428 41.0553 33.5153 42.2894 31.9998 42.2894C30.4843 42.2894 29.2569 41.0553 29.2569 39.5315V9.41835L19.3103 19.4193C18.2405 20.4949 16.5023 20.4949 15.4325 19.4193C14.3593 18.3402 14.3593 16.5959 15.4325 15.5168L30.0591 0.810144C30.5734 0.293028 31.2731 0 31.9999 0Z"
        fill="url(#rc-avatar-upload-grad-1)"
        fillOpacity="0.36"
        style={{ mixBlendMode: "screen" }}
      />
      <path
        d="M52.116 33.0954C53.683 33.0954 54.8658 33.0816 55.9047 33.2919C59.8923 34.0883 63.0158 37.2254 63.8078 41.2382C64.0135 42.2794 63.9998 43.4721 63.9998 45.0476C63.9998 46.6231 64.0135 47.8124 63.8078 48.857C63.0158 52.8698 59.8923 56.007 55.9047 56.8033C54.8658 57.0136 53.683 56.9998 52.116 56.9998H11.884C10.317 56.9998 9.13417 57.0136 8.09528 56.8033C4.10771 56.0069 0.98418 52.8698 0.192196 48.857C-0.0135291 47.8124 0.000189984 46.6231 0.000189984 45.0476C0.000189984 43.4721 -0.0135247 42.2794 0.192196 41.2382C0.984216 37.2254 4.10771 34.0882 8.09528 33.2919C9.13417 33.0816 10.317 33.0954 11.884 33.0954H17.9184C19.9687 33.0954 20.9905 33.0954 21.7756 33.4953C22.4614 33.8504 23.0203 34.4124 23.3734 35.1052C23.7711 35.8912 23.7711 36.922 23.7711 38.9801V39.5317C23.7711 44.0996 27.4569 47.8055 31.9999 47.8055L32.8434 47.7607C36.9887 47.3367 40.2288 43.8168 40.2288 39.5317V38.9801C40.2288 36.9221 40.2288 35.8912 40.6265 35.1053C40.9762 34.4123 41.5386 33.8504 42.2243 33.4953C43.0094 33.0954 44.0312 33.0954 46.0815 33.0954L52.116 33.0954Z"
        fill="url(#rc-avatar-upload-grad-2)"
        fillOpacity="0.36"
        style={{ mixBlendMode: "screen" }}
      />
      <defs>
        <linearGradient id="rc-avatar-upload-grad-1" x1="32" y1="33.0952" x2="32" y2="57" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00D4FF" stopOpacity="0.43" />
          <stop offset="1" stopColor="#007F99" stopOpacity="0.71" />
        </linearGradient>
        <linearGradient id="rc-avatar-upload-grad-2" x1="32" y1="33.0952" x2="32" y2="57" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00D4FF" stopOpacity="0.43" />
          <stop offset="1" stopColor="#007F99" stopOpacity="0.71" />
        </linearGradient>
      </defs>
    </svg>
  );
}
