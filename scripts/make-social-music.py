# Original music for Whistle Ready Reels (public/social-music/*.mp3), synthesized
# from scratch — oscillators and filtered noise only, no samples, loops or
# third-party material — so the tracks are ours outright and safe to bundle in
# the app and to use on Instagram/Facebook. Melodies are original, scale-based.
#
# Regenerate:  python3 scripts/make-social-music.py public/social-music
# Needs numpy, scipy and ffmpeg. Mix is weighted toward the mids so it still
# reads on phone speakers (which drop everything under ~120 Hz).
import numpy as np, subprocess, sys, json
from scipy.signal import butter, sosfilt
SR = 44100
rng = np.random.default_rng(7)

def env(n, a=0.002, d=0.2, s=0.0, r=0.0, total=None):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / max(d, 1e-4)) * (1 - s) + s
    return e
def lp(x, f, order=2): return sosfilt(butter(order, min(f, SR/2-100) / (SR / 2), 'low', output='sos'), x)
def hp(x, f, order=2): return sosfilt(butter(order, f / (SR / 2), 'high', output='sos'), x)
def bp(x, lo, hi): return sosfilt(butter(2, [lo/(SR/2), hi/(SR/2)], 'band', output='sos'), x)
def note_hz(n): return 440.0 * 2 ** ((n - 69) / 12)
def saw(f, n, ph=0.0):
    t = np.arange(n) / SR
    return 2 * ((t * f + ph) % 1.0) - 1
def sq(f, n, duty=0.5):
    t = np.arange(n) / SR
    return np.where((t * f) % 1.0 < duty, 1.0, -1.0)
def sine(f, n): return np.sin(2*np.pi*f*np.arange(n)/SR)

def kick(n=int(0.45*SR), punch=1.0):
    t = np.arange(n)/SR
    f = 45 + 110*np.exp(-t/0.045)
    ph = 2*np.pi*np.cumsum(f)/SR
    k = np.sin(ph)*np.exp(-t/0.30)
    click = hp(rng.standard_normal(n), 2000)*np.exp(-t/0.004)*0.25
    return np.tanh((k+click)*1.6*punch)
def snare(n=int(0.3*SR)):
    t = np.arange(n)/SR
    nz = bp(rng.standard_normal(n), 1500, 9000)*np.exp(-t/0.11)
    tone = np.sin(2*np.pi*185*t)*np.exp(-t/0.05)*0.6
    return (nz*0.8+tone)*0.9
def clap(n=int(0.3*SR)):
    t = np.arange(n)/SR
    nz = bp(rng.standard_normal(n), 900, 6000)
    e = np.zeros(n)
    for off in (0, 0.011, 0.022):
        i = int(off*SR); e[i:] += np.exp(-(t[:n-i])/0.012)*0.5
    e += np.exp(-np.maximum(0, t-0.03)/0.13)*(t>0.03)*0.6
    return nz*e
def hat(n=int(0.06*SR), open_=False):
    n = int((0.35 if open_ else 0.06)*SR)
    t = np.arange(n)/SR
    return hp(rng.standard_normal(n), 7000)*np.exp(-t/(0.12 if open_ else 0.018))*0.45
def bell(f, n):  # sleigh-bell-ish jingle
    t = np.arange(n)/SR
    x = sum(np.sin(2*np.pi*f*m*t)*a for m, a in ((1, 1), (2.76, .5), (5.4, .3), (8.9, .2)))
    return x*np.exp(-t/0.12)*0.25 + hp(rng.standard_normal(n), 6000)*np.exp(-t/0.05)*0.3
def pluck(f, n, bright=3500, kind='saw'):
    t = np.arange(n)/SR
    osc = (saw(f, n) + 0.5*saw(f*1.005, n)) if kind == 'saw' else sq(f, n, 0.3)
    return lp(osc, bright)*np.exp(-t/0.18)
