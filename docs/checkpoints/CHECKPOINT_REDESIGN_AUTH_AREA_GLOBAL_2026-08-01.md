# Checkpoint — Redesign da autenticação e da área autenticada global

**Data**: 2026-08-01
**Commit-base**: `7c98c35`
**Escopo**: migração visual da tela de login e da área "fora de campanha" (Minhas Campanhas, Personagens, Compêndio, Conta e Preferências) para a interface definida no protótipo Figma Make, integrada aos fluxos reais existentes. Não inclui o shell interno da campanha nem a ficha.

---

## 1. Objetivo

Uma pasta de referência exportada do Figma Make (`Ruptura VTT code figma make/`, Vite + Tailwind v4 + shadcn) trazia duas interfaces prontas visualmente, mas com lógica mockada: a tela de autenticação (`src/app/components/AuthScreen.tsx`) e a área autenticada global (`src/app/authenticated/*`). O objetivo era levar a identidade visual, os estados, as interações e as microanimações dessa referência para o projeto real — sem transformar o projeto em Vite, sem substituir configuração do repositório, sem criar uma aplicação paralela — conectando tudo aos dados e fluxos já existentes no Supabase/Next.js.

## 2. Estratégia técnica escolhida

O projeto real é Next.js 16 (App Router, Server Components + Server Actions) sem Tailwind, estilizado com CSS global + estilo inline. Em vez de importar o stack do protótipo (Tailwind, shadcn, `lucide-react`), a linguagem visual foi portada:

- **CSS real**, não Tailwind: todas as classes utilitárias do protótipo viraram CSS nomeado em `src/app/_design/auth.css` (tela de login) e `src/app/_design/app.css` (área global), com os mesmos valores de cor, espaçamento e animação do Figma.
- **Ícones inline**: ~30 SVGs em `src/app/_design/icons.tsx` substituem `lucide-react` — sem dependência nova.
- **Tipografia via `next/font`**: Orbitron/Rajdhani/JetBrains Mono auto-hospedadas (sem requisição externa em runtime), carregadas em `src/app/layout.tsx` e expostas como variáveis CSS.
- **Assets**: os fundos HUD do protótipo foram copiados para `public/brand/` e convertidos de PNG (~1,7 MB cada) para JPEG q88 (~200 KB cada).
- **Dados**: nenhum mock foi mantido — cada tela foi ligada às Server Actions/queries que já existiam (`lib/auth`, `lib/table/storage`, `lib/character/storage`, `lib/content/queries`), respeitando a autorização/RLS existente.

## 3. Arquitetura final da autenticação

`src/app/LoginForm.tsx` é o componente compartilhado (client component) usado por três entradas:

- `/login` (rota real, produto) → `redirectTo="/mesas"`, `context="prod"`;
- `/dev/login` (rota dev, atrás de `assertDevRouteAllowed()`) → `redirectTo="/dev/auth/status"`, `context="dev"`;
- fluxo de convite por e-mail (`lockedEmail` travado, não editável).

Chama as Server Actions em `src/lib/auth/actions.ts`:

- `signInWithPassword(email, password)` — inalterada;
- `signUpWithPassword(email, password, displayName?)` — renomeada nesta rodada (ver §11);
- `requestPasswordReset(email)` — **nova**, dispara `supabase.auth.resetPasswordForEmail`, resposta sempre `ok: true` para e-mail bem formatado (evita enumeração de contas), `redirectTo` calculado a partir do header `host`/`x-forwarded-host` da própria requisição, apontando para `/redefinir-senha`;
- `updateDisplayName(displayName)` — inalterada, único caminho de escrita de nome de exibição.

Sessão continua em cookie httpOnly (`ruptura_auth`, `session.ts`), sem chave/token exposta ao bundle do navegador — nada disso mudou.

**Nova rota**: `src/app/redefinir-senha/page.tsx` (client component) — destino do link de redefinição. Aceita tanto o formato implícito (`#access_token&refresh_token&type=recovery`) quanto PKCE/verify (`?token_hash&type=recovery`); a troca de senha em si roda no navegador com a anon key pública (`getBrowserSupabaseClient`) e a sessão temporária de recuperação (`auth.updateUser`) — nunca grava o cookie httpOnly de sessão do app; ao final, a pessoa entra normalmente por `/login`.

Mocks do protótipo removidos: "ENTRADA RÁPIDA" (botão que pulava toda a autenticação); submit com `setTimeout` fingindo sucesso; "RECUPERAR SENHA" sem ação nenhuma.

