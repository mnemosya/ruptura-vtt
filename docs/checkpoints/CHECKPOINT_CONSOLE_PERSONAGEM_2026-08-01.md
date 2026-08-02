# Checkpoint — Console do Personagem (Tempo 1)

Data: 2026-08-01
Escopo: adaptação do wireframe do Console do Personagem para a rota
`/ficha`, substituindo o layout antigo da ficha.

---

## 1. Decisão de arquitetura

O wireframe **não pediu sistema novo** — pediu uma casca de
apresentação sobre um motor que já existia. A auditoria encontrou
~33k linhas em `src/lib/character` cobrindo quase tudo que o desenho
mostra, então a estratégia foi **trocar a carroceria sem tocar no
motor**:

- `CharacterSheetClient.tsx` (~5.7k linhas) **não foi reescrito**. O
  novo `ConsoleShell` envolve o mesmo estado e recebe o conteúdo das
  abas como `children` — cada aba continua exatamente como estava.
- O que mudou no client foi só a casca: o `<main style={{maxWidth:720}}>`
  e o `CharacterSheetTabs` viraram `ConsoleShell`; os banners viraram um
  slot, e `ActiveStateStrip` passou a viver no painel Condições.

Reescrever motor e carroceria juntos era o caminho caro e arriscado.

## 2. Custo real de backend: nenhum nesta fase

Personagem é **uma coluna `payload` JSONB única** (`storage.ts`, RPC
`update_character_sheet_payload`). Campo novo na ficha **não é migração
SQL** — é campo opcional no payload + `normalizeCharacter`.

O Tempo 1 não adicionou nenhum campo. Nada foi gravado.

## 3. Mapeamento wireframe → dado real

Bate quase 1:1 com o que já existia:

| Wireframe | Fonte |
|---|---|
| CORPO / MENTE / ÂNIMO | `atributos` |
| INTEGRIDADE | `recursos_atuais.integridade` + derivado |
| SOBRECARGA (3 slots) | `sobrecarga_usada_dia` + `MAX_OVERLOAD_SURGES_PER_DAY` |
| DESLOCAMENTO | derivados `andar_m` / `correr_m` |
| PA / REAÇÕES | `estado_jogo` + derivados |
| COLAPSO | `character.colapso` (`MAX_COLLAPSE_SEGMENTS`) |
| PV / PE / MANA | `recursos_atuais` + derivados |
| CONDIÇÕES | `condicoes_ativas` (via `ActiveStateStrip`) |

Duas escolhas deliberadas:

- **Colapso encostado em Recursos** — a regra dispara quando PV ou PE
  chega a 0, então a adjacência espacial comunica a mecânica. É assim no
  wireframe e foi mantido.
- **Camada temporária nas barras** — o modelo tem `pv_temporario` e
  `mana_temporaria`, que o wireframe não previa. Sem a faixa hachurada,
  o Console esconderia informação que o motor já mantém.

## 4. Paper doll: o único gap estrutural

O modelo atual é um enum plano, **sem região corporal**:

```
estado: "equipado" | "empunhado" | "acesso_rapido" | "mochila"
equipamentoSlot?: "armadura" | "escudo"   // só isso
```

`inventory.ts` já registrava isso: *"o projeto ainda não tem um modelo
de 'slot equipado' nem região corporal (PRD 13.7)"*.

`lib/character/equipmentSlots.ts` (`projectBodySlots`) resolve o Tempo 1
com uma **projeção de leitura pura**:

- `empunhado` → arma primária/secundária (ordem estável por
  `adquiridoEm`/`id`, **nunca** por índice de array — senão comprar
  qualquer item rebaixaria a arma primária sozinho)
- `equipadoDefensivo` + `equipamentoSlot` → tronco / escudo
- `acesso_rapido` → quick access #1/#2
- **cabeça, membro superior, membro inferior** → `supported: false`

Esses três aparecem tracejados e esmaecidos, escritos "indisponível" —
que é diferente de "vazio porque nada foi equipado". O Console diz a
verdade sobre o que o sistema ainda não sabe, em vez de inventar.

Itens vestidos que sobram (ex.: uma segunda armadura que não é a fonte
de MIT ativa) são reportados como "sem região corporal" em vez de
sumirem da tela.

Coberto por `scripts/test-equipment-slots.ts` (7 casos, `npm run
test:equipment-slots`), incluindo a estabilidade de ordem e a garantia
de que a projeção não muta o personagem.

---

## 5. Pendências

### 5.1 Ranking cobalto (badge "D")

O campo **não existe no modelo** — `grep` por `cobalto`/`ranking` não
retorna nada em `src/`. O badge renderiza `—` e nunca um valor
inventado.

