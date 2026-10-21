/**
 * Catálogo de Marcas e Traços de Ruptura — RUPTURA 1.2, cap. 18
 * ("Sobrecarga e Ruptura"). Fonte canônica: o capítulo do livro no
 * Notion; os textos aqui são os de lá.
 *
 * Marca é mecânica (escolha 1 por Ruptura); Traço é narrativo (4 tipos
 * × 8, escolhido ou sorteado com 1d4 para o tipo e 1d8 para o traço).
 * Módulo puro de dados, sem dependência da ficha.
 */

export type FamiliaMarca = "resistencia" | "conduto" | "magia";

export interface MarcaRuptura {
  id: string;
  nome: string;
  familia: FamiliaMarca;
  /** Uma linha, para a grade. */
  resumo: string;
  /** Texto do livro. */
  texto: string;
  /** Como a ficha trata a Marca (uma linha). */
  naFicha: string;
  /** Cadência ou natureza, para o selo do cartão. */
  selo?: string;
  /** Pede uma magia do repertório na escolha (Manejo Intuitivo). */
  pedeMagia?: boolean;
}

export const FAMILIAS_MARCA: Record<FamiliaMarca, { nome: string; descricao: string }> = {
  resistencia: { nome: "Resistência", descricao: "o corpo aguenta mais" },
  conduto: { nome: "Conduto", descricao: "a Mana volta para você" },
  magia: { nome: "Magia", descricao: "suas magias mudam" },
};