## 4. Arquitetura final da área autenticada global

`src/app/mesas/_global/GlobalShell.tsx` (client component) é o shell compartilhado pelas quatro telas — substitui a antiga `AccountNav` horizontal (removida). Contém:

- sidebar de navegação (marca + itens + Sair);
- topbar com o controle de perfil e seu menu suspenso;
- fundo HUD com parallax, grade, vinheta e scanlines;
- cursor HUD customizado (só em ponteiro fino);
- sistema de toasts (`usePushToast`, via `ToastContext`);
- preferências visuais (`useVisualPrefs`, via `PrefsContext` + `localStorage`).

Cada página (`page.tsx`, Server Component) busca os dados com sessão real (`getCurrentUser()`, redireciona para `/login` se ausente) e envolve o client component da tela com `<GlobalShell active="...">`.

## 5. Rotas e componentes criados ou alterados

**Criados**:
- `src/app/_design/auth.css`, `app.css`, `icons.tsx`
- `src/app/mesas/_global/GlobalShell.tsx`, `parts.tsx`
- `src/app/mesas/personagens/page.tsx`, `PersonagensGlobaisClient.tsx`
- `src/app/mesas/compendio/page.tsx`, `CompendioClient.tsx`
- `src/app/redefinir-senha/page.tsx`
- `public/brand/auth-hud.jpg`, `app-hud.jpg`

**Alterados**:
- `src/app/layout.tsx` — `next/font` (Orbitron/Rajdhani/JetBrains Mono)
- `src/app/LoginForm.tsx` — reescrita completa da interface
- `src/lib/auth/actions.ts` — `signUpWithPassword` (renomeada) + `requestPasswordReset` (nova)
- `src/app/mesas/page.tsx` — `GlobalShell` + dados extras do narrador (participantes/personagens)
- `src/app/mesas/MesasDashboardClient.tsx` — reescrita completa da interface
- `src/app/mesas/conta/page.tsx`, `ContaClient.tsx` — `GlobalShell` + preferências visuais reais

**Removido**:
- `src/app/mesas/_account/AccountNav.tsx` — substituída pelo `GlobalShell`

Nenhuma rota do shell interno da campanha (`/mesas/[campaignId]/*`), da ficha (`/ficha`) ou de `/admin` foi tocada.

## 6. Localização de estilos, ícones, fontes e assets

- Estilos: `src/app/_design/auth.css` (login), `src/app/_design/app.css` (área global) — CSS puro, sem pré-processador, importado diretamente pelos componentes que usam (`import "../_design/auth.css"` etc.).
- Ícones: `src/app/_design/icons.tsx` — componentes SVG `24×24`, `currentColor`, `aria-hidden` por padrão.
- Fontes: `next/font/google` em `src/app/layout.tsx`, variáveis `--font-orbitron`/`--font-rajdhani`/`--font-mono` no `<html>`; páginas de `/dev` e `/admin` não referenciam essas variáveis e continuam com a fonte de sistema.
- Assets: `public/brand/auth-hud.jpg` (fundo do terminal de acesso), `public/brand/app-hud.jpg` (fundo da área global) — únicos arquivos de imagem novos no build.

## 7. Comportamento do menu lateral

- **Expandido por padrão** em desktop: marca completa + itens com ícone e texto + Sair no rodapé.
- **Recolhível/expansível**: botão dedicado (`ra2-collapse-btn`) alterna entre expandido e um modo compacto (só ícones, com `title` para acessibilidade); a escolha é persistida em `localStorage` (`ruptura.sidebar.collapsed`) e recuperada após a hidratação.
- **Responsivo**: abaixo de 1000px a sidebar já nasce recolhida; abaixo de 860px vira drawer (`ra2-sidebar-wrap--open`), acionado pelo botão de menu na topbar, com scrim e fechamento por Esc ou navegação.
- Item ativo destacado com borda, brilho interno e barra lateral ciano (`aria-current="page"`).

## 8. Minhas Campanhas

`src/app/mesas/page.tsx` → `MesasDashboardClient.tsx`. Lista todas as campanhas da conta (`listCampaigns()`), papel derivado de `owner_id === user.id`. Interface: busca por nome, segmentado Todas/Narrador/Jogador, campanha em destaque + grade das demais, painéis laterais "Atividade recente" e "Rede". Modal de criação de campanha (`createCampaign(name)`) — único campo aceito é o nome, o mesmo contrato de antes. Estados de erro, vazio e "nenhum resultado" tratados; "Criar campanha" acessível pela barra de ferramentas e pelo item do menu de perfil (`?novo=1`).

