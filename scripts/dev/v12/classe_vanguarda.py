"""Vanguarda — transcrita do Notion (edição de 14/09/2026)."""
from classe_comum import classe, criacao, feature as f, perfis_pericias, recursos_padrao, salvar, subclasse

SLUG = "vanguarda"

berserker = subclasse(
    "berserker", "Berserker", SLUG,
    "Berserkers convertem ferimentos em agressividade. Avançam para a região mais violenta do combate e se tornam mais perigosos à medida que seus PV diminuem. Sua resistência mantém a ofensiva ativa quando o corpo já deveria estar cedendo.",
    [
        f("dor_e_combustivel", "Dor é Combustível",
          "Uma vez por rodada, quando sofrer uma perda de PV causada por uma criatura hostil, receba 1 Ímpeto. Esse ganho pode ocorrer mesmo que já tenha recebido Ímpeto naquela rodada de outras formas, respeitando seu limite.",
          "Depois de sofrer essa perda, você pode se deslocar 2 m em direção à criatura que a causou."),
        f("furia", "Fúria",
          "Quando seus PV atuais forem reduzidos à metade dos seus PV máximos ou menos, você entra em Fúria.",
          "Além disso, depois de receber Ímpeto por Dor é Combustível, você pode gastar 2 Ímpetos para entrar em Fúria antes de alcançar esse limite.",
          "A Fúria permanece até o final da cena.",
          "Enquanto estiver em Fúria:\n• Seus ataques corpo a corpo causam o dobro do bônus de dano de Corpo.\n• Você recebe +1 de vantagem em testes de Vigor."),
    ],
    [
        f("contra_ataque", "Contra-Ataque",
          "Você aprende a transformar os golpes sofridos em contra-ataques e resistência.",
          "Uma vez por rodada, depois que uma criatura ao seu alcance fizer você perder PV, pode gastar 2 Ímpetos e uma Reação para realizar imediatamente um ataque corpo a corpo contra ela. Se estiver em Fúria, esse ataque recebe +1 de vantagem. O ataque acontece depois da resolução do dano e dos demais efeitos que provocaram a perda de PV."),
        f("negar_a_dor", "Negar a Dor",
          "Uma vez por cena, enquanto estiver em Fúria, quando um ataque de uma criatura hostil fosse fazer você perder PV, pode gastar 2 Ímpetos para sofrer apenas metade dessa perda, arredondada para cima."),
    ],
    [
        f("limite_rompido", "Limite Rompido",
          "Uma vez por cena, enquanto estiver em Fúria, você pode romper seus limites até o final do seu próximo turno.",
          "Ao ativar esta característica:\n• Receba Ímpeto até alcançar seu limite;\n• Seus ataques corpo a corpo e manobras de combate custam –1 PA, até o mínimo de 1 PA;\n• Seus ataques corpo a corpo causam o triplo do bônus de dano de Corpo;\n• Você permanece consciente ao chegar a 0 PV;\n• Condições físicas recebidas durante o efeito ficam suspensas.",
          "Quando Limite Rompido terminar, as condições suspensas voltam a produzir seus efeitos caso suas durações ainda não tenham terminado. Se você estiver com 0 PV, entra em Colapso. Recuperar ao menos 1 PV antes desse momento permite que continue agindo normalmente."),
    ],
)

carcereiro = subclasse(
    "carcereiro", "Carcereiro", SLUG,
    "Carcereiros transformam a região ao redor em território controlado. Fecham passagens, interrompem retiradas e mantêm adversários onde representam menos perigo. Sua força está em restringir escolhas: quanto mais perto um inimigo chega, mais difícil se torna sair.",
    [
        f("sem_saida", "Sem Saída",
          "Uma vez por rodada, quando uma criatura hostil adjacente tentar se deslocar voluntariamente para mais longe de você, pode gastar uma Reação e 1 Ímpeto para realizar imediatamente uma das seguintes ações contra ela: Agarrar, Derrubar ou Empurrar.",
          "A manobra acontece antes do deslocamento e não exige PA. Se você vencer, o deslocamento é interrompido e a criatura perde os metros que ainda percorreria com aquela ação. Em um sucesso crítico, essa criatura fica impedida de usar qualquer ação de deslocamento até o início do próximo turno dela."),
    ],
    [
        f("cela_movel", "Cela Móvel",
          "Quando acertar um ataque ou vencer uma ação de Sem Saída contra uma criatura hostil adjacente, você pode gastar 2 Ímpetos para impor os seguintes efeitos até o início do seu próximo turno:\n• A criatura precisa gastar 2 m de deslocamento para percorrer cada 1 m;\n• A criatura sofre –1 de desvantagem na próxima ação defensiva dela."),
    ],
    [
        f("sentenca", "Sentença",
          "Uma vez por cena, pode gastar 1 PA e 2 Ímpetos para escolher uma quantidade de criaturas hostis a até 2 m igual ao seu valor de Corpo, mínimo de 1.",
          "Realize imediatamente uma das ações de Sem Saída contra cada criatura escolhida, sem gastar PA ou uma Reação. Você pode escolher uma ação diferente para cada criatura, e as manobras são resolvidas separadamente.",
          "Cada criatura contra a qual vencer a manobra sofre os efeitos de Cela Móvel até o início do seu próximo turno."),
    ],
)

