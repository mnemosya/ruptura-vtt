"""Tradução da paleta ANTIGA do Console (a do arquivo do Figma) para a
que ficou decidida no commit `3d6a9c6` — a alinhada ao VTT.

A tabela segue os mesmos pares daquele commit onde eles existem, e
completa o resto pelo PAPEL da cor, não pela aparência: superfície vira
superfície, fio vira fio, âmbar vira âmbar. Cada linha diz o papel, pra
que a próxima pessoa possa discordar de uma sem desmontar as outras.
"""

# NÃO ENTRA NESTA TABELA: a cor do TIPO do item (a vertente). Ela não
# é chrome, é conteúdo, e já tem paleta canônica em vtt.css
# (`--rv-vertente-cor`). Traduzir essas cores aqui achata as seis
# vertentes num âmbar só. Quem consome deve marcar `data-vertente` e
# usar a variável.

CORES = {
  # ── Superfícies, do fundo pra frente ──────────────────────────────
  "#090f1a": "#070c16",                     # fundo atrás da janela
  "rgba(11,18,27,0.96)": "rgba(12,20,32,0.96)",  # corpo da janela → --rc-surface
  "#0b1520": "#0c1420",                     # chapa funda
  "#0c1921": "rgba(8,14,24,0.8)",           # ladrilho do ícone (o mais fundo)
  "#0c1b27": "rgba(8,20,32,0.7)",           # caixa de efeito
  "#0d141d": "#0c1420",                     # chapa funda (variante)
  "#101a26": "rgba(12,20,32,0.7)",          # botão de filtro
  "#11222f": "#111d31",                     # a superfície mais usada → o par do commit
  "#141f2b": "rgba(12,20,32,0.6)",          # célula de valor / botão
  "#15212c": "rgba(17,29,49,0.45)",         # superfície de campo, aba, caixa
  "#172838": "rgba(17,29,49,0.7)",          # superfície um degrau acima
  "#23202c": "rgba(17,29,49,0.95)",         # miolo do pip
  "rgba(16,26,38,0.7)": "rgba(16,26,38,0.7)",    # já é do mesmo tom — fica
  "rgba(21,33,44,0.35)": "rgba(17,29,49,0.35)",  # cartão de item
  "rgba(24,49,67,0.5)": "rgba(17,29,49,0.5)",    # aba ativa
  "rgba(12,15,33,0.66)": "rgba(12,20,32,0.66)",
  "rgba(7,22,23,0.76)": "rgba(8,20,32,0.76)",

  # ── Fios: o azul-petróleo vira as duas linhas do Console ──────────
  "#092e3b": "#16233a",                     # fio interno (ladrilho) → --rc-line-soft
  "#0e3445": "#1c2b45",                     # fio de caixa → --rc-line
  "#0e3647": "#1c2b45",                     # fio de campo → --rc-line
  "#112835": "#16233a",                     # fio de cartão
  "#123640": "#1c2b45",                     # o par do commit (era superfície de título)
  "#123645": "#1c2b45",                     # fio de aba
  "#108bac": "#108bac",                     # ciano de borda — já vive no VTT, fica

  # ── Ciano: o acento nunca mudou (--cy #00d4ff) ────────────────────
  "#049fc1": "#00d4ff",                     # chip "Resistir" → --cy
  "#0e6b7f": "rgba(0,212,255,0.45)",        # fio do botão primário
  "#114961": "rgba(0,212,255,0.25)",        # fio do seletor de quantidade
  "#1a2e40": "rgba(0,212,255,0.06)",        # fundo do seletor
  "rgba(6, 129, 154, 0.1)": "rgba(0,212,255,0.10)",
  "rgba(14,107,127,0.42)": "rgba(0,212,255,0.42)",
  "rgba(0,60,90,0.1)": "rgba(0,212,255,0.08)",
  "rgba(184,243,255,0.88)": "rgba(214,228,245,0.88)",
  "rgba(184,243,255,0.68)": "rgba(214,228,245,0.68)",
  "rgba(84,172,190,0.6)": "rgba(214,228,245,0.45)",   # placeholder da busca → --rc-dim

  # ── Âmbar: #f5a200 virou #cf9a3e no commit; os tons seguem junto ──
  "#775b2e": "#846021",                     # fio do medidor e as marcas
  "#1d1a12": "#261b09",                     # trilho do medidor
  "#372e1f": "#453211",                     # preenchimento do medidor
  "#7b3e28": "#cf9a3e",                     # acento do TIPO do item (fio do cartão)
  "#d77649": "#cf9a3e",                     # etiquetas de categoria/raridade → --am
  "rgba(123,62,40,0.6)": "rgba(207,154,62,0.35)",
  "rgba(18,15,6,0.43)": "rgba(18,15,6,0.43)",     # ladrilho: escurece, não tinge

  # ── Vermelho: #ff5f74 virou #d15068 ───────────────────────────────
  "#c5455a": "#d15068",                     # chip de condição → --rc-danger
  "rgba(255,95,116,0.6)": "rgba(209,80,104,0.6)",
  "rgba(255,95,116,0.5)": "rgba(209,80,104,0.5)",
  "rgba(36,8,8,0.43)": "rgba(36,8,8,0.43)",       # idem
  "rgba(31,13,10,0.43)": "rgba(31,13,10,0.43)",   # idem
  "rgba(38,29,32,0.6)": "rgba(207,154,62,0.12)",  # etiqueta: segue o tipo

  # ── Texto: #eaf7ff virou #d6e4f5, mantidos os mesmos alfas ────────
  "#d3f4ff": "#d6e4f5",
  "rgba(234,247,255,0.83)": "rgba(214,228,245,0.83)",
  "rgba(234,247,255,0.8)": "rgba(214,228,245,0.8)",
  "rgba(234,247,255,0.65)": "rgba(214,228,245,0.65)",
  "rgba(234,247,255,0.45)": "rgba(214,228,245,0.45)",

  # ── Sombra interna de campo: preto azulado, vira o fundo fundo ────
  "rgba(7,15,23,0.3)": "rgba(8,14,24,0.3)",
  # Ciano que já está na forma final (com espaços) — fica como está.
  "rgba(0, 212, 255, 0.1)": "rgba(0, 212, 255, 0.1)",
}
