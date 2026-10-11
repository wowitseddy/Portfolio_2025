from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ADDON_DIR = ROOT / "blender_addons" / "threejs_web_builder"
OUT_DIR = ROOT / "output" / "blender_addons"
OUT_DIR.mkdir(parents=True, exist_ok=True)
ZIP_PATH = OUT_DIR / "threejs_web_builder.zip"

if not ADDON_DIR.exists():
    raise SystemExit(f"Addon folder missing: {ADDON_DIR}")

with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as zf:
    for path in ADDON_DIR.rglob("*"):
        if path.is_file():
            arcname = Path("threejs_web_builder") / path.relative_to(ADDON_DIR)
            zf.write(path, arcname.as_posix())

print(ZIP_PATH)
