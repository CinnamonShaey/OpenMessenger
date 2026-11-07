"""Generate OpenMessenger's icon, unread badges and notification sounds.

Everything is synthesized here so the repo contains no third-party artwork
or audio with unclear licensing. Re-run after tweaking:

    uv run --with pillow python scripts/make-assets.py
"""
import math
import struct
import wave
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
SOUNDS = ASSETS / "sounds"
BADGES = ASSETS / "badges"
for d in (ASSETS, SOUNDS, BADGES):
    d.mkdir(parents=True, exist_ok=True)

PURPLE_A = (168, 85, 247)   # #a855f7
PURPLE_B = (109, 40, 217)   # #6d28d9


# ---------------------------------------------------------------- icon
def make_icon(size: int) -> Image.Image:
    s = size * 4  # supersample for smooth edges
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))

    # diagonal purple gradient
    grad = Image.new("RGBA", (s, s))
    gp = grad.load()
    for y in range(s):
        for x in range(s):
            t = (x + y) / (2 * s)
            gp[x, y] = tuple(int(PURPLE_A[i] * (1 - t) + PURPLE_B[i] * t) for i in range(3)) + (255,)

    # speech-bubble mask: circle + tail bottom-left
    mask = Image.new("L", (s, s), 0)
    m = ImageDraw.Draw(mask)
    pad = s * 0.06
    m.ellipse([pad, pad, s - pad, s - pad * 1.6], fill=255)
    m.polygon([(s * 0.16, s * 0.70), (s * 0.10, s * 0.96), (s * 0.40, s * 0.82)], fill=255)
    img.paste(grad, (0, 0), mask)

    # black "O" ring in the middle (Open)
    d = ImageDraw.Draw(img)
    cx, cy = s / 2, s * 0.46
    r_out, r_in = s * 0.24, s * 0.13
    d.ellipse([cx - r_out, cy - r_out, cx + r_out, cy + r_out], fill=(0, 0, 0, 255))
    d.ellipse([cx - r_in, cy - r_in, cx + r_in, cy + r_in], fill=(0, 0, 0, 0))
    # re-fill the hole with the gradient so it reads as a ring
    hole = Image.new("L", (s, s), 0)
    ImageDraw.Draw(hole).ellipse([cx - r_in, cy - r_in, cx + r_in, cy + r_in], fill=255)
    img.paste(grad, (0, 0), hole)
    return img.resize((size, size), Image.LANCZOS)


icon = make_icon(512)
icon.save(ASSETS / "icon.png")
icon.save(ASSETS / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
make_icon(32).save(ASSETS / "tray.png")


# ---------------------------------------------------------------- badges
def font(px):
    for name in ("segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"):
        try:
            return ImageFont.truetype(name, px)
        except OSError:
            pass
    return ImageFont.load_default()


def make_badge(label: str) -> Image.Image:
    s = 64
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([2, 2, s - 2, s - 2], fill=PURPLE_A + (255,), outline=(0, 0, 0, 255), width=3)
    f = font(36 if len(label) == 1 else 28)
    w, h = d.textbbox((0, 0), label, font=f)[2:]
    box = d.textbbox((0, 0), label, font=f)
    d.text(((s - (box[2] - box[0])) / 2 - box[0], (s - (box[3] - box[1])) / 2 - box[1]), label, font=f, fill="white")
    return img.resize((32, 32), Image.LANCZOS)


for n in range(1, 10):
    make_badge(str(n)).save(BADGES / f"{n}.png")
make_badge("9+").save(BADGES / "9plus.png")


# ---------------------------------------------------------------- sounds
RATE = 44100


def write_wav(path: Path, samples, level=0.8):
    peak = max(1e-9, max(abs(x) for x in samples))
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(x / peak * level * 32767)) for x in samples))


def tone(freq, dur, decay, start_freq=None, harmonics=((1, 1.0),), attack=0.004):
    out = []
    n = int(RATE * dur)
    phase = 0.0
    for i in range(n):
        t = i / RATE
        f = freq if start_freq is None else start_freq + (freq - start_freq) * min(1, t / 0.03)
        phase += 2 * math.pi * f / RATE
        # smooth (sine-shaped) fade-in, then exponential decay
        rise = 1.0 if t >= attack else math.sin(0.5 * math.pi * t / attack)
        env = rise * math.exp(-t * decay)
        out.append(env * sum(a * math.sin(phase * k) for k, a in harmonics))
    return out


def mix(*parts):
    """parts: (offset_seconds, samples)"""
    length = max(int(off * RATE) + len(s) for off, s in parts)
    out = [0.0] * length
    for off, s in parts:
        o = int(off * RATE)
        for i, v in enumerate(s):
            out[o + i] += v
    return out


# Gentle (default): soft, low two-note "bloop" with a slow fade-in and no
# sharp transient. Deliberately quiet so it doesn't startle.
pure = ((1, 1), (2, 0.04))
write_wav(SOUNDS / "gentle.wav", mix(
    (0, tone(523.25, 0.35, 9, harmonics=pure, attack=0.025)),      # C5
    (0.13, tone(659.25, 0.45, 8, harmonics=pure, attack=0.025)),   # E5
), level=0.35)
# Pop: short bubbly blip with an upward pitch sweep (softened)
write_wav(SOUNDS / "pop.wav", tone(780, 0.2, 22, start_freq=520, harmonics=((1, 1), (2, 0.08)), attack=0.012), level=0.5)
# Chime: two-note bell (E6 -> A6)
bell = ((1, 1), (2.01, 0.35), (3.02, 0.12))
write_wav(SOUNDS / "chime.wav", mix((0, tone(1318.5, 0.6, 7, harmonics=bell, attack=0.008)),
                                     (0.11, tone(1760, 0.8, 6, harmonics=bell, attack=0.008))), level=0.45)
# Soft: mellow low double-tap
soft = ((1, 1), (2, 0.08))
write_wav(SOUNDS / "soft.wav", mix((0, tone(587, 0.25, 18, harmonics=soft, attack=0.015)),
                                    (0.12, tone(784, 0.3, 16, harmonics=soft, attack=0.015))), level=0.5)

print("assets written to", ASSETS)
