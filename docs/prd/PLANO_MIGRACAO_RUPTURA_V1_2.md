# Plano de migração — RUPTURA VTT para RUPTURA v1.2

**Status:** em implementação  
**Criado em:** 30/09/2026  
**Responsável editorial:** a definir  
**Responsável técnico:** a definir  
**Versão deste documento:** 0.4

## 1. Objetivo

Migrar o RUPTURA VTT para representar corretamente o domínio de RUPTURA v1.2 sem reescrever a infraestrutura madura do produto.

Ao final da migração:

- novos personagens serão criados exclusivamente pelas regras da v1.2;
- Classe, Subclasse, Ranking e Trajetória serão entidades estruturadas;
- a progressão deixará de usar PM e Talentos como fonte de verdade;
- rolagens, recursos, condições, ações e magias seguirão a v1.2;
- nenhum conteúdo legado será convertido por mera coincidência de nome.

## 2. Princípio de execução

Esta é uma **migração incremental da aplicação, com corte direto dos dados de personagem**, não uma reescrita.

Componentes que devem ser preservados e evoluídos:

- `content_documents` e o pipeline de publicação;
- `characters.payload`;
- biblioteca de itens;
- inventário por instância;
- runas e munição;
- logs e histórico;
- efeitos temporários;
- drafts de criação;
- controles de autorização;
- mesa e VTT;
- infraestrutura de Bando já usada pelo inventário.

Componentes cuja fonte de verdade precisa mudar:

- criação de personagem;
- progressão;
- Classe e Subclasse;
- Ranking;
- Trajetória;
- catálogo e resolução de magias;
- estados niveláveis de condições.

## 3. Fontes de verdade

### 3.1 Editorial

O Notion de RUPTURA v1.2 é a fonte canônica das regras e do texto editorial.

Página raiz:

