#!/usr/bin/env python3
"""Before/after contact sheet from layout_capture.py outputs. usage: layout_sheet.py DIR SIZE OUT.png [scale]"""
import json, sys
from PIL import Image, ImageDraw
d, size, out = sys.argv[1], sys.argv[2], sys.argv[3]; sc = float(sys.argv[4]) if len(sys.argv) > 4 else 0.4
B = json.load(open(f"{d}/before_{size}.json"))["stops"]; A = json.load(open(f"{d}/after_{size}.json"))["stops"]
W, H = (int(int(x) * sc) for x in size.split("x"))
S = Image.new("RGB", (2 * W + 30, 24 + len(A) * (H + 22)), "white"); dr = ImageDraw.Draw(S)
LB = sys.argv[5] if len(sys.argv) > 5 else "BEFORE"; LA = sys.argv[6] if len(sys.argv) > 6 else "AFTER"
dr.text((30, 6), LB, fill="black"); dr.text((30 + W, 6), LA, fill="black")
for i, (b, a) in enumerate(zip(B, A)):
    y = 24 + i * (H + 22)
    dr.text((30, y + 4), f"flow {a['flow']}  section: {','.join(a.get('vis', [])) or '-'}  nav: {','.join(a.get('nav', []))}", fill="black")
    S.paste(Image.open(b["file"]).resize((W, H)), (30, y + 18)); S.paste(Image.open(a["file"]).resize((W, H)), (30 + W, y + 18))
S.save(out); print(out, S.size)
