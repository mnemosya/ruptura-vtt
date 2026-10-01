"""Converte o resultado de `notion-fetch` (JSON com o campo `text`) em texto
limpo, preservando a hierarquia de títulos e as linhas de tabela ("| a | b |").
Uso: python3 limpar_notion.py <entrada> <saida.txt>
"""
import json
import re
import sys


def limpar(raw: str) -> str:
    try:
        t = json.loads(raw)["text"]
    except Exception:
        t = raw
    t = t[t.find("<content>") + len("<content>"):t.rfind("</content>")]
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", t)
    t = re.sub(r"<colgroup>.*?</colgroup>", "", t, flags=re.S)

    def linha_tabela(m):
        celulas = re.findall(r"<td>(.*?)</td>", m.group(0), flags=re.S)
        return "| " + " | ".join(c.strip() for c in celulas) + " |"

    t = re.sub(r"<tr>.*?</tr>", linha_tabela, t, flags=re.S)
    t = re.sub(r"</?table[^>]*>", "", t)
    t = re.sub(r"<span[^>]*>(.*?)</span>", r"\1", t, flags=re.S)
    t = re.sub(r"<callout[^>]*>|</callout>|<mention-page[^>]*/>|<unknown[^>]*/>", "", t)
    t = re.sub(r"<summary>(.*?)</summary>", r"\1:", t)
    t = re.sub(r"</?details>", "", t)
    t = t.replace('{toggle="true"}', "")
    t = t.replace("**", "").replace("`", "").replace("\\[", "[").replace("\\]", "]")
    linhas = [l.strip() for l in t.split("\n")]
    return "\n".join(l for l in linhas if l and l != "---")


if __name__ == "__main__":
    texto = limpar(open(sys.argv[1], encoding="utf-8").read())
    open(sys.argv[2], "w", encoding="utf-8").write(texto + "\n")
    print(len(texto))
