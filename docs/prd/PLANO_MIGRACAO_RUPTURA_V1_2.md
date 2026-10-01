# Plano de migração — RUPTURA VTT para RUPTURA v1.2

**Status:** em implementação  
**Criado em:** 30/09/2026  
**Responsável editorial:** a definir  
**Responsável técnico:** a definir  
**Versão deste documento:** 0.3

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

- [ ] snapshot recuperável do banco;
- [x] branch ou tag de início da migração;
- [ ] execução do replay das migrations;
- [ ] comparação do schema reconstruído com o schema remoto;
- [x] relatório de divergências;
- [ ] inventário dos conteúdos legados que serão substituídos ou removidos;
- [x] conjunto inicial de critérios de aceite automatizados.

Estado do replay local em 30/09/2026: bloqueado porque o Docker Desktop abriu sem iniciar o engine nem criar o socket local. O drift estático e a comparação das funções remotas foram executados; nenhuma migration v1.2 foi aplicada no remoto.

Ferramentas já existentes:

- `npm run db:replay`;
- `npm run db:verificar-replay`;
- `npm run db:drift`.

Critério de saída:

- o schema remoto e o reconstruído estão equivalentes ou todas as divergências possuem decisão registrada.

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

Progresso do registro de tipos: `content_type`, o registro canônico e o contrato do seed já conhecem `class`, `subclass`, `background`, `quality` e `complication`. O seed publica `class` e `subclass` a partir de `content/v12/db_classe_ancora_v1_2.json` com `version = "1.2"` e valida o pacote inteiro com `validateRulesetContentBundleV12` antes de qualquer escrita; `npm run seed:content:dry` monta e valida sem tocar no banco. Continuam abertos: fontes JSON de `background`, `quality` e `complication` e os formulários do Editor Universal (os cinco tipos são somente leitura por enquanto). A migration `20261001024158_ruptura_v12_content_types.sql` foi aplicada no remoto e `class:ancora` e as três Subclasses estão publicadas.

Critério de saída:

- um pacote canônico v1.2 pode ser validado e publicado sem depender do wizard.

### Fase 3 — Fatia vertical da Âncora

**Objetivo:** provar o contrato de ponta a ponta.

Entregáveis:

- [x] conteúdo canônico da Classe Âncora;
- [x] seus perfis de Atributos e Perícias;
- [x] fórmulas próprias de PV, PE e Mana;
- [ ] equipamento e recursos iniciais;
- [ ] Vertente Primária e magias iniciais;
- [ ] criação server-side válida;
- [ ] persistência e reabertura;
- [ ] renderização correta na ficha;
- [ ] rolagem integrada à mesa;
- [ ] relatório dos ajustes necessários no contrato.

Progresso: `content/v12/db_classe_ancora_v1_2.json` contém a Classe e as Subclasses Coordenador, Terapeuta e Vitalista, extraídas do Notion (edição de 23/09/2026) e validadas por `npm run test:ruleset-v12-ancora`. O equipamento inicial registra Ⱥ 3.000 e Mochila de 10 espaços; os pacotes recomendados continuam placeholders no Notion e nenhum item foi inferido. O arquivo ainda não entra no seed, porque o registro no pipeline (Fase 2) segue aberto.

Critério de saída:

- é possível criar e jogar uma Âncora de Ranking F sem usar point-buy, Talento inicial ou PM.

### Fase 4 — Classes, Subclasses e Ranking

**Objetivo:** generalizar a fatia validada para todo o domínio de personagem.

Entregáveis:

- [ ] 7 Classes publicadas;
- [ ] 24 Subclasses publicadas;
- [ ] Ranking F completo;
- [ ] Subclasse obrigatória no Ranking E;
- [ ] avanços de D, C, B, A, S e S+;
- [ ] PA igual a 4 no C e 5 no S;
- [ ] recursos derivados dependentes da Classe;
- [ ] progressão server-side atômica;
- [ ] Modo Evolução orientado pelo próximo Ranking;
- [ ] PM e Talentos deixam de ser fonte de verdade para v2.

Critério de saída:

- cada Classe pode ser criada no Ranking F e evoluída até S+ conforme seu pacote autorizado.

### Fase 5 — Novo wizard

**Objetivo:** substituir a criação antiga pela sequência canônica.

Fluxo:

```text
Conceito → Trajetória → Classe → Revisão → Bando
```

Entregáveis:

- [ ] remoção do point-buy genérico do fluxo v1.2;
- [ ] remoção do orçamento genérico de 25 Perícias;
- [ ] remoção dos 3 pontos livres de Vertente;
- [ ] remoção de Talento inicial;
- [ ] equipamento e aretz definidos pela Classe;
- [ ] retomada de draft compatível com o schema v2;
- [ ] revisão final mostra todas as escolhas e pendências;
- [ ] servidor recalcula e valida o payload enviado pelo cliente.