- [RUPTURA (1.2)](https://app.notion.com/p/ggcardoso/RUPTURA-1-2-17f0a1363552827fab1601753924fb3a)

### 3.2 Aplicação

O VTT não deve consultar o Notion durante o jogo. O conteúdo utilizado pela aplicação deve ser:

1. extraído e revisado;
2. transformado em contratos canônicos;
3. validado pelo pipeline;
4. publicado no Supabase;
5. consumido pelo VTT com versão identificável.

### 3.3 Política de corte

Não há usuários externos nem personagens de produção que precisem ser preservados. Os personagens atuais são dados de desenvolvimento e podem ser apagados.

Consequências:

- não será construída uma camada de leitura para personagens v1;
- não será criado um conversor de personagens;
- não haverá modo legado na ficha;
- não será necessário manter campos antigos dentro do novo payload;
- drafts e personagens incompatíveis poderão ser apagados no corte para a v1.2;
- o sistema passará a aceitar apenas personagens `schema_version: 2` após o corte.

Ainda será feito um snapshot técnico antes de operações destrutivas, para diagnóstico e rollback da migration, não como compromisso de compatibilidade do produto.

## 4. Decisões arquiteturais iniciais

### 4.1 Personagem v2

Manter `characters.payload` e introduzir um payload versionado:

```ts
{
  schema_version: 2,
  ruleset_version: "1.2",

  identidade: {
    // dados pessoais e conceito
  },

  trajetoria: {
    regiao: string,
    idioma: string,
    antecedente_id: string,
    transformacao_refratario: string,
    rpi_forjado: string,
    codinome?: string,
    qualidades: string[],
    complicacoes: string[]
  },

  progressao: {
    classe_id: string,
    subclasse_id?: string,
    ranking: "F" | "E" | "D" | "C" | "B" | "A" | "S" | "S+",
    escolhas_por_ranking: Record<string, unknown>
  },

  magia: {
    vertente_primaria: string,
    niveis_vertente: Record<string, number>,
    magias_aprendidas: string[]
  }
}
```

O desenho definitivo deve ser fechado antes da migration. O exemplo acima registra a direção, não um contrato já aprovado.

### 4.2 Conteúdo canônico novo

Adicionar ao registro de conteúdo, no mínimo:

- `class`;
- `subclass`;
- `background`;
- `quality`;
- `complication`;
- características de Classe/Subclasse, como tipo próprio ou estrutura validada dentro dos registros anteriores.

Não criar uma tabela física para cada categoria sem evidência de necessidade. O modelo genérico existente é preferível.

### 4.3 Progressão

O Modo Evolução deve ser preservado como interface, mas seu contrato muda:

```text
estado atual + próximo Ranking
→ pacote de avanços permitido
→ escolhas obrigatórias
→ validação server-side
→ aplicação atômica
```

PM e Talentos antigos deixam de ser autoritativos na v1.2.

### 4.4 Conteúdo legado

O catálogo antigo não precisa continuar operacional depois que seu equivalente v1.2 estiver publicado. Talentos e magias antigas ainda precisam de análise editorial para orientar o novo catálogo, mas não para preservar personagens existentes.

## 5. Estratégia de entrega

O primeiro fluxo completo será uma **fatia vertical de uma única Classe**, preferencialmente Âncora, porque ela também exercita a inclusão da Perícia Medicina.

A fatia deve cobrir:

- Trajetória mínima;
- perfil de Atributos da Classe;
- perfil de Perícias da Classe;
- Atributo 0;
- Medicina;
- recursos derivados da Classe;
- Vertente Primária;
- Ranking F;
- equipamento inicial;
- persistência;
- abertura da ficha;
- rolagem no console e na mesa.

Somente depois de validar esse fluxo o contrato será generalizado para as 7 Classes e 24 Subclasses.

## 6. Fases

### Fase 0 — Congelamento e reconciliação

**Objetivo:** estabelecer uma base auditável antes de alterar domínio ou dados.

Entregáveis:

- [x] snapshot recuperável do banco (01/10/2026, antes do corte);
- [x] branch ou tag de início da migração;
- [x] execução do replay das migrations;
- [x] comparação do schema reconstruído com o schema remoto;
- [x] relatório de divergências;
- [x] inventário dos conteúdos legados que serão substituídos ou removidos (`docs/relatorios/INVENTARIO_LEGADO_V1_2_2026-10-01.md`);
- [x] conjunto inicial de critérios de aceite automatizados.

Estado em 01/10/2026: as 160 migrations replayam do zero em PostgreSQL Supabase 17.6 descartável. A comparação integral do catálogo (incluindo enums) ficou equivalente ao remoto depois da migration idempotente que reconcilia o texto de erro de `publish_content_draft`. As migrations e os seeds v1.2 aplicados ao remoto durante a sessão autônoma também estão representados no histórico.

Ferramentas já existentes:

- `npm run db:replay`;
- `npm run db:verificar-replay`;
- `npm run db:drift`.

Critério de saída:

- o schema remoto e o reconstruído estão equivalentes ou todas as divergências possuem decisão registrada.

**Resultado:** atendido em 01/10/2026. Snapshot recuperável e inventário para o corte continuam como pré-condições da Fase 7, não como bloqueio da implementação aditiva.

### Fase 1 — Fundação mecânica

**Objetivo:** corrigir regras centrais independentes do novo wizard.

Entregáveis:

- [x] Atributo positivo rola `Nd8` e usa o maior;
- [x] Atributo 0 rola `2d8` e usa o menor;
- [x] Atributo –1 rola `3d8` e usa o menor;
- [x] Atributo –N continua adicionando dados e usa o menor;
- [x] `rollPericia()` e `resolverPericia()` compartilham a mesma transformação;
- [x] console, defesa, ataque e dados físicos usam a mesma regra;
- [x] Reações passam a ser `Mente + 1`;
- [x] Medicina entra no catálogo, tipos, ficha, busca, validação e rolagem;
- [x] testes de regressão cobrem pools `3`, `1`, `0`, `–1` e `–2`.

Critério de saída:

- todas as superfícies de rolagem produzem a mesma resolução para os casos de ouro.

### Fase 2 — Contratos canônicos v1.2

**Objetivo:** representar o domínio novo antes de alterar a experiência.

Entregáveis:

- [x] contrato de Classe;
- [x] contrato de Subclasse;
- [x] contrato de características por Ranking;
- [x] contrato de Antecedente;
- [x] contrato de Qualidade;
- [x] contrato de Complicação;
- [ ] registro dos novos tipos no editor e pipeline;
- [x] validação de referências entre conteúdos;
- [x] validação contra registros incompletos;
- [x] esqueleto do payload `schema_version: 2`;
- [ ] leitura e validação exclusiva de personagens v2 após o corte.

Progresso do registro de tipos: `content_type`, o registro canônico e o contrato do seed já conhecem `class`, `subclass`, `background`, `quality` e `complication`. O seed publica `class` e `subclass` a partir de `content/v12/db_classe_ancora_v1_2.json` com `version = "1.2"` e valida o pacote inteiro com `validateRulesetContentBundleV12` antes de qualquer escrita; `npm run seed:content:dry` monta e valida sem tocar no banco. As fontes JSON de `background`, `quality` e `complication` estão em `content/v12/db_trajetoria_v1_2.json` e entram no seed. Continuam abertos os formulários do Editor Universal (os cinco tipos são somente leitura por enquanto). A migration `20261001024158_ruptura_v12_content_types.sql` foi aplicada no remoto e `class:ancora` e as três Subclasses estão publicadas.

Critério de saída:

- um pacote canônico v1.2 pode ser validado e publicado sem depender do wizard.

### Fase 3 — Fatia vertical da Âncora

**Objetivo:** provar o contrato de ponta a ponta.

Entregáveis:

- [x] conteúdo canônico da Classe Âncora;
- [x] seus perfis de Atributos e Perícias;
- [x] fórmulas próprias de PV, PE e Mana;
- [ ] equipamento e recursos iniciais;
- [ ] Vertente Primária e magias iniciais; Vertente Primária pronta; magias iniciais (4 de nível 1 da Vertente) dependem do catálogo v1.2 da Fase 6;
- [x] criação server-side válida;
  - Em implementação: `buildCharacterV2` (`src/lib/rulesetV12/creation.ts`) monta o payload v2 a partir das escolhas; a server action `createCharacterV2` chama a nova RPC `complete_character_creation_v2`, que revalida tudo no banco. A RPC passou em 13 cenários no remoto, dentro de uma transação abortada, e a migration `20261001033923_ruptura_v12_criacao_personagem.sql` foi aplicada no remoto em 01/10/2026. Antecedentes, Qualidades e Complicações estão publicados (`content/v12/db_trajetoria_v1_2.json`). As magias iniciais da Vertente Primária continuam indefinidas.
- [x] persistência e reabertura;
- [x] renderização correta na ficha;
  - Em implementação: a ficha e o HUD usam as fórmulas da Classe copiadas para `progressao.formulas_derivados` (DEC-003). A migration `20261001034830_ruptura_v12_formulas_classe.sql` foi aplicada no remoto em 01/10/2026.
- [x] rolagem integrada à mesa (motor verificado com o payload v2 salvo);
- [x] relatório dos ajustes necessários no contrato (`docs/relatorios/RELATORIO_FATIA_VERTICAL_ANCORA_2026-10-01.md`).

Progresso: `content/v12/db_classe_ancora_v1_2.json` contém a Classe e as Subclasses Coordenador, Terapeuta e Vitalista, extraídas do Notion (edição de 23/09/2026) e validadas por `npm run test:ruleset-v12-ancora`. O equipamento inicial registra Ⱥ 3.000 e Mochila de 10 espaços; os pacotes recomendados continuam placeholders no Notion e nenhum item foi inferido. O arquivo ainda não entra no seed, porque o registro no pipeline (Fase 2) segue aberto.

Critério de saída:

- é possível criar e jogar uma Âncora de Ranking F sem usar point-buy, Talento inicial ou PM.

### Fase 4 — Classes, Subclasses e Ranking

**Objetivo:** generalizar a fatia validada para todo o domínio de personagem.

Entregáveis:

- [x] 7 Classes publicadas;
- [x] 24 Subclasses publicadas;
- [x] Ranking F completo (as 7 Classes são criáveis pela tela e pela RPC);
- [x] Subclasse obrigatória no Ranking E;
- [x] avanços de D, C, B, A, S e S+ (magias concedidas ficam pendentes até o catálogo v1.2);
- [x] PA igual a 4 no C e 5 no S;
- [x] recursos derivados dependentes da Classe (DEC-003);
- [x] progressão server-side atômica: `advance_character_ranking_v2` revalida no banco o salto de um Ranking e a RPC de ficha preserva a progressão para o jogador;
- [x] Modo Evolução orientado pelo próximo Ranking (personagens v1.2);
- [x] PM e Talentos deixam de ser fonte de verdade para v2 (o payload v2 não os tem, a RPC rejeita Talentos e o Modo Evolução livre não aparece para v1.2).

Critério de saída:

- cada Classe pode ser criada no Ranking F e evoluída até S+ conforme seu pacote autorizado.

### Fase 5 — Novo wizard

**Objetivo:** substituir a criação antiga pela sequência canônica.

Fluxo:

```text
Conceito → Trajetória → Classe → Revisão → Bando
```

Implementado como Conceito → Trajetória → Classe → Equipamento → Revisão (`AssistenteV12`); o Bando é a Fase 8. A criação anterior segue disponível em "Regras anteriores" até o corte da Fase 7.

Entregáveis:

- [x] remoção do point-buy genérico do fluxo v1.2;
- [x] remoção do orçamento genérico de 25 Perícias;
- [x] remoção dos 3 pontos livres de Vertente;
- [x] remoção de Talento inicial;
- [x] equipamento e aretz definidos pela Classe (somados ao bônus de Recursos);
- [x] retomada de draft compatível com o schema v2;
- [x] revisão final mostra todas as escolhas e pendências;
- [x] servidor recalcula e valida o payload enviado pelo cliente (o cliente envia escolhas; servidor e RPC validam).

Critério de saída:

- o wizard não consegue produzir um personagem que viole o contrato da Classe.

### Fase 6 — Condições, combate e magias

**Objetivo:** completar os sistemas mais acoplados à ficha e ao jogo.

Condições e combate:

- [x] 18 condições canônicas (`content/db_condicoes_normalizado_v1_5.json`, gerado por `scripts/dev/v12/gerar_condicoes.mjs`);
- [x] inclusão de `Oculto` (a relação por observador é só texto até o VTT ter percepção por criatura);
- [x] estado persistente de nível (`nivel`/`nivelMaximo` na condição ativa; nova aplicação agrava até o limite);
- [x] transições de Contundido, Envenenado, Lento, Ofuscado, Queimando, Sangrando e Sufocando (fratura do Contundido só sinalizada; deslocamento do Lento ainda não é aplicado ao movimento);
- [x] ação Esconder-se (no catálogo; teste por observador e Oculto relativo ficam manuais até a aba de ações);
- [x] ação Ataque Secundário (no catálogo; 1/rodada após Atacar com arma leve, resolução manual até a aba de ações);
- [x] Acessar Trama por 1 PA;
- [x] Interagir reduz um nível de Queimando e contém Sangrando (opções da própria Interagir; Apagar fogo arquivada);
- [x] revisão da equivalência das demais ações (tabela no registro de 01/10/2026);

Magias:

> **Fonte canônica (decisão de 01/10/2026):** as magias v1.2 vêm da lista de magias no capítulo de cada Vertente, no Notion. O banco "BANCO DE MAGIAS" está desatualizado e não deve ser usado. Magias e equipamentos ficam em espera até o conteúdo estabilizar.

- [ ] crosswalk de todas as entradas v1.2; o rascunho `content/v12/crosswalk_magias_v1_3_para_v1_2.json` foi gerado a partir do BANCO DE MAGIAS e está **obsoleto**; refazer a partir dos capítulos;
- [ ] classificação `same`, `renamed`, `redesigned`, `removed` ou `ambiguous`; hoje as 132 legadas estão como `ambiguous` (60 com homônima na mesma Vertente, 72 sem), aguardando revisão editorial;
- [ ] schema de Mana fixa, intervalo, escolha e fórmula; os metadados já distinguem fixo (208), intervalo (1) e variável (2), sem contrato TypeScript ainda;
- [ ] schema de tempo de conjuração; os metadados já distinguem PA (190), Reação (9), tempo (11) e variável (1);
- [ ] interface para custos escolhidos/variáveis;
- [x] alias temporário `somatica → biotica` (`canonicalVertenteId` em `src/lib/character/spells.ts`: nível de Vertente, filtros e rótulos do painel de Magias);
- [ ] backfill dos IDs persistidos;
- [ ] Fusão global desativada ou sustentada por regra canônica documentada.

Progresso (01/10/2026, **obsoleto**: fonte errada): `content/v12/db_magias_v1_2_metadados.json` traz as 211 magias do BANCO DE MAGIAS do Notion (só propriedades: nível, Mana, conjuração, alcance, duração, pré-requisito, teste), geradas por `scripts/dev/v12/gerar_magias.py` e checadas por `npm run test:ruleset-v12-magias`. Todas estão como Rascunho ou Em revisão no Notion, então nada foi publicado e o texto das magias não foi extraído. Toda Vertente tem ao menos quatro magias de nível 1, o que basta para a escolha inicial quando o catálogo for aprovado.

Critério de saída:

- nenhuma magia de custo variável é tratada como custo desconhecido igual a zero.

### Fase 7 — Corte de dados para v1.2

**Objetivo:** remover dados de desenvolvimento incompatíveis e ativar o novo contrato como única fonte de verdade.

Entregáveis:

- [x] snapshot técnico anterior ao corte (`pg_dump` completo em 01/10/2026, guardado fora do repositório, restauração testada);
- [x] script explícito para apagar personagens e drafts incompatíveis: `scripts/dev/v12/corte_fase7.mjs` (só conta por padrão; `--testar` ensaia e desfaz; `--executar` exige `--snapshot=<ref>`). Remove também os tokens dos personagens v1 (decisão de 01/10/2026). Ensaio no remoto em 01/10/2026, desfeito: 121 personagens, 46 tokens e 2 rascunhos; v2 intactos;
- [ ] remoção ou arquivamento dos documentos de conteúdo obsoletos;
- [ ] substituição de `somatica` por `biotica` no conteúdo canônico;
- [ ] remoção dos caminhos de criação, progressão e leitura v1; criação v1 encerrada em 01/10/2026 (assistente anterior removido; "+ Personagem"/PN agora criam v1.2 pendente). Falta a leitura v1 e o Modo Evolução v1 (PM e Talentos);
- [ ] seed mínimo de dados v1.2 para desenvolvimento;
- [x] verificações pós-corte (do script, mais a mesa abrindo sem erro só com a Hilda);
- [x] registro das contagens removidas e criadas (abaixo, 01/10/2026).

Critério de saída:

- a aplicação opera apenas com personagens e conteúdo canônico v1.2, sem caminhos silenciosos para o modelo anterior.

### Fase 8 — Bando

**Objetivo:** transformar Bando em ficha coletiva, preservando o inventário existente.

Entregáveis:

- [x] Nome;
- [x] Símbolo;
- [x] Princípio;
- [x] Contato;
- [x] Inimigo ou dívida;
- [x] QG;
- [x] Cobalto;
- [x] Ranking;
- [x] Exposição;
- [x] Alerta Imperial;
- [ ] transferência bidirecional entre personagem e Bando;
- [x] persistência isolada (decisão de 01/10/2026: tabela própria `campaign_crews`, 1:1 com a campanha);

Opções comparadas em `docs/relatorios/BANDO_V1_2_OPCOES_ARMAZENAMENTO.md`; decidido: tabela própria.

Critério de saída:

- a ficha coletiva persiste todos os campos canônicos e integra o inventário compartilhado.

### Fase 9 — Paridade ampliada

**Objetivo:** cobrir sistemas que não bloqueiam a primeira ficha v1.2, mas bloqueiam a paridade integral.

- [ ] Investigação; transcrita (`content/v12/db_investigacao_v1_2.json`, rascunho) e motor do Desafio de Acesso pronto (`src/lib/rulesetV12/accessChallenge.ts`); falta interface na mesa e decisão de `content_type`;
- [ ] Conflitos Sociais; transcrito (`content/v12/db_conflitos_sociais_v1_2.json`, rascunho); é quase só orientação ao narrador, sem automação prevista;
- [ ] Ameaças e Antagonistas (em espera: conteúdo em edição);
- [ ] integração das características de Classe dependentes desses subsistemas; mapeadas no inventário (Perito: Dossiê/Pistas; Face: Manobras Sociais, Reserva de Confiança; Ícone: Movimento). Decidido em 01/10/2026: Pista ≠ Evidência e Teste de Interação ≠ teste social; são mecânicas próprias das Classes.

### Fase 10 — Limpeza final do legado

**Objetivo:** remover código e conteúdo antigo que já não participam do fluxo v1.2.

Pré-condições:

- [ ] PM não participa de nenhum fluxo v1.2;
- [ ] Talentos antigos não participam de nenhum fluxo v1.2;
- [ ] nenhum conteúdo depende do ID `somatica`;
- [ ] nenhuma ficha depende do catálogo antigo de magias;
- [ ] nenhuma condição depende do schema booleano antigo;
- [ ] buscas, testes e validadores confirmam ausência de referências;
- [ ] plano de rollback está documentado.

## 7. Manifestos obrigatórios

### 7.1 Talentos antigos

```text
legacy_talent
→ current_class
→ current_subclass
→ feature/ranking
→ status
→ confidence
→ migration_strategy
```

Igualdade de nome nunca basta para mapear automaticamente conteúdo antigo para o catálogo novo.

### 7.2 Magias

```text
legacy_slug
canonical_slug
status: same | renamed | redesigned | removed | ambiguous
migration_strategy
editorial_notes
```

## 8. Critérios globais de aceite

- [x] Atributo 0 rola 2d8 e usa o menor.
- [x] Atributo –1 rola 3d8 e usa o menor.
- [x] As 7 Classes podem ser criadas no Ranking F.
- [x] Classe define Atributos, Perícias, recursos e equipamento inicial (pacotes de equipamento ainda são placeholders editoriais).
- [x] Reações são `Mente + 1`.
- [x] Medicina pode ser selecionada e rolada.
- [x] Ranking E exige uma Subclasse.
- [ ] Todos os Rankings aplicam exatamente seus avanços.
- [x] PA passa para 4 no C e 5 no S.
- [x] As 18 condições existem.
- [x] Condições niveláveis possuem estado e transições reais.
- [x] Oculto está disponível.
- [x] Esconder-se e Ataque Secundário estão disponíveis (no catálogo).
- [x] Acessar Trama custa 1 PA.
- [ ] Toda magia v1.2 está classificada no crosswalk.
- [ ] Custos variáveis não são interpretados como zero.
- [ ] Biótica não depende permanentemente do ID `somatica`.
- [ ] A aplicação rejeita payloads de personagem anteriores ao schema v2.
- [x] O Bando persiste todos os campos canônicos.
- [x] O replay das migrations produz schema equivalente ao remoto.
- [ ] Conteúdo legado não é usado silenciosamente como fonte de verdade.

## 9. Regras de segurança da migração

1. Nenhuma alteração destrutiva antes de snapshot e verificação de restauração.
2. O alvo exato de toda exclusão deve ser validado antes da execução.
3. Todo novo payload possui `schema_version` e `ruleset_version`.
4. Toda validação relevante também existe no servidor.
5. Toda migration destrutiva produz contagens anteriores e posteriores.
6. Toda regra editorial ambígua permanece marcada como ambígua.
7. Saturado e Insaturado não serão “resolvidos” pelo VTT enquanto o cânone estiver editorialmente pendente.

## 10. Organização do trabalho

### 10.1 Unidade de entrega

Cada PR deve conter:

- problema canônico atendido;
- escopo deliberadamente excluído;
- contrato ou migration afetada;
- testes adicionados ou atualizados;
- impacto sobre dados de desenvolvimento existentes;
- necessidade de conteúdo editorial;
- plano de rollback quando houver dados envolvidos.

### 10.2 Estados do backlog

Usar os seguintes estados:

- `Não iniciado`;
- `Em descoberta`;
- `Contrato em revisão`;
- `Pronto para implementar`;
- `Em implementação`;
- `Em validação`;
- `Bloqueado por decisão editorial`;
- `Concluído`.

### 10.3 Registro de decisão

Toda decisão relevante deve ser adicionada ao fim deste documento:

```text
DEC-XXX — Título
Data:
Status: proposta | aceita | substituída
Contexto:
Decisão:
Consequências:
Responsáveis:
```

## 11. Próxima entrega recomendada

### Marco Zero + Fundação mecânica

Ordem:

1. reconciliar migrations e banco;
2. registrar os testes canônicos de rolagem;
3. corrigir o motor para Atributo 0/negativo;
4. corrigir Reações;
5. adicionar Medicina;
6. preparar o esqueleto de `schema_version: 2`; **concluído**
7. publicar um relatório curto com os achados comprovados no código. **concluído**

Essa entrega deve terminar antes da implementação do novo wizard.

## 12. Questões abertas

- [ ] Quem aprova equivalências editoriais de Talentos, Subclasses e magias?
- [x] Âncora será confirmada como primeira Classe da fatia vertical? Sim, conteúdo iniciado em 30/09/2026.
- [x] Características de Classe/Subclasse serão registros próprios ou estruturas internas versionadas? Resolvida pela DEC-002.
- [ ] Qual será a política para magias redesenhadas já aprendidas?
- [ ] O estado do Bando ficará em entidade 1:1 própria ou no payload de campanha?
- [ ] Em qual marco ocorrerá o corte e a exclusão dos personagens/drafts v1?

## 13. Registro de decisões

### DEC-001 — Corte direto dos personagens anteriores à v1.2

**Data:** 30/09/2026  
**Status:** aceita

**Contexto:** o VTT ainda não possui usuários externos. Os personagens existentes foram criados apenas pelo autor e por automações usadas durante o desenvolvimento.

**Decisão:** personagens e drafts incompatíveis poderão ser apagados no corte para a v1.2. Não será implementada compatibilidade de leitura, modo legado ou conversão de personagens v1.

**Consequências:** o desenho do schema v2, da ficha, do wizard e da progressão pode ser feito sem campos transitórios para personagens antigos. Operações destrutivas ainda exigem snapshot técnico, alvo validado e contagens antes/depois.

### DEC-002 — Características permanecem dentro de Classe e Subclasse

**Data:** 30/09/2026  
**Status:** aceita

**Contexto:** a v1.2 concede Características de Classe apenas em F, D, B e S e Características de Subclasse apenas em E, C e A. Elas não possuem identidade independente no fluxo de criação ou progressão.

**Decisão:** características serão estruturas versionadas dentro dos documentos `class` e `subclass`, e não um sexto `content_type`.

**Consequências:** referências e validação ficam locais à entidade que concede a característica; se uma característica passar a ser compartilhada entre Classes no futuro, a decisão poderá ser revista com uma migration explícita.

### DEC-003 — Fórmulas de recursos copiadas da Classe para o personagem

**Data:** 01/10/2026  
**Status:** proposta

**Contexto:** cada Classe v1.2 tem fórmulas próprias de PV, PE, Mana, Integridade, Reações e Deslocamento, e o PA depende do Ranking. A ficha calcula os máximos em cerca de 25 pontos do código a partir dos atributos e das regras gerais, e o HUD do mapa calcula em SQL a partir do payload do personagem, sem acesso à campanha nem à Classe.

**Decisão:** na criação, as fórmulas da Classe e o PA do Ranking são copiados para `progressao.formulas_derivados`, junto com o texto editorial em `progressao.formulas_derivados_texto`. A RPC de criação confere a cópia contra o documento `class` publicado. `computeDerivedStats` e `vtt_hud_derived` usam essas fórmulas antes das regras gerais; nós malformados ou com referência a outro derivado são ignorados.

**Consequências:** a ficha e o HUD não precisam buscar a Classe a cada cálculo. Uma correção editorial nas fórmulas de uma Classe exige atualizar os personagens existentes (backfill), e a progressão de Ranking precisa regravar o PA. O jogador já pode editar o payload pela ficha, incluindo atributos; a cópia não amplia esse risco.

**Responsáveis:** a definir.

## 14. Registro de execução

### 30/09/2026 — Fundação mecânica

- motor central atualizado para pools positivos, zero e negativos;
- rolador físico e validação server-side usam a mesma definição de pool;
- feed registra e exibe se o maior ou o menor dado decidiu;
- Reações corrigidas para `Mente + 1` no conteúdo, fallback TypeScript e fallback SQL preparado;
- Medicina completada nos enums, schemas, serialização de efeitos e ícones;
- testes de dados, Reações, feed e validação de conteúdo aprovados;
- baseline de drift encontrou 10 falsos positivos causados pela migration dinâmica 0155; o verificador foi corrigido e agora aponta apenas a migration v1.2 ainda não aplicada no remoto.

### 30/09/2026 — Contratos canônicos iniciais

- o Notion v1.2 foi consultado diretamente para criação, Trajetória, Classes, Âncora e progressão;
- a tag local `ruptura-v1.2-migration-start` foi criada sobre o baseline `0505f20`;
- contratos adicionados para Classe, Subclasse, Antecedente, Qualidade, Complicação e personagem `schema_version: 2`;
- validadores rejeitam registros incompletos, distribuições inválidas, Rankings incorretos e orçamentos de Trajetória diferentes de 3/2;
- validação de pacote detecta slugs duplicados, Subclasses ausentes e vínculo incoerente entre Classe e Subclasse;
- migration local preparada para os cinco novos valores de `content_type`;
- build, typecheck e testes do contrato aprovados;
- o primeiro replay ficou bloqueado pelo engine do Docker Desktop; em 01/10/2026 foi concluído em um PostgreSQL Supabase descartável, com catálogo equivalente ao remoto após reconciliação idempotente de uma mensagem de erro.

### 30/09/2026 — Conteúdo canônico da Âncora

- Classe Âncora e Subclasses Coordenador, Terapeuta e Vitalista transcritas do Notion para `content/v12/db_classe_ancora_v1_2.json`;
- recursos (PV, PE, Mana, Andar, Correr, Reações, Integridade), perfis de Atributos e Perícias, sinergia das Vertentes e Focos/Intervenções por Ranking estruturados;
- aumentos de limite de Focos do Coordenador registrados como efeito `recurso_classe`;
- teste dedicado verifica o contrato, as perícias do catálogo (incluindo Medicina), os totais dos perfis, as fórmulas e o ID `biotica`;
- pendência editorial: pacotes de equipamento recomendados.

### 30/09/2026 — Seed de Classe e Subclasse

- `scripts/seed-content.ts` passou a incluir `class` e `subclass` do pacote da Âncora, com versão fixa `1.2`;
- pacotes v1.2 são validados (contrato e referências Classe↔Subclasse) antes de qualquer escrita; um pacote inválido aborta o seed sem publicar nada;
- novo modo `SEED_DRY_RUN=1` (`npm run seed:content:dry`): 454 documentos montados, incluindo `class:ancora` e as três Subclasses;
- com credenciais, o dry-run também compara com o banco (somente leitura) e lista o que seria criado ou atualizado.

### 01/10/2026 — Publicação no remoto

- migrations aplicadas no Supabase remoto: `ruptura_v12_content_types` (versão `20261001024158`) e `ruptura_v12_reacoes` (versão `20261001024345`); os arquivos locais foram renomeados para essas versões;
- seed executado: created=4 (`class:ancora`, `subclass:coordenador`, `subclass:terapeuta`, `subclass:vitalista`), updated=2 (`character_rule:regras_personagem`, `combat_flow:fluxo_combate`, com Reações `Mente + 1`, Medicina e pool de d8), sem mudança=448; total de 450 para 454 documentos;
- verificação: novo dry-run sem diferenças, `db:drift` com 184/184 funções equivalentes e `vtt_hud_derived` retornando 3 Reações para Mente 2 pelo documento e pelo fallback;
- operação não destrutiva (adição de valores de enum, `create or replace` de função e upserts com changelog); o snapshot da Fase 0 continua pendente.

### 01/10/2026 — Criação server-side da Âncora

- `buildCharacterV2` valida perfil e permutação de Atributos, perfil e listas de Perícias, Vertente Primária e compras contra o documento `class`, e monta recursos, perícias, carteira e inventário no servidor;
- `createCharacterV2` (server action) busca Classe, regras e preços publicados e chama `complete_character_creation_v2`;
- a RPC repete as checagens no banco (um participante pode chamá-la diretamente) e também valida a Trajetória contra documentos publicados e os orçamentos 3/2;
- `npm run test:ruleset-v12-criacao` cobre o caso válido e 11 casos hostis; no remoto, a RPC aceitou o payload válido e rejeitou 12 adulterações, numa transação desfeita ao final;
- decisões provisórias: magias iniciais rejeitadas até a regra ser estruturada; nenhum limite de raridade de item (a regra v1.2 não o define); recursos máximos da ficha ainda vêm de `character_rule`, não das fórmulas da Classe.

### 01/10/2026 — Trajetória transcrita

- 15 Antecedentes, 24 Qualidades e 28 Complicações transcritos do capítulo 8 do Notion (edição de 30/09/2026) para `content/v12/db_trajetoria_v1_2.json`;
- Regiões de origem ficaram como constante (`REGIOES_V12`), não como `content_type`: o capítulo diz que não são personalizáveis;
- Qualidades repetíveis marcadas conforme o texto (Boa Reputação, Contato e Credencial); Recursos recebeu o efeito `aretz_inicial_adicional` (Ⱥ 1.500 ou Ⱥ 3.000);
- regras ajustadas ao texto canônico: Complicações somam ao menos 2 pontos (adicionais permitidas por acordo do grupo); custo de cada opção restrito a `custos_permitidos`; repetição só em opções repetíveis; região dentro das cinco do Império;
- `buildCharacterV2` e a RPC aplicam essas regras e o bônus de Recursos na carteira; na RPC, 10 novos cenários foram testados no remoto em transação desfeita;
- o dry-run do seed monta 67 documentos novos e nenhuma alteração nos existentes; nada foi publicado.

### 01/10/2026 — Criação v1.2 publicada no remoto

- migration `ruptura_v12_criacao_personagem` aplicada (versão `20261001033923`); arquivo local renomeado para essa versão;
- seed: created=67 (15 `background`, 24 `quality`, 28 `complication`), updated=0, sem mudança=454; total de 521 documentos;
- verificação: dry-run sem diferenças; `db:drift` com 185/185 funções equivalentes; `anon` sem permissão de executar a RPC;
- prova de ponta a ponta com o conteúdo publicado, como participante real e em transação desfeita: Âncora Concentrada criada com PV 10, PE 15, Mana 16, Integridade 14 e Ⱥ 3.900 (Recursos 1 = Ⱥ 4.500, menos 3 Medkits); replay com o mesmo `creationRequestId` devolveu o mesmo personagem;
- ainda falta interface: nenhuma tela chama `createCharacterV2`.

### 01/10/2026 — Ficha usando as fórmulas da Classe

- `buildCharacterV2` grava em `progressao` as fórmulas de recurso da Classe e o PA do Ranking F (DEC-003);
- `computeDerivedStats` recebe as fórmulas do personagem como 4º parâmetro; os pontos de chamada da ficha, mesa, painel, HUD, fim de rodada e transferência de tripulação passam a usá-las; a aba de Recursos mostra o texto da Classe ("13 + Mente");
- migration `20261001034830_ruptura_v12_formulas_classe.sql` (aplicada no remoto): `vtt_hud_derived` lê as fórmulas do personagem; a RPC de criação confere a cópia contra a Classe;
- no remoto, em transação desfeita: HUD e ficha calcularam os mesmos máximos (PV 10, PE 15, Mana 16, Reações 3, PA 3); fórmula de PV forjada e cópia ausente foram rejeitadas;
- personagens sem `formulas_derivados` continuam usando as regras gerais.

### 01/10/2026 — Tela de criação v1.2

- `AssistenteV12` (Conceito → Trajetória → Classe → Equipamento → Revisão) na janela Novo personagem, aberta pelo novo botão "Criar com assistente" da aba Personagens; a criação anterior continua disponível em "Regras anteriores" até o corte;
- a tela envia só escolhas (`criarPersonagemV12Action`); a server action passou a usar o conteúdo efetivo da campanha, como a RPC;
- botões com `aria-pressed` ganharam o estilo de selecionado em `mesa.css`;
- validado no navegador: Hilda Norren (Âncora Equilibrada, Biótica, Recursos 1, dois Contatos, Dívida e Fobia, 3 Medkits) criada na campanha 12312321 (`e434866f-ec73-4c2c-b685-76dad1855f84`); a ficha abriu com PV 11, PE 15, Mana 14, Integridade 12, PA 3, Reações 3 e Deslocamento 11/22 m, e o registro tem Ⱥ 3.900 e 1 item;
- limitação vista no teste: sem rascunho v1.2, uma remontagem da janela (ex.: recarga do servidor de desenvolvimento) perde o que foi preenchido (resolvida a seguir).

### 01/10/2026 — Rascunho da criação v1.2

- rascunho salvo na mesma tabela e RPC do assistente anterior (`character_creation_drafts`, `save_character_creation_draft`), com `schema_version: 2`; nenhuma migration nova;
- `parseDraftV12` valida o formato com limites de tamanho; `sanitizeDraftV12` ajusta o rascunho ao conteúdo publicado ao restaurar e conta as escolhas descartadas;
- o assistente salva sozinho (800 ms de debounce, troca de etapa e fechamento da janela), compara com o último conteúdo salvo para não gravar só por abrir, pausa em conflito de revisão e oferece "Salvar e sair" e "Cancelar criação";
- cada assistente trata o rascunho do outro como formato incompatível e oferece descartar;
- validado no navegador: gravação (revisões 1 a 4), mudança feita logo antes de fechar a janela preservada, restauração na mesma etapa, abertura sem gravação, troca de etapa salvando e cancelamento apagando o rascunho;
- `npm run test:ruleset-v12-rascunho` cobre o formato, a separação v1/v2 e a restauração com conteúdo alterado.

### 01/10/2026 — Sete Classes e 24 Subclasses (Fase 4)

- Vanguarda, Técnico, Infiltrador, Combatente, Caçador e Face transcritos do Notion; Âncora já existia;
- extrator `scripts/dev/v12/extrair_classe.py` monta o pacote a partir do texto limpo da página (`limpar_notion.py`); os textos-fonte ficam em `scripts/dev/v12/fontes/` e `gerar_classes.sh` regenera os pacotes de forma idêntica;
- contrato: Classe passa a aceitar **várias características por Ranking** (o Técnico concede três no D e quatro no B); o validador rejeita slugs de característica duplicados na Classe;
- recursos próprios de cada Classe na progressão: Focos/Intervenções (Âncora), limite de Ímpeto (Vanguarda), Unidades ativas (Técnico), limite de Brechas (Infiltrador), Dados de Manobra e Manobras conhecidas (Combatente), capacidade da Reserva e Preparos (Caçador), Reserva de Confiança (Face);
- `npm run test:ruleset-v12-classes`: contrato, catálogo de perícias, sinergia, slugs únicos entre pacotes e criação de um personagem por Classe e perfil;
- seed: 27 documentos criados (6 Classes, 21 Subclasses) e `class:ancora` atualizada para o novo formato de características; total de 548 documentos;
- no remoto, em transação desfeita, a RPC criou um personagem de cada uma das 7 Classes com as fórmulas próprias;
- pendências editoriais registradas nos pacotes: pacotes de equipamento (todas as Classes) e a nota "REVISAR O DANO DE SANGRANDO" no Ranking C do Assassino.

### 01/10/2026 — Avanço de Ranking (Fase 4)

- `src/lib/rulesetV12/progression.ts`: pacote do próximo Ranking, validação das escolhas (Subclasse no E, pontos e limite de Perícia, Atributo até 5, Vertente até o nível 5) e aplicação; PA atualizado na fórmula copiada (DEC-003);
- magias concedidas (nível de Vertente na criação e na progressão, magia adicional em D/B/S) ficam em `magia.escolhas_pendentes` até o catálogo v1.2; recursos atuais não mudam no avanço (os máximos são recalculados);
- `evolucaoV12Actions.ts`: lê o pacote e aplica o avanço no servidor a partir das escolhas, recarregando personagem e Classe efetiva; grava por `update_character_sheet_payload`;
- console: para personagens v1.2, o chip "Ranking X" substitui o Modo Evolução livre e abre o modal de avanço;
- `npm run test:ruleset-v12-progressao`: Âncora de F a S+ e casos inválidos;
- validado no navegador: Hilda Norren avançou de F para E (Vitalista, Luta +1, Vigor +1, Cinética); banco e ficha conferidos;
- limitação: `update_character_sheet_payload` aceita o payload completo do controlador, então um jogador ainda poderia alterar Ranking e escolhas por fora da tela. Fechar isso exige uma RPC de avanço e proteger `progressao` na RPC de ficha, decisão registrada no relatório.

### 01/10/2026 — Metadados e crosswalk das magias (Fase 6, rascunho)

- 211 magias lidas do BANCO DE MAGIAS do Notion (Biótica 41, Material 38, Cognitiva 36, Energética 36, Cinética 30, Sináptica 30); todas em Rascunho ou Em revisão;
- `content/v12/db_magias_v1_2_metadados.json`: nível, Mana estruturada (fixa, intervalo "3–6", variável), conjuração (PA, Reação, tempo), alcance, duração, pré-requisito de perícia, teste e link da página; nada entra no seed;
- `content/v12/crosswalk_magias_v1_3_para_v1_2.json` e `docs/relatorios/CROSSWALK_MAGIAS_V1_2_RASCUNHO.md`: as 132 magias legadas com candidato por nome (60) ou sem correspondência (72), todas `ambiguous`, mais as 151 magias v1.2 sem antecessor por nome; `somatica` é comparada com `biotica`;
- `npm run test:ruleset-v12-magias`: slugs únicos, Vertentes válidas, perícias de pré-requisito no catálogo, ao menos quatro magias de nível 1 por Vertente e cobertura completa do crosswalk;
- pendente de decisão: aprovação editorial do catálogo, a classificação de cada linha e a extração do texto das magias.

### 01/10/2026 — Proteção do Ranking (Fase 4)

- migration `20261001120000_ruptura_v12_protecao_ranking.sql`, aplicada no remoto em 01/10/2026;
- nova RPC `advance_character_ranking_v2`, chamada pela action de avanço. Ela confere no banco:
  - que o novo Ranking é exatamente o seguinte ao persistido (envio duplicado falha);
  - Subclasse publicada da Classe no E e fixa depois;
  - pontos de Atributo (até 5), Perícia (dentro do limite) e Vertente (até 5);
  - PA do Ranking, fórmulas da Classe intactas e magias pendentes acrescentadas sem apagar as anteriores;
  - grava só os campos de progressão sobre o payload persistido;
- `update_character_sheet_payload`: para personagens v1.2 e jogador controlador, `schema_version`, `ruleset_version`, `progressao`, `trajetoria`, `atributos`, `pericias`, `niveis_vertente` e `magia.vertente_primaria`/`niveis_vertente`/`escolhas_pendentes` voltam ao valor persistido. O narrador continua editando tudo. Um salvamento atrasado da ficha deixa de desfazer um avanço;
- `scripts/dev/v12/testar_rpc_avanco.ts`: 15 cenários no remoto em transação desfeita (jogador, narrador, estranho, avanço válido, duplicado, salto, pontos a mais, PA, Subclasse, fórmulas, pendências, F→E com Subclasse).

### 01/10/2026 — Condições v1.2 (Fase 6)

- iniciado no Codex e concluído aqui;
- 18 condições, com Oculto. As cumulativas têm níveis: Contundido 2, Envenenado 3, Lento 2, Ofuscado 2, Queimando 3, Sangrando 3. Efeitos e dano variam por nível;
- nova aplicação de condição cumulativa agrava o nível pelo narrador, pela ficha e pelo HUD; condição não cumulativa não duplica;
- no nível máximo, Ofuscado aplica Cego até o fim do próximo turno, e Contundido avisa a fratura;
- recuperar PV reduz Contundido e Sangrando em 1 nível; Envenenado não sai mais por cura;
- Sangrando agrava no fim da rodada a partir da rodada seguinte à aplicação, salvo se contido;
- Sufocando: teste de Vigor com CD 6 crescente, Inconsciente na falha e morte na falha seguinte; um novo episódio recomeça em CD 6;
- ações: enquanto Queimando ou Sangrando, Interagir pergunta sobre o que age: apagar o fogo (Queimando −1 nível), conter o sangramento (não agrava nesta rodada) ou outra interação. A ação antiga Apagar fogo foi arquivada (continua no banco);
- testes: `test:ruleset-v12-condicoes` e `test:action-console` ampliados;
- seed aplicado no remoto em 01/10/2026: `condition:oculto` criada; 17 condições, Interagir e Apagar fogo (arquivada) atualizadas.

### 01/10/2026 — Ações de combate v1.2 (Fase 6)

- fonte: capítulo 21 (Cenas de Combate) do Notion;
- novas: Esconder-se (1 PA; Furtividade contra a Percepção de cada inimigo; no sucesso fica Oculto para ele) e Ataque Secundário (1 PA; uma vez por rodada após Atacar com arma leve; sem Corpo no dano; –1 corpo a corpo e –2 à distância). A resolução fica como efeito pendente, sem automação falsa, até a aba de ações;
- Acessar Trama passa de 2 para 1 PA;
- seed aplicado no remoto: 2 ações criadas e 3 atualizadas (Acessar Trama e os dois Sacar).

Equivalência das demais ações:

| Ação | v1.2 | Situação |
|---|---|---|
| Deslocar-se | 1 PA, cinco formas, +1 PA por repetição | igual |
| Levantar, Escapar | 1 PA / 2 PA | iguais |
| Interagir | 1 PA; também usa itens sem custo próprio | igual; ganhou as opções de Queimando e Sangrando |
| Sacar rápido / difícil | "Sacar, guardar ou trocar": Acesso Rápido 1 PA, Mochila 2 PA, podendo usar item de 1 PA na mesma ação | custo igual; nome e descrição atualizados |
| Recarregar, Mirar, Usar Perícia, Fintar | 1 PA | iguais |
| Atacar, Agarrar, Estrangular, Derrubar, Empurrar, Desarmar | 2 PA | iguais |
| Aparar, Bloquear, Esquivar, Resistir | Reação | iguais |
| Preparar Turno | Reação + PA das ações preparadas | igual |
| Posturas | 1 PA; podem começar o combate sem custo | custo igual; o início gratuito não está automatizado |
| Falar, Gestos Rápidos | livres | iguais |
| Soltar alvo | parte de Gestos Rápidos (livre) | equivalente; mantida como ação livre condicional |
| Apagar fogo | opção de Interagir | arquivada |

### 01/10/2026 — Alias `somatica → biotica` (Fase 6)

- personagens v1.2 guardam `niveis_vertente.biotica`, e o catálogo antigo usa `somatica`; sem o alias, as magias de Biótica apareciam com nível de Vertente desconhecido;
- `canonicalVertenteId` e `getVertenteLevel` leem o ID canônico e, em fichas antigas, o legado; o painel de Magias filtra e rotula por Biótica e grava o nível no ID canônico;
- o alias é temporário e sai quando o catálogo v1.2 substituir o antigo (Fases 7 e 10).

### 01/10/2026 — Investigação e Conflitos Sociais (Fase 9, rascunho)

- fonte: capítulos 20 (Cenas de Investigação, editado em 23/09) e 19 (Cenas de Conflitos Sociais, editado em 18/09) do Notion;
- `content/v12/db_investigacao_v1_2.json`: 8 ações de investigação, tabela de impacto, regras gerais, Desafio de Acesso (tipos, Leituras, tentativas por perícia, Tolerância, Contramedidas, 6 modelos) e Arrombamento com Marcador de Progresso;
- `content/v12/db_conflitos_sociais_v1_2.json`: Objetivo, Resistência e Alavancas; vantagem por argumento (máximo +2); perícias por abordagem; teste simples, contestado por Vontade ou sem teste; Concessões por impacto; limites;
- `src/lib/rulesetV12/accessChallenge.ts`: motor puro do Desafio de Acesso (Código secreto, Leitura Direcional/Confirmação, tentativas 1/2/3 + Auxílio, Tolerância uma vez por ação, Contramedida uma vez) e avanço do Arrombamento;
- `npm run test:ruleset-v12-investigacao`: reproduz o exemplo do livro (Tecnomagia 3, 2d4, Código 3–1) e cobre encerramento voluntário, Contramedida e Arrombamento;
- nada publicado: os arquivos não entram no seed. Pendências: a página "AJUSTES APÓS O CAPÍTULO DE INVESTIGAÇÃO e LACUNAS PRIORIZADAS" lista dúvidas abertas; Ameaças está em espera.

### 01/10/2026 — Inventário do legado (Fase 0) e dependências de Classe (Fase 9)

- só leitura no remoto; relatório em `docs/relatorios/INVENTARIO_LEGADO_V1_2_2026-10-01.md`;
- legado a substituir ou remover: 132 magias (catálogo antigo, em espera), 22 Talentos (arquivar no corte), itens, escalpos, runas, propriedades e companheiros (em espera, junto com equipamentos), além de `character_rule` 1.4 parcialmente;
- nenhuma campanha tem conteúdo próprio; 121 personagens v1 (32 com token no mapa), 1 personagem v2 e 3 rascunhos (2 v1);
- características ligadas a Investigação e Conflitos Sociais: Dossiê, Montar o Perfil e Caso Encerrado (Perito); Manobras Sociais e Reserva de Confiança (Face); Movimento (Ícone). Pista ≠ Evidência e Teste de Interação ≠ teste social (decisão de 01/10/2026); tokens de personagens v1 serão removidos no corte.

### 01/10/2026 — Script de corte (Fase 7, preparado, não executado)

- `scripts/dev/v12/corte_fase7.mjs`, na ordem das FKs conferidas no remoto:
  1. tokens dos personagens v1 (a FK é `SET NULL`; sem este passo, os tokens ficariam órfãos);
  2. personagens v1 (controladores e posicionamentos vão em cascata; logs e narrativa mantêm o histórico com `character_id` nulo);
  3. rascunhos v1;
- modos: contagem (padrão), `--testar` (apaga, confere e desfaz) e `--executar --snapshot=<ref>` (regra de segurança 1);
- ensaio no remoto, desfeito: 121 personagens, 46 tokens (dos 32 personagens com token) e 2 rascunhos removidos; Hilda e o rascunho v2 intactos;
- fora do script: imagens de avatar no Storage e o arquivamento de conteúdo obsoleto (Talentos), que fica para um passo separado.

### 01/10/2026 — Snapshot e corte de personagens (Fase 7, executado)

- **Snapshot:** `pg_dump` completo (formato custom) com o PostgreSQL 17.6 da imagem Supabase, rodando via Docker.
  - Arquivo `~/ruptura-backups/ruptura_pre_corte_v12_20261001_152726.dump`, com 2,2 MB e sha256 `eca60c15c865…`. Fica fora do repositório porque contém dados de usuários.
  - Restauração testada num contêiner descartável: 122 personagens, 77 tokens, 3 rascunhos, 551 documentos, 44 campanhas, 188 funções e 80 policies em `public`, iguais ao remoto. Os erros da restauração se limitam aos schemas gerenciados pelo Supabase.
- **Corte** com `corte_fase7.mjs --executar`: removidos 121 personagens v1, 46 tokens e 2 rascunhos v1; 4 controladores saíram em cascata.
- **Restaram:** 1 personagem v2 (Hilda Norren) e 1 rascunho v2.
- **Verificação:** a mesa de desenvolvimento abre sem erros, com só a Hilda.
- **Para voltar atrás:** `pg_restore` do arquivo acima.

### 01/10/2026 — Botão "Ajustar" para personagens v1.2

- decisão: o Modo Evolução continua para personagens v1.2, como correção de Atributos e Perícias definidos na criação. O botão se chama "Ajustar" e vira "Concluir" quando ligado; fica à esquerda do botão de Ranking;
- migration `20261001160000_ruptura_v12_correcao_atributos_pericias.sql`, aplicada no remoto: a RPC de ficha deixa de devolver Atributos e Perícias ao valor salvo e passa a conferir Atributo entre 1 e 5 e Perícia entre 0 e o limite do Ranking atual na Classe, com perícia do catálogo. Vale também para o narrador. Progressão, Trajetória e níveis de Vertente continuam protegidos;
- interface: o "+" de Perícia para no limite do Ranking (`LIMITE_PERICIA_POR_RANKING_V12`, igual nas 7 Classes e conferido no teste de Classes). No Painel de Magias, o modo não libera aprender magias nem editar nível de Vertente em personagens v1.2;
- `scripts/dev/v12/testar_rpc_avanco.ts` passou a criar o próprio personagem de teste no Ranking F: 20 cenários no remoto, em transação desfeita;
- validado no navegador com a Hilda: Artes 0 → 1 → 0 gravado ao Concluir e "+" de Medicina desabilitado no limite 3. O chanfro do botão ligado acompanha a borda âmbar.

### 01/10/2026 — Assistente de criação v1 removido (Fase 7)

- a janela "Novo personagem" abre direto no assistente v1.2, sem o botão "Regras anteriores";
- removidos o assistente v1 (`AssistenteDeCriacao.tsx`), `lerCatalogosDaCriacaoAction` e, em `storage.ts`, a criação pelo assistente v1 (`createCharacterFromWizard`) e o rascunho v1 (`loadCharacterCreationDraft`/`saveCharacterCreationDraft`), além de `createCharacterValidation.ts` e `character/draftValidation.ts`;
- continuam por decisão pendente: o "+ Personagem" (narrador e jogador) e a criação de PN, que geram ficha em branco no formato v1 via `createInitialCharacter`.
- decisão (01/10/2026): a criação mantém dois caminhos, tanto para personagem de jogador quanto para PN: "só com nome" ("+ Personagem") e "com assistente". O assistente v1.2 ganhou, para o narrador, a opção "É um PN". O personagem é criado normalmente e depois marcado com `metadados.tipo_personagem = "pn"` pela RPC de ficha, que só aceita essa marca do narrador (2 cenários novos em `testar_rpc_avanco.ts`). A ficha "só com nome" deixou de ser v1 (ver o registro abaixo).

### 01/10/2026 — "+ Personagem" cria personagem v1.2 pendente

- decisão (opção 1): a ficha "só com nome" é um personagem v1.2 incompleto (`criacao_pendente: true`), completado depois pelo assistente;
- migration `20261001170000_ruptura_v12_personagem_pendente.sql`, aplicada no remoto:
  - `create_pending_character_v2`: o narrador cria personagem de jogador ou PN; o jogador cria só para si e recebe o controle;
  - `complete_character_creation_v2` ganhou `p_character_id`. Com ele, faz as mesmas validações e atualiza o personagem pendente, mantendo id, dono, controladores, tokens, pasta e a marca de PN;
  - a RPC de ficha protege `criacao_pendente` para o jogador e só confere limites de Atributo e Perícia depois da criação concluída;
- na ficha, personagem pendente mostra "Completar criação" no lugar de "Ajustar" e "Ranking". O botão abre o assistente no modo de completar: título "Completar <nome>", nome preenchido, sem ler nem gravar o rascunho da campanha;
- `ProvedorJanelasDaMesa` subiu para `CampaignShell`, porque o Console é janela da casca e fica fora do VTT;
- removidos `createBlankCharacterForSelf` e o uso de `createInitialCharacter` na criação. A RPC v1 `complete_character_creation` ficou sem chamadas no app;
- `testar_rpc_avanco.ts`: 31 cenários no remoto, desfeitos;
- validado no navegador: PN criado só com o nome aparece como v1.2 pendente, e a ficha leva ao assistente no modo de completar. O personagem de teste foi arquivado.

### 01/10/2026 — Bando: catálogo, regras e armazenamento (Fase 8)

- `content/v12/db_bando_v1_2.json`: capítulo 10 transcrito, com Rankings por Cobalto, 5 QGs, 8 melhorias, 6 áreas, 7 especialistas, coberturas, atividades, Exposição, Alerta e complicações (rascunho, fora do seed);
- `src/lib/rulesetV12/crew.ts`: motor puro com os limites por operação do capítulo. Cobre Cobalto (base mais um ajuste, −2..+3, nunca negativo), Ranking derivado, Exposição com pista obrigatória (+2 por operação), Alerta (+0..2, redução com causa), Capacidade e Segurança do QG (até 3), instalação e aprimoramento de melhorias e troca de QG (revenda, reconstrução das fixas pela metade, Exposição zerada). Testado por `npm run test:ruleset-v12-bando`;
- migration `20261001180000_ruptura_v12_bando.sql`, aplicada no remoto: tabela `campaign_crews` com CHECKs dos invariantes. Participantes leem; só o narrador escreve, pela RPC `save_campaign_crew` com revisão otimista (conflito como `check_violation`, nunca 40001). A tabela está publicada no realtime;
- `src/lib/table/crewState.ts`: leitura e gravação;
- `scripts/dev/v12/testar_bando.ts`: 14 cenários no remoto, desfeitos;
- falta a interface na aba Bando, que hoje só tem o inventário compartilhado.

### 01/10/2026 — Ficha do Bando na aba Bando (Fase 8)

- decisões: a ficha fica dentro da aba Bando e todos os participantes editam. A migration `20261001190000_ruptura_v12_bando_edicao_participantes.sql`, aplicada no remoto, abre `save_campaign_crew` a qualquer participante; o estranho continua bloqueado (16 cenários em `testar_bando.ts`);
- a aba Bando ganhou as seções "Ficha" (padrão) e "Inventário" (o inventário compartilhado de antes, sem mudança);
- Ficha (`BandoFicha.tsx`):
  - fundar o bando;
  - Identidade (grava ao sair do campo) e Lista Cobalto (registrar operação com resultado-base e ajuste);
  - QG (Capacidade, Segurança, caixa, instalar e aprimorar melhorias, trocar de QG, inclusive comprometido);
  - Exposição (pistas com origem, neutralizar) e Alerta (+1/+2, redução com causa, notas);
  - Especialistas (recrutar, dispensar, pagar a retaguarda do intervalo), Coberturas (criar, marcar comprometida) e Caixa (depositar, retirar);
- cada ação passa pelo motor puro e grava com revisão otimista; em conflito, a ficha relê e avisa;
- motor ampliado com recrutamento, salários (dois intervalos sem pagamento encerram o contrato), coberturas e caixa (`test:ruleset-v12-bando`);
- validado no navegador: fundação, duas operações (F → E "Listados" com 4 de Cobalto), uma pista de Exposição e a troca para o Inventário, sem erros. Ficou um bando de teste, "Vórtex (teste)", na campanha de desenvolvimento;
- pendentes: transferência bidirecional de itens e aretz entre personagem e Bando no formato v1.2 (o inventário compartilhado continua funcionando como antes) e atualização ao vivo da ficha (hoje ela relê ao focar a janela e ao salvar).
