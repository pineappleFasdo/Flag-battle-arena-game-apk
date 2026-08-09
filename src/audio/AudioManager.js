// AudioManager.js — Web Audio API synthesis, no mp3/wav files needed.
// MOBILE FIX: speechSynthesis is fully guarded — never accessed unless confirmed present.
// MOBILE FIX: AudioContext created lazily on first user gesture only.
// MOBILE FIX: visibilitychange handler guards all API calls.

export default class AudioManager {

    constructor() {
        this._ctx        = null;
        this._masterGain = null;

        this._lastFlagCollision = 0;
        this._lastWallCollision = 0;
        this._flagCoolMs        = 40;
        this._wallCoolMs        = 80;

        this._milestonesHit = new Set();
        this._lastSpeakTime = 0;

        this.volume = 0.7;

        // Pre-allocated noise buffer pool — reused to avoid per-collision alloc
        this._noiseBuffers = new Map();

        // MOBILE FIX: Guard ALL speechSynthesis access behind a feature check.
        // On some Android WebViews speechSynthesis is undefined — calling any
        // method on it crashes the entire app at construction time.
        this._hasSpeech = typeof window !== 'undefined'
            && 'speechSynthesis' in window
            && typeof window.speechSynthesis !== 'undefined';

        this._voices = [];
        if (this._hasSpeech) {
            this._voices = window.speechSynthesis.getVoices() || [];
            if (this._voices.length === 0) {
                window.speechSynthesis.addEventListener('voiceschanged', () => {
                    this._voices = window.speechSynthesis.getVoices() || [];
                }, { once: false });
            }
        }

        // MOBILE FIX: visibilitychange — guard every API call inside
        this._handleVisibility = () => {
            if (document.hidden) {
                if (this._hasSpeech) {
                    try { window.speechSynthesis.cancel(); } catch (e) {}
                }
                if (this._ctx && this._ctx.state === 'running') {
                    try { this._ctx.suspend(); } catch (e) {}
                }
            } else {
                if (this._ctx && this._ctx.state === 'suspended') {
                    try { this._ctx.resume(); } catch (e) {}
                }
            }
        };
        document.addEventListener('visibilitychange', this._handleVisibility);
    }

    // ── AudioContext bootstrap ────────────────────────────────────────────────

    _getCtx() {
        if (this._ctx) return this._ctx;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try {
            this._ctx        = new AC();
            this._masterGain = this._ctx.createGain();
            this._masterGain.gain.value = this.volume;
            this._masterGain.connect(this._ctx.destination);
        } catch (e) {
            this._ctx = null;
        }
        return this._ctx;
    }

    _resume() {
        const ctx = this._getCtx();
        if (!ctx) return null;
        if (ctx.state === 'suspended') {
            try { ctx.resume(); } catch (e) {}
        }
        return ctx;
    }

    // ── Low-level helpers ─────────────────────────────────────────────────────

    _tone(freq, startTime, duration, gain = 0.4, type = 'sine', fadeOut = 0.05) {
        const ctx = this._resume();
        if (!ctx) return;
        try {
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
        } catch (e) {}
    }

    _noise(startTime, duration, gain = 0.3, filterFreq = 800) {
        const ctx = this._resume();
        if (!ctx) return;
        try {
            const key = Math.round(duration * 1000);
            let buffer = this._noiseBuffers.get(key);
            if (!buffer) {
                const bufferSize = Math.ceil(ctx.sampleRate * duration);
                buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
                this._noiseBuffers.set(key, buffer);
            }
            const src    = ctx.createBufferSource();
            src.buffer   = buffer;
            const filter = ctx.createBiquadFilter();
            filter.type  = 'lowpass';
            filter.frequency.value = filterFreq;
            const g = ctx.createGain();
            g.gain.setValueAtTime(gain, startTime);
            g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            src.connect(filter);
            filter.connect(g);
            g.connect(this._masterGain);
            src.start(startTime);
            src.stop(startTime + duration);
        } catch (e) {}
    }

    // ── Public sound API ─────────────────────────────────────────────────────

    playCollision(type = 'flag') {
        if (type === 'wall') { this._playWallHit(); } else { this._playFlagHit(); }
    }

    _playFlagHit() {
        const now = performance.now();
        if (now - this._lastFlagCollision < this._flagCoolMs) return;
        this._lastFlagCollision = now;
        const ctx = this._resume();
        if (!ctx) return;
        const t        = ctx.currentTime;
        const baseFreq = 130 * Math.pow(2, Math.random() * 2);
        const gain     = 0.10 + Math.random() * 0.06;
        this._tone(baseFreq,       t,    0.06, gain,        'sine', 0.055);
        this._tone(baseFreq * 1.5, t,    0.03, gain * 0.35, 'sine', 0.025);
        this._noise(t, 0.025, gain * 0.45, 900);
    }

    _playWallHit() {
        const now = performance.now();
        if (now - this._lastWallCollision < this._wallCoolMs) return;
        this._lastWallCollision = now;
        const ctx = this._resume();
        if (!ctx) return;
        const t        = ctx.currentTime;
        const baseFreq = 300 + Math.random() * 400;
        const gain     = 0.07 + Math.random() * 0.04;
        this._tone(baseFreq, t, 0.04, gain, 'triangle', 0.035);
        this._noise(t, 0.018, gain * 0.55, 2200);
    }

