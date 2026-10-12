# LIGHT-01 — auditoria e proposta técnica

Estado em 2026-10-08: **proposta v1 aprovada pelo solicitante para iniciar LIGHT-02**, com a decisão adicional de que tokens públicos fora do campo de visão ficam secretos também na API e no Realtime. A meta definitiva de hardware e o aceite de desempenho integrado continuam pendentes. A prévia do jogador pelo narrador já foi implementada, mas carece de validação visual no produto.

Implementação em andamento: a interface de LIGHT-02 está protegida por `NEXT_PUBLIC_VTT_LIGHT_ENABLED=1`. A chave só deve ser ligada após aplicar a migração de autorização `20261008171559_vtt_dynamic_lighting.sql` no ambiente correspondente. O Supabase CLI local falhou ao iniciar com `LegacyDbSetupError`/código 139, mas um PostgreSQL descartável com a imagem Supabase 17.6 aceitou o replay completo das 191 migrações, inclusive a RPC de prévia, em instalação limpa. `scripts/test-light-auth.ts` passou com identidades de narrador/jogador e rollback: SELECT/RPC de token e objeto, HUD, aura, escrita proibida, luz, oclusão, visão noturna e prévia sanitizada. O build sem a chave preserva o comportamento atual. Ainda faltam teste visual integrado, meta de hardware e publicação coordenada de banco e aplicação.

## Base observada

| Tema | Evidência no repositório | Consequência |
| --- | --- | --- |
| Regras | `docs/fontes/16 COMBATE…`: iluminação baixa impõe –1, escuridão impede Percepção visual, névoa limita visão a 3 m. `docs/fontes/19 MERCADO NOTURNO/ESCALPOS…`: visão noturna ignora penalidades e lentes fotônicas iluminam cone de 10 m. | A apresentação de luz deve preservar essas categorias, sem automatizar bônus/penalidades de combate. Alcance padrão da visão, campo angular e penetração de paredes não estão definidos. |
| Combate consultivo | `docs/prd/PRD Ruptura VTT.md`, §7.1: ações não são escondidas por ausência de alvo, distância ou linha de visão. | Máscara visual não deve alterar o catálogo ou validar ataques. |
| Mapa | `MapaHex.tsx` desenha SVG com grade hexagonal; `hex.ts` define 1 célula = 1 m; cenas permitem até 200×200 células. | Uma máscara por célula pode gerar 40 mil nós; usar geometria consolidada e medir renderização real. |
| Tokens | `vtt_tokens.visivel` e `read_vtt_scene_tokens` filtram token exclusivo do narrador; `tokens_changed` só invalida, e a leitura é refeita. | Reutilizar a invalidação sem enviar identidade/posição de token oculto. Visibilidade pela luz exigirá projeção por usuário no servidor se for segredo de jogo. |
| Movimento | `campaign:{id}:vtt:movimento` aceita membros e o payload contém `tokenId` e rota. O cliente enviava também movimento de token oculto. | Nesta auditoria, o envio para tokens `visivel=false` foi suprimido nos movimentos único e em grupo. É uma correção do cliente oficial, não fronteira de autorização: o canal ainda aceita payload de membros. Para LIGHT-02, a rota de token fora da visão precisará de filtro confiável antes de chegar ao jogador. |
| Objetos e áreas | Objetos ocupam células; `bloqueia_movimento` não equivale a `bloqueia_visao`. Áreas têm tipos/visibilidade próprios e auras podem depender de token. | Paredes de luz devem ser entidade separada, não derivação implícita de objeto, terreno ou área. |
| Realtime | Áreas/objetos usam eventos ou invalidação; tokens não estão na publicação `postgres_changes` (0148). | Mutação de geometria deve enviar invalidação sem dados secretos; o cliente relê snapshot autorizado. |
| Leitura direta | `vtt_tokens` concede SELECT a `authenticated` com RLS baseada em cena e `visivel`; objetos e áreas têm filtros semelhantes. | Hoje um token público fora do campo de visão ainda é consultável diretamente. Se visão for sigilo, a política/RPC e as leituras de todas as entidades precisam filtrar por observador antes de entregar dados. |

## Contrato proposto para decisão

