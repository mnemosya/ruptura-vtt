# Checkpoint — Fase 5: Integração da ficha

**Data**: 2026-07-29
**Escopo**: seletor de personagem persistente, retorno fácil para Personagens, entrada pela lista sem tela desnecessária, troca entre fichas por navegação — conforme aditivo §9.4, §10, §11.4, §13.4, §16.7 e auditoria §8 ("Fase 5 — UX completa: seletor, retorno, entrada pela lista, troca").

## 1. Definição do escopo

Diferente das Fases 3/4, não havia especificação detalhada equivalente para a Fase 5 — só a linha da auditoria e as seções do aditivo. Combinando os dois documentos (e confirmando que `docs/htmls/Ruptura — Console do Refratário.html`, referenciado no aditivo §9.4 como direção visual, descreve especificamente a **estrutura interna** da ficha, que o próprio aditivo diz ser "especificada em uma fase própria" — não esta), o escopo real da Fase 5 ficou definido como:

- seletor de personagem persistente (§10.2);
- retorno fácil para Personagens (§9.4, §16.7);
- entrada pela lista sem tela de seleção desnecessária quando só há uma opção (§10.1);
- troca entre fichas — por **navegação**, não por estado interno trocado dentro do componente já montado (a proibição explícita de "troca interna de personagem" do pedido original das Fases 3/4 aponta exatamente para essa distinção).

**Fora do escopo, propositalmente**: estrutura interna da ficha, abas, painéis, hierarquia visual, Modo Jogo/Modo Evolução, densidade — nada disso foi tocado. `CharacterSheetClient.tsx` (5700+ linhas) permanece intocado.

## 2. O que foi construído

A ficha (`/ficha`) não tinha NENHUM elemento de navegação ao redor — era uma rota solta fora da árvore de layout da campanha. A Fase 5 acrescenta só um cabeçalho:

- **`src/app/ficha/FichaHeader.tsx`** (novo, Client Component): campanha + papel identificáveis; link "← Personagens"; `<select>` nativo listando os personagens disponíveis (narrador: todos os da campanha, via `listCharactersForNarratorCampaign`; jogador: só os controlados, via `listControlledCharacters` — mesmas funções já usadas pela página Personagens da Fase 4, nenhuma nova). Trocar a seleção navega para `/ficha?campaignId=...&characterId=...` — uma nova requisição, não uma troca de estado dentro do componente já montado.
- **`src/app/ficha/page.tsx`**: resolve `resolveCampaignAccess` (mesmo helper da Fase 3) e renderiza `<FichaHeader>` acima de `<CharacterSheetView>` quando há campanha válida; sem campanha ou sem acesso, comportamento idêntico ao de antes (sem cabeçalho, `CharacterSheetClient` mostra sua própria mensagem de "não encontrado").
- **`src/app/mesas/[campaignId]/personagens/page.tsx`**: jogador com exatamente 1 personagem controlado é redirecionado direto para a ficha (mesmo padrão já usado em Mercado, Fase 3) — "a interface deve evitar uma tela de seleção desnecessária" (§10.1).

## 3. Bug encontrado e corrigido durante o teste em navegador

O `<select>` do seletor, quando `characterId` da URL não corresponde a nenhum personagem da lista (removido, controle revogado, id inválido), mostrava a **primeira opção da lista como se estivesse selecionada** (comportamento padrão de `<select>` do navegador quando `value` não bate com nenhuma `<option>`) — sugerindo falsamente que aquele personagem estava ativo, quando na verdade o corpo da ficha mostrava "Personagem não encontrado ou você não tem acesso a ele." Corrigido: o seletor agora verifica se `currentCharacterId` está de fato na lista antes de tentar selecioná-lo; caso contrário, mostra "— selecionar —" como placeholder neutro.

## 4. Testes

### Browser check (contas reais, 1 campanha, 2 personagens)

**Narrador**: criou "Personagem Alfa" e "Personagem Beta" (nenhum controlado); abriu a ficha de Alfa — cabeçalho mostra "Campanha Fase 5 · Narrador" e seletor com os dois; trocou para Beta pelo seletor — navegação real, personagem certo carregado (confirmado pelo id exibido na aba Geral); "← Personagens" volta para a lista completa com a casca de navegação inteira de volta.

**Jogador**: personagens Alfa e Beta atribuídos à conta; **Personagens com 2 controlados mostra a lista** (não redireciona — só ocorre com exatamente 1); abriu Beta, cabeçalho mostra "Jogador" e seletor **só com os dois personagens que controla** (autorização correta, mesmas funções já testadas na Fase 4); trocou para Alfa pelo seletor; acessar `?characterId=<inexistente>` mostra "— selecionar —" no cabeçalho (não finge que outro personagem está ativo) e o corpo da ficha nega corretamente.

Console do navegador sem erros novos em toda a sessão (confirmado via `read_network_requests` — todas as respostas 200 OK; entradas de erro no console eram resíduo de uma janela transitória bem no início da sessão, antes dos arquivos existirem, sem relação com o estado atual).

### Tipos e build

- `npx tsc --noEmit`: limpo.
- `npm run build`: limpo.
- `next-env.d.ts`: revertido após cada build.

## 5. O que NÃO foi feito (propositalmente)

- **"Sistema pode abrir o último utilizado" (§10.2)** — explicitamente opcional ("pode", não "deve") no aditivo. Não há mecanismo de persistência de "último personagem" hoje; implementar isso exigiria uma coluna/tabela nova (fora do mínimo necessário para esta fase) ou armazenamento client-side (menos confiável entre dispositivos). Deixado de fora, registrado aqui como pendência legítima e opcional.
- Reskin da ficha para a linguagem visual de `Console do Refratário.html` — explicitamente não é desta fase (aditivo: "a estrutura interna... será definida em uma fase própria").
- Autosave/Ctrl+Z dentro da ficha — fora do escopo desta fase (era restrição explícita das Fases 3/4, e a Fase 5 tal como definida pela auditoria não pede isso).

## 6. Working tree

Fixtures de teste (2 contas, 1 campanha, 2 personagens) criadas e limpas ao final via Supabase real. Nenhum arquivo temporário no repositório.