    playElimination() {
        const ctx = this._resume();
        if (!ctx) return;
        const t = ctx.currentTime;
        this._tone(850,  t,        0.035, 0.28, 'square',   0.030);
        this._tone(450,  t + 0.01, 0.030, 0.12, 'triangle', 0.025);
        this._noise(t, 0.020, 0.05, 3500);
    }

    playRoundStart() {
        const ctx = this._resume();
        if (!ctx) return;
        const t = ctx.currentTime;
        this._tone(440, t,        0.12, 0.45, 'square', 0.08);
        this._tone(660, t + 0.13, 0.18, 0.50, 'square', 0.10);
        this._noise(t, 0.08, 0.20, 3000);
    }

    playCountdown(number) {
        const ctx  = this._resume();
        if (!ctx) return;
        const t    = ctx.currentTime;
        const freq = number === 1 ? 880 : 440;
        this._tone(freq, t, 0.15, 0.50, 'sine', 0.08);
        this._noise(t, 0.05, 0.15, 2000);
    }

    playWinner() {
        const ctx   = this._resume();
        if (!ctx) return;
        const t     = ctx.currentTime;
        const notes = [261.6, 329.6, 392.0, 523.3];
        notes.forEach((freq, i) => {
            this._tone(freq, t + i * 0.09, 0.55, 0.40, 'triangle', 0.25);
        });
        const chordStart = t + notes.length * 0.09 + 0.05;
        notes.forEach(freq => {
            this._tone(freq, chordStart, 0.80, 0.30, 'sine', 0.40);
        });
        this._noise(t, 0.12, 0.35, 5000);
        this._noise(chordStart, 0.60, 0.12, 8000);
    }

    playMilestone(remaining, total) {
        const pct = remaining / total;
        let key = null;
        if      (remaining === 10)          key = '10';
        else if (pct <= 0.25 && pct > 0.10) key = '25pct';
        else if (pct <= 0.50 && pct > 0.25) key = '50pct';
        if (!key || this._milestonesHit.has(key)) return;
        this._milestonesHit.add(key);
        const ctx  = this._resume();
        if (!ctx) return;
        const t    = ctx.currentTime;
        const freq = { '50pct': 523, '25pct': 659, '10': 880 }[key];
        this._tone(freq,       t,        0.30, 0.35, 'sine', 0.18);
        this._tone(freq / 2,   t + 0.04, 0.30, 0.22, 'sine', 0.18);
        this._tone(freq * 1.5, t + 0.08, 0.22, 0.18, 'sine', 0.14);
    }

    resetMilestones() {
        this._milestonesHit.clear();
    }

    // ── Speech synthesis ──────────────────────────────────────────────────────

    _pickVoice() {
        if (!this._hasSpeech) return null;
        const voices = this._voices.length > 0
            ? this._voices
            : (window.speechSynthesis.getVoices() || []);
        return voices.find(v =>
            v.lang && v.lang.startsWith('en') && /male|guy|david|mark|alex/i.test(v.name)
        ) || voices.find(v => v.lang && v.lang.startsWith('en'))
          || voices[0]
          || null;
    }

    speak(text) {
        if (!this._hasSpeech) return;
        try {
            window.speechSynthesis.cancel();
            setTimeout(() => {
                if (document.hidden) return;
                if (!this._hasSpeech) return;
                try {
                    const utt   = new SpeechSynthesisUtterance(text);
                    utt.rate    = 0.92;
                    utt.pitch   = 1.05;
                    utt.volume  = 1.0;
                    utt.lang    = 'en-US';
                    const voice = this._pickVoice();
                    if (voice) utt.voice = voice;
                    this._lastSpeakTime = Date.now();
                    window.speechSynthesis.speak(utt);
                } catch (e) {}
            }, 120);
        } catch (e) {}
    }

    speakCommentary(text) {
        if (!this._hasSpeech) return;
        if (document.hidden) return;
        const now = Date.now();
        if (this._lastSpeakTime && now - this._lastSpeakTime < 4000) return;
        try {
            window.speechSynthesis.cancel();
            const utt   = new SpeechSynthesisUtterance(text);
            utt.rate    = 1.05;
            utt.pitch   = 1.00;
            utt.volume  = 0.80;
            utt.lang    = 'en-US';
            const voice = this._pickVoice();
            if (voice) utt.voice = voice;
            window.speechSynthesis.speak(utt);
        } catch (e) {}
    }

    setVolume(v) {
        this.volume = Math.max(0, Math.min(1, v));
        if (this._masterGain && this._ctx) {
            try {
                this._masterGain.gain.setTargetAtTime(
                    this.volume, this._ctx.currentTime, 0.05
                );
            } catch (e) {}
        }
    }

    destroy() {
        document.removeEventListener('visibilitychange', this._handleVisibility);
        if (this._hasSpeech) {
            try { window.speechSynthesis.cancel(); } catch (e) {}
        }
        if (this._ctx) {
            try { this._ctx.close(); } catch (e) {}
            this._ctx = null;
        }
    }
}
