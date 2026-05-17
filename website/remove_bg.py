from rembg import remove
from PIL import Image
import os

img_dir = r"d:\genie (3)\genie\website\images"
files = ["hands.jpg", "genie.jpg", "lamp.jpg"]

for f in files:
    inp = os.path.join(img_dir, f)
    out = os.path.join(img_dir, f.replace(".jpg", ".png"))
    print(f"Processing {f}...")
    with open(inp, "rb") as i:
        result = remove(i.read())
    with open(out, "wb") as o:
        o.write(result)
    print(f"  -> Saved {out}")

print("Done! All backgrounds removed.")