colosso = subclasse(
    "colosso", "Colosso", SLUG,
    "Colossos dominam o confronto pelo espaço que ocupam e pela dificuldade de removê-los. Avançam através de ataques, colisões e formações inimigas sem perder terreno. Quanto maior a pressão ao redor, mais difícil se torna interromper sua marcha.",
    [
        f("corpo_colossal", "Corpo Colossal",
          "Você é considerado uma criatura Grande. Seus ataques e efeitos medem alcance a partir de qualquer célula que você ocupe."),
        f("absorver_impacto", "Absorver Impacto",
          "Uma vez por rodada, quando sofrer uma perda de PV, pode gastar 1 Ímpeto para reduzi-la em uma quantidade igual ao seu valor de Corpo, até o mínimo de 0."),
    ],
    [
        f("passo_firme", "Passo Firme",
          "Enquanto possuir ao menos 1 Ímpeto, reduza em 2 m qualquer movimento forçado aplicado a você."),
        f("abrir_caminho", "Abrir Caminho",
          "Quando gastar Ímpeto para se deslocar, você ignora terreno difícil e pode abrir caminho através de uma criatura hostil do seu tamanho ou menor. Uma vez por rodada, antes de entrar no espaço ocupado por ela, realize Empurrar ou Derrubar contra essa criatura, sem gastar PA.",
          "Se vencer a manobra, pode atravessar o espaço da criatura e continuar o deslocamento. Se perder, pare no último espaço livre antes dela. Em qualquer caso, precisa terminar o deslocamento em um espaço livre."),
    ],
    [
        f("centro_da_batalha", "Centro da Batalha",
          "Uma vez por cena, no início do seu turno, pode se tornar o Centro da Batalha até o início do seu próximo turno.",
          "Durante esse período:\n• Aplique a redução de Absorver Impacto a cada perda de PV que sofrer, sem gastar Ímpeto.\n• Você não pode ser movido contra sua vontade nem ficar Caído.\n• Uma vez por turno, quando realizar um ataque corpo a corpo, estenda o ataque a uma segunda criatura ao seu alcance."),
    ],
)

guardiao = subclasse(
    "guardiao", "Guardião", SLUG,
    "Guardiões transformam escudos em posições defensivas móveis. Interceptam ataques, absorvem impactos destinados aos aliados e avançam mantendo o grupo protegido. Com disciplina e Ímpeto, sustentam uma linha de defesa capaz de atravessar até as regiões mais expostas do confronto.",
    [
        f("arsenal_defensivo", "Arsenal Defensivo",
          "Você pode equipar um escudo como arma primária e outro como arma secundária. Cada escudo mantém seus próprios PD, e você escolhe qual deles utiliza sempre que Bloquear. Ataques corpo a corpo realizados com um escudo causam 1d6 + Corpo de dano."),
        f("posicao_de_guarda", "Posição de Guarda",
          "Uma vez por cena, durante seu turno, você pode assumir Postura Defensiva sem gastar PA."),
        f("impeto_protetor", "Ímpeto Protetor",
          "Uma vez por rodada, quando obtiver sucesso ao Bloquear um ataque contra você ou um aliado, receba 1 Ímpeto. Esse ganho pode ocorrer mesmo que você já tenha recebido Ímpeto por Ponta de Lança na mesma rodada."),
        f("interceptar", "Interceptar",
          "Uma vez por rodada, quando um aliado a até 2 m for alvo de um ataque, você pode gastar 1 Ímpeto para se deslocar até 2 m antes da resolução do ataque. Esse deslocamento não exige PA, precisa terminar adjacente ao aliado e permite que você utilize Bloquear contra o ataque.",
          "Você decide normalmente se gasta uma Reação para Bloquear. Caso realize a defesa sem gastar uma Reação, aplique a desvantagem cumulativa normalmente."),
    ],
    [
        f("abrigo_movel", "Abrigo Móvel",
          "Depois de obter sucesso ao Bloquear, você pode gastar 1 Ímpeto para criar um abrigo móvel até o início do seu próximo turno.",
          "Enquanto estiver ativo:\n• Você e seus aliados adjacentes a você recebem os benefícios de cobertura parcial.\n• Quando gastar Ímpeto para se deslocar, escolha um aliado protegido; depois do seu deslocamento, ele pode se deslocar até 2 m sem gastar PA. O aliado precisa terminar esse deslocamento a até 2 m de você."),
    ],
    [
        f("ninguem_fica_para_tras", "Ninguém Fica Para Trás",
          "Uma vez por cena, no início do seu turno, você pode assumir uma formação protetora até o início do seu próximo turno.",
          "Durante esse período:\n• O alcance de Interceptar aumenta para 4 m.\n• Interceptar não possui limite de usos por rodada.\n• Utilizar Interceptar não exige o gasto de Ímpeto.",
          "Cada bloqueio realizado durante o efeito é uma ação defensiva separada. Você decide normalmente se gasta uma Reação e acumula desvantagem pelas defesas realizadas sem Reação."),
    ],
)

