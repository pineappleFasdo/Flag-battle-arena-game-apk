// ALL sounds are synthesised with the Web Audio API — no mp3/wav files needed.
// AudioContext is created lazily on the first user interaction.

export default class AudioManager {

    constructor() {
        this._ctx         = null;
        this._masterGain  = null;

        this._lastCollision   = 0;
        this._collisionCoolMs = 60;   // min ms between collision sounds

        this._milestonesHit = new Set();

        this.volume = 0.7;
    }

    // ── AudioContext bootstrap ────────────────────────────────────────────────

    _getCtx() {
        if (this._ctx) return this._ctx;

        this._ctx = new (window.AudioContext || window.webkitAudioContext)();

        this._masterGain            = this._ctx.createGain();
        this._masterGain.gain.value = this.volume;
        this._masterGain.connect(this._ctx.destination);

        return this._ctx;
    }

    _resume() {
        const ctx = this._getCtx();
        if (ctx.state === "suspended") ctx.resume();
        return ctx;
    }

    // ── Low-level helpers ─────────────────────────────────────────────────────

    _tone(freq, startTime, duration, gain = 0.4, type = "sine", fadeOut = 0.05) {
        const ctx = this._resume();
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, startTime);

        g.gain.setValueAtTime(0, startTime);
        g.gain.linearRampToValueAtTime(gain, startTime + 0.005);

        const decayStart = startTime + duration - fadeOut;
        g.gain.setValueAtTime(gain, decayStart);
        g.gain.linearRampToValueAtTime(0, startTime + duration);

        osc.connect(g);
        g.connect(this._masterGain);

        osc.start(startTime);
        osc.stop(startTime + duration);
    }

    _noise(startTime, duration, gain = 0.3, filterFreq = 800) {
        const ctx        = this._resume();
        const bufferSize = Math.ceil(ctx.sampleRate * duration);
        const buffer     = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data       = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const src  = ctx.createBufferSource();
        src.buffer = buffer;

        const filter           = ctx.createBiquadFilter();
        filter.type            = "lowpass";
        filter.frequency.value = filterFreq;

        const g = ctx.createGain();
        g.gain.setValueAtTime(gain, startTime);
        g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        src.connect(filter);
        filter.connect(g);
        g.connect(this._masterGain);

        src.start(startTime);
        src.stop(startTime + duration);
    }

    // ── Public sound API ─────────────────────────────────────────────────────

    /** Soft thud when flags collide — has built-in 60ms cooldown */
    playCollision() {
        const now = performance.now();
        if (now - this._lastCollision < this._collisionCoolMs) return;
        this._lastCollision = now;

        const ctx = this._resume();
        const t   = ctx.currentTime;

        this._tone(110 + Math.random() * 40, t, 0.07, 0.12, "sine", 0.06);
        this._noise(t, 0.04, 0.06, 300);
    }

    /** Descending whoosh when a flag is eliminated */
    /** Sharp arcade pop when a flag is eliminated */
playElimination() {

    const ctx = this._resume();
    const t = ctx.currentTime;

    // Main pop
    this._tone(
        850,
        t,
        0.035,
        0.28,
        "square",
        0.03
    );

    // Small click
    this._tone(
        450,
        t + 0.01,
        0.03,
        0.12,
        "triangle",
        0.025
    );

    // Tiny burst of noise
    this._noise(
        t,
        0.02,
        0.05,
        3500
    );

}

    /** Rising two-note stab when the gap opens and the round begins */
    playRoundStart() {
        const ctx = this._resume();
        const t   = ctx.currentTime;

        this._tone(440, t,        0.12, 0.45, "square", 0.08);
        this._tone(660, t + 0.13, 0.18, 0.50, "square", 0.10);
        this._noise(t, 0.08, 0.20, 3000);
    }

    /**
     * Single tick per countdown number.
     * @param {number} number  3 | 2 | 1
     */
    playCountdown(number) {
        const ctx  = this._resume();
        const t    = ctx.currentTime;
        const freq = number === 1 ? 880 : 440;

        this._tone(freq, t, 0.15, 0.50, "sine", 0.08);
        this._noise(t, 0.05, 0.15, 2000);
    }

    /** Triumphant fanfare chord arpeggio when a winner is found */
    playWinner() {
        const ctx   = this._resume();
        const t     = ctx.currentTime;
        const notes = [261.6, 329.6, 392.0, 523.3];   // C4 E4 G4 C5

        // Arpeggio
        notes.forEach((freq, i) => {
            this._tone(freq, t + i * 0.09, 0.55, 0.40, "triangle", 0.25);
        });

        // Held chord
        const chordStart = t + notes.length * 0.09 + 0.05;
        notes.forEach(freq => {
            this._tone(freq, chordStart, 0.80, 0.30, "sine", 0.40);
        });

        this._noise(t, 0.12, 0.35, 5000);
        this._noise(chordStart, 0.60, 0.12, 8000);
    }

    /**
     * Chime at 50% / 25% / 10 flags remaining — each one higher to build tension.
     * @param {number} remaining  flags left
     * @param {number} total      flags at match start
     */
    playMilestone(remaining, total) {
        const pct = remaining / total;

        let key = null;
        if      (remaining === 10)           key = "10";
        else if (pct <= 0.25 && pct > 0.10)  key = "25pct";
        else if (pct <= 0.50 && pct > 0.25)  key = "50pct";

        if (!key || this._milestonesHit.has(key)) return;
        this._milestonesHit.add(key);

        const ctx  = this._resume();
        const t    = ctx.currentTime;
        const freq = { "50pct": 523, "25pct": 659, "10": 880 }[key];

        this._tone(freq,       t,        0.30, 0.35, "sine", 0.18);
        this._tone(freq / 2,   t + 0.04, 0.30, 0.22, "sine", 0.18);
        this._tone(freq * 1.5, t + 0.08, 0.22, 0.18, "sine", 0.14);
    }

    /** Reset milestone tracker — call at the start of each new round */
    resetMilestones() {
        this._milestonesHit.clear();
    }

    /** Web Speech API — "India wins!" etc. */
    speak(text) {
        if (!("speechSynthesis" in window)) return;

        speechSynthesis.cancel();

        const utt   = new SpeechSynthesisUtterance(text);
        utt.rate    = 0.92;
        utt.pitch   = 1.05;
        utt.volume  = 1.0;

        const voices    = speechSynthesis.getVoices();
        const preferred = voices.find(v =>
            v.lang.startsWith("en") && /male|guy|david|mark|alex/i.test(v.name)
        ) || voices.find(v => v.lang.startsWith("en"));

        if (preferred) utt.voice = preferred;

        speechSynthesis.speak(utt);
    }

    setVolume(v) {
        this.volume = Math.max(0, Math.min(1, v));
        if (this._masterGain) {
            this._masterGain.gain.setTargetAtTime(
                this.volume,
                this._getCtx().currentTime,
                0.05
            );
        }
    }
}