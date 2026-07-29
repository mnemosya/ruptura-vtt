# Relatório — Checkpoint Git inicial do Ruptura VTT

## 1. Git inicializado localmente

`/Users/gabi/Developer/ruptura-vtt` não era um repositório Git (`git status`
retornou `fatal: not a git repository`). Inicializado com `git init`.

Branch padrão criada: `main`.

## 2. Nenhum remoto criado

```
$ git remote -v
(saída vazia)
```

Nenhum `git remote add` foi executado. Nenhum `git push` foi executado. O
repositório existe apenas localmente em `/Users/gabi/Developer/ruptura-vtt/.git`.

## 3. `.env.local` não foi commitado

`.gitignore` já continha `.env`, `.env.local`, `.env.*.local` e `node_modules/`.
Foram adicionadas as entradas que faltavam: `.next/`, `dist/`, `build/`,
`*.tsbuildinfo` e `.claude/` (estado local de tooling, sem segredos, mas
específico da máquina — não faz sentido versionar).

Antes de commitar, `git status --short` foi conferido explicitamente e
`.env.local` **não apareceu** na lista de arquivos staged. O `git diff --stat
HEAD` final do commit (`58 files changed`) também não inclui `.env.local`.

## 4. Hash do commit inicial

```
commit e6d1a06c8558a1784f849477bf98c9dddc73493f
chore: initial ruptura vtt checkpoint
```

`git status` após o commit: `nothing to commit, working tree clean`.

Nota: o Git usou autor/e-mail derivados automaticamente do usuário/hostname da
máquina (`git` avisou sobre isso no output do commit), por não haver
`user.name`/`user.email` configurados globalmente. Isso não afeta o conteúdo do
commit nem expõe nada sensível — é só a identidade do autor local. Se quiser
um autor diferente, dá para corrigir com `git commit --amend --reset-author`
depois de configurar `git config --global user.name/user.email`.

## 5. Confirmação — nenhuma chave secreta exposta

- `.env.local` nunca entrou no stage nem no commit.
- Antes de `git add .`, os arquivos candidatos ao commit foram varridos por
  padrões de segredo (JWT do Supabase, `SUPABASE_SERVICE_ROLE_KEY=<valor>`,
  connection string `postgres://usuario:senha@`). As únicas ocorrências
  encontradas foram referências ao **nome** da variável de ambiente em código
  (`requireEnv("SUPABASE_SERVICE_ROLE_KEY")`) e um placeholder de exemplo em
  documentação (`SUPABASE_SERVICE_ROLE_KEY="<service_role_key>"`) — nenhum
  valor real de chave, token ou string de conexão.
- Nenhum valor de variável de ambiente foi impresso neste relatório ou em
  qualquer saída de comando mostrada durante o checkpoint.
- `scripts/`, `content/` e `supabase/migrations/` versionados não contêm
  segredos — `content/` é o pacote de conteúdo público (ruptura-core, JSON),
  `supabase/migrations/` são apenas DDL/SQL.

## Escopo respeitado

- Biblioteca do Sistema (`content_packs`, `content_documents`,
  `src/lib/content`): não alterada.
- Banco, migrations, ficha, storage e lógica de personagem: não alterados
  (apenas adicionados ao controle de versão, sem nenhuma edição de conteúdo).
- Nenhum remoto criado, nenhum push realizado.
