"""Embed SVG geometry used by FilledIcon; keep attribution in source SVGs."""
from pathlib import Path
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]

# Art-only boxes for exports with attribution margins.
ART_BOXES = {'noun_Audio_8196748': [0, 0, 100, 100],
 'noun_Climbing_5026510(ascensor)': [0, 0, 32.0, 32.0],
 'noun_Gloves_8340735': [0, 0, 100, 100],
 'noun_Handcuffs_699304': [0, 0, 60.0, 60.0],
 'noun_HangGlider_8112644': [0, 0, 100.0, 100.0],
 'noun_Heart_5999211': [0, 0, 60.0, 60.0],
 'noun_Lockpick_6989497': [0, 0, 100, 100],
 'noun_Zipline_268825': [0, 0, 100.0, 100.0],
 'noun_beauty_3677917': [0, 0, 60.0, 60.0],
 'noun_block_5432800': [0, 0, 24, 24],
 'noun_digitalwallet_8310695': [0, 0, 100, 100],
 'noun_flashdrive_4483089': [0, 0, 100.0, 100.0],
 'noun_globaltracking_6583453': [0, 0, 64.0, 64.0],
 'noun_hacker_5879592': [0, 0, 100, 100],
 'noun_id_7920951': [0, 0, 100.0, 100.0],
 'noun_neural_4128305': [0, 0, 24.0, 24.0],
 'noun_paint_6045428': [0, 0, 8.4666, 8.4666],
 'noun_runningshoe_8228716(antiderrapantes)': [0, 0, 100, 100],
 'noun_skippingrope_1553123': [0, 0, 100, 100],
 'noun_spray_8421659': [0, 0, 100, 100],
 'noun_vr_2226896': [0, 0, 64.0, 64.0]}

ART_BOXES["noun_Scanner_7959164"] = [0, 0, 100, 100]
ART_BOXES["noun_Lung_4303915"] = [0, 0, 90, 90]
ART_BOXES["noun_Boot_2249240"] = [0, 0, 32, 32]
ART_BOXES["noun_Bike_8339085"] = [0, 0, 100, 100]
ART_BOXES["noun_Tool_8303078"] = [0, 0, 100, 100]
ART_BOXES.update({
    "noun_armadurasubdermica_7991712": [0, 0, 100, 100],
    "noun_elixir_8401397": [0, 0, 100, 100],
    "noun_immunity_3883965": [0, 0, 100, 100],
    "noun_kiss_6493561": [0, 0, 32, 32],
    "noun_mana_8219198": [0, 0, 100, 100],
})

data = {}
for folder in ("filled icons", "energy", "legacy"):
    for source in sorted((ROOT / "icones" / folder).glob("*.svg")):
        root = ET.parse(source).getroot()
        view_box = [float(n) for n in root.attrib["viewBox"].split()]
        if source.stem in ("noun_drugs_7809670", "dorsal", "noun_Drone_8335890", "noun_ElectricScooter_8291684", "noun_Hoverboard_7742758", "noun_Robot_8483832", "noun_respiratormask_6792995", "noun_bionicleg_7356680", "noun_bionicrobotarm_7001919", "noun_Flashlight_8418741", "noun_Paper_8227159"):
            # O desenho ocupa 0..100; as margens extras incluem créditos abaixo.
            assert view_box == [-5, -10, 110, 135], source
            view_box = [0, 0, 100, 100]
        if source.stem == "noun_RollerSkate_5192593":
            assert view_box == [0, 0, 64, 80], source
            view_box = [0, 0, 64, 64]
        if source.stem in ("noun_Skateboard_1293918", "noun_earlistening_5252153", "noun_medkit_5794368"):
            assert view_box == [0, 0, 100, 125], source
            view_box = [0, 0, 100, 100]
        if source.stem == "noun_bioniccontact_6410565":
            assert view_box == [0, 0, 24, 30], source
            view_box = [0, 0, 24, 24]
        if folder == "energy":
            # Noun exports use the extra bottom 22.5 units for credit text.
            assert view_box == [0, 0, 90, 112.5], source
            view_box = [0, 0, 90, 90]
        view_box = ART_BOXES.get(source.stem, view_box)
        css_rules = {}
        for style in root.iter():
            if style.tag.split("}")[-1] == "style":
                for cls, body in re.findall(r"\.([\w-]+)\s*\{([^}]+)\}", style.text or ""):
                    rule = re.search(r"fill-rule\s*:\s*(evenodd|nonzero)", body)
                    if rule:
                        css_rules[cls] = rule.group(1)
        paths = []
        parents = {child: parent for parent in root.iter() for child in parent}
        for element in list(root.iter())[1:]:
            tag = element.tag.split("}")[-1]
            attrs = element.attrib
            if tag in ("g", "text", "title", "desc", "metadata", "defs", "style", "switch", "foreignObject"):
                if tag == "g":
                    assert all(k in {"transform", "fill-rule", "data-name", "fill", "stroke", "stroke-width"} or k.startswith("{") for k in attrs), source
                continue
            if tag == "path":
                d = attrs["d"]
            elif tag == "polygon":
                points = re.findall(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", attrs["points"])
                assert len(points) % 2 == 0, source
                pairs = [f"{points[i]} {points[i+1]}" for i in range(0, len(points), 2)]
                d = "M" + "L".join(pairs) + "Z"
            elif tag == "rect":
                assert "rx" not in attrs and "ry" not in attrs, source
                x, y = float(attrs.get("x", 0)), float(attrs.get("y", 0))
                w, h = float(attrs["width"]), float(attrs["height"])
                d = f"M{x} {y}h{w}v{h}h{-w}Z"
            elif tag == "circle":
                x, y, r = (float(attrs[k]) for k in ("cx", "cy", "r"))
                d = f"M{x-r} {y}a{r} {r} 0 1 0 {2*r} 0a{r} {r} 0 1 0 {-2*r} 0Z"
            else:
                raise ValueError(f"Unsupported SVG element {tag}: {source}")
            ancestry = [element]
            while ancestry[-1] in parents:
                ancestry.append(parents[ancestry[-1]])
            transforms = [node.attrib["transform"] for node in reversed(ancestry) if "transform" in node.attrib]
            fill_rule = next((node.attrib["fill-rule"] for node in ancestry if "fill-rule" in node.attrib), "nonzero")
            fill_rule = css_rules.get(attrs.get("class"), fill_rule)
            path = {"d": d, "fillRule": fill_rule}
            if transforms:
                path["transform"] = " ".join(transforms)
            paths.append(path)
        assert paths, source
        assert source.stem not in data, source
        data[source.stem] = {"viewBox": view_box, "paths": paths}

target = ROOT / "src/app/_design/filledIconData.ts"
target.write_text("// Generated by scripts/dev/generate-filled-icons.py from icones SVGs.\n"
                  "export const FILLED_ICON_DATA = " + json.dumps(data, indent=2) + " as const;\n")
print(f"Embedded {len(data)} filled icons")
