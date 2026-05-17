import sys

with open(r"d:\genie (3)\genie\website\index.html", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update CSS
old_css = """/* Eye glow — z7 */
.eye-wrap{position:absolute;z-index:7;pointer-events:none;top:34vh;left:50%;transform:translateX(-50%);display:flex;gap:clamp(22px,4vw,42px);opacity:0}
.eye-glow{width:10px;height:10px;border-radius:50%;background:#fff;animation:eye-pulse 2.2s ease-in-out infinite;box-shadow:0 0 6px 3px rgba(255,255,255,.9),0 0 18px 8px rgba(210,210,255,.7),0 0 36px 16px rgba(180,160,255,.4)}"""

new_css = """/* Eye glow — z7 */
.eye-wrap{position:absolute;z-index:7;pointer-events:none;top:42vh;left:50%;transform:translateX(-50%);display:flex;gap:clamp(16px,2.5vw,30px);opacity:0}
.eye-glow{width:8px;height:8px;border-radius:50%;background:#fff;animation:eye-pulse 2.2s ease-in-out infinite;box-shadow:0 0 6px 3px rgba(255,255,255,.9),0 0 18px 8px rgba(210,210,255,.7),0 0 36px 16px rgba(180,160,255,.4)}"""

content = content.replace(old_css, new_css)

# 2. Move HTML
old_genie = """  <!-- Layer 2: Genie (middle parallax) -->
  <div class="hero-layer" id="layer-genie">
    <img id="img-genie" src="images/genie.png" alt="Genie Puppet"/>
  </div>"""

new_genie = """  <!-- Layer 2: Genie (middle parallax) -->
  <div class="hero-layer" id="layer-genie">
    <img id="img-genie" src="images/genie.png" alt="Genie Puppet"/>
    <!-- Eye glow -->
    <div class="eye-wrap" id="eye-wrap">
      <div class="eye-glow"></div>
      <div class="eye-glow"></div>
    </div>
  </div>"""

old_eyes = """  <!-- Eye glow -->
  <div class="eye-wrap" id="eye-wrap">
    <div class="eye-glow"></div>
    <div class="eye-glow"></div>
  </div>"""

content = content.replace(old_genie, new_genie)
content = content.replace(old_eyes, "", 1) # remove the original standalone one

with open(r"d:\genie (3)\genie\website\index.html", "w", encoding="utf-8") as f:
    f.write(content)

print("Patched!")
