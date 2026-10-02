# Plano — Forja de Refratário (criação de personagem)

**Status:** em implementação (Fases 0 a 4 entregues)  
**Criado em:** 02/10/2026  
**Versão deste documento:** 0.4  
**Origem:** audit do protótipo `High-Fidelity Character Creator Exploration/` (Figma Make, commit `6449e71`)  
**Prancha de cores:** https://claude.ai/artifact/QPtzERYKCXwA5AoBQNGNFs

## 1. Objetivo

Trazer para o VTT a criação de personagem desenhada no protótipo "Forja de Refratário", preservando o visual e o motion dele, e ligando-a às regras, ao rascunho e à conclusão da v1.2 que o VTT já tem.

A tela atual do assistente (`_painel/janelas/AssistenteV12.tsx`) sai. A lógica dela fica.

## 2. Princípios

- **O protótipo é a base do código visual.** Ajustamos nele próprio; não reescrevemos a tela do zero, para não perder o resultado visual e o motion.
- **As regras vêm do VTT.** Estado, validação, rascunho e conclusão vêm do que já existe para a v1.2 (`src/lib/rulesetV12/`, `criacaoV12Actions.ts`, `draft.ts`). A tela só coleta escolhas; o servidor decide.
- **Os dados vêm de `content/v12` e dos catálogos publicados.** Os `classes.json`, `vertentes.json` e `.md` copiados para o protótipo são apagados.
- **Narrativa não trava o jogo.** Campos de história do personagem são opcionais: ficam entre jogador e narrador.

## 3. Decisões tomadas

### 3.1 Regras

| Tema | Decisão |
|---|---|
| Atributos | Escolha de um perfil da Classe (ex.: 2/1/1, 2/2/0, 3/1/0) e permutação dos valores entre Corpo, Mente e Ânimo. O 0 é válido. |
| Perícias | Passo novo, no mesmo idioma visual dos demais: perfil de perícias e distribuição dos valores 3, 2 e 1 pelas listas da Classe. |
| Qualidades | Somam exatamente 3 pontos. |
| Complicações | Somam no mínimo 2 pontos (sem teto de 2). |
| Recursos derivados | PV, PE, Mana, Integridade, Reações, Andar e Correr pelas fórmulas da Classe. Sai o selo "Ilustrativo". |
| Vertente Primária | Aberta a qualquer Classe (todas as classes têm `vertentes_primarias: "qualquer"`). |
| Magias iniciais | Não são escolhidas na Forja. Ficam como pendência, como o servidor já faz (`escolhas_pendentes`). |
| Dependências | Trocar a Classe reseta os perfis de atributos e perícias, com aviso. |

### 3.2 Campos narrativos opcionais

Ficam opcionais **na tela e no servidor** (`validation.ts`, linhas ~300–311, e a validação equivalente no banco):

- Antecedente: Meio, Papel, Relação atual;
- Transformação: Estopim, Primeiros passos, Consequência;
- RPI Forjado: nome registrado, ocupação declarada, origem.

Na tela, entram num bloco expansível **"Detalhes para o narrador (opcional)"** no painel do Antecedente. O texto livre "Como se tornou refratário" e o codinome continuam como estão.

Continuam obrigatórios: nome, região, local de origem, Antecedente, Qualidades, Complicações, Classe, perfis e Vertente.

### 3.3 Fluxo

Conceito → Região → Antecedente → Traços → Classe → Atributos → **Perícias** → Vertente → Revisão.

Equipamento entra depois (em espera).

### 3.4 Telas e ações

- **Selar refratário:** chama a criação real. Com pendências, fica bloqueado e lista o que falta, com link para o passo. Ao concluir, abre a ficha por cima, como hoje.
- **Tela inicial:** "Novo refratário" começa do zero; "Continuar rascunho" carrega o rascunho do servidor com nome e progresso reais (sem rascunho, o botão some); "Voltar à mesa" fecha a janela; "Importar registro" sai por enquanto; "Mesa ativa" e "MJ" usam dados reais.
- **Avatar:** segue as regras de avatar do VTT (`src/lib/vtt/imagePreparation.ts`: PNG/JPEG/WebP até 30 MB, WebP, downscale, sem EXIF). A imagem fica preparada só no navegador e é enviada no Selar; desistir não deixa imagem órfã. Ganha foco pelo teclado e botão de remover.

### 3.5 Sincronia (progresso)

Uma única função de validação alimenta a barra de Sincronia, os losangos do menu e o Selar. Um personagem a 100% é um personagem que o servidor aceita.

### 3.6 Acessibilidade

- Nenhum texto abaixo de 10px.
- Atalhos funcionando: Q (voltar), E (confirmar), U (avatar), Enter (tela inicial).
- Labels nos campos de Identidade e nos controles do carrossel; o ✕ de remover traço aparece também no foco do teclado.
- `prefers-reduced-motion`: desliga scan, flick, glitch, spin e beam e reduz o `boot`, no padrão de `motion.css`.
- Abaixo de 1280px, o menu lateral vira uma faixa compacta com os passos no topo.

