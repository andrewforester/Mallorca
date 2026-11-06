def both(base, v=1.0):
    return {f"{base}L": v, f"{base}R": v}


def four(base, v=1.0):
    return {f"{base}{s}": v for s in ("UL", "UR", "DL", "DR")}


def side(arkit_side, mh_side):
    s = mh_side
    return {
        f"browDown{arkit_side}": {f"browDown{s}": 1.0, f"browLateral{s}": 0.6},
        f"browOuterUp{arkit_side}": {f"browRaiseOuter{s}": 1.0},
        f"cheekSquint{arkit_side}": {f"eyeCheekRaise{s}": 1.0},
        f"eyeBlink{arkit_side}": {f"eyeBlink{s}": 1.0},
        f"eyeLookDown{arkit_side}": {f"eyeLookDown{s}": 1.0},
        f"eyeLookUp{arkit_side}": {f"eyeLookUp{s}": 1.0},
        f"eyeLookIn{arkit_side}": {f"eyeLook{'Right' if s == 'L' else 'Left'}{s}": 1.0},
        f"eyeLookOut{arkit_side}": {f"eyeLook{'Left' if s == 'L' else 'Right'}{s}": 1.0},
        f"eyeSquint{arkit_side}": {f"eyeSquintInner{s}": 1.0, f"eyeLidPress{s}": 0.3},
        f"eyeWide{arkit_side}": {f"eyeWiden{s}": 0.7},
        f"mouthDimple{arkit_side}": {f"mouthDimple{s}": 1.0},
        f"mouthFrown{arkit_side}": {f"mouthCornerDepress{s}": 1.0},
        f"mouthLowerDown{arkit_side}": {f"mouthLowerLipDepress{s}": 1.0},
        f"mouthPress{arkit_side}": {f"mouthPressU{s}": 0.45, f"mouthPressD{s}": 0.45},
        f"mouthSmile{arkit_side}": {f"mouthCornerPull{s}": 1.0},
        f"mouthStretch{arkit_side}": {f"mouthStretch{s}": 1.0},
        f"mouthUpperUp{arkit_side}": {f"mouthUpperLipRaise{s}": 1.0},
        f"noseSneer{arkit_side}": {f"noseWrinkle{s}": 1.0},
    }


ARKIT = {
    **side("Left", "L"),
    **side("Right", "R"),
    "browInnerUp": both("browRaiseIn", 0.8),
    "cheekPuff": both("mouthCheekBlow"),
    "jawForward": {"jawFwd": 1.0},
    "jawLeft": {"jawLeft": 1.0},
    "jawRight": {"jawRight": 1.0},
    "jawOpen": {"jawOpen": 1.0},
    "mouthFunnel": four("mouthFunnel"),
    "mouthLeft": {"mouthLeft": 1.0},
    "mouthRight": {"mouthRight": 1.0},
    "mouthPucker": {**four("mouthLipsPurse"), **four("mouthLipsTowards", 0.4)},
    "mouthRollLower": both("mouthLowerLipRollIn", 0.45),
    "mouthRollUpper": both("mouthUpperLipRollIn", 0.45),
    "mouthShrugLower": {"jawChinRaiseDL": 0.4, "jawChinRaiseDR": 0.4},
    "mouthShrugUpper": {"jawChinRaiseUL": 0.5, "jawChinRaiseUR": 0.5},
    "tongueOut": {"tongueOut": 1.0, "jawOpen": 0.25},
}

RELATIVE = {
    "mouthClose": ({"jawOpen": 1.0, **four("mouthLipsTogether")}, {"jawOpen": 1.0}),
    "tongueOut": ({"tongueOut": 1.0, "jawOpen": 0.25}, {"jawOpen": 0.25}),
}

VISEMES = {
    "viseme_sil": {},
    "viseme_PP": {**four("mouthLipsTogether"), **both("mouthPressU", 0.3), **both("mouthPressD", 0.3)},
    "viseme_FF": {**both("mouthLowerLipBite", 0.7), **both("mouthUpperLipRaise", 0.25), "jawOpen": 0.08},
    "viseme_TH": {"jawOpen": 0.18, "tongueOut": 0.35, "tongueTipUp": 0.4},
    "viseme_DD": {"jawOpen": 0.2, "tongueTipUp": 0.6, **both("mouthStretch", 0.2)},
    "viseme_kk": {"jawOpen": 0.25, **both("mouthStretch", 0.3), "tongueUp": 0.4},
    "viseme_CH": {**four("mouthFunnel", 0.5), **four("mouthLipsPurse", 0.3), "jawOpen": 0.12},
    "viseme_SS": {"jawOpen": 0.06, **both("mouthStretch", 0.4), **both("mouthCornerPull", 0.15)},
    "viseme_nn": {"jawOpen": 0.14, "tongueTipUp": 0.7},
    "viseme_RR": {**four("mouthFunnel", 0.4), **four("mouthLipsPurse", 0.3), "jawOpen": 0.14},
    "viseme_aa": {"jawOpen": 0.55, **both("mouthLowerLipDepress", 0.2)},
    "viseme_E": {"jawOpen": 0.3, **both("mouthStretch", 0.5), **both("mouthUpperLipRaise", 0.2)},
    "viseme_I": {"jawOpen": 0.15, **both("mouthStretch", 0.45), **both("mouthCornerPull", 0.3)},
    "viseme_O": {"jawOpen": 0.38, **four("mouthFunnel", 0.7), **four("mouthLipsPurse", 0.2)},
    "viseme_U": {**four("mouthLipsPurse", 0.8), **four("mouthFunnel", 0.4), "jawOpen": 0.1},
}



def mapping():
    out = {name: dict(v) for name, v in ARKIT.items()}
    for name, (full, base) in RELATIVE.items():
        out[name] = {k: round(v - base.get(k, 0.0), 6) for k, v in full.items() if v - base.get(k, 0.0) > 1e-6}
    out.update({name: dict(v) for name, v in VISEMES.items()})
    return out
