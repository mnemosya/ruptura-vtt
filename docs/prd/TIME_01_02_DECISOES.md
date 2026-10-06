# TIME-01/02 — calendário e clima da campanha

- **Calendário:** Imperial; 12 meses de 30 dias, semanas D1–D6 e 24 horas. A data de jogo usa minutos inteiros imperiais, sem `Date` nem timezone real. Inverno: Dodecan, Primen, Dicen; primavera: Tricen, Caten, Quinten; verão: Hexan, Heptan, Octan; outono: Noven, Decan, Undecan. A mudança ocorre no dia 1.
- **Escopo:** um estado canônico por campanha, independente da cena. O narrador controla data e hora. Jogadores recebem atualizações em tempo real e têm acesso somente de leitura.
- **Clima:** uma condição canônica entre 11 comuns e 3 especiais, região, temperatura atual e alvo, vento qualitativo, duração, aurora opcional e observação. O narrador pode editar manualmente condição, região, temperatura, alvo, vento, aurora, observação, mês, dia, ano e horário.
- **Sorteio:** pesos editoriais por região e estação, com influência da condição anterior e instabilidade regional. O sorteio usa seed reproduzível e produz uma prévia privada; só **Aplicar clima** publica. Sorteio não altera data/hora.
- **Evolução:** avanços +10 min, +1 hora e +1 dia aproximam a temperatura do alvo gradualmente. Uma condição só muda após sua duração; o novo sorteio é determinístico a partir da seed persistida. Edições diretas de calendário reancoram a duração sem simular todo o intervalo saltado.
- **Efeito especial:** tempestade arcana mostra aviso de Saturação atmosférica. Conforme decisão do narrador, a ferramenta não marca fichas ou tokens; a regra aparece como aviso para criaturas expostas.
- **Histórico:** sem log nesta versão. A linha canônica mantém `updated_at` e `updated_by` da última edição.
