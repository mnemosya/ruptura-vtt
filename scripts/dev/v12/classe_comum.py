"""Funções comuns para gerar os pacotes de Classe v1.2 transcritos do Notion.

Cada script de Classe descreve só o conteúdo editorial; a estrutura
(envelope, progressão padrão, perfis de Atributos) vem daqui, para que
todas as Classes sigam o mesmo contrato (src/lib/rulesetV12/contracts.ts).
"""
import json
import os

RANKINGS = ["F", "E", "D", "C", "B", "A", "S", "S+"]
PA = {"F": 3, "E": 3, "D": 3, "C": 4, "B": 4, "A": 4, "S": 5, "S+": 5}
LIMITE = {"F": 3, "E": 3, "D": 3, "C": 4, "B": 4, "A": 5, "S": 5, "S+": 5}
PONTOS_PERICIA = {"F": 0, "E": 2, "D": 0, "C": 2, "B": 0, "A": 2, "S": 0, "S+": 2}
PONTOS_ATRIBUTO = {"F": 0, "E": 0, "D": 1, "C": 0, "B": 1, "A": 0, "S": 1, "S+": 0}
PONTOS_VERTENTE = {"F": 0, "E": 1, "D": 0, "C": 1, "B": 0, "A": 1, "S": 0, "S+": 1}
MAGIAS = {"F": 0, "E": 0, "D": 1, "C": 0, "B": 1, "A": 0, "S": 1, "S+": 0}

PERFIS_ATRIBUTOS = [
    {"slug": "equilibrada", "nome": "Equilibrada", "valores": [2, 1, 1]},
    {"slug": "concentrada", "nome": "Concentrada", "valores": [2, 2, 0]},
    {"slug": "especializada", "nome": "Especializada", "valores": [3, 1, 0]},
]

ENVELOPE = {"schema_version": 1, "ruleset_version": "1.2"}


def recurso(constante, atributo=None, mult=1, texto=""):
    r = {"constante": constante, "texto": texto}
    if atributo:
        r["atributo"] = atributo
        r["multiplicador_atributo"] = mult
    return r


def recursos_padrao(pv, pe, mana):
    """Recursos com Deslocamento, Reações e Integridade iguais em todas as Classes; PV/PE/Mana como (constante, mult)."""
    return {
        "pv": recurso(pv, "corpo", 1, f"{pv} + Corpo"),
        "pe": recurso(pe, "mente", 1, f"{pe} + Mente"),
        "mana": recurso(mana, "animo", 2, f"{mana} + (Ânimo × 2)"),
        "andar": recurso(10, "corpo", 1, "10 + Corpo"),
        "correr": recurso(20, "corpo", 2, "2 × (10 + Corpo)"),
        "reacoes": recurso(1, "mente", 1, "Mente + 1"),
        "integridade": recurso(10, "animo", 2, "10 + (Ânimo × 2)"),
    }


def perfis_pericias(abrangente, padrao, especializado):
    def p(slug, nome, q):
        return {"slug": slug, "nome": nome, "quantidades": {"valor_1": q[0], "valor_2": q[1], "valor_3": q[2]}}
    return [p("abrangente", "Abrangente", abrangente), p("padrao", "Padrão", padrao), p("especializado", "Especializado", especializado)]


def progressao(recursos_classe_por_ranking):
    """recursos_classe_por_ranking: dict ranking -> dict de recursos próprios (ou None)."""
    out = {}
    for r in RANKINGS:
        item = {
            "ranking": r,
            "pontos_pericia": PONTOS_PERICIA[r],
            "limite_pericia": LIMITE[r],
            "pontos_atributo": PONTOS_ATRIBUTO[r],
            "pontos_vertente": PONTOS_VERTENTE[r],
            "magias_adicionais": MAGIAS[r],
            "pa": PA[r],
            "escolhe_subclasse": r == "E",
        }
        extra = (recursos_classe_por_ranking or {}).get(r)
        if extra:
            item["mudancas_recursos_classe"] = extra
        out[r] = item
    return out


def feature(slug, nome, *paragrafos, efeitos=None):
    f = {"slug": slug, "nome": nome, "descricao": "\n\n".join(paragrafos)}
    if efeitos:
        f["efeitos"] = efeitos
    return f


def classe(slug, nome, descricao, papel, secundarios, criacao, caracteristicas, subclasses, recursos_classe):
    return {
        **ENVELOPE,
        "slug": slug,
        "nome": nome,
        "descricao": descricao,
        "papel_principal": papel,
        "papeis_secundarios": secundarios,
        "criacao": criacao,
        # Aceita uma característica ou uma lista por Ranking.
        "caracteristicas": {r: (v if isinstance(v, list) else [v]) for r, v in caracteristicas.items()},
        "subclasses": [s["slug"] for s in subclasses],
        "progressao": progressao(recursos_classe),
    }


def subclasse(slug, nome, classe_slug, descricao, e, c, a):
    return {**ENVELOPE, "slug": slug, "nome": nome, "classe_slug": classe_slug, "descricao": descricao,
            "caracteristicas": {"E": e, "C": c, "A": a}}


def criacao(perfis_per, valor3, valor2, recursos, sinergia, aretz=3000, mochila=10):
    return {
        "perfis_atributos": PERFIS_ATRIBUTOS,
        "perfis_pericias": perfis_per,
        "pericias_valor_3": valor3,
        "pericias_valor_2": valor2,
        "pericias_valor_1": "qualquer_nao_escolhida",
        "recursos": recursos,
        "vertentes_primarias": "qualquer",
        "sinergia_vertentes": sinergia,
        "equipamento_inicial": {"aretz": aretz, "espacos_mochila": mochila, "itens": []},
    }


def salvar(nome_arquivo, fonte, editada_em, cls, subs, pendencias=None):
    bundle = {
        "_meta": {
            "ruleset_version": "1.2",
            "fonte": fonte,
            "fonte_editada_em": editada_em,
            "extraido_em": "2026-10-01",
            "pendencias_editoriais": pendencias or [
                "equipamento_inicial: os pacotes recomendados 1 e 2 ainda são placeholders no Notion; nenhum item foi inferido."
            ],
        },
        "classes": [cls],
        "subclasses": subs,
        "backgrounds": [],
        "qualities": [],
        "complications": [],
    }
    raiz = os.path.join(os.path.dirname(__file__), "..", "..", "..", "content", "v12")
    caminho = os.path.normpath(os.path.join(raiz, nome_arquivo))
    with open(caminho, "w", encoding="utf-8") as f:
        f.write(json.dumps(bundle, ensure_ascii=False, indent=2) + "\n")
    print(caminho)
