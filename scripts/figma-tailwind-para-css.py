"""Converte as classes Tailwind que o Figma emite em estilo CSS inline.

Só os padrões que aparecem NESTE arquivo — não é um Tailwind completo, e
não deve ser: qualquer classe que o conversor não conheça é reportada em
vez de silenciosamente ignorada, senão a cópia sairia diferente do
desenho sem ninguém perceber.
"""
import re, sys, json

NOME_VALIDO = re.compile(r'^--[A-Za-z0-9_-]+$')

def resolver_vars(v: str) -> str:
    """Troca `var(--nome, fallback)` pelo fallback quando o NOME é
    inválido em CSS.

    O Figma nomeia variáveis com BARRA (`--size/line-width/linewidth`) e
    com PARÊNTESES (`--stroke-button-(primary)`), e nenhum dos dois é
    identificador válido: a declaração inteira vira erro de parse e o
    navegador a DESCARTA — sem aviso no console. Os dois sintomas já
    apareceram aqui: largura de borda sumindo (fio invisível) e cor de
    borda sumindo (fio no `currentColor`, branco).

    Como essas variáveis não existem em lugar nenhum do projeto, o que
    vale é sempre o fallback que o próprio arquivo declara. Varredura
    com contagem de parênteses porque o NOME pode conter parênteses —
    regex não dá conta."""
    saida, i = [], 0
    while True:
        j = v.find("var(", i)
        if j < 0:
            saida.append(v[i:]); break
        saida.append(v[i:j])
        k, prof = j + 4, 1
        virgula = -1
        while k < len(v) and prof:
            if v[k] == "(": prof += 1
            elif v[k] == ")": prof -= 1
            elif v[k] == "," and prof == 1 and virgula < 0: virgula = k
            k += 1
        inteiro, nome = v[j:k], v[j+4:(virgula if virgula > 0 else k-1)].strip()
        fallback = v[virgula+1:k-1].strip() if virgula > 0 else ""
        saida.append(inteiro if NOME_VALIDO.match(nome) or not fallback else fallback)
        i = k
    return "".join(saida)

def val(v):
    return resolver_vars(v.replace("_", " "))

def eh_medida(v):
    """`border-[length:…]` é LARGURA de borda, não cor.

    Foi o erro que apagou 17 fios da primeira cópia: o `length:` caiu
    junto com o resto num `borderColor`, e o nó ficou com cor de borda
    e largura zero — invisível, sem erro nenhum."""
    return v.startswith("length:")