def pad(freqs, n, cutoff=2500):
    x = np.zeros(n)
    for f in freqs:
        for d in (-0.08, 0.0, 0.08):
            x += saw(f*2**(d/12), n, rng.random())
    x = lp(x/ (len(freqs)*3), cutoff)
    a = np.minimum(1, np.arange(n)/(0.08*SR)); r = np.minimum(1, (n-np.arange(n))/(0.1*SR))
    return x*a*r
def organ(freqs, n):
    t = np.arange(n)/SR
    x = sum(sum(np.sin(2*np.pi*f*h*t)*a for h, a in ((1, 1), (2, .5), (3, .3), (4, .2))) for f in freqs) / len(freqs)
    a = np.minimum(1, t/0.02); r = np.minimum(1, (n-np.arange(n))/(0.05*SR))
    vib = 1 + 0.003*np.sin(2*np.pi*5.5*t)
    return x*a*r*0.5*vib

def place(buf, x, start, gain=1.0, pan=0.0):
    i = int(start*SR)
    if i >= len(buf): return
    x = x[:len(buf)-i]*gain
    l, r = np.cos((pan+1)*np.pi/4), np.sin((pan+1)*np.pi/4)
    buf[i:i+len(x), 0] += x*l*1.41; buf[i:i+len(x), 1] += x*r*1.41

CH = {'maj': (0, 4, 7), 'min': (0, 3, 7), 'maj7': (0, 4, 7, 11), 'min7': (0, 3, 7, 10), 'dim': (0, 3, 6), 'sus': (0, 5, 7)}