## 9. Personagens (área global)

Tela nova (`src/app/mesas/personagens/`). Índice pessoal de personagens atravessando campanhas — não substitui a tela "Personagens" de dentro de uma campanha, que continua sendo o painel administrativo do narrador. Para cada campanha da conta, busca `listCharactersForNarratorCampaign` (narrador) ou `listControlledCharacters` (jogador) — mesma autorização por RLS já existente, nenhuma consulta nova. Cada card leva para `/ficha?campaignId&characterId`, a rota real da ficha.

## 10. Compêndio

Tela nova (`src/app/mesas/compendio/`). Catálogo de leitura da Biblioteca do Sistema (`content_documents`, `status = 'published'`), usando a camada pública já existente (`lib/content/queries.ts`, anon key + RLS `content_documents_public_read`). Abas por tipo de conteúdo (magias, talentos, itens, runas, escalpos, condições, propriedades, ações de combate, companheiros), busca local, detalhe expansível por verbete com resumo extraído do payload canônico (sem reinterpretar mecânica). Não é o editor administrativo (`/admin/biblioteca`) nem a biblioteca da campanha (que resolve homebrew/sobreposições) — é somente leitura do catálogo oficial.

## 11. Conta e Preferências

`src/app/mesas/conta/page.tsx` → `ContaClient.tsx`. Nome de exibição com autosave (debounce de 700ms, estados "Salvando…"/"Salvo"/"Falha ao salvar" com nova tentativa, tenta concluir gravação pendente no `beforeunload`) — mesmo contrato de antes (`updateDisplayName`). Preferências visuais "Reduzir movimento" e "Alto contraste" agora funcionam de verdade (contexto do `GlobalShell` + `localStorage`) — no protótipo eram só toggles visuais sem efeito. Painel de sessão com botão "Encerrar sessão" (`signOut()`).

## 12. Dados reais vs. dados derivados

**Fontes reais** (sem mock):
- Campanhas, papel narrador/jogador, `current_round`/`current_scene`: `lib/table/storage.ts`.
- Participantes ativos e nomes de exibição (só quando a conta é narradora, por RLS): `listCampaignMembers`, `getCampaignParticipantInfo`.
- Personagens (contagem e listagem): `lib/character/storage.ts`.
- Conteúdo do Compêndio: `lib/content/queries.ts` contra `content_documents` publicados.
- Nome de exibição, e-mail, sessão: `lib/auth/session.ts` / `actions.ts`.

**Derivado, não inventado**: a "capa" de cada campanha (o banco não tem esse campo) é uma composição visual determinística — hash estável do `id` da campanha sobre o mesmo fundo da marca, com enquadramento e tintura variando por campanha (`campaignCoverStyle` em `_global/parts.tsx`) — nunca uma foto de banco de imagens de terceiros.

## 13. Informações do protótipo removidas por não existirem no banco

- Presença online de jogadores (o protótipo simulava `online: boolean` por jogador).
- Capas de campanha vindas de banco de imagens externo (Unsplash) — substituídas pela composição derivada do §12.
- Descrição, objetivo, progresso (%) e cor de acento por campanha — não existem colunas para isso; o campo "descrição" do modal de criação foi removido do formulário (só o nome é aceito, mesmo contrato de `createCampaign`).
- Contagem de participantes/personagens para conta jogadora: a RLS só permite à própria linha em `campaign_members`; a interface mostra explicitamente que a informação não está disponível, em vez de mostrar zero.
- Avatar de conta — não há coluna/bucket para isso; o card de perfil usa um ícone genérico.

## 14. Decisões de segurança e autenticação

- Nenhuma nova tabela, RPC ou coluna foi criada — todas as telas novas leem através de funções de storage/queries já existentes, com a mesma autorização (RLS) de antes.
- `requestPasswordReset` sempre responde `ok: true` para e-mail bem formatado, mesmo se a conta não existir — evita transformar a tela num verificador de contas cadastradas (enumeração).
- `/redefinir-senha` troca a senha inteiramente no navegador com a sessão temporária de recuperação da própria conta (`auth.updateUser`) — nunca grava o cookie httpOnly de sessão do app, nunca passa por escrita administrativa.
- Preferências visuais (`reduceMotion`, `highContrast`) e o estado de recolhimento da sidebar vivem em `localStorage`, não em tabela nova — não há hoje onde persistir preferência de UI por conta no servidor.
- As 5 rotas `/dev` (`login`, `auth/status`, `table`, `character-sheet`, `join/[campaignId]`) continuam gated por `assertDevRouteAllowed()` (`src/lib/dev/guard.ts`), inalterado nesta rodada: acessíveis sem restrição em desenvolvimento, `notFound()` em produção a menos que `DEV_ROUTES_ENABLED=true` esteja setado explicitamente.