DIRETO = {
  "absolute": ("position", "absolute"), "relative": ("position", "relative"),
  "block": ("display", "block"), "flex": ("display", "flex"), "grid": ("display", "grid"),
  "flex-col": ("flexDirection", "column"), "flex-row": ("flexDirection", "row"),
  "flex-none": ("flex", "none"), "shrink-0": ("flexShrink", "0"),
  "items-center": ("alignItems", "center"), "items-start": ("alignItems", "flex-start"),
  "justify-center": ("justifyContent", "center"), "justify-between": ("justifyContent", "space-between"),
  "self-stretch": ("alignSelf", "stretch"), "justify-self-stretch": ("justifySelf", "stretch"),
  "content-stretch": ("alignContent", "stretch"),
  "inset-0": ("inset", "0"), "left-0": ("left", "0"), "top-0": ("top", "0"),
  "right-0": ("right", "0"), "bottom-0": ("bottom", "0"), "left-1/2": ("left", "50%"),
  "size-full": ("__size", "100%"), "w-full": ("width", "100%"), "h-full": ("height", "100%"),
  "w-px": ("width", "1px"), "h-px": ("height", "1px"),
  "min-w-full": ("minWidth", "100%"), "min-h-px": ("minHeight", "1px"), "min-w-px": ("minWidth", "1px"),
  "max-w-none": ("maxWidth", "none"),
  "p-px": ("padding", "1px"), "py-px": ("__py", "1px"), "pb-px": ("paddingBottom", "1px"),
  "gap-px": ("gap", "1px"),
  "border": ("borderWidth", "1px"), "border-0": ("borderWidth", "0"),
  "border-b": ("borderBottomWidth", "1px"), "border-t": ("borderTopWidth", "1px"),
  "border-l": ("borderLeftWidth", "1px"), "border-r": ("borderRightWidth", "1px"),
  "border-solid": ("borderStyle", "solid"),
  "overflow-auto": ("overflow", "auto"), "overflow-clip": ("overflow", "clip"),
  "overflow-hidden": ("overflow", "hidden"),
  "uppercase": ("textTransform", "uppercase"), "not-italic": ("fontStyle", "normal"),
  "text-center": ("textAlign", "center"), "text-ellipsis": ("textOverflow", "ellipsis"),
  "whitespace-nowrap": ("whiteSpace", "nowrap"),
  "pointer-events-none": ("pointerEvents", "none"),
  "bg-clip-padding": ("backgroundClip", "padding-box"),
  "font-bold": ("fontWeight", "700"), "font-medium": ("fontWeight", "500"), "font-normal": ("fontWeight", "400"),
  "opacity-0": ("opacity", "0"), "opacity-44": ("opacity", ".44"),
  "opacity-70": ("opacity", ".7"), "opacity-89": ("opacity", ".89"),
  "-translate-x-1/2": ("__tx", "translateX(-50%)"),
  "rotate-15": ("__tx", "rotate(15deg)"), "-rotate-30": ("__tx", "rotate(-30deg)"),
  "bg-gradient-to-r": ("__grad", "to right"),
  "via-1/2": ("__via_pos", "50%"),
  # `col-N`/`row-N` do Figma são a LINHA/COLUNA da grade (1-based), não um span.
  "col-1": ("gridColumn", "1"), "col-2": ("gridColumn", "2"), "col-3": ("gridColumn", "3"),
  "row-1": ("gridRow", "1"), "row-2": ("gridRow", "2"), "row-3": ("gridRow", "3"),
  "[word-break:break-word]": ("wordBreak", "break-word"),
}
PESOS = {"Regular": "400", "Medium": "500", "SemiBold": "600", "Bold": "700"}
desconhecidas = set()

def classes_para_estilo(cls: str):
    est, grad, tx = {}, {}, []
    for c in cls.split():
        if c in DIRETO:
            k, v = DIRETO[c]
            if k == "__size": est["width"] = est["height"] = v
            elif k == "__py": est["paddingTop"] = est["paddingBottom"] = v
            elif k == "__tx": tx.append(v)
            elif k == "__grad": grad["dir"] = v
            elif k == "__via_pos": grad["viaPos"] = v
            else: est[k] = v
            continue
        m = re.match(r'^(-?)([a-z]+(?:-[a-z]+)*)-\[(.+)\]$', c)
        if not m: desconhecidas.add(c); continue
        neg, pre, v = m.group(1), m.group(2), val(m.group(3))
        if neg: v = "-" + v
        if   pre == "size": est["width"] = est["height"] = v
        elif pre == "w": est["width"] = v
        elif pre == "h": est["height"] = v
        elif pre == "p": est["padding"] = v
        elif pre == "px": est["paddingLeft"] = est["paddingRight"] = v
        elif pre == "py": est["paddingTop"] = est["paddingBottom"] = v
        elif pre == "pt": est["paddingTop"] = v
        elif pre == "pb": est["paddingBottom"] = v
        elif pre == "pl": est["paddingLeft"] = v
        elif pre == "pr": est["paddingRight"] = v
        elif pre == "gap": est["gap"] = v
        elif pre == "gap-x": est["columnGap"] = v
        elif pre == "gap-y": est["rowGap"] = v
        elif pre in ("left","top","right","bottom","inset"): est[pre] = v
        elif pre == "rounded": est["borderRadius"] = v
        elif pre == "leading": est["lineHeight"] = v
        elif pre == "tracking": est["letterSpacing"] = v
        elif pre == "shadow": est["boxShadow"] = v
        elif pre == "drop-shadow": est["filter"] = f"drop-shadow({v})"
        elif pre == "grid-cols": est["gridTemplateColumns"] = v
        elif pre == "grid-rows": est["gridTemplateRows"] = v
        elif pre == "col": est["gridColumn"] = v
        elif pre == "row": est["gridRow"] = v
        elif pre == "flex": est["flex"] = v
        elif pre == "bg": est["background"] = v
        elif pre == "from": grad["from"] = v
        elif pre == "via": grad["via"] = v
        elif pre == "to": grad["to"] = v
        elif pre == "border":
            if eh_medida(v): est["borderWidth"] = v[len("length:"):]
            else: est["borderColor"] = v
        elif pre in ("border-t","border-b","border-l","border-r"):
            # Vale por lado o mesmo do `border` inteiro: com `length:` é
            # LARGURA. O rodapé do desenho perdeu o fio exatamente aqui.
            face = {"border-t":"Top","border-b":"Bottom","border-l":"Left","border-r":"Right"}[pre]
            if eh_medida(v): est[f"border{face}Width"] = v[len("length:"):]
            else: est[f"border{face}Color"] = v
        elif pre == "font": est["fontWeight"] = v
        elif pre == "text":
            if re.match(r'^[\d.]+px$', v): est["fontSize"] = v
            else: est["color"] = v
        else: desconhecidas.add(c)
    if "dir" in grad:
        paradas = [grad.get("from","transparent")]
        if "via" in grad: paradas.append(grad["via"] + (" " + grad["viaPos"] if "viaPos" in grad else ""))
        paradas.append(grad.get("to","transparent"))
        est["backgroundImage"] = f"linear-gradient({grad['dir']}, {', '.join(paradas)})"
    if tx: est["transform"] = " ".join(tx)
    return reconciliar(est)