def render(spec):
    bpm, bars = spec['bpm'], spec['bars']
    beat = 60/bpm; total = bars*4*beat
    n = int(total*SR)
    drums = np.zeros((n, 2)); music = np.zeros((n, 2)); bass = np.zeros((n, 2))
    duck = np.ones(n)
    prog = spec['prog']
    for bar in range(bars):
        t0 = bar*4*beat
        root, quality = prog[bar % len(prog)]
        intro = bar < spec.get('intro', 1)
        # drums
        for b in range(4):
            tb = t0 + b*beat
            if spec['style'] == 'four':
                if not intro or b in (0,):
                    place(drums, kick(), tb, 0.95)
                    i = int(tb*SR); m = min(n, i+int(0.25*SR)); duck[i:m] = np.minimum(duck[i:m], 0.35 + 0.65*np.linspace(0, 1, m-i))
                if b in (1, 3) and not intro: place(drums, clap(), tb, 0.55, 0.05)
                if not intro: place(drums, hat(open_=True), tb + beat/2, 0.35, 0.3)
                for s in range(4):
                    if not intro or s % 2 == 0: place(drums, hat(), tb + s*beat/4, 0.28 if s % 2 else 0.18, -0.25)
            elif spec['style'] == 'half':
                if b == 0 or (b == 2 and bar % 2 == 1) or (b == 3 and bar % 4 == 3):
                    place(drums, kick(punch=1.2), tb + (beat/2 if b == 3 else 0), 1.0)
                    i = int(tb*SR); m = min(n, i+int(0.3*SR)); duck[i:m] = np.minimum(duck[i:m], 0.3 + 0.7*np.linspace(0, 1, m-i))
                if b == 2 and not intro: place(drums, snare(), tb, 0.7); place(drums, clap(), tb, 0.4)
                rolls = 6 if (b == 3 and bar % 2 == 1) else 2
                for s in range(rolls if not intro else 1):
                    place(drums, hat(), tb + s*beat/rolls, 0.22, -0.3)
            elif spec['style'] == 'chill':
                if b in (0, 2) or (b == 3 and bar % 2): place(drums, kick(punch=0.7), tb + (beat/2 if b == 3 else 0), 0.75)
                if b in (1, 3) and not intro: place(drums, lp(snare(), 4500), tb, 0.45)
                for s in range(2): place(drums, lp(hat(), 9000), tb + s*beat/2 + (0.02 if s else 0), 0.16, -0.3)
            elif spec['style'] == 'stomp':
                if b in (0, 2) or (bar % 2 and b == 3): place(drums, kick(punch=1.1), tb, 1.0)
                if b in (1, 3) and not intro: place(drums, snare(), tb, 0.6); place(drums, clap(), tb, 0.35)
                for s in range(2): place(drums, hat(), tb + s*beat/2, 0.2, 0.3)
                i = int(tb*SR); m = min(n, i+int(0.2*SR)); duck[i:m] = np.minimum(duck[i:m], 0.5 + 0.5*np.linspace(0, 1, m-i))
            if spec.get('bells') and not intro:
                for s in range(4): place(drums, bell(2200 + 300*(s % 2), int(0.15*SR)), tb + s*beat/4, 0.35 if s % 2 == 0 else 0.22, 0.35)
        # bass: 8th notes on root (octave pump), or 808 long notes
        rhz = note_hz(root - 24)
        if spec['style'] == 'half':
            x = sine(rhz, int(4*beat*SR)) + 0.6*np.tanh(4*sine(rhz, int(4*beat*SR)))
            x *= np.exp(-np.arange(len(x))/SR/1.6)
            place(bass, x, t0, 0.55)
        else:
            for e in range(8):
                f = rhz*(2 if (spec['style'] == 'four' and e % 2) else 1)
                d = int(beat/2*SR*0.9)
                x = lp(saw(f, d) + 0.5*sq(f, d), 700 if spec['style'] != 'chill' else 450)*env(d, 0.004, 0.25)
                x = hp(x, 70) + 0.35*lp(saw(f*2, d), 1600)*env(d, 0.004, 0.18)
                if not intro or spec['style'] == 'chill': place(bass, x, t0 + e*beat/2, 0.42)
        # harmony
        freqs = [note_hz(root + iv) for iv in CH[quality]]
        if spec['harmony'] == 'pad': place(music, pad(freqs, int(4*beat*SR), spec.get('cutoff', 2400)), t0, 0.38, 0)
        if spec['harmony'] == 'organ': place(music, organ(freqs, int(4*beat*SR)), t0, 0.45, 0)
        if spec['harmony'] == 'keys':
            for half in range(2):
                ch = sum(sine(f, int(2*beat*SR))*np.exp(-np.arange(int(2*beat*SR))/SR/1.2) for f in freqs)/len(freqs)
                place(music, lp(ch + 0.2*np.sign(ch)*ch**2, 3000), t0 + half*2*beat + (0.015 if half else 0), 0.55)
        # melody / arp (original, scale-based)
        mel = spec['melody'][bar % len(spec['melody'])]
        step = 4*beat/len(mel)
        if not intro or spec.get('melody_in_intro'):
            for k, m in enumerate(mel):
                if m is None: continue
                f = note_hz(root + m + spec.get('mel_oct', 12))
                d = int(step*SR*(0.9 if spec['lead'] != 'bell' else 1.6))
                x = bell(f, d) * 1.6 if spec['lead'] == 'bell' else pluck(f, d, spec.get('bright', 3500), 'sq' if spec['lead'] == 'sq' else 'saw')
                place(music, x, t0 + k*step, spec.get('lead_gain', 0.28), 0.25 if k % 2 else -0.25)
    # riser into bar 2 (end of intro)
    if spec.get('intro', 1) >= 1:
        rn = int(4*beat*SR*spec.get('intro', 1))
        r = hp(rng.standard_normal(rn), 3000)*np.linspace(0, 1, rn)**2*0.18
        place(drums, r, 0, 1.0)
    mix = drums*spec.get('dg', 0.75) + (music*duck[:, None])*spec.get('mg', 2.0) + bass*duck[:, None]*spec.get('bg', 0.85)
    # simple stereo room
    d = int(0.023*SR); wet = np.zeros_like(mix); wet[d:, 0] = mix[:-d, 1]; wet[d:, 1] = mix[:-d, 0]
    mix = mix + 0.12*lp(wet.T, 3000).T
    mix = np.tanh(mix*1.1)
    mix /= np.max(np.abs(mix))/0.89
    f = int(0.01*SR); mix[:f] *= np.linspace(0, 1, f)[:, None]
    fo = int(0.4*SR); mix[-fo:] *= np.linspace(1, 0, fo)[:, None]
    return mix, total

