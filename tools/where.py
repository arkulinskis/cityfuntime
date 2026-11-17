"""Where does a feature live? Prints exact line ranges, so a fix opens only the lines it needs (no tokens wasted).

    python -I tools/where.py parry block               rows of FIX_INDEX.md + definitions + hits for these words
    python -I tools/where.py --def strike windUp       only the definitions (function / method bodies, start-end)
    python -I tools/where.py --toc cft-fun.js          table of contents of one file: every section and definition with its range
    python -I tools/where.py --tune hype               the D.TUNE knobs matching a word (cft-content.js)

Ranges run from a definition to the line before the next definition or section marker in the same file, so
`Read file offset=start limit=(end-start+1)` gets exactly that piece. Searches theme/assets/*.js (the engine),
client_code and server_code (Python) and FIX_INDEX.md. Words match case-insensitively; all words must appear
(in an index row) or any word (in a definition name).
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
SKIP = {"three.min.js", "ark-music.js", "legal-kit.js", "app-kit.js"}
JS_DEF = re.compile(r"^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(|^\s*(?:const\s+|let\s+|var\s+)?([A-Za-z_$][\w$.]*)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)|^\s*([A-Za-z_$][\w$]*)\s*:\s*(?:async\s+)?function")
PY_DEF = re.compile(r"^\s*(?:async\s+)?def\s+(\w+)\s*\(|^\s*class\s+(\w+)")
SECTION = re.compile(r"^\s*(?://|#)\s*-{6,}\s*(.+?)\s*$|^\s*/\*\s*={3,}\s*(.+?)\s*={3,}\s*\*/|^\s*//\s*={6,}\s*(.+?)\s*$")


def files():
    out = [p for p in sorted((ROOT / "theme" / "assets").glob("*.js")) if p.name not in SKIP]
    for sub in ("client_code", "server_code"):
        out += sorted((ROOT / sub).rglob("*.py"))
    return out


def marks(path):
    """[(line, kind, name)] for definitions and section markers, in order."""
    res = []
    py = path.suffix == ".py"
    for i, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
        m = SECTION.match(line)
        if m:
            res.append((i, "section", next(g for g in m.groups() if g)))
            continue
        m = (PY_DEF if py else JS_DEF).match(line)
        if m:
            name = next(g for g in m.groups() if g)
            if len(line) - len(line.lstrip()) <= 6 or py:  # top-level-ish definitions only (closures inside are part of their parent)
                res.append((i, "def", name))
    return res


def js_end(lines, i):
    """Line (1-based) where the body starting on line i (1-based) closes: braces counted outside strings and comments."""
    depth, seen, q = 0, False, None
    for j in range(i - 1, min(len(lines), i + 1500)):
        line, k = lines[j], 0
        while k < len(line):
            c = line[k]
            if q:
                if c == "\\":
                    k += 1
                elif c == q:
                    q = None
            elif c in "'\"`":
                q = c
            elif c == "/" and line[k + 1:k + 2] == "/":
                break
            elif c == "{":
                depth += 1; seen = True
            elif c == "}":
                depth -= 1
                if seen and depth <= 0:
                    return j + 1
            k += 1
        if q != "`":
            q = None  # unclosed quote on a line (a regex): forget it
        if not seen and j > i + 1:
            return i  # a one-liner without a body
    return i


def py_end(lines, i):
    ind = len(lines[i - 1]) - len(lines[i - 1].lstrip())
    end = i
    for j in range(i, len(lines)):
        l = lines[j]
        if l.strip() and len(l) - len(l.lstrip()) <= ind:
            break
        if l.strip():
            end = j + 1
    return end


def ranges(path):
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    ms, n, out = marks(path), len(lines), []
    for k, (ln, kind, name) in enumerate(ms):
        if kind == "section":
            nxt = next((m[0] for m in ms[k + 1:] if m[1] == "section"), n + 1)
            out.append((ln, nxt - 1, kind, name))
        else:
            out.append((ln, py_end(lines, ln) if path.suffix == ".py" else js_end(lines, ln), kind, name))
    return out


def rel(p):
    return p.relative_to(ROOT).as_posix()


def toc(name):
    hits = [p for p in files() if p.name == name or rel(p).endswith(name)]
    if not hits:
        print("no such file:", name)
        return
    for p in hits:
        print("##", rel(p))
        for a, b, kind, nm in ranges(p):
            print(("  %5d-%-5d " % (a, b)) + ("== " + nm if kind == "section" else nm))


def tune(words):
    p = ROOT / "theme" / "assets" / "cft-content.js"
    lines = p.read_text(encoding="utf-8").splitlines()
    start = next((i for i, l in enumerate(lines) if l.startswith("D.TUNE = {")), None)
    if start is None:
        print("D.TUNE not found")
        return
    end = next(i for i in range(start, len(lines)) if lines[i].startswith("};"))
    print("## theme/assets/cft-content.js D.TUNE (lines %d-%d)" % (start + 1, end + 1))
    group = ""
    for i in range(start + 1, end):
        l = lines[i]
        g = re.match(r"\s{2}(\w+): \{", l)
        if g:
            group = g.group(1)
        if not words or any(w in l.lower() or w in group for w in words):
            print("  %5d  %s" % (i + 1, l.strip()))


def index_rows(words):
    p = ROOT / "FIX_INDEX.md"
    if not p.exists():
        return
    rows = [l for l in p.read_text(encoding="utf-8").splitlines() if l.startswith("|") and not l.startswith("|--")]
    hit = [l for l in rows if all(w in l.lower() for w in words)] or [l for l in rows if any(w in l.lower() for w in words)]
    if hit:
        print("## FIX_INDEX.md")
        for l in hit[:14]:
            print(" ", l)


def defs(words, limit=40):
    shown = 0
    print("## definitions")
    for p in files():
        for a, b, kind, nm in ranges(p):
            if any(w in nm.lower() for w in words):
                print("  %s:%d-%d  %s%s" % (rel(p), a, b, "== " if kind == "section" else "", nm))
                shown += 1
                if shown >= limit:
                    return


def grep(words, limit=25):
    print("## mentions (file:line)")
    shown = 0
    for p in files():
        for i, line in enumerate(p.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            low = line.lower()
            if all(w in low for w in words):
                print("  %s:%d  %s" % (rel(p), i, line.strip()[:110]))
                shown += 1
                if shown >= limit:
                    print("  ... (more: narrow the words)")
                    return


def main(argv):
    if not argv:
        print(__doc__)
        return
    if argv[0] == "--toc":
        for n in argv[1:]:
            toc(n)
        return
    if argv[0] == "--tune":
        tune([w.lower() for w in argv[1:]])
        return
    only_defs = argv[0] == "--def"
    words = [w.lower() for w in argv[1:] if not w.startswith("--")] if only_defs else [w.lower() for w in argv]
    if not only_defs:
        index_rows(words)
    defs(words)
    if not only_defs:
        grep(words)


main(sys.argv[1:])
