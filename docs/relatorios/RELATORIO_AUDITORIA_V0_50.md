# Relatório de Auditoria — Ruptura VTT (v0.50)

**HEAD auditado:** `cfc9d22` (v0.50.2)
**Tipo:** Auditoria geral (sem implementação de novas features; código não alterado)

## 1. Metodologia

Cruzei o código (`src/lib`, `src/app`, migrations) contra: PRD consolidado (§0–13), `db_regras_personagem_v1_4`, `db_condicoes_v1_5`, `db_fluxo_combate_v1_1`, `db_acoes_combate_v1_1`, `db_equipamentos/magias/talentos`, e os relatórios `RELATORIO_MESAS_LOG_V0_1.md` e `RELATORIO_FICHA_MINIMA_V0_1.md`.

Baseline antes da auditoria: `tsc --noEmit` limpo, 9 suítes de teste puro verdes, working tree limpo.

Escopo respeitado: nenhuma alteração de código, migrations, RLS ou auth; nenhum valor de `.env.local` exposto; nenhum uso de service role no client.

## 2. Pontos corretos

- **Derivados** (`derived.ts`/`derived.fallback.ts`): PV=10+Corpo, PE=10+Mente, Mana/Integridade=10+(Ânimo×2), Reações=Mente, Andar=10+Corpo, Correr=2×Andar, PA=3 — batem com o DB e o PRD §10.1, e o fallback é idêntico à fórmula da Biblioteca.
- **Descanso** (`rest.ts`): curto=+floor(ManaMax/2); longo=PV+Corpo+2, PE+Mente+2, Mana→max, remove temporários, reseta Sobrecarga, nunca toca Integridade — fiel ao DB §descansos.
- **Sobrecarga** (`overload.ts`): 3/dia, 1d4 psíquico, 3º surto→Ruptura pendente + Vontade CD 7 (falha=Atordoado 1 rodada) — bate com `db_regras.sobrecarga`.
- **Ruptura** (`rupture.ts`): reduz Integridade pelo nível, +Ânimo+2 de Mana máx, Marca/Traço pendentes, Última Vontade a 0 — bate com `db_regras.ruptura`. Faixas de Integridade batem exatamente com `db_regras.integridade.faixas`.
- **Arquitetura data-driven** confirmada em ações, condições (formulário), talentos, itens, magias — todos consomem `content_documents`, sem catálogo manual.
- **Segurança**: nenhum uso de service role no client; `browserClient` só usa `NEXT_PUBLIC_*` anon; `.env.local` gitignored; nenhum segredo trackeado; `/ficha` usa RPCs security-definer, não as policies abertas.

## 3. Achados por severidade

### 🟠 A1 — Modificadores de condição hardcodados (data-driven parcial)

`activeEffects.ts` (v0.33) mantém `CONDITION_EFFECT_TEMPLATES` com os modificadores fixos no código, mas `db_condicoes_v1_5` **já traz** `payload_automacao.efeitos` estruturado (`modificador`/`alvo_tags`) para todas as 17 condições. Consequências:

- Viola o princípio §6 do PRD (o mais repetido do projeto) — editar o modificador de uma condição na Biblioteca **não** tem efeito na ficha.
- Divergência real: `ofuscado` no DB tem `-1 ofensiva/defensiva (quando dependem de visão)` que o código não aplica; `cego` no DB tem `+2 modificador_recebido` (ataques contra o cego) ausente. Ambos são condicionais que o modelo atual (sem alvo estruturado) não avalia, então dentro do escopo não causam número errado — mas o acoplamento hardcoded é o risco.

**Recomendação:** refatorar `deriveActiveEffectsFromConditions` para ler `alvo_tags`/`valor` do payload (mesmo mecanismo já usado em `talents.ts` v0.48). Não é fix pequeno/seguro — é refactor com testes; não alterei.

### 🟡 A2 — `FIM_DE_RODADA_SLUGS` duplicado e hardcoded

Em `ActiveStateStrip.tsx` e `endRound.ts` há um `Set(["queimando","sangrando",...])` fixo. O motor real (`endRoundConditions.ts`) é data-driven; esse set só alimenta um badge de "atenção" e o resumo de log. Baixa severidade, mas poderia derivar de "condições com efeito de fim de rodada no payload". Já documentado nos relatórios como "piso mínimo".

## 4. Riscos permanentes (documentados, não regressões)

- **RLS transitória aberta**: `characters` ainda tem `characters_dev_transition_{select,insert,update,delete}` para `anon` irrestrito (migration 0014, marcadas "MANTIDA"). Qualquer cliente anônimo pode ler/alterar qualquer personagem via caminho legado/dev. O caminho de produto (`/ficha`) não depende disso, mas **antes de expor a jogadores reais** essas policies precisam cair (condições de remoção já estão documentadas na própria migration). Mesmo padrão para `campaigns`/`table_logs` dev-anon.
- **Colapso incompleto** (`collapse.ts`, documentado): sem teste de fim de rodada automático, sem morte/coma no 3º segmento, avanço só manual. `db_regras.colapso` descreve o fluxo completo (teste corpo/mente <7, resultado 8 mantém, falha=morte/coma). Gap conhecido.
- **`custo_mana` placeholder**: maioria das magias tem `custo_mana: null` no DB — conjurar só desconta PA. Correto por decisão de PRD, mas Mana não é gasta de fato ainda.
- **Conteúdo pronto mas não exposto**: `listProperties`, `listRunes`, `listEscalpos`, `getMasterTables`, `getCombatField` existem e têm DB seedado, mas nenhuma UI consome — escopo futuro (propriedades em crítico, runas, escalpos, campo de combate).

## 5. Recomendações

- Priorizar **A1** antes de expandir automação de condições — quanto mais features dependerem dos modificadores, mais caro será desacoplar depois.
- `cron-secret.ts`: comparação com `===` (o próprio comentário sugere `crypto.timingSafeEqual`) — side-channel teórico só server-side; trocar quando conveniente.
- Antes de expor o produto a jogadores reais, remover as policies `*_dev_transition_*` de `characters`/`campaigns`/`table_logs`.

## 6. Conclusão

Nenhum bug crítico ou erro pequeno-e-seguro para corrigir agora — por isso não alterei código (conforme o escopo da auditoria). O projeto está fiel ao PRD e aos DBs nos números e no fluxo; os desvios são (A1) um acoplamento arquitetural que contradiz o próprio princípio data-driven do projeto, e riscos de RLS/escopo já conhecidos e documentados. A prioridade única de "dívida" é A1; o bloqueador para produção real é a RLS transitória.