export const MARCAS_RUPTURA: MarcaRuptura[] = [
  {
    id: "carapaca_arcana", nome: "Carapaça Arcana", familia: "resistencia", selo: "Aplica na ficha",
    resumo: "PV máximos + Corpo + 3.",
    texto: "O arcano impregna sua carne, tornando-a mais resistente: seus Pontos de Vida (PV) aumentam em um valor igual ao seu Corpo + 3.",
    naFicha: "PV máximos sobem sozinhos.",
  },
  {
    id: "escudo_psiquico", nome: "Escudo Psíquico", familia: "resistencia", selo: "Aplica na ficha",
    resumo: "PE máximos + Mente + 3.",
    texto: "O excesso arcano reforça sua mente, tornando-a mais difícil de abalar: seus Pontos de Estresse (PE) aumentam em um valor igual à sua Mente + 3.",
    naFicha: "PE máximos sobem sozinhos.",
  },
  {
    id: "pelicula_arcana", nome: "Película Arcana", familia: "resistencia",
    resumo: "Ao receber Sobrecarga, PV temporários = 2 × Sobrecarga atual.",
    texto: "A pressão acumulada faz o arcano transbordar pela superfície do corpo, formando uma camada protetora. Sempre que receber Sobrecarga, ganhe uma quantidade de PV temporários igual ao dobro de sua Sobrecarga atual. Esses PV temporários não se acumulam e desaparecem ao final da cena.",
    naFicha: "Registrada; aplique os PV temporários ao receber Sobrecarga.",
  },
  {
    id: "valvula_de_escape", nome: "Válvula de Escape", familia: "resistencia", selo: "1× por cena",
    resumo: "1×/cena: −1d4 no dano psíquico da Sobrecarga.",
    texto: "Seu conduto encontra maneiras menos destrutivas de liberar parte da pressão acumulada. Uma vez por cena, quando receber um ou mais pontos de Sobrecarga, reduza em 1d4 o dano psíquico causado por eles, até o mínimo de 0.",
    naFicha: "Registrada; use ao receber Sobrecarga, uma vez por cena.",
  },
  {
    id: "conduto_voraz", nome: "Conduto Voraz", familia: "conduto", selo: "1× por cena",
    resumo: "1×/cena: magia que derruba uma criatura dá 1d6 de Mana temporária.",
    texto: "Seu conduto absorve o resíduo arcano deixado pela queda de outras criaturas. Uma vez por cena, quando uma magia sua reduzir uma criatura a 0 PV ou 0 PE, ganhe 1d6 de Mana temporária. A Mana temporária obtida desta forma não se acumula.",
    naFicha: "Registrada; use quando sua magia derrubar alguém.",
  },
  {
    id: "refluxo_arcano", nome: "Refluxo Arcano", familia: "conduto",
    resumo: "Crítico com magia: 1d4 de Mana temporária.",
    texto: "A força do arcano retorna com intensidade toda vez que você ultrapassa seus limites. Sempre que obtiver um sucesso crítico em um teste de ataque de uma magia ou ao menos um alvo obtiver uma falha crítica no teste de resistência contra uma magia sua, ganhe 1d4 de Mana temporária. Cada conjuração pode conceder essa Mana apenas uma vez, mesmo que mais de um alvo obtenha uma falha crítica. A Mana temporária obtida desta forma não se acumula.",
    naFicha: "Registrada; use no crítico.",
  },
  {
    id: "aura_continua", nome: "Aura Contínua", familia: "conduto", selo: "1× por descanso",
    resumo: "1×/descanso longo: ancora uma magia sustentada sem custo extra.",
    texto: "Uma vez por descanso longo, ao sustentar uma magia, você pode ancorá-la em seu fluxo arcano. Enquanto estiver ancorada, você não paga o custo adicional de Mana para sustentá-la, ela não aumenta em 2 o custo de Mana das novas magias que você conjurar e não é contada para determinar a CD dos testes de Vontade realizados para manter suas magias sustentadas. A magia continua sujeita às demais regras de sustentação.",
    naFicha: "Registrada; use ao sustentar uma magia.",
  },
  {
    id: "furia_arcana", nome: "Fúria Arcana", familia: "magia",
    resumo: "Magias de Ataque: +1 dado de dano ao acertar.",
    texto: "A presença do arcano intensifica sua ofensiva, canalizando energia extra a cada golpe. Suas magias de Ataque causam 1 dado adicional de dano sempre que acertam.",
    naFicha: "Registrada; some o dado no dano das magias de Ataque.",
  },
  {
    id: "expansao_arcana", nome: "Expansão Arcana", familia: "magia",
    resumo: "Magias de Controle: alcance e área em dobro.",
    texto: "Suas magias de Controle alcançam distâncias e se expandem em áreas o dobro do tamanho do normal.",
    naFicha: "Registrada; dobre alcance e área das magias de Controle.",
  },
  {
    id: "presenca_persistente", nome: "Presença Persistente", familia: "magia",
    resumo: "Magias de Suporte: duração em dobro.",
    texto: "O fluxo arcano se acomoda em você, prolongando os efeitos de tudo que ampara e fortalece. Suas magias de Suporte permanecem ativas pelo dobro da duração.",
    naFicha: "Registrada; dobre a duração das magias de Suporte.",
  },
  {
    id: "pulso_de_movimento", nome: "Pulso de Movimento", familia: "magia", selo: "1× por cena",
    resumo: "1×/cena: magia de Movimento (até nível 3) sem PA.",
    texto: "O arcano se antecipa ao seu desejo de deslocamento, tornando o movimento quase instintivo. Uma vez por cena, no seu próprio turno, pode conjurar uma magia de Movimento (até nível 3) sem gastar PA.",
    naFicha: "Registrada; conjure sem PA uma vez por cena.",
  },
  {
    id: "poder_difuso", nome: "Poder Difuso", familia: "magia",
    resumo: "Magias de vários alvos: +1 alvo.",
    texto: "Sua presença arcana se espalha além do esperado, alcançando mais do que o comum. Sempre que conjurar uma magia que afete múltiplos alvos, escolha um alvo adicional.",
    naFicha: "Registrada; escolha um alvo a mais.",
  },
  {
    id: "sussurro_arcano", nome: "Sussurro Arcano", familia: "magia",
    resumo: "Magias de nível 1 a 3 sem manifestação visível.",
    texto: "O poder flui de forma tão sutil que mal deixa rastros no ar. Suas magias de níveis 1, 2 e 3 não produzem manifestações visíveis.",
    naFicha: "Registrada.",
  },
  {
    id: "manejo_intuitivo", nome: "Manejo Intuitivo", familia: "magia", selo: "Escolha uma magia", pedeMagia: true,
    resumo: "Uma magia sua: moldar com Complexidade um grau menor.",
    texto: "Escolha uma magia do seu repertório. Sempre que moldar essa magia, considere a Complexidade da alteração pretendida um grau menor.",
    naFicha: "Fica presa à magia escolhida.",
  },
  {
    id: "repertorio_expandido", nome: "Repertório Expandido", familia: "magia", selo: "Nova magia",
    resumo: "Aprenda uma magia de uma vertente sua (exceto nível 5).",
    texto: "Aprenda uma nova magia de uma vertente que já faz parte do seu repertório, escolhendo qualquer nível a que tenha acesso (exceto nível 5).",
    naFicha: "Aprenda a magia pelo Grimório depois.",
  },
];