Critério de saída:

- o wizard não consegue produzir um personagem que viole o contrato da Classe.

### Fase 6 — Condições, combate e magias

**Objetivo:** completar os sistemas mais acoplados à ficha e ao jogo.

Condições e combate:

- [ ] 18 condições canônicas;
- [ ] inclusão de `Oculto`;
- [ ] estado persistente de nível;
- [ ] transições de Contundido, Envenenado, Lento, Ofuscado, Queimando, Sangrando e Sufocando;
- [ ] ação Esconder-se;
- [ ] ação Ataque Secundário;
- [ ] Acessar Trama por 1 PA;
- [ ] Interagir reduz um nível de Queimando;
- [ ] revisão da equivalência das demais ações.

Magias:

- [ ] crosswalk de todas as entradas v1.2;
- [ ] classificação `same`, `renamed`, `redesigned`, `removed` ou `ambiguous`;
- [ ] schema de Mana fixa, intervalo, escolha e fórmula;
- [ ] schema de tempo de conjuração;
- [ ] interface para custos escolhidos/variáveis;
- [ ] alias temporário `somatica → biotica`;
- [ ] backfill dos IDs persistidos;
- [ ] Fusão global desativada ou sustentada por regra canônica documentada.

Critério de saída:

- nenhuma magia de custo variável é tratada como custo desconhecido igual a zero.

### Fase 7 — Corte de dados para v1.2

**Objetivo:** remover dados de desenvolvimento incompatíveis e ativar o novo contrato como única fonte de verdade.

Entregáveis:

- [ ] snapshot técnico anterior ao corte;
- [ ] script explícito para apagar personagens e drafts incompatíveis;
- [ ] remoção ou arquivamento dos documentos de conteúdo obsoletos;
- [ ] substituição de `somatica` por `biotica` no conteúdo canônico;
- [ ] remoção dos caminhos de criação, progressão e leitura v1;
- [ ] seed mínimo de dados v1.2 para desenvolvimento;
- [ ] verificações pós-corte;
- [ ] registro das contagens removidas e criadas.

Critério de saída:

- a aplicação opera apenas com personagens e conteúdo canônico v1.2, sem caminhos silenciosos para o modelo anterior.

### Fase 8 — Bando

**Objetivo:** transformar Bando em ficha coletiva, preservando o inventário existente.

Entregáveis:

- [ ] Nome;
- [ ] Símbolo;
- [ ] Princípio;
- [ ] Contato;
- [ ] Inimigo ou dívida;
- [ ] QG;
- [ ] Cobalto;
- [ ] Ranking;
- [ ] Exposição;
- [ ] Alerta Imperial;
- [ ] transferência bidirecional entre personagem e Bando;
- [ ] persistência isolada ou decisão registrada para armazenamento em `campaigns`.

Critério de saída:

- a ficha coletiva persiste todos os campos canônicos e integra o inventário compartilhado.

### Fase 9 — Paridade ampliada

**Objetivo:** cobrir sistemas que não bloqueiam a primeira ficha v1.2, mas bloqueiam a paridade integral.

- [ ] Investigação;
- [ ] Conflitos Sociais;
- [ ] Ameaças e Antagonistas;
- [ ] integração das características de Classe dependentes desses subsistemas.

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
- [ ] As 7 Classes podem ser criadas no Ranking F.
- [ ] Classe define Atributos, Perícias, recursos e equipamento inicial.
- [x] Reações são `Mente + 1`.
- [x] Medicina pode ser selecionada e rolada.
- [ ] Ranking E exige uma Subclasse.
- [ ] Todos os Rankings aplicam exatamente seus avanços.
- [ ] PA passa para 4 no C e 5 no S.
- [ ] As 18 condições existem.
- [ ] Condições niveláveis possuem estado e transições reais.
- [ ] Oculto está disponível.
- [ ] Esconder-se e Ataque Secundário estão disponíveis.
- [ ] Acessar Trama custa 1 PA.
- [ ] Toda magia v1.2 está classificada no crosswalk.
- [ ] Custos variáveis não são interpretados como zero.
- [ ] Biótica não depende permanentemente do ID `somatica`.
- [ ] A aplicação rejeita payloads de personagem anteriores ao schema v2.
- [ ] O Bando persiste todos os campos canônicos.
- [ ] O replay das migrations produz schema equivalente ao remoto.
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
- replay das migrations continua pendente porque o engine do Docker Desktop não iniciou.

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