Pendente de especificação da autora (declarado explicitamente: *"depois
especifico mais profundamente"*). Quando definido: campo opcional no
payload + `normalizeCharacter`, sem migração SQL.

### 5.2 `slotCorporal` — Tempo 2 do paper doll

Adicionar `slotCorporal?: "cabeca" | "tronco" | "membro_superior" |
"membro_inferior" | "arma_primaria" | "arma_secundaria" | "escudo" |
"acesso_rapido_1" | "acesso_rapido_2"` à instância do inventário.

Restrições obrigatórias:

- **Aditivo e opcional**; `normalizeCharacter` trata ausência.
- **NÃO substituir `estado`** — `attack.ts`, `defense.ts` e
  `ammunition.ts` leem esse campo. `slotCorporal` é refinamento, não
  troca.
- Qual item cabe em qual slot precisa vir do **DB**
  (`categoria`/`subtipo`), nunca de lista hardcoded. Precedente exato:
  `rune.slots_possiveis`. **Antes de implementar, auditar
  `db_equipamentos`**: se o dado não sustentar a regra, é Caso B → slot
  escolhido manualmente pelo jogador, sem validação inventada.

### 5.3 `pinned #1-3`

Não existe no payload. Os três slots renderizam vazios e rotulados, sem
simular conteúdo. Precisa de modelo (provavelmente referências a
ação/magia/item) antes de virar funcional.

### 5.4 Destinos órfãos (consequência direta das 6 abas) — PRIORITÁRIO

O Console renderiza exatamente as **seis abas do wireframe**: Perícias,
Magias, Mochila (`inventario`), Escalpos (`biblioteca` — é onde
`escalpos_instalados` é gerenciado hoje), Características (`talentos`) e
Ações.

Os outros sete destinos (Geral, Atributos, Recursos, Condições,
Rolagens, Log, Mesa) **deixaram de ser renderizados**. O código deles
NÃO foi apagado — ficou dormente no `CharacterSheetClient`, porque são
regras implementadas e testadas. Ficaram inalcançáveis pela UI:

- descanso curto / longo e restaurar recursos ao máximo
- surto de Sobrecarga e teste de Vontade
- avanço / estabilização / teste de Colapso
- resolução de Ruptura pendente
- adicionar e remover Condição, resolver testes de resistência
- usar / desfazer Reação, resetar reações
- PM e histórico de evolução (Modo Evolução)
- edição de atributos, perícias e recursos atuais
- console de Rolagens, Log e painel de Mesa / fim de rodada
- "Novo personagem" (dev: Personagens salvos, Debug)

**Salvar personagem** foi o único resgatado de imediato — saiu da aba
Geral para a barra de título, porque perder a persistência seria perda
de dado, não só de navegação.

Régua exata para reconectar: `npx tsc --noEmit --noUnusedLocals` lista
os **62 símbolos** hoje sem uso no client. Cada um precisa de um destino
definido (aba nova, painel do Console, modal) antes de a ficha voltar a
ser operacionalmente completa.

### 5.5 Estilo interno das abas

O conteúdo das abas manteve o estilo antigo (inline styles, botão verde
"Modo Jogo" etc.), que destoa da identidade HUD. Foi **deliberadamente
deixado fora do Tempo 1** — é o que permitiu não reescrever as ~5.7k
linhas do client de uma vez. Portar aba por aba é trabalho seguinte, e
pode ser incremental.

---

## 6. Arquivos

Novos:
- `src/app/_design/console.css` — terceira folha da linguagem HUD
  (prefixo `rc-`), mesmos tokens de `auth.css`/`app.css`
- `src/app/ficha/_console/ConsoleShell.tsx`
- `src/app/ficha/_console/VitalsColumn.tsx`
- `src/app/ficha/_console/ResourcesRow.tsx`
- `src/app/ficha/_console/PaperDoll.tsx`
- `src/app/ficha/_console/SkillsPanel.tsx`
- `src/lib/character/equipmentSlots.ts`
- `scripts/test-equipment-slots.ts`

Alterados:
- `src/app/dev/character-sheet/CharacterSheetClient.tsx` — só a casca
- `src/lib/character/index.ts` — export do módulo novo
- `package.json` — script de teste

## 7. Regra visual herdada

Vale registrar porque custou caro para descobrir: **superfície pode ser
translúcida; estado ativo é preenchimento sólido**. Gradiente
translúcido de alfa baixa sobre fundo escuro compõe para quase-cinza —
num console com dezenas de slots isso apagaria a leitura inteira. Todos
os estados ativos do `console.css` usam preenchimento opaco.