subs = [berserker, carcereiro, colosso, guardiao]

vanguarda = classe(
    SLUG, "Vanguarda",
    "Vanguardas são especialistas em avançar, ocupar posições e pressionar inimigos de perto. Entram nas áreas mais perigosas do confronto, interrompem investidas e dificultam que os adversários alcancem seus aliados ou mantenham o controle do campo.\n\n"
    "Durante o combate, a Vanguarda transforma envolvimento direto em novas oportunidades. Ao conquistar terreno e permanecer junto aos inimigos, torna-se capaz de se reposicionar, fortalecer suas ações e manter a ofensiva mesmo quando cercada ou sob pressão.\n\n"
    "Uma Vanguarda pode confiar em armas, escudos e armaduras, mas também pode controlar o campo com magia ou modificar o próprio corpo para suportar o combate direto. Escolha esta classe se quiser conduzir o avanço do grupo, disputar posições importantes e obrigar os inimigos a responder à sua presença.",
    "Linha de frente", ["Proteção", "Contenção", "Avanço"],
    criacao(
        perfis_pericias((8, 5, 1), (5, 4, 2), (4, 2, 3)),
        ["intimidacao", "luta", "mobilidade", "reflexos", "vigor", "biologia"],
        ["arcanismo", "balistica", "biologia", "engenharia", "intimidacao", "luta", "mobilidade", "percepcao", "precisao", "reflexos", "vigor", "vontade"],
        recursos_padrao(13, 12, 10),
        {"biotica": 5, "cinetica": 5, "cognitiva": 3, "energetica": 4, "material": 4, "sinaptica": 1},
    ),
    {
        "F": f("ponta_de_lanca", "Ponta de Lança",
               "Sua presença na linha de frente gera Ímpeto, um recurso que representa o ritmo adquirido ao avançar e permanecer diretamente envolvido no confronto.",
               "Seu limite inicial é de 2 Ímpetos.",
               "GANHANDO ÍMPETO\nUma vez por rodada, quando entrar ou começar seu turno adjacente a uma criatura hostil, receba 1 Ímpeto. Suas Características de Subclasse podem conceder outras maneiras de ganhar Ímpeto em Rankings superiores.",
               "USANDO ÍMPETO\nDepois de realizar uma ação, você pode gastar qualquer quantidade de Ímpeto para se deslocar 2 m por Ímpeto gasto, sem gastar PA. Você pode realizar esse deslocamento uma vez depois de cada ação. Todo o Ímpeto destinado ao deslocamento deve ser gasto ao iniciá-lo. Suas Características de Classe e de Subclasse concedem outras maneiras de utilizar Ímpeto em Rankings superiores.",
               "PERDENDO ÍMPETO\nVocê perde todos os Ímpetos quando a cena termina ou quando encerra seu turno sem estar diretamente envolvido no confronto. Para permanecer envolvido, você precisa estar adjacente a uma criatura hostil, ocupando uma posição ameaçada por ela ou participando diretamente de uma disputa ainda ativa determinada pelo Narrador."),
        "D": f("ganhar_terreno", "Ganhar Terreno",
               "Seu limite aumenta para 3 Ímpetos.",
               "Além disso, cada Ímpeto passa a poder ser gasto de uma das seguintes maneiras:\n• Avançar: depois de realizar uma ação, deslocar-se 2 m sem gastar PA;\n• Pressionar: depois de acertar um ataque ou vencer uma manobra de combate, aumentar em 1 a margem de sucesso.",
               "Você pode gastar vários Ímpetos após a mesma ação, repetindo ou combinando esses efeitos. Cada Ímpeto gasto concede uma aplicação."),
        "B": f("presenca_dominante", "Presença Dominante",
               "Enquanto possuir 3 Ímpetos, criaturas hostis adjacentes a você sofrem –2 de desvantagem em ataques e manobras de combate que não tenham você entre os alvos."),
        "S": f("avanco_irrefreavel", "Avanço Irrefreável",
               "Seu limite aumenta para 4 Ímpetos.",
               "Uma vez por rodada, depois de gastar um ou mais Ímpetos e ainda possuir pelo menos 1 Ímpeto, recupere 1 Ímpeto. Essa recuperação acontece depois que o efeito que exigiu o gasto for resolvido.",
               "Além disso, quando fosse perder todos os seus Ímpetos por encerrar o turno fora do confronto, conserve 1 Ímpeto."),
    },
    subs,
    {r: {"limite_impeto": v} for r, v in {"F": 2, "E": 2, "D": 3, "C": 3, "B": 3, "A": 3, "S": 4, "S+": 4}.items()},
)

salvar("db_classe_vanguarda_v1_2.json", "https://app.notion.com/p/3d90a1363552807aad18f3d230b68c40", "2026-09-14T23:11:38.554Z", vanguarda, subs)
