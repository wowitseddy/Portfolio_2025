#!/usr/bin/env python3
"""Layout capture: WebGL canvas + DOM overlay composites at given scroll-flow stops.

Fast on SwiftShader: the scene runs in no-draw mode (logic only), the canvas is
grabbed with one real frame via the manifest hook, the DOM is captured
separately as a transparent PNG with the canvas hidden, then alpha-composited.
(Limitation: CSS backdrop-filter blur is not applied over the canvas layer.)

usage: layout_capture.py URL --size 1280x800 --stops 0.05,0.21 --out DIR [--tag after]
"""
import argparse, asyncio, base64, io, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from manifest_capture import HOOK
from playwright.async_api import async_playwright
from PIL import Image

ARGS = ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"]

async def run(a):
    W, H = (int(x) for x in a.size.split("x"))
    stops = [float(x) for x in a.stops.split(",")]
    os.makedirs(a.out, exist_ok=True)
    log = {"url": a.url, "size": a.size, "console_errors": [], "failed": [], "stops": []}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={"width": W, "height": H}, device_scale_factor=1,
                                  is_mobile=W < 700, has_touch=W < 700)
        await ctx.add_init_script(HOOK)
        pg = await ctx.new_page()
        pg.on("console", lambda m: log["console_errors"].append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: log["console_errors"].append("pageerror: " + str(e)))
        pg.on("requestfailed", lambda r: log["failed"].append(f"{r.failure} {r.url}"))
        pg.on("response", lambda r: log["failed"].append(f"{r.status} {r.url}") if r.status >= 400 else None)
        t0 = time.time()
        await pg.goto(a.url, wait_until="load", timeout=120000)
        await pg.wait_for_function("document.body.dataset.startupState==='ready'", timeout=120000)
        log["ready_s"] = round(time.time() - t0, 1); print("ready", log["ready_s"], flush=True)
        await pg.evaluate(f"window.__cap.nodraw=true; window.__cap.shotW={W//2}; window.__cap.shotH={H//2}")
        await pg.mouse.move(W - 4, H - 4)  # outside panels/nav, so wheel drives the page
        cdp = await ctx.new_cdp_session(pg)
        for t in stops:
            g = 0
            while await pg.evaluate("window.__portfolioDebug.getScrollProgress()") < t and g < 600:
                await pg.mouse.wheel(0, 120); await pg.wait_for_timeout(25); g += 1
            print(f"  t={time.time()-t0:.0f}s scrolled to {t} ({g} wheels)", flush=True)
            await pg.wait_for_timeout(1500)  # let eased values settle (reading zone)
            await pg.evaluate("window.__cap.shot=null; window.__cap.wantShot=true")
            await pg.evaluate("window.__cap.wait(3)")
            d = await pg.evaluate("window.__cap.shot")
            print(f"  t={time.time()-t0:.0f}s canvas shot", flush=True)
            canvas = Image.open(io.BytesIO(base64.b64decode(d.split(",")[1]))).convert("RGBA").resize((W, H))
            await pg.add_style_tag(content="html,body{background:transparent!important}#background-canvas{visibility:hidden!important}")
            await cdp.send("Emulation.setDefaultBackgroundColorOverride", {"color": {"r": 0, "g": 0, "b": 0, "a": 0}})
            r = await cdp.send("Page.captureScreenshot", {"format": "png"})
            await pg.evaluate("document.querySelectorAll('style').forEach(s=>{if(s.textContent.includes('#background-canvas{visibility:hidden'))s.remove()})")
            dom = Image.open(io.BytesIO(base64.b64decode(r["data"]))).convert("RGBA").resize((W, H))
            comp = Image.alpha_composite(canvas, dom).convert("RGB")
            flow = await pg.evaluate("window.__portfolioDebug.getScrollProgress()")
            info = await pg.evaluate("""()=>({vis:[...document.querySelectorAll('.v2-section')].map(s=>s.id+':'+(+getComputedStyle(s).opacity).toFixed(2)).filter(x=>!x.endsWith(':0.00')),
               nav:[...document.querySelectorAll('.menu-item.is-active')].map(n=>n.textContent.trim()),
               overflow:[...document.querySelectorAll('.v2-section.is-v2-visible .v2-panel')].map(p=>p.scrollHeight>p.clientHeight+1)})""")
            path = os.path.join(a.out, f"{a.tag}_{W}x{H}_{t:.3f}.jpg")
            comp.save(path, quality=80)
            log["stops"].append({"target": t, "flow": round(flow, 3), "file": path, **info})
            print(json.dumps(log["stops"][-1]), flush=True)
        await b.close()
    json.dump(log, open(os.path.join(a.out, f"{a.tag}_{W}x{H}.json"), "w"), indent=1)
    print("console_errors", len(log["console_errors"]), "failed", len(log["failed"]), flush=True)
    for e in log["console_errors"][:10]: print("  ERR", e[:200])
    for e in log["failed"][:10]: print("  FAIL", e[:200])

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("url"); ap.add_argument("--size", default="1280x800")
    ap.add_argument("--stops", default="0.05,0.21,0.42,0.65,0.81,0.95")
    ap.add_argument("--out", required=True); ap.add_argument("--tag", default="shot")
    asyncio.run(run(ap.parse_args()))