def px(v):
    m = re.match(r'^(-?[\d.]+)px$', str(v or ""))
    return float(m.group(1)) if m else None

def reconciliar(est):
    """Quando a ALTURA do quadro e o respiro se contradizem, a altura
    ganha.

    O Figma permite um quadro de 12px com 13px de padding — ele
    simplesmente recorta. O CSS não: com `border-box`, o padding empurra
    a caixa e ela cresce (o medidor de capacidade ia de 12px pra 28px).
    Como a altura do quadro é a MEDIDA REAL do nó (é ela que aparece no
    metadata), é ela que fica; o respiro que não cabe é descartado. Os
    filhos desses nós são posicionados em absoluto, então não perdem
    nada com isso."""
    for eixo, medida, lados in (("altura", "height", ("paddingTop", "paddingBottom")),
                                ("largura", "width", ("paddingLeft", "paddingRight"))):
        alvo = px(est.get(medida))
        if alvo is None: continue
        soma = sum(px(est.get(l)) or 0 for l in lados)
        borda = (px(est.get("borderWidth")) or 0) * 2
        if soma + borda > alvo:
            for l in lados: est.pop(l, None)
            est.pop("padding", None)
    return est

def familia(cls):
    m = re.search(r"font-\['([^']+)'\]", cls)
    if not m: return {}
    nome = m.group(1)
    if ":" in nome:
        fam, peso = nome.split(":", 1)
        return {"fontFamily": f"var(--font-{fam.lower().replace('_','-')}), sans-serif",
                "fontWeight": PESOS.get(peso, "400")}
    return {"fontFamily": f"var(--font-{nome.lower().replace('_','-')}), sans-serif"}

def js(est):
    return "{{ " + ", ".join(f'{k}: "{v}"' for k, v in est.items()) + " }}"

if __name__ == "__main__":
    fonte = open(sys.argv[1]).read()
    def troca(m):
        cls = m.group(1)
        est = {**classes_para_estilo(cls), **familia(cls)}
        return f"style={js(est)}" if est else ""
    saida = re.sub(r'className="([^"]*)"', troca, fonte)
    # Tailwind escapa `/` dentro de `var(--a\/b)`; em CSS de verdade o
    # nome da variável é sem a barra invertida.
    saida = saida.replace("\\/", "/")
    open(sys.argv[2], "w").write(saida)
    print("classes não convertidas:", sorted(desconhecidas) or "nenhuma")
