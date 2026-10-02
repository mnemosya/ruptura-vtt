/**
 * Acervo das cinco regiões do Império para a Forja de Refratário: o texto
 * de ambientação (como é crescer ali, lore, nomes) e a posição no mapa.
 *
 * Isto é APRESENTAÇÃO. As regras (quais regiões existem, idioma) são de
 * `REGIOES_V12` em `src/lib/rulesetV12/contracts.ts`; o `id` daqui é o
 * mesmo slug de lá.
 *
 * Texto vindo do protótipo `High-Fidelity Character Creator Exploration`.
 * `tint` é a cor de cada região nos marcadores e na arte, não da UI.
 */
import type { RegiaoIdV12 } from "../../../../../../lib/rulesetV12/contracts";

export const MAPA_DO_IMPERIO = "/forja/regioes/mapa.webp";

export interface RegiaoAcervo {
  id: RegiaoIdV12;
  nome: string;
  img: string;
  capital: string;
  lang: string;
  sector: string;
  tag: string;
  grow: string;
  mark: string;
  lore: string[];
  namesNote: string;
  names: { f: string[]; m: string[]; s: string[] };
  pin: { x: number; y: number };
  tint: string;
}

const L = (s: string) => s.split(", ");

export const REGRAS_DE_ORIGEM = [
  "Todo personagem passou seus anos de formação em algum canto do Império. Escolha a região onde ele cresceu ou viveu o período que mais definiu sua identidade. Ela não precisa ser seu local de nascimento nem o lugar onde mora atualmente.",
  "Depois, especifique uma cidade, distrito, vila, estação, assentamento ou comunidade dessa região. Duas pessoas de Vastra podem ter experiências muito diferentes se uma cresceu nos níveis altos de Vosek e a outra em um núcleo industrial distante da capital.",
  "Sua região estabelece costumes, referências culturais e conhecimentos amplamente compartilhados. Fatos cotidianos sobre ela não exigem teste. Informações locais, técnicas, secretas ou ligadas a um meio específico dependem do Antecedente e das Perícias apropriadas.",
  "Todo personagem conhece o idioma de sua Região de origem. Além disso, conhece o idioma predominante da região onde a campanha começa. Se os dois forem iguais, o personagem conhece apenas esse idioma. Mudar o local da campanha posteriormente não concede novos idiomas automaticamente.",
]