TRACKS = [
  dict(id='game-day', title='Game Day', mood='Driving, upbeat', bpm=128, bars=16, style='four', harmony='pad', lead='saw',
       prog=[(64, 'min'), (60, 'maj'), (67, 'maj'), (62, 'maj')],
       melody=[[0, None, 7, None, 12, 10, 7, None], [4, None, 7, None, 12, None, 11, 7], [0, 4, 7, None, 11, None, 7, 4], [7, None, 9, None, 14, 12, 9, None]], cutoff=2600),
  dict(id='big-stage', title='Big Stage', mood='Hype, hard-hitting', bpm=140, bars=16, style='half', harmony='pad', lead='sq',
       prog=[(60, 'min'), (56, 'maj'), (63, 'maj'), (58, 'maj')],
       melody=[[0, None, None, 3, None, 7, None, None, 10, None, 7, None, 3, None, 2, None], [None]*16, [0, None, 3, None, 7, None, 12, None, 10, None, 7, None, 8, 7, 3, None], [None]*16], mel_oct=12, lead_gain=0.22, cutoff=1800),
  dict(id='warm-up', title='Warm-Up', mood='Relaxed, feel-good', bpm=96, bars=12, style='chill', harmony='keys', lead='saw',
       prog=[(65, 'maj7'), (64, 'min7'), (62, 'min7'), (60, 'maj7')],
       melody=[[12, None, 11, 7, None, None, 4, None], [None, 7, None, 10, None, 7, None, None], [5, None, 9, None, 12, None, 9, 5], [None, None, 7, None, 11, None, None, None]], bright=2200, lead_gain=0.22, intro=1),
  dict(id='spooky-stomp', title='Spooky Stomp', mood='Halloween, playful-creepy', bpm=118, bars=16, style='stomp', harmony='organ', lead='sq',
       prog=[(62, 'min'), (62, 'min'), (58, 'maj'), (57, 'dim')],
       melody=[[0, 1, 0, None, 6, None, 5, None], [0, None, 3, None, 6, 5, 3, None], [0, 1, 0, None, 7, None, 6, 5], [3, None, 0, None, None, 6, None, None]], mel_oct=12, lead_gain=0.2, bright=2600),
  dict(id='holiday-rush', title='Holiday Rush', mood='Festive, bright', bpm=132, bars=16, style='four', harmony='pad', lead='bell', bells=True,
       prog=[(67, 'maj'), (64, 'min'), (60, 'maj'), (62, 'maj')],
       melody=[[12, None, 14, None, 16, None, 14, 12], [11, None, 12, None, 14, None, None, None], [12, 14, 16, None, 19, None, 16, None], [14, None, 12, None, 11, None, 7, None]], mel_oct=0, lead_gain=0.35, cutoff=3000),
]

out = sys.argv[1]
meta = []
for spec in TRACKS:
    mix, total = render(spec)
    pcm = (mix*32767).astype('<i2').tobytes()
    path = f"{out}/{spec['id']}.mp3"
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '2', '-i', '-', '-b:a', '160k', path], input=pcm, check=True)
    meta.append({'id': spec['id'], 'title': spec['title'], 'mood': spec['mood'], 'bpm': spec['bpm'], 'seconds': round(total, 2)})
    print(spec['id'], round(total, 1), 's')
print(json.dumps(meta))