1. **Ambiente:** modo `claro`, `penumbra` ou `escuro` por cena. `claro` preserva a mesa atual. `penumbra` e `escuro` alteram apresentação, não aplicam penalidades automaticamente.
2. **Visão:** por padrão, cada token controlado pelo jogador contribui com visão de 360° e raio configurável. O jogador vê a união da visão dos tokens que controla. Cone fica reservado a fontes direcionais, como lentes fotônicas, respeitando `direcao` (0–5). Sem token controlado, exibir somente conteúdo público fora da máscara se o narrador escolher um modo de espectador; caso contrário, mostrar a cena obscurecida. Esta escolha ainda precisa de decisão.
3. **Luz:** fontes fixas ou vinculadas a token, com raio em metros, intensidade `fraca`/`forte`, cor sRGB e modo `radial`/`cone`. Luz revela iluminação apenas dentro da linha desobstruída; não concede controle do token nem remove `visivel=false`. Cor é cosmética. Animação fica fora do primeiro corte para não multiplicar invalidações.
4. **Paredes:** segmentos finitos bidimensionais em coordenadas do mundo, com `bloqueiaLuz` e `bloqueiaVisao` independentes. Pontas podem se unir por snap. Uma porta é um segmento editável `aberta`/`fechada`. Altura e visão tridimensional ficam para contrato posterior; o MVP assume plano 2D. Objetos táticos não criam paredes automaticamente.
5. **Narrador:** visão completa com opção de prévia de um jogador específico. A prévia deve consultar a mesma projeção autorizada usada por aquele jogador, incluindo tokens, áreas e assets, não só aplicar filtro CSS ao estado do narrador.
6. **Áreas e ocultos:** `vtt_tokens.visivel=false` jamais aparece, ilumina, fornece visão ou emite rota para jogadores. Aura vinculada a token oculto segue oculta. Área independente mantém sua permissão própria; luz não a publica. Um objeto oculto não deve gerar sombra reveladora ao jogador por padrão. Uma parede secreta só produz oclusão visível após decisão explícita de revelação, ou uma regra de sombra neutra aprovada.

Os pontos 1–6 foram aprovados como direção da v1. Visão noturna foi implementada provisoriamente com raio de 12 m, sem atravessar paredes e sem conceder acesso a entidades privadas; a regra exata de jogo ainda requer confirmação.

## Formatos de dados propostos (v1)

Coordenadas em metros no plano do mapa, com conversor único entre axial fracionário e cartesiano. O alcance mecânico continua na métrica hexagonal existente. O plano de luz usa distância cartesiana; a diferença nas bordas precisa de aceitação visual.

```ts
type AmbienteLuz = { modo: "claro" | "penumbra" | "escuro"; revision: number };
type ParedeLuz = {
  id: string; sceneId: string; a: { q: number; r: number }; b: { q: number; r: number };
  bloqueiaLuz: boolean; bloqueiaVisao: boolean;
  porta: boolean; aberta: boolean; visivel: boolean; revision: number;
};
type FonteLuz = {
  id: string; sceneId: string; tokenId: string | null;
  origem: { q: number; r: number } | null; raioM: number;
  formato: "radial" | "cone"; aberturaGraus: number | null;
  direcaoGraus: number; intensidade: "fraca" | "forte";
  cor: string; ativa: boolean; visivel: boolean; revision: number;
};
```

Invariantes: `sceneId` concorda com campanha; revisão otimista em toda escrita; limites de coordenada dentro da cena; raio finito e positivo; `tokenId` e `origem` mutuamente exclusivos; `cor` canônica; `aberturaGraus` só em cone; uma fonte vinculada a token oculto é sempre privada. A RPC de leitura deve sanitizar IDs, coordenadas, vínculos e contagem de registros que o jogador não pode ver. Broadcast contém somente `sceneId` e revisão de iluminação, sem diferenças de linhas. Escrita apenas pelo narrador autenticado, conferida no banco, com leitura por cena autorizada. É necessário reavaliar as concessões de SELECT direto em `vtt_tokens` e outras tabelas antes de prometer sigilo por campo de visão.

## Matriz de autorização proposta

| Operação | Narrador | Jogador com token controlado | Jogador sem token |
| --- | --- | --- | --- |
| Editar ambiente, parede, luz fixa | Sim | Não | Não |
| Ligar luz do próprio token | Sim | Só se o narrador habilitar explicitamente; RPC confere controle | Não |
| Ler geometria pública | Sim | Snapshot da cena autorizada | Snapshot da cena autorizada |
| Ler geometria privada | Sim | Não | Não |
| Ver token `visivel=false` | Sim | Não, mesmo iluminado | Não |
| Ver token público fora da visão | Sim | Não; oculto também nas leituras do servidor | Mesmo contrato |
| Ver prévia por jogador | Sim, via projeção daquele usuário | Não | Não |
| Receber rota ao vivo | Todas | Só rotas autorizadas por visão e token; sem rota privada | Só rotas autorizadas |

## Desempenho e fallback

Alvo **provisório** até receber hardware/navegador: notebook comum com Chrome/Edge atual, 60 Hz. Orçamento proposto: p95 de atualização geométrica ≤ 8 ms em cena pequena e ≤ 16 ms em cena grande, no dispositivo alvo; pintura/composição p95 ≤ 16,7 ms/frame durante pan/zoom/movimento; memória adicional de iluminação ≤ 64 MiB; atualização de cena remota sem travar interação por mais de 100 ms. Esses valores são metas para aceite, não medições atuais.