### 3.7 Visual: conversão de Tailwind para o CSS do app

O app não usa Tailwind. A conversão não é de um para um: usa ao máximo os valores que o CSS do app já tem.

| Elemento | Origem |
|---|---|
| Fontes de heading (Oxanium) e efeitos de texto (`glow`, `glitch`, tracking largo) | Protótipo |
| Efeitos visuais (scan, hexgrid, hazard, holograma, carrossel 3D, `boot`) e formas de chanfro | Protótipo, com as cores do app |
| Espaçamento, sombras, raio, tamanhos de chanfro | `tokens.css` (`--hud-*`) |
| Durações e curvas de animação | `motion.css` (`--mo-*`) |
| Cores | Tabela abaixo |

Resultado: uma folha `forja.css` no padrão das outras folhas do app.

**Cores**

| Protótipo | Fica | Observação |
|---|---|---|
| `abyss #030b10` | `--rc-surface-3 #06121c` | |
| `deep #06161e` | `--rc-surface-2 #0c1f2b` | |
| `hull #0a2029` | `--rm-surface-solid #101a26` | |
| `cy #3ff0ff` | `--cy #00d4ff` | |
| `cyd #1a8a99` | `--rc-teal #45b8c9` | |
| `amb #ff8a1f` | `#ff8a1f` (mantido) | Token próprio `--forja-am`, só em `forja.css`. |
| `ice #cfeff4` (títulos) | `#cfeff4` (mantido) | |
| `ice` (texto corrido) | `--rm-text #b8d8e8` | |
| `dim #5f8a93` | `--rc-dim #7f95b3` | Melhora o contraste dos rótulos. |
| — | `--rm-danger #ff5f74` | Pendências e erros do Selar. |
| — | `--rm-success #22d3aa` | Personagem selado. |

**Vertentes:** a Forja usa a mesma paleta dos tokens do mapa (`COR_VERTENTE`, hoje em `_mapa/MapaHex.tsx`), extraída para uma fonte única compartilhada.

| Vertente | Cor |
|---|---|
| Biótica | `#2f9e56` |
| Cinética | `#e0455f` |
| Cognitiva | `#8b5cf6` |
| Energética | `#f07a1f` |
| Material | `#f5a200` |
| Sináptica | `#35c7d8` |

- Energética quase igual ao âmbar da Forja: aceito como está.
- Biótica e Cognitiva: clarear só o brilho do holograma (`color-mix`), sem mudar a cor base.

## 4. Fases

### Fase 0 — Normalizar os nomes das Vertentes (passo próprio, antes da Forja)

"Somática" não existe mais: **Biótica** é a substituição direta. Os nomes passam a concordar com "a Vertente …":

- `somatico` → `biotica`
- `cognitivo` → `cognitiva`
- `energetico` → `energetica`

Abrange mapa, tokens (`tokenApresentacao.ts`), Gerenciador de Token, ficha, `console.css` e `vtt.css`, mais a conversão no banco dos tokens que já existem nas mesas.

Cuidados:

- **Magias ficam de fora** enquanto o capítulo de magias não estiver fechado: `CamposMagiaSection.tsx`, `scripts/dev/v12/gerar_magias.py` e os testes de magias.
- **Dano energético não muda.** Só se troca `energetico` quando for o nome da Vertente. Antes de aplicar, a lista do que muda e do que fica de fora é revisada.

### Fase 1 — Trazer para o app e converter o visual

Mover o protótipo para dentro do app, como janela da mesa no lugar de `JanelaNovoPersonagem`, e converter Tailwind para `forja.css` conforme 3.7. Critério de pronto: comparação de capturas com o protótipo, mudando só o que a tabela de cores manda.

### Fase 2 — Motor único

Extrair do `AssistenteV12` o estado, o rascunho, as pendências e a conclusão para um módulo compartilhado usado pela Forja. Dividir o `App.tsx` do protótipo em passos, corrigir a ordem dos hooks em `Tracos` e unificar a regra de "concluído" (3.5).

### Fase 3 — Regras

Aplicar 3.1 e 3.2, incluindo a mudança de validação no servidor.

### Fase 4 — Telas e ações reais

Aplicar 3.4.

### Fase 5 — Acessibilidade

Aplicar 3.6.

### Fase 6 — Absorver no design system

Com a Forja pronta, levantar o que vale para o VTT inteiro (Oxanium nos headings, efeitos de texto, chanfros, `edge` em gradiente, `glass`, hexgrid, `boot`) e propor a adoção nas outras telas.

## 5. Andamento