export interface TipoTraco {
  id: "fisico" | "sensorial" | "emocional" | "ambiental";
  nome: string;
  descricao: string;
  tracos: { nome: string; texto: string }[];
}

/** Ordem do livro: é a ordem do 1d4. Dentro de cada tipo, a ordem do 1d8. */
export const TIPOS_TRACO: TipoTraco[] = [
  {
    id: "fisico", nome: "Físico", descricao: "Alterações permanentes no corpo, visíveis a olho nu ou percebidas de perto.",
    tracos: [
      { nome: "Brilho nos olhos", texto: "Ao canalizar, os olhos emitem um brilho azulado intenso por toda a esclera, que se sobrepõe ao brilho original da vertente conjurada. Em Rupturas mais intensas, esse brilho vaza como brumas." },
      { nome: "Veios arcânicos", texto: "Linhas finas, levemente azul fluorescentes, percorrem braços, pescoço ou rosto. Visíveis apenas durante esforço mágico." },
      { nome: "Aura termal", texto: "Pele quente demais em repouso, fria demais após canalizações. Toques físicos revelam pulsos de calor ou eletricidade leve." },
      { nome: "Alvura arcana", texto: "A cor do corpo empalece ou se torna translúcida ao conjurar magia. Em Rupturas avançadas, o cabelo fica branco e se move suavemente por conta própria." },
      { nome: "Aura de distorção", texto: "O ar ao redor do magista parece ondular, como calor tremeluzente ou estática leve. Poeira e folhas flutuam em sua presença, mesmo sem vento." },
      { nome: "Fissuras arcanas", texto: "Partes do corpo parecem fissuradas, como se estivessem trincadas por dentro. Em Rupturas mais intensas, as bordas dessas rachaduras brilham em azul anil sob esforço arcano." },
      { nome: "Fagulhas luminescentes", texto: "Fragmentos ou partículas arcanas flutuam ao redor do corpo, como cinzas luminosas ou faíscas suaves. Podem reagir a emoções intensas." },
      { nome: "Véu escorrente", texto: "Extremidades do corpo, como cabelo, mãos e pés, exalam bruma azulada ou fragmentos de energia sob esforço mágico. A pele pode parecer fina ou rachada nesses pontos, com o arcano vazando lentamente." },
    ],
  },
  {
    id: "sensorial", nome: "Sensorial", descricao: "Alterações permanentes na forma como o personagem percebe o mundo.",
    tracos: [
      { nome: "Murmúrio arcano", texto: "O personagem ouve um leve sussurro persistente, como se o conduto estivesse vibrando internamente. Em silêncio absoluto, o som se torna mais claro." },
      { nome: "Orbe errante", texto: "Pontos azuis ou brancos piscam na visão lateral, principalmente em momentos de esforço mágico. Mesmo com os olhos fechados, essas luzes parecem flutuar como resíduos da canalização." },
      { nome: "Pele desfasada", texto: "O personagem sente duas versões de um mesmo toque: a primeira imediata, a segunda com atraso sutil (meio segundo)." },
      { nome: "Calor fantasma", texto: "Algumas partes do corpo esquentam intensamente por breves segundos, como se reagissem a uma magia próxima, mesmo quando não há nenhuma ativa ao redor." },
      { nome: "Sufoco arcano", texto: "O personagem sente uma pressão leve no peito ou estômago sempre que entra em um ambiente carregado de arcano, parecida com altitude ou enjoo." },
      { nome: "Distorção sonora", texto: "Sons naturais como passos, água ou metal se tornam mais altos e mais metálicos. Já vozes humanas soam abafadas ou distantes, mesmo quando próximas." },
      { nome: "Vozes em fuga", texto: "Ao ouvir gritos, insultos ou súplicas, o som reverbera como se viesse de múltiplas fontes distantes. A emoção real da fala parece chegar depois, em ondas." },
      { nome: "Presença fantasma", texto: "O personagem frequentemente sente que há alguém atrás ou ao lado, mesmo estando sozinho. A sensação costuma surgir após conjuração intensa ou estresse extremo." },
    ],
  },
  {
    id: "emocional", nome: "Emocional", descricao: "Respostas emocionais disfuncionais causadas pela saturação do conduto.",
    tracos: [
      { nome: "Afeto arcano", texto: "Você desenvolve sentimentos reais por manifestações mágicas. Pode se apegar a um campo de distorção, falar com zonas anômalas ou sentir saudade de lugares saturados de arcano." },
      { nome: "Emoções caóticas", texto: "Conjurar qualquer magia provoca, em segundos, uma reação emocional incompatível com o contexto, como raiva súbita, medo desproporcional ou riso descontrolado." },
      { nome: "Simbiose arcana", texto: "Seu conduto se tornou uma parte autônoma da sua identidade. Quando forçado, você sente dor emocional; quando ele se expande, sente orgulho ou culpa, como se algo vivo existisse dentro de você." },
      { nome: "Empatia fragmentada", texto: "Você ainda compreende pessoas, mas não sente mais como elas. Sua compaixão funciona melhor com criaturas anômalas, máquinas ou mutações." },
      { nome: "Rastro do que se foi", texto: "Você sente falta de algo perdido na primeira Ruptura. Não lembra o que era, nem sabe se existia, mas o vazio retorna após conjurar algo muito grande." },
      { nome: "Fascínio quebrado", texto: "Quando alguém sofre, perde o controle ou entra em Ruptura, mesmo um inimigo, você sente um misto de fascínio, inveja ou conexão profunda." },
      { nome: "Carne estranha", texto: "Você sente raiva, vergonha ou desconforto profundo pelas partes do corpo alteradas pelo excesso arcano, e pode evitar contato, exibir as mudanças ou criar rituais para acalmá-las." },
      { nome: "Lágrimas do passado", texto: "Às vezes seus olhos lacrimejam sem aviso, mesmo em repouso. Você não está triste. Mas o corpo parece lembrar algo que você já não acessa." },
    ],
  },
  {
    id: "ambiental", nome: "Ambiental", descricao: "Alterações involuntárias e persistentes no ambiente ao redor do personagem.",
    tracos: [
      { nome: "Suspensão efêmera", texto: "Durante a conjuração, objetos pequenos próximos levitam levemente ou tremem, como se fossem puxados por um campo invisível, até um segundo após o fim da canalização." },
      { nome: "Interferência viva", texto: "O personagem interfere involuntariamente em aparelhos elétricos: fones chiando, telas piscando, sensores acusando interferência, sobretudo quando está instável ou canalizando demais." },
      { nome: "Luz errante", texto: "Durante e logo após uma canalização, a luz ao redor sofre leves distorções, como reflexos duplicados, halos ou mudanças súbitas de cor." },
      { nome: "Pegada térmica", texto: "O chão por onde o personagem passa fica levemente morno ou frio, mesmo sem toque direto, por até 30 segundos." },
      { nome: "Reflexo retido", texto: "Espelhos e vidros mantêm um traço residual luminoso onde o personagem passou, que desaparece lentamente." },
      { nome: "Som interno", texto: "Ambientes muito silenciosos registram sons sutis próximos ao personagem, como zumbidos ou sussurros, vindos do corpo inteiro." },
      { nome: "Tinido arcano", texto: "Durante a conjuração, superfícies metálicas próximas vibram ou emitem um tinido sutil, em ressonância com o fluxo do conduto." },
      { nome: "Rastro corporal", texto: "Em movimentos rápidos ou conjurações, o personagem deixa uma leve trilha de luz ou distorção no ar, como uma sombra translúcida do corpo anterior." },
    ],
  },
];