export const REGIOES: RegiaoAcervo[] = [
  {
    id: "beldran", nome: "Beldran", img: "/forja/regioes/beldran.webp", capital: "Lonich", lang: "Beldrano", sector: "COSTA · LONICH", tag: "Costa mediterrânea", tint: "#ffb35c", pin: { x: 78, y: 69 },
    grow: "Costa mediterrânea, mercados de rua, festas, culinária intensa, arquitetura aberta e política de bastidor.",
    mark: "Aprendeu a negociar, contornar regras e proteger sua autonomia sem buscar confronto desnecessário.",
    lore: [
      "Beldran é uma região mediterrânea de orgulho, sensualidade e vida ao ar livre. Festivais, culinária apimentada, mercados de rua e celebrações que atravessam a madrugada ocupam seus espaços públicos. Por trás da aparência descontraída existe uma sociedade politicamente experiente, acostumada a negociar, contornar regras e sobreviver sob o controle imperial.",
      "Música, dança, vestimentas leves e arquitetura arejada também funcionam como sinais de identidade e resistência cultural. Beldran preservou parte de sua autonomia depois do Reordenamento, e seus habitantes tratam essa conquista com orgulho.",
    ],
    namesNote: "Os nomes beldranos são melódicos e abertos, com muitas vogais e terminações suaves.",
    names: { f: L("Alessa, Amara, Carina, Celina, Isela, Lorena, Mirela, Nerissa, Romina, Viona"), m: L("Cael, Cassian, Dario, Lorian, Lúcio, Mateo, Nilo, Ravel, Rique, Vito"), s: L("Alberto, Bellori, Calvera, Montero, Morales, Moresi, Ravelli, Solano, Valoro, Velasquez") },
  },
  {
    id: "kravus", nome: "Kravus", img: "/forja/regioes/kravus.webp", capital: "Kylahosa", lang: "Kravino", sector: "MONTANHA · KYLAHOSA", tag: "Frio, mineração e kravita", tint: "#cfe6ff", pin: { x: 37, y: 22 },
    grow: "Frio extremo, montanhas, mineração, indústria pesada, kravita, turnos longos e comunidades fechadas.",
    mark: "Valoriza palavra dada, trabalho bem-feito, resistência e vínculos difíceis de conquistar.",
    lore: [
      "Gelada, montanhosa e industrial, Kravus é sustentada pela mineração e pela kravita, liga de grande resiliência e afinidade arcana empregada em blindagens, armamentos e infraestrutura estratégica por todo o Império. Turnos longos, clima implacável e comunidades fechadas em torno do trabalho tornam a vida difícil por padrão.",
      "Ostentação é rara. Reconhecimento vem da qualidade do que se constrói e da firmeza em cumprir a palavra. Estranhos são avaliados com cautela, mas aqueles que conquistam confiança passam a integrar vínculos duradouros. Kravus foi devastada durante as Guerras Mágicas e se reconstruiu por esforço próprio; esse orgulho ainda atravessa a região.",
    ],
    namesNote: "Os nomes kravinos são curtos e truncados, com consoantes duras e poucas sílabas.",
    names: { f: L("Anja, Brina, Elka, Hilda, Ingrid, Lena, Maren, Olga, Petra, Sigrid"), m: L("Drev, Einar, Halvar, Ivar, Kiril, Korin, Orik, Sten, Toren, Vasko"), s: L("Bravik, Dorsen, Hestrom, Kalt, Kravik, Norren, Skeld, Ulfren, Varn, Vekar") },
  },
  {
    id: "talesh", nome: "Talesh", img: "/forja/regioes/talesh.webp", capital: "Aluvar", lang: "Taleshino", sector: "FLORESTA · ALUVAR", tag: "Rios, chuva e coletivos", tint: "#7dffb0", pin: { x: 49.5, y: 74 },
    grow: "Florestas úmidas, rios, chuva constante, comunidades móveis, coletivos e famílias além do sangue.",
    mark: "Cresceu improvisando soluções, confiando em redes locais e se reinventando quando tudo muda de lugar.",
    lore: [
      "Talesh vive entre florestas densas, rios largos, pântanos e chuvas capazes de redesenhar caminhos. Vilas, bairros suspensos e comunidades móveis dependem de transporte aquático, produção flexível e soluções adaptadas à umidade. Aluvar concentra mercados, pesquisa biológica e um fluxo constante de pessoas e mercadorias.",
      "Durante as Guerras Mágicas, a região serviu como rota de refúgio e passagem. Povos deslocados formaram novas famílias, coletivos e assentamentos, misturando técnicas, sotaques e tradições. Essa diversidade permanece nas redes comunitárias e nas maneiras locais de negociar com a disciplina imperial sem perder a capacidade de mudança.",
    ],
    namesNote: "Os nomes taleshinos misturam origens e sonoridades, reflexo dos povos que atravessaram a região durante e depois das Guerras Mágicas.",
    names: { f: L("Ayara, Dalila, Imani, Lumina, Maíra, Naia, Samira, Tainá, Yuna, Zaira"), m: L("Aruan, Baru, Luan, Naim, Ravi, Renn, Shio, Tavir, Yanis, Zain"), s: L("Amaré, Aramé, Belai, Kael, Kai-Moru, Kalun, Mavira, Sonai, Tavara, Vael") },
  },
  {
    id: "torvash", nome: "Torvash", img: "/forja/regioes/torvash.webp", capital: "Zaheed", lang: "Torvashino", sector: "ANÔMALA · ZAHEED", tag: "Zonas Anômalas e cristalídeo", tint: "#c48cff", pin: { x: 29, y: 51 },
    grow: "Zonas Anômalas, mineração de cristalídeo, vigilância militar, contrabando e clima imprevisível.",
    mark: "Aprendeu que sobreviver exige cautela, lealdade próxima e intimidade com o risco arcano.",
    lore: [
      "Torvash concentra algumas das maiores Zonas Anômalas do continente e a principal produção de cristalídeo do Império. Campos de extração, postos de contenção e bairros operários ocupam uma paisagem em que clima, relevo e ecossistemas podem mudar sem aviso. Zaheed, construída numa rara área de estabilidade, funciona ao mesmo tempo como capital e centro militar.",
      "O Império mantém vigilância intensa, mas a lealdade cotidiana costuma pertencer às comunidades próximas. Redes de contrabando e serviços clandestinos sustentam a vida tanto quanto os postos oficiais. Magistas são mais numerosos aqui do que em qualquer outra região: úteis em certas situações, perigosos em outras e impossíveis de separar da realidade local. A fronteira entre sobrevivência e resistência sempre foi incerta em Torvash.",
    ],
    namesNote: "Os nomes torvashinos são áridos e cadenciados, com vogais abertas e consoantes prolongadas.",
    names: { f: L("Dalia, Farida, Kalima, Lina, Nozra, Samira, Shaira, Soraya, Tarisha, Vesha"), m: L("Hazar, Kadir, Kazan, Mazin, Nahir, Ozhan, Rashad, Tarek, Tariq, Vashir"), s: L("Ashkor, Dazhan, Harun, Malik, Mirzhan, Narez, Nazim, Rukash, Sazek, Vashkar") },
  },
  {
    id: "vastra", nome: "Vastra", img: "/forja/regioes/vastra.webp", capital: "Vosek", lang: "Vastrano", sector: "NÚCLEO · VOSEK", tag: "Megacidades verticais", tint: "#00d4ff", pin: { x: 67.8, y: 36 },
    grow: "Megacidades verticais, neon, drones, escalpos, consumo, competição e vigilância constante.",
    mark: "Conhece o centro do Império por dentro: seus sistemas, suas promessas, suas desigualdades e seus pontos cegos.",
    lore: [
      "Vastra é a região mais urbanizada do Império e seu coração político, financeiro e industrial. Megacidades de vidro e aço, ruas iluminadas por neon e vigilância constante de drones dominam a paisagem. O que alguém exibe costuma dizer tanto quanto aquilo que faz: escalpos recentes, conexões velozes e cargos influentes compõem a linguagem social.",
      "A liberdade pessoal existe dentro de limites rígidos. A desigualdade aparece na distância entre distritos altos e luminosos e zonas baixas, superlotadas e próximas do colapso. Quem cresce em Vastra aprende a reconhecer sistemas eficientes, promessas imperiais e os pontos cegos que ambos produzem.",
    ],
    namesNote: "Os nomes vastranos são duros e consonantais.",
    names: { f: L("Annika, Calina, Chiara, Elira, Irena, Maelis, Niva, Renna, Sorela, Talia"), m: L("Artan, Dalen, Elian, Miro, Niko, Oskar, Rivan, Soren, Tomasen, Varek"), s: L("Brevik, Dornel, Karsten, Kessel, Malk, Orvan, Roven, Sarn, Valek, Voss") },
  },
]