- **Fase 0 — entregue.** Token, mapa, Gerenciador de Token, ficha e CSS usam `biotica`/`cognitiva`/`energetica`. A leitura do token converte os nomes antigos. **Pendente:** aplicar `supabase/migrations/20261002120000_vtt_token_vertentes_v12.sql` **depois** do deploy desse código (o código anterior não reconhece os nomes novos).
- **Fase 1 — entregue em `/dev/forja`.** A Forja vive em `src/app/mesas/[campaignId]/vtt/_forja/` com CSS próprio (`forja.css`, sem Tailwind) e ainda não substitui o assistente da mesa. Decisões tomadas na conversão:
  - a paleta das Vertentes virou fonte única (`src/app/_design/coresVertente.ts`), usada pelo mapa e pela Forja;
  - as durações longas do protótipo (entrada `boot`, varreduras) ficaram, com as curvas do app; `prefers-reduced-motion` desliga o que é contínuo;
  - os breakpoints são de contêiner, para a Forja funcionar dentro da mesa;
  - as imagens usadas viraram WebP em `public/forja/` (de ~45 MB para ~1,9 MB), porque o build não pode depender dos PNGs do protótipo, que estão em Git LFS. As URLs do Unsplash continuam em espera;
  - Antecedentes, Qualidades e Complicações já vêm do catálogo canônico (`CatalogosCriacaoV12`). Dossiês de classe e grimórios ainda vêm dos JSON do protótipo, importados direto da pasta dele (sai na Fase 3);
  - de quebra: rótulos de 8–9px subiram para 10px, a regra de "concluído" ficou numa função só (`passosCompletos`), a prévia do avatar é liberada da memória e a ordem dos hooks em Traços foi corrigida.

- **Fases 2 e 3 — entregues em `/dev/forja`.**
  - Motor único (`_forja/useCriacao.ts`): o personagem em construção é um `DraftV12`, o mesmo rascunho do servidor, salvo sozinho quando a Forja abre numa mesa (debounce, fila, pausa em conflito, vindos do assistente anterior). O rascunho ganhou `forja` (passo exato e os textos da Forja); o assistente anterior ignora esse campo.
  - Pendências numa função pura (`src/lib/rulesetV12/pendencias.ts`), que alimenta a Sincronia, os losangos do menu e a Revisão; testada em `test:ruleset-v12-pendencias`.
  - Regras: Atributos por perfil da Classe (escolher o perfil já distribui; − e + trocam valores, a distribuição fica sempre válida), passo novo de Perícias, Qualidades = 3 e Complicações ≥ 2 (sem teto; Qualidades repetíveis podem ser compradas de novo), recursos e PA pelas fórmulas da Classe, magias pendentes, troca de Classe limpa perfis e Perícias com aviso.
  - Narrativa opcional também no servidor (`validation.ts`): Meio, Papel, Relação atual, transformação e RPI aceitam texto vazio. O banco já não exigia.
  - O quadro da placa mostra o Ranking (hoje sempre F).
  - ~~Em aberto para a Fase 4~~: resolvido abaixo.

- **Fase 4 — entregue na mesa.**
  - "Novo personagem" abre a Forja em tela cheia no lugar do assistente anterior (`AssistenteV12.tsx` removido). Selar cria o personagem (ou completa um existente), fecha a Forja e abre a ficha. O narrador marca "PN" na Revisão.
  - Avatar pelas regras do VTT: recorte quadrado (`JanelaRecorte`) e envio pelo mesmo fluxo da ficha, feito depois de Selar. Se o envio falhar, o personagem continua criado.
  - Tela de título: Continuar rascunho, Novo refratário (confirma antes de descartar), Voltar à mesa.
  - Atributos não dependem da Classe (os perfis são iguais em todas); trocar a Classe limpa só as Perícias. Sem recomendações por Classe.
  - Ideia geral, Aparência e "Como se tornou refratário" vão para `trajetoria` (`conceito`, `aparencia`, `relato_refratario`, opcionais) e aparecem na ficha, no bloco "História".
  - Sem região de campanha definida, a Forja pergunta "A campanha começa em" para dar o segundo idioma.
  - Correção paralela: perfis de Perícias iguais em todas as Classes (Abrangente 8/5/1, Padrão 5/4/2, Especializado 4/2/3), no repositório e no banco (`20261002130000_v12_perfis_pericias_corrigidos.sql`, aplicada).
  - **Em aberto:** páginas das Classes no Notion ainda com os números antigos; 1 personagem Âncora criado com o Especializado antigo.

## 6. Em espera

- **Ranking inicial da campanha:** o narrador poder começar a mesa acima do Ranking F. Precisa de uma opção na campanha, de passos extras na Forja (Subclasse, características por Ranking) ou de "criar em F e evoluir até o Ranking da mesa" reaproveitando a evolução v1.2, e de validação no servidor aceitando personagens criados acima de F. Depende de regras a definir.

- **Equipamento:** passo de compras com Ⱥ inicial.
- **Magias:** escolha na criação e o back correspondente, depois do capítulo de magias.
- **Imagens:** trocar as URLs do Unsplash por arquivos do repositório e remover os PNGs duplicados (`src/imports/` e `src/imports/regions/`).
