"""Docs honesty check: every code name, file path and line hint in docs/dev/*.md must exist in the code.

    python -I tools/doc_check.py              check docs/dev (exit 1 if anything is missing)
    python -I tools/doc_check.py --lines      also warn when a "(~L123)" hint is more than 80 lines off
    python -I tools/doc_check.py -v           list every unresolved token, not just the first 40

What it checks, in `backticks` only (plain prose is ignored):
  * paths (contain "/" or end in .js/.py/.md/.yaml/.css/.html/.mjs/.json) -> the file or folder exists
  * identifiers (foo, W.foo, G.fun.attack, D.TUNE.combat.parry, CFT.api) -> the LAST name part appears as a word
    somewhere in the code (theme/assets, client_code, server_code, tools, anvil.yaml)
  * with --lines: `name` (~L123) or name ~L123 -> name is defined within 80 lines of 123 in the file that the same
    table row / bullet / paragraph names

Why: these docs are used to judge AI-written code. A doc that names a function that no longer exists is worse
than no doc, so run this after every change (tools/check.py runs it too) and fix or regenerate the stale page.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs" / "dev"
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

CODE_DIRS = ["theme/assets", "client_code", "server_code", "tools"]
CODE_EXT = {".js", ".mjs", ".py", ".yaml", ".html", ".css", ".json"}
SKIP_CODE = {"three.min.js", "three-gltf.js"}
PATH_EXT = (".js", ".py", ".md", ".yaml", ".yml", ".css", ".html", ".mjs", ".json", ".glb", ".jpg", ".png", ".svg", ".bat", ".txt")
IDENT = re.compile(r"^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\(\))?$")
# Words that are fine in backticks without being code names (JS/Python keywords, units, values, CLI words).
ALLOW = set("""
true false null undefined none None True False NaN Infinity this self new var let const function return if else for
while async await import from def class lambda yield typeof instanceof object string number boolean array int float
str dict list bool any void px ms s m km x y z lat lon yaw hp xp id ids key value JSON HTML CSS URL GET POST PUT
master main git push docker chrome node python python3 npm py js md ok OK on off up down left right tab esc enter
shift ctrl alt space wheel click try catch finally
window document localStorage sessionStorage console requestAnimationFrame performance HTMLAudioElement AudioContext
Promise Math Date Object Array Map Set WeakMap fetch setTimeout setInterval
""".split())
SKIP_MARK = "<!-- doc-check: skip -->"  # put at the end of a line that names files on purpose (old / gone / placeholders)
APP_MAKER = ROOT.parent / "APP_MAKER"
ALT_PART = re.compile(r"^-{0,2}[A-Za-z_$][\w$-]*(?:\.[A-Za-z_$][\w$]*)*$")
LINE_HINT = re.compile(r"`([A-Za-z_$][\w$.]*)(?:\(\))?`\s*\(?\s*~?\s*L(\d+)")
FILE_IN_ROW = re.compile(r"([\w-]+\.(?:js|py))")
JS_DEF = re.compile(r"^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(|^\s*(?:const\s+|let\s+|var\s+)?([A-Za-z_$][\w$.]*)\s*=|^\s*([A-Za-z_$][\w$]*)\s*:\s*|^\s*(?:async\s+)?def\s+(\w+)|^\s*class\s+(\w+)")


def code_files():
    for d in CODE_DIRS:
        for p in (ROOT / d).rglob("*"):
            if p.is_file() and p.suffix in CODE_EXT and p.name not in SKIP_CODE and "__pycache__" not in p.parts:
                yield p
    yield ROOT / "anvil.yaml"


def build_vocab():
    words = set()
    for p in code_files():
        try:
            words.update(re.findall(r"[A-Za-z_$][\w$]*", p.read_text(encoding="utf-8", errors="replace")))
        except OSError:
            pass
    return words


def defs_of(path):
    out = {}
    for i, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
        m = JS_DEF.match(line)
        if m:
            name = next(g for g in m.groups() if g)
            out.setdefault(name.split(".")[-1], []).append(i)
    return out


def find_file(name):
    hits = [p for p in (ROOT / "theme" / "assets").glob(name)] + list((ROOT / "client_code").rglob(name)) + list(
        (ROOT / "server_code").rglob(name)) + list((ROOT / "tools").rglob(name))
    return hits[0] if hits else None


def path_exists(tok, doc):
    t = tok.strip().rstrip("/").split("#")[0].split("?")[0]
    t = re.sub(r"\s.*$", "", t)  # "tools/where.py --toc" -> "tools/where.py"
    if not t or "*" in t or "<" in t or "..." in t or t.startswith(("http", "~", "$", "_/", "/_/")):
        return True
    if t.startswith("APP_MAKER/"):
        return (APP_MAKER / t[len("APP_MAKER/"):]).exists()
    for base in (ROOT, doc.parent, ROOT / "theme" / "assets", ROOT / "docs"):
        if (base / t).exists():
            return True
    if "/" not in t:  # bare file name: anywhere in the project
        return find_file(t) is not None or any(ROOT.rglob(t))
    return pathlib.Path(t).is_absolute() and pathlib.Path(t).exists()


def main():
    verbose = "-v" in sys.argv
    check_lines = "--lines" in sys.argv
    if not DOCS.exists():
        print("no docs/dev folder")
        return 0
    vocab = build_vocab()
    missing, line_warn, total = [], [], 0
    def_cache = {}
    for doc in sorted(DOCS.rglob("*.md")):
        text = doc.read_text(encoding="utf-8")
        text_nofence = re.sub(r"```.*?```", lambda m: "\n" * m.group(0).count("\n"), text, flags=re.S)  # keep line numbers
        for n, line in enumerate(text_nofence.splitlines(), 1):
            if SKIP_MARK in line:
                continue
            for tok in re.findall(r"`([^`\n]+)`", line):
                tok = tok.strip()
                total += 1
                if tok.startswith((".", "[", "#", "-", "--", "<", "{", "(", "=")) or " = " in tok:
                    continue  # CSS selectors, attributes, flags, templates
                parts = tok.split("/")
                if len(parts) > 1 and all(ALT_PART.match(x) for x in parts) and not any(
                        x.lower().endswith(PATH_EXT) for x in parts) and not path_exists(tok, doc):
                    # "hp/atk/speed" or "H.mainOn/speedMul": a list of names, each must exist
                    for x in parts:
                        last = x.split(".")[-1]
                        if last not in vocab and last not in ALLOW and not last.isdigit() and len(last) > 1:
                            missing.append((doc, n, f"{tok} ({last})", "name"))
                    continue
                looks_path = "/" in tok or tok.lower().endswith(PATH_EXT)
                if looks_path and not tok.startswith(("D.", "W.", "G.", "U.", "CFT")):
                    if " " in tok and not tok.split()[0].lower().endswith(PATH_EXT) and "/" not in tok.split()[0]:
                        continue  # a command line like "python -I tools/x.py": checked by its path part below
                    first = next((w for w in tok.split() if "/" in w or w.lower().endswith(PATH_EXT)), tok)
                    if not path_exists(first, doc):
                        missing.append((doc, n, first, "path"))
                    continue
                if not IDENT.match(tok):
                    continue
                last = tok.rstrip("()").split(".")[-1]
                if last in ALLOW or last.isdigit() or len(last) < 2:
                    continue
                if last not in vocab:
                    missing.append((doc, n, tok, "name"))
            if check_lines:
                for name, ln in LINE_HINT.findall(line):
                    names = dict.fromkeys(FILE_IN_ROW.findall(line) + [doc.stem + ".js", "cft-game.js"])
                    found = []
                    for x in names:
                        f = find_file(x)
                        if f is None:
                            continue
                        defs = def_cache.setdefault(f, defs_of(f))
                        found += [(f.name, d) for d in defs.get(name.split(".")[-1], [])]
                    if found and min(abs(int(ln) - d) for _, d in found) > 80:
                        line_warn.append((doc, n, name, int(ln), ", ".join(sorted({a for a, _ in found})), [d for _, d in found][:3]))
    rel = lambda p: p.relative_to(ROOT).as_posix()
    print(f"doc_check: {total} backticked tokens in {len(list(DOCS.rglob('*.md')))} pages")
    for doc, n, tok, kind in missing[: None if verbose else 40]:
        print(f"  MISSING {kind}: {rel(doc)}:{n}  `{tok}`")
    if len(missing) > 40 and not verbose:
        print(f"  ... {len(missing) - 40} more (-v)")
    for doc, n, name, ln, fname, real in line_warn:
        print(f"  LINE DRIFT: {rel(doc)}:{n}  `{name}` says ~L{ln}, {fname} defines it at {real}")
    if missing:
        print(f"DOC CHECK FAILED: {len(missing)} unresolved")
        return 1
    print("DOC CHECK PASSED" + (f" ({len(line_warn)} line hints drifted)" if line_warn else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
