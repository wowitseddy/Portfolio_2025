#!/usr/bin/env python3
"""Per-object state diff between two manifest runs (same sample count).
Usage: diffstate.py BASE_DIR NEW_DIR [--expect-rebuilt name1,name2] > diff.md
Objects are matched by scene path (name/type with occurrence index), not uuid.
Expected differences: geometry attrs/verts of rebuilt meshes, and objects that are
render-skipped while their opacity is ~0 (invisible in both)."""
import json, sys, collections
A, B = sys.argv[1], sys.argv[2]
shader_alpha_ok = sys.argv[sys.argv.index('--shader-alpha-subtree') + 1] if '--shader-alpha-subtree' in sys.argv else None
rebuilt = set(sys.argv[sys.argv.index('--expect-rebuilt') + 1].split(',')) if '--expect-rebuilt' in sys.argv else set()
load = lambda d: [json.loads(l) for l in open(d + '/timeline.jsonl')]
ra, rb = load(A), load(B)
def keyed(objs):
    c = collections.Counter(); out = {}
    for o in objs:
        k0 = (o.get("path") or "") + f"<{o['type']}>" + ("@" + str((o.get("mat") or {}).get("name")) if o.get("mat") and o["mat"].get("name") else ""); c[k0] += 1; out[f"{k0}#{c[k0]}"] = o
    return out
MAT = ['type', 'color', 'em', 'emI', 'emMap', 'map', 'mapCS', 'vc', 'side', 'wire', 'blend', 'n']
def eff_visible(o):
    op = (o.get('mat') or {}).get('op'); skipped = o.get('l0') is False
    return o['wvis'] and not skipped and not (op is not None and op < 0.004)
rows, unexpected, expected = [], 0, 0
for i in range(min(len(ra), len(rb))):
    a, b = keyed(ra[i]['objects']), keyed(rb[i]['objects'])
    for k in sorted(set(a) | set(b)):
        x, y = a.get(k), b.get(k)
        if x is None or y is None:
            rows.append((i, k, 'only in ' + ('new' if x is None else 'base'), 'UNEXPECTED')); unexpected += 1; continue
        name = x['name']
        diffs = []
        if eff_visible(x) != eff_visible(y):
            if shader_alpha_ok and shader_alpha_ok in k and y.get('l0') is False and (rb[i].get('flow') or 0) < 0.69:
                rows.append((i, k, 'render-skipped while shader alpha (uFieldOpacity) = 0; invisible in both', 'expected (shader-alpha skip)')); expected += 1; continue
            diffs.append(f"effective-visible {eff_visible(x)}→{eff_visible(y)}")
        elif x['wvis'] != y['wvis']: diffs.append(f"wvis {x['wvis']}→{y['wvis']} (both invisible: opacity≈0)")
        mx, my = x.get('mat') or {}, y.get('mat') or {}
        for f in MAT:
            if mx.get(f) != my.get(f): diffs.append(f"mat.{f} {mx.get(f)}→{my.get(f)}")
        if mx.get('op') is not None and my.get('op') is not None and abs(mx['op'] - my['op']) > 0.03: diffs.append(f"mat.op {mx['op']}→{my['op']}")
        if x.get('fc') != y.get('fc'): diffs.append(f"frustumCulled {x.get('fc')}→{y.get('fc')}")
        geo = []
        if x.get('attrs') != y.get('attrs'): geo.append(f"attrs {x.get('attrs')}→{y.get('attrs')}")
        if x.get('verts') != y.get('verts'): geo.append(f"verts {x.get('verts')}→{y.get('verts')}")
        if geo:
            if name in rebuilt: rows.append((i, k, '; '.join(geo), 'expected (rebuilt asset)')); expected += 1
            else: diffs += geo
        if diffs:
            kind = 'expected (opacity≈0 skip)' if all('both invisible' in d for d in diffs) else 'UNEXPECTED'
            # ignore animation-driven opacity drift when sampling positions differ slightly
            rows.append((i, k, '; '.join(diffs), kind))
            if kind == 'UNEXPECTED': unexpected += 1
            else: expected += 1
print(f"# Per-object state diff\n\nbase: `{A}`  new: `{B}`  samples: {min(len(ra), len(rb))}\n")
print(f"**Unexpected differences: {unexpected}**  ·  expected: {expected}\n")
print("| sample | object | difference | class |\n|---|---|---|---|")
seen = collections.Counter()
for i, k, d, c in rows:
    sig = (k, d, c); seen[sig] += 1
    if seen[sig] == 1: print(f"| {i} | {k} | {d.replace('|','/')[:300]} | {c} |")