## 15. Renomeação de `signUpDevNarrator` → `signUpWithPassword`

Revisão pós-implementação identificou que o nome antigo sugeria uma função exclusiva de desenvolvimento e/ou concessão de papel — nenhuma das duas coisas é verdade. A implementação sempre foi `supabase.auth.signUp()` com a anon key (o mesmo self-service signup que qualquer cliente Supabase pode disparar), mais opcionalmente `user_metadata.display_name`. Não cria campanha, não insere em `campaign_members`, não concede "Narrador" nem qualquer outro papel — "Narrador"/"Jogador" são sempre derivados por campanha, a partir de `campaigns.owner_id`. A função já era usada pela rota real `/login` antes desta rodada (não é algo introduzido incorretamente nesta migração); só o nome foi corrigido, junto com o docblock, que agora deixa essa garantia explícita.

## 16. Validações executadas

- Leitura completa da estrutura da pasta de referência do Figma Make e da arquitetura atual do projeto (rotas, camadas de dados, RLS, convenções de estilo).
- Comparação byte-a-byte (MD5) dos assets de imagem entre referência e projeto — confirmou que os fundos já presentes em `images/` eram diferentes dos usados nas telas de autenticação/área global; os corretos foram copiados de `src/imports/` da referência.
- Verificação em navegador (desktop e mobile) da tela de login: alternância Entrar/Criar conta, erro real do Supabase ("Invalid login credentials") ao tentar logar com credencial inexistente, disparo real de `requestPasswordReset` com mensagem neutra, `/redefinir-senha` tratando corretamente a ausência de token.
- Verificação em navegador da área global via páginas de pré-visualização temporárias (`/dev/ui-global`, removidas antes do commit): sidebar expandida/recolhida, drawer mobile, menu de perfil, modal de criação de campanha, filtros/busca, toggles de preferências visuais (classes `ra-hc`/`ra-reduce-motion` aplicadas corretamente, cursor HUD desativado com "reduzir movimento").
- Checagem do caminho de leitura do Compêndio contra os dados reais do Supabase: 132 magias, 22 talentos, 120 itens, 45 runas, 58 escalpos, 17 condições, 14 propriedades, 28 ações de combate, 10 modelos de companheiro.
- `/mesas` confirmadamente redireciona para `/login` sem sessão (gate de autenticação real, não simulado).
- Revisão linha a linha do diff final de cada arquivo alterado, procurando regressões, mocks remanescentes e alterações fora do escopo — nenhum encontrado; único ajuste necessário foi a renomeação do §15.
- Grep por `TODO`/`FIXME`/`mock`/`fake` nos arquivos novos — sem ocorrências de código, só comentários descrevendo o que foi removido.

## 17. Resultado de typecheck e build

- `npx tsc --noEmit` — sem erros.
- `npm run build` (`next build`) — compilado com sucesso; todas as rotas novas (`/mesas/personagens`, `/mesas/compendio`, `/redefinir-senha`) aparecem no manifesto de rotas; nenhuma rota existente foi removida do manifesto.

## 18. Limitação da validação visual sem sessão autenticada válida

A sessão local salva para checks autenticados (`.auth/admin-session.json`, usada por `scripts/dev/authSession.ts`) tem access token expirado (validade até 2026-07-15, sem refresh automático server-side — limitação já documentada em `lib/auth/session.ts`). Regenerá-la exige login manual real de uma pessoa em uma janela de navegador (`scripts/dev/save-admin-session.ts` é explícito: "a pessoa, nunca o agente"). Por isso:

- **Não verificado**: a renderização das telas de Minhas Campanhas, Personagens, Compêndio e Conta contra uma sessão real e dados reais de uma conta autenticada.
- **O que foi feito em vez disso**: verificação de cada client component isoladamente, com dados de exemplo, via páginas de pré-visualização temporárias sob `/dev` (removidas antes do commit, nunca fizeram parte da árvore final); verificação de todos os pontos observáveis sem sessão (gate de redirecionamento, tela de login completa, recuperação de senha); revisão de código de cada consulta/Server Action usada pelas páginas reais.
- **Como fechar esta lacuna**: rodar `npx tsx scripts/dev/save-admin-session.ts` (login manual) e então abrir `/mesas`, `/mesas/personagens`, `/mesas/compendio`, `/mesas/conta` com uma conta real.