export function marcaPorId(id: string | undefined): MarcaRuptura | undefined {
  return id ? MARCAS_RUPTURA.find((m) => m.id === id) : undefined;
}

/** Traço pelo par do sorteio: tipo 1–4 (1d4), número 1–8 (1d8). */
export function tracoPorDados(tipo: number, numero: number): { tipo: TipoTraco; nome: string; texto: string } | undefined {
  const t = TIPOS_TRACO[tipo - 1];
  const traco = t?.tracos[numero - 1];
  return t && traco ? { tipo: t, ...traco } : undefined;
}

export interface SurtoSobrecarga {
  /** Igual ao `tipo` gravado no surto (o de Energia tem efeito automático por esse nome). */
  nome: string;
  /** Pontos de Sobrecarga: fixo (min = max) ou escolhido (Urgência, 1 a 3). */
  custo: { min: number; max: number };
  efeito: string;
  /** Quando anunciar e limites de uso. */
  quando: string;
}

/** Surtos de Sobrecarga — RUPTURA 1.2, cap. 18. Todos são Ação Livre. */
export const SURTOS_SOBRECARGA: SurtoSobrecarga[] = [
  { nome: "Surto de Energia", custo: { min: 1, max: 1 }, efeito: "Ganhe 5 de Mana temporária imediatamente.", quando: "A Mana temporária se desfaz num descanso longo." },
  { nome: "Surto de Foco", custo: { min: 1, max: 1 }, efeito: "Rerrole um teste de ataque de uma magia de Ataque e some +1 ao novo resultado.", quando: "Pode ser anunciado depois de saber se acertou. Uma vez por teste." },
  { nome: "Surto de Desequilíbrio", custo: { min: 1, max: 1 }, efeito: "Force um alvo que passou no teste de resistência contra sua magia a rerrolar e aplicar −1 ao novo resultado.", quando: "Anuncie logo após o resultado. Uma vez por teste." },
  { nome: "Surto de Impacto", custo: { min: 1, max: 1 }, efeito: "Adicione +1 dado ao efeito da magia, como +1d8 de dano ou +1d6 de cura.", quando: "Depois de saber que a magia afetou o alvo, antes de rolar ou aplicar o efeito." },
  { nome: "Surto de Urgência", custo: { min: 1, max: 3 }, efeito: "Ao conjurar, receba de 1 a 3 pontos de Sobrecarga para reduzir o custo da magia na mesma quantidade de PA, até 0 PA.", quando: "Anuncie antes de pagar o PA. Não passe do necessário para chegar a 0 PA nem do seu limite." },
  { nome: "Surto de Discrição", custo: { min: 1, max: 1 }, efeito: "Conjure uma magia sem manifestação visual ou sensorial: o efeito fica completamente discreto.", quando: "Anuncie ao conjurar a magia." },
];
