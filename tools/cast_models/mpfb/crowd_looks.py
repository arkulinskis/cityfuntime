"""The looks of City Fun Time's townspeople (2026-11-27): plain Python, no Blender, so tools/cast_models/build.py can
read them for the manifest. build_crowd.py builds each entry. Fields: g gender 0/1, age, muscle, weight, race (asian,
caucasian, african), skin, eyes, brows, hair + colour, clothes {mhclo: top/bottom/whole sRGB colour}, facial
(beard | mustache | stubble), extra (glasses | watch), h height in metres. Ids are saved in players' sweethearts: keep
them (add new ones, don't rename).
"""


def P(g, age, race, skin, hair, hair_col, clothes, h, eyes="brown", brows="eyebrow001", mu=0.5, we=0.5, **kw):
    return dict(g=g, age=age, mu=mu, we=we, race=race, skin=skin, eyes=eyes, brows=brows, hair=hair, hair_col=hair_col,
                clothes=clothes, h=h, **kw)


CAU, AFR, ASI = (0.0, 1.0, 0.0), (0.0, 0.05, 0.95), (1.0, 0.0, 0.0)
MIX1, MIX2 = (0.0, 0.5, 0.5), (0.45, 0.45, 0.1)
CROWD = {
    # women
    "w1": P(0, 24, CAU, "young_caucasian_female", "ponytail01", "#c9a46a", {"female_casualsuit02": dict(top="#2f8f8a", bottom="#3b4f78"), "shoes04": {}}, 1.66, eyes="blue", brows="eyebrow003"),
    "w2": P(0, 22, AFR, "young_african_female", "afro01", "#1b1310", {"female_sportsuit01": dict(top="#e2558c", bottom="#202024"), "shoes06": dict(whole="#ececf0")}, 1.68, brows="eyebrow004"),
    "w3": P(0, 45, ASI, "middleage_asian_female", "bob01", "#141010", {"female_elegantsuit01": dict(top="#24345e", bottom="#4b4f58"), "shoes05": dict(whole="#1a1a1a")}, 1.6, brows="eyebrow006"),
    "w4": P(0, 27, ASI, "young_asian_female", "long01", "#120e0d", {"female_casualsuit01": dict(top="#f1efe9", bottom="#41567d"), "shoes02": {}}, 1.62, brows="eyebrow005"),
    "w5": P(0, 41, CAU, "middleage_caucasian_female", "bob02", "#5a3a26", {"female_casualsuit02": dict(top="#7a1f33", bottom="#1f1f24"), "shoes05": dict(whole="#3a2416")}, 1.67, eyes="green", we=0.6),
    "w6": P(0, 72, CAU, "old_caucasian_female", "bob02", "#c8c4be", {"female_casualsuit01": dict(top="#c9b48f", bottom="#5a4636"), "shoes02": {}}, 1.6, eyes="grey", brows="eyebrow002", we=0.6, extra=["glasses"]),
    "w7": P(0, 38, AFR, "middleage_african_female", "braid01", "#1a1210", {"female_elegantsuit01": dict(top="#e8b52c", bottom="#262628"), "shoes05": dict(whole="#1a1a1a")}, 1.72, brows="eyebrow004"),
    "w8": P(0, 26, CAU, "young_caucasian_female2", "long01", "#7a3a1e", {"female_sportsuit01": dict(top="#8d939c", bottom="#26272c"), "shoes06": {}}, 1.7, eyes="bluegreen", brows="eyebrow003", mu=0.6),
    "w9": P(0, 70, AFR, "old_african_female", "bob01", "#b4b0aa", {"female_elegantsuit01": dict(top="#2d6a4f", bottom="#2d6a4f"), "shoes02": {}}, 1.63, we=0.65),
    "w10": P(0, 21, MIX1, "young_african_female", "ponytail01", "#2a1a12", {"female_casualsuit01": dict(top="#e9772e", bottom="#3b5480"), "shoes04": {}}, 1.65, eyes="brownlight", brows="eyebrow006"),
    "w11": P(0, 39, ASI, "middleage_asian_female", "ponytail01", "#18120f", {"female_casualsuit02": dict(top="#9b8cc8", bottom="#55575e"), "shoes03": {}}, 1.58, brows="eyebrow005"),
    "w12": P(0, 74, ASI, "old_asian_female", "bob02", "#9c9892", {"female_casualsuit01": dict(top="#6b7040", bottom="#2e2e30"), "shoes02": {}}, 1.54, brows="eyebrow002", extra=["glasses"]),
    # men
    "m1": P(1, 25, CAU, "young_caucasian_male", "short02", "#5b3d28", {"male_casualsuit01": dict(top="#3c6e9e", bottom="#2c3440"), "shoes03": {}}, 1.8, eyes="blue", brows="eyebrow011"),
    "m2": P(1, 23, AFR, "young_african_male", "short01", "#0e0c0b", {"male_casualsuit04": dict(top="#c0392b", bottom="#3a4a6b"), "shoes06": dict(whole="#ececf0")}, 1.83, brows="eyebrow010", mu=0.65),
    "m3": P(1, 46, CAU, "middleage_caucasian_male", "short03", "#6b5a48", {"male_worksuit01": dict(top="#f07b16", bottom="#2b3346"), "shoes01": {}}, 1.78, eyes="grey", brows="eyebrow007", we=0.65, facial="stubble"),
    "m4": P(1, 48, ASI, "middleage_asian_male", "short01", "#15110f", {"male_elegantsuit01": dict(whole="#33363c"), "shoes02": {}}, 1.72, brows="eyebrow008", extra=["glasses"]),
    "m5": P(1, 71, CAU, "old_caucasian_male", "", "#8e8880", {"male_casualsuit05": dict(top="#7d8c96", bottom="#4c4a44"), "fedora_cocked": dict(whole="#3e4a3a"), "shoes02": {}}, 1.74, eyes="grey", brows="eyebrow009", we=0.6, facial="mustache"),
    "m6": P(1, 21, ASI, "young_asian_male", "short04", "#100d0c", {"male_casualsuit06": dict(top="#1f1f22", bottom="#5e6340"), "shoes06": {}}, 1.74, brows="eyebrow005"),
    "m7": P(1, 40, AFR, "middleage_african_male", "", "#0e0c0b", {"male_casualsuit02": dict(top="#3d6b45", bottom="#8a7a5c"), "shoes03": {}}, 1.86, brows="eyebrow010", mu=0.7, we=0.6, facial="beard"),
    "m8": P(1, 29, CAU, "young_caucasian_male2", "long01", "#3a2a1e", {"male_casualsuit03": dict(top="#8a8f96", bottom="#34445e"), "shoes04": {}}, 1.81, eyes="bluegreen", brows="eyebrow011", facial="stubble"),
    "m9": P(1, 68, AFR, "old_african_male", "short01", "#8f8b86", {"male_elegantsuit01": dict(whole="#5a4330"), "shoes02": {}}, 1.76, brows="eyebrow009", we=0.6, extra=["glasses"]),
    "m10": P(1, 43, CAU, "middleage_caucasian_male", "short04", "#b89462", {"male_casualsuit05": dict(top="#8fb5d8", bottom="#9a8b6c"), "shoes03": {}}, 1.84, eyes="blue", brows="eyebrow007", we=0.7, facial="beard"),
    "m11": P(1, 20, MIX1, "young_african_male", "afro01", "#1a1210", {"male_casualsuit06": dict(top="#ededed", bottom="#202024"), "shoes06": dict(whole="#d43a3a")}, 1.79, brows="eyebrow010"),
    "m12": P(1, 69, ASI, "old_asian_male", "short02", "#a6a29c", {"male_casualsuit03": dict(top="#28365a", bottom="#5a5c62"), "shoes02": {}}, 1.68, brows="eyebrow008"),
    "m13": P(1, 35, MIX2, "middleage_asian_male", "short02", "#16110e", {"male_casualsuit04": dict(top="#f2c230", bottom="#33363d"), "shoes04": {}}, 1.76, brows="eyebrow008", facial="mustache"),
    "w13": P(0, 33, MIX2, "middleage_caucasian_female", "braid01", "#24180f", {"female_sportsuit01": dict(top="#3f9c6d", bottom="#2a2c36"), "shoes06": dict(whole="#ececf0")}, 1.64, brows="eyebrow001"),
    # kids (W.isKid: the game keeps them small; these bodies are 10 year olds)
    "k1": P(1, 10, CAU, "young_caucasian_male", "short02", "#7a5634", {"male_casualsuit04": dict(top="#2f74c0", bottom="#3a3f4a"), "shoes06": {}}, 1.38, eyes="blue", brows="eyebrow005"),
    "k2": P(0, 10, AFR, "young_african_female", "ponytail01", "#1a1210", {"female_casualsuit01": dict(top="#ef6aa5", bottom="#41567d"), "shoes04": {}}, 1.36, brows="eyebrow006"),
    "k3": P(1, 10, ASI, "young_asian_male", "short01", "#120e0d", {"male_casualsuit06": dict(top="#3f9c4a", bottom="#26272c"), "shoes03": {}}, 1.35, brows="eyebrow005"),
    "k4": P(0, 10, CAU, "young_caucasian_female", "bob01", "#d6b06a", {"female_casualsuit01": dict(top="#f2c230", bottom="#5b4fc0"), "shoes06": dict(whole="#ececf0")}, 1.37, eyes="blue", brows="eyebrow003"),
}


def meta(cid):
    """What the game's picker (cft-world W.crowdFor) needs: gender, age, kid, skin tone (0-1 luminance), height."""
    c = CROWD[cid]
    a, ca, af = c["race"]
    tone = (a * 0.72 + ca * 0.82 + af * 0.42) / max(a + ca + af, 1e-6)
    return dict(g=int(c["g"]), age=c["age"], kid=c["age"] < 14, tone=round(tone, 2), h=c["h"])