Limites iniciais **candidatos**: 16 polígonos ativos por atualização (fontes e observadores somados), 600 segmentos ativos por cena e raio máximo 12 m no modo padrão. São apenas limites observados no M2 para a geometria: 32 polígonos com raio de 20 m excedem o orçamento de 16 ms antes de desenhar. Cenas maiores ou raio ampliado exigem otimização e nova medição. Recomputa-se somente quando visão/luz/parede muda, com agrupamento de alterações por frame; pan/zoom reaproveitam polígonos. A geometria deve rodar fora do caminho de interação (worker), com índice espacial e cache por revisão. O protótipo atual só elimina segmentos fora do raio e usa ray casting síncrono; não demonstra que worker, SVG ou composição atingem a meta.

Fallback: se o recurso gráfico necessário falhar ou a medição exceder o orçamento por 3 atualizações consecutivas, preservar a **mesma projeção autorizada** e trocar o efeito suave por máscara binária estática. Se a geometria de visão não puder ser calculada para uma cena escura, ocultar o conteúdo dependente da visão e oferecer ao narrador ação explícita para usar modo `claro`; nunca revelar tudo automaticamente. Preferência de movimento reduzido desativa pulsação/transição, sem mudar autorização.

## Protótipo e resultado local

`node scripts/dev/prototipo-light-01.mjs` gera cenas determinísticas, testa interseção/oclusão e recorte de cone e mede 20 execuções após aquecimento. Uma execução em Apple M2, Node 24.18.0, nesta máquina:

| Cena | Fontes | Segmentos | Raio | p50 | p95 | Vértices totais |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 32×24 | 4 | 40 | 12 m | 0,76 ms | 1,07 ms | 1.170 |
| 120×100 | 16 | 600 | 12 m | 3,73 ms | 6,50 ms | 5.328 |
| 120×100 (teto testado) | 32 | 600 | 20 m | 16,77 ms | 20,75 ms | 17.370 |
| 120×100 | 16 | 600 | 40 m | 70,17 ms | 78,51 ms | 20.652 |

O teste de 40 m mostra que o algoritmo ingênuo não serve sem limite de raio ou índice espacial. Os cenários cronometrados usam visão radial; o cone tem somente guarda funcional. Os tempos variam por execução. Nenhum número inclui DOM/SVG, rasterização, combinação entre luz e visão, transferência de worker, memória controlada ou cliente móvel. O aceite de LIGHT-01 exige repetir no hardware definido e medir a cena renderizada no navegador.

`node scripts/dev/prototipo-light-01-browser.mjs` usa Chromium headless 149, na mesma máquina, com SVG sintético de 768/12.000 células, máscara de 4/16 aberturas e pan alternado por 30 frames. Resultado: atualização de atributos DOM p95 de 0,1 ms nas duas cenas; intervalo de `requestAnimationFrame` p95 de 17,1 ms na pequena e 16,8 ms na grande. `JSHeapUsedSize` foi 1,0/1,6 MiB, mas **não inclui memória nativa do DOM ou do rasterizador**. O ensaio usa geometria pré-calculada em Node, não inclui React, `VttClient`, regras de visibilidade, rede nem pintura medida por instrumentação de compositor. Serve para rejeitar uma hipótese de custo óbvio da máscara SVG; não prova orçamento de frame do produto.

`node --import tsx scripts/dev/benchmark-light-02-map.tsx` renderiza `MapaHex` e `CamadaIluminacao` reais no React do servidor e mede pan pelo `transform` do grupo SVG em Chromium headless 149, no Apple M2. A cena pequena (32×24, 40 paredes, 4 fontes) registrou p95 de 18,2–18,6 ms; a grande (120×100, 600 paredes, 16 fontes), 18,4–33,3 ms entre execuções. Sem iluminação, uma medição da cena grande deu 18,3 ms. O heap JS medido foi 0,8/5 MiB com iluminação. A variação e o p95 acima de 16,7 ms impedem declarar o orçamento cumprido. O ensaio não inclui hidratação, rede, Realtime, toda a interface VTT nem memória nativa do SVG/compositor. Falta medir a aplicação em uso no hardware escolhido e otimizar caso o limite seja confirmado.

## Critérios para liberar LIGHT-02

1. Aprovar ou corrigir as seis decisões de produto, o significado de visão noturna e o sigilo fora do campo de visão.
2. Fixar matriz de navegadores/hardware e limites de fontes, segmentos e raio; repetir o protótipo no alvo.
3. Construir prova de renderização integrada (mapa pequeno e grande) e registrar p50/p95 de frame, tempo de recomputação e memória.
4. Resolver entrega de rota e projeções server-side por jogador antes de usar a máscara como fronteira de sigilo; testar cliente jogador direto por RPC/REST/Realtime, inclusive token oculto, aura, objeto secreto, reconexão e mudança de controlador.
5. Aprovar formato v1, migrações e fallback. Somente então derivar editor, persistência e testes de LIGHT-02.
