# bg1 — camadas para parallax

Origem: images/bg1.png. Preparadas com a ferramenta integrada ImageGen.
Todos os PNGs têm 1672 × 941 px. Original preservado.

Ordem de composição, de trás para frente:
1. background.png — névoa e iluminação ambiente, opaco.
2. midground.png — estruturas industriais, transparência real.
3. foreground.png — moldura e radar HUD, transparência real.

Usar o mesmo tamanho e enquadramento nas três camadas, sem recortar ao conteúdo.
Sugestão: fundo com deslocamento de 3 px, estruturas 9 px e HUD fixo.
Aplicar folga/escala nas camadas móveis para não revelar bordas.
Respeitar prefers-reduced-motion. Aplicadas à AuthMoldura compartilhada pelo login e demais telas de acesso.

A extração é generativa: há diferenças nos detalhes da arquitetura e do HUD.
O fundo oculto foi reconstruído. A camada intermediária recebeu 1 px transparente
à direita para normalizar o tamanho retornado pela ferramenta.

## Especificações dos prompts usados

- Background: remover todas as estruturas, molduras HUD, radar e partículas;
  reconstruir névoa escura em todo o quadro; preservar composição 1672:941,
  textura carvão/teal e iluminação âmbar inferior esquerda/ciana inferior direita.
- Midground: extrair somente torres, plataformas e piso industriais sobre alpha
  transparente; manter posições e escala originais no quadro inteiro; remover
  céu, névoa, HUD e partículas; preservar sombreado escuro e detalhes âmbar.
- Foreground: extrair somente moldura angular, linhas diagonais, indicadores
  pequenos e radar circular direito sobre alpha transparente; manter registro
  no quadro inteiro; remover arquitetura, atmosfera e partículas; sem novos
  elementos, texto ou fundo opaco.