## 19. Próximos passos recomendados

1. Regenerar a sessão local (`save-admin-session.ts`) e validar as quatro telas com dados reais de uma conta com múltiplas campanhas (narradora em algumas, jogadora em outras).
2. Confirmar no painel do Supabase que a URL `/redefinir-senha` desta instalação está na allowlist de Redirect URLs — sem isso, o link de recuperação cai na Site URL configurada em vez de abrir a tela nova.
3. Definir onde persistir preferências visuais por conta no servidor (hoje só em `localStorage`, por navegador) — se e quando isso for prioridade.
4. Avaliar se a composição derivada de capa de campanha (§12) é suficiente a longo prazo ou se compensa introduzir um campo real de capa no banco.
5. **Presença online real (Supabase Presence).** O card em destaque de Minhas Campanhas (`FeaturedCampaign` em `MesasDashboardClient.tsx`) mostra badge "ONLINE" e contagem "online/total" — hoje isso é MOCK (`mockIsOnline`/`mockOnlineCount` em `src/app/mesas/_global/parts.tsx`, bloco de comentário dedicado no topo dessas funções), pedido explícito do usuário para bater com o design antes do backend existir. Não há `channel.track()`/Presence em nenhum lugar do projeto — só `postgres_changes` (mudança de linha), que não serve para "quem está conectado agora". Precisa de: canal de Presence por campanha, alguém marcando presença enquanto a sessão estiver aberta (provavelmente dentro do shell da campanha, `CampaignShell`/`_shell`), e uma forma de agregar isso na visão global do dashboard sem assinar um canal por campanha listada de uma vez (custo em escala).
   - **Estado OFFLINE do badge, pendente de design/implementação.** Hoje o badge está travado em `<OnlineTag />` incondicional (commit `a8f678b`) — sempre "ONLINE", independente de presença real. Quando a Presence existir: se a última campanha com atividade (a que vira destaque quando nenhuma está online) estiver offline, o badge deve mostrar o estado OFFLINE já estabelecido no design (mesmo padrão visual do badge — ponto + texto —, cor/estado diferente do ONLINE), não continuar mostrando "ONLINE" nem sumir. Pedido explícito do usuário nesta rodada; nenhuma referência de offline para o badge do card em destaque foi encontrada nos arquivos do Figma Make (só existe "offline" no texto simples da lista "Rede", sem badge com ponto) — ao implementar, confirmar/derivar o visual exato do estado offline com o usuário antes de finalizar.
6. **Coluna de descrição em `campaigns`.** O mesmo card mostra um parágrafo de descrição — hoje é texto fixo (`mockCampaignDescription` no mesmo arquivo), porque `campaigns` nunca teve essa coluna. Precisa de: migration adicionando a coluna (texto livre, provavelmente nullable), um lugar para o narrador editar (não existe hoje — nem no modal "Criar campanha" nem em Configurações), e então trocar `mockCampaignDescription()` pelo campo real vindo de `campaign.description`.
7. Quando os itens 5 e 6 forem implementados, remover o bloco `MOCK TEMPORÁRIO` inteiro de `_global/parts.tsx` e as duas linhas que o chamam em `FeaturedCampaign`.

## 20. Relação com o futuro redesenho do shell interno das campanhas

Este checkpoint cobre exclusivamente a autenticação e a área "fora de campanha". O shell interno de cada campanha (`src/app/mesas/[campaignId]/_shell/*`, `CampaignShell.tsx`, `CampaignNav.tsx`) e a ficha (`/ficha`) continuam com a interface anterior, visualmente distinta da nova área global — essa divergência é esperada e temporária. A referência do Figma Make trazia também um redesenho equivalente para o shell da campanha (`redesign-auth-area.md`, `ruptura-vtt-authenticated-area*.md`, componentes `CampaignShell`/`CampaignNav` do protótipo), que não foi escopo desta rodada. Uma futura migração do shell interno deveria reaproveitar a mesma estratégia adotada aqui — CSS portado (não Tailwind), ícones inline, tipografia via `next/font`, dados reais sem mocks remanescentes — e, quando possível, os primitivos já existentes em `src/app/_design/` e `src/app/mesas/_global/parts.tsx`.
