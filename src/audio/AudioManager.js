// AudioManager.js
// Uses @capacitor-community/text-to-speech for winner announcements on Android.
// Falls back to browser speechSynthesis on desktop/browser (Vite dev server).
// Web Audio API handles all sound effects — no mp3/wav files needed.
//
// WHY NATIVE TTS:
// Browser speechSynthesis inside Capacitor WebView requires speech to be
// triggered from a direct user-gesture call stack. Any setTimeout (even 0ms)
// breaks that chain and silently kills the utterance. Native TTS has no such
// restriction — it talks directly to Android's TTS engine bypassing WebView.

import { BGM, BGM_BASE } from './BgmConfig.js';

let _nativeTTS = null;   // set once the plugin loads
let _ttsReady  = false;

// Load the native plugin at module level — non-blocking, safe to fail in browser
import('@capacitor-community/text-to-speech')
    .then(m => {
        _nativeTTS = m.TextToSpeech;
        _ttsReady  = true;
    })
    .catch(() => {
        // Running in browser (Vite) — will use speechSynthesis fallback
        _ttsReady = false;
    });

export default class AudioManager {

    constructor() {
        this._ctx        = null;
        this._masterGain = null;

        this._lastFlagCollision = 0;
        this._lastWallCollision = 0;
        this._flagCoolMs        = 40;
        this._wallCoolMs        = 80;

        this._milestonesHit = new Set();
        this.volume         = 0.7;
        this._bgm           = null;  // HTMLAudioElement for looping BGM

        // Noise buffer pool — reused per duration key
        this._noiseBuffers = new Map();

        // Browser speechSynthesis fallback (Vite / desktop Chrome)
        this._hasSpeech = typeof window !== 'undefined'
            && 'speechSynthesis' in window
            && window.speechSynthesis != null;

        // Pause audio + cancel speech when app is backgrounded
        this._handleVisibility = () => {
            if (document.hidden) {
                this._stopNativeTTS();
                if (this._hasSpeech) {
                    try { window.speechSynthesis.cancel(); } catch (e) {}
                }
                if (this._ctx && this._ctx.state === 'running') {
                    try { this._ctx.suspend(); } catch (e) {}
                }
                if (this._bgm && !this._bgm.paused) {
                    try { this._bgm.pause(); } catch (e) {}
                }
            } else {
                if (this._ctx && this._ctx.state === 'suspended') {
                    try { this._ctx.resume(); } catch (e) {}
                }
                if (this._bgm && this._bgm.paused) {
                    try { this._bgm.play().catch(() => {}); } catch (e) {}
                }
            }
        };
        document.addEventListener('visibilitychange', this._handleVisibility);
    }

    // ── Native TTS helpers ────────────────────────────────────────────────────

    async _stopNativeTTS() {
        if (_ttsReady && _nativeTTS) {
            try { await _nativeTTS.stop(); } catch (e) {}
        }
    }

    async _speakNative(text, rate = 1.0) {
        await _nativeTTS.speak({
            text,
            lang:        'en-US',
            rate,
            pitch:       1.0,
            volume:      1.0,
            category:    'ambient',   // doesn't pause background music
        });
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
        } catch (e) { this._ctx = null; }
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

    // ── Low-level synth helpers ───────────────────────────────────────────────

    _tone(freq, startTime, duration, gain = 0.4, type = 'sine', fadeOut = 0.05) {
        const ctx = this._resume();
        if (!ctx) return;
        try {
            const osc = ctx.createOscillator();
            const g   = ctx.createGain();
            osc.type  = type;
            osc.frequency.setValueAtTime(freq, startTime);
            g.gain.setValueAtTime(0, startTime);
            g.gain.linearRampToValueAtTime(gain, startTime + 0.005);
            g.gain.setValueAtTime(gain, startTime + duration - fadeOut);
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
                const size = Math.ceil(ctx.sampleRate * duration);
                buffer     = ctx.createBuffer(1, size, ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
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
        this._tone(baseFreq,       t, 0.06, gain,        'sine', 0.055);
        this._tone(baseFreq * 1.5, t, 0.03, gain * 0.35, 'sine', 0.025);
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
        // Soothing soft chime — gentle descending sine tones, no harsh square waves
        const ctx = this._resume();
        if (!ctx) return;
        const t = ctx.currentTime;
        // Soft bell-like chime: mid-range sine, gentle fade
        this._tone(660, t,        0.18, 0.12, 'sine', 0.15);
        this._tone(495, t + 0.08, 0.22, 0.09, 'sine', 0.18);
        this._tone(392, t + 0.16, 0.28, 0.07, 'sine', 0.24);
        // Very soft high shimmer
        this._tone(1320, t, 0.05, 0.04, 'sine', 0.04);
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
        const ctx = this._resume();
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

    /** Soft crowd clap burst for champion celebration. */
    playClap() {
        const ctx = this._resume();
        if (!ctx) return;
        const t = ctx.currentTime;
        // Layered short noise bursts = applause texture
        for (let i = 0; i < 6; i++) {
            const st = t + i * 0.045 + Math.random() * 0.02;
            this._noise(st, 0.06 + Math.random() * 0.04, 0.14 + Math.random() * 0.08, 1800 + Math.random() * 1200);
            this._tone(180 + Math.random() * 80, st, 0.04, 0.06, 'triangle', 0.03);
        }
        this._noise(t, 0.35, 0.10, 900);
    }

    /** Light confetti / sparkle whoosh for champion screen. */
    playConfetti() {
        const ctx = this._resume();
        if (!ctx) return;
        const t = ctx.currentTime;
        this._noise(t, 0.18, 0.18, 6000);
        this._noise(t + 0.05, 0.22, 0.10, 4000);
        this._tone(1200, t, 0.08, 0.08, 'sine', 0.06);
        this._tone(1800, t + 0.04, 0.10, 0.06, 'sine', 0.07);
        this._tone(2400, t + 0.08, 0.12, 0.05, 'triangle', 0.08);
    }

    /**
     * Swoosh sound — played once when an asteroid shower begins entering the arena.
     * Deep whooshing noise with a descending pitch sweep: sounds like something
     * massive hurtling through space at high velocity.
     */
    playAsteroidSwoosh() {
        const ctx = this._resume();
        if (!ctx) return;
        const t = ctx.currentTime;

        // ── Layer 1: Fiery hiss — wide-band noise with high-pass (air-rip sound) ──
        this._noise(t,        0.55, 0.32, 6000);  // hot leading edge hiss
        this._noise(t + 0.04, 0.70, 0.22, 3800);  // mid-range body rush
        this._noise(t + 0.10, 0.80, 0.18, 2200);  // low-mid trailing roar

        // ── Layer 2: Doppler pitch drop — descending sawtooth (incoming + passing) ──
        const osc1 = ctx.createOscillator();
        const g1   = ctx.createGain();
        osc1.type  = 'sawtooth';
        osc1.frequency.setValueAtTime(600, t);
        osc1.frequency.exponentialRampToValueAtTime(80, t + 1.10);
        g1.gain.setValueAtTime(0, t);
        g1.gain.linearRampToValueAtTime(0.22, t + 0.05);
        g1.gain.linearRampToValueAtTime(0.30, t + 0.25);
        g1.gain.exponentialRampToValueAtTime(0.001, t + 1.15);
        osc1.connect(g1); g1.connect(this._masterGain);
        osc1.start(t); osc1.stop(t + 1.15);

        // ── Layer 3: Deep sub-bass rumble — low sine growl ──
        const osc2 = ctx.createOscillator();
        const g2   = ctx.createGain();
        osc2.type  = 'sine';
        osc2.frequency.setValueAtTime(110, t);
        osc2.frequency.exponentialRampToValueAtTime(22, t + 1.0);
        g2.gain.setValueAtTime(0, t);
        g2.gain.linearRampToValueAtTime(0.40, t + 0.08);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 1.05);
        osc2.connect(g2); g2.connect(this._masterGain);
        osc2.start(t); osc2.stop(t + 1.05);

        // ── Layer 4: Crackling fire trail (very short burst noise) ──
        this._noise(t + 0.02, 0.18, 0.15, 8500);  // sharp leading crackle
        this._noise(t + 0.15, 0.35, 0.12, 1400);  // low fire rumble

        // ── Layer 5: Triangle sub-pulse for tactile weight ──
        const osc3 = ctx.createOscillator();
        const g3   = ctx.createGain();
        osc3.type  = 'triangle';
        osc3.frequency.setValueAtTime(55, t);
        osc3.frequency.exponentialRampToValueAtTime(18, t + 0.80);
        g3.gain.setValueAtTime(0, t);
        g3.gain.linearRampToValueAtTime(0.28, t + 0.06);
        g3.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
        osc3.connect(g3); g3.connect(this._masterGain);
        osc3.start(t); osc3.stop(t + 0.85);
    }

    /**
     * Impact sound — played when an asteroid hits and burns a flag.
     * Sharp crack + bass thud + high-end sizzle: sounds like a meteor strike.
     */
    playAsteroidHit() {
        const ctx = this._resume();
        if (!ctx) return;
        const t = ctx.currentTime;

        // ── Layer 1: Explosive transient crack — ultra-short high-freq burst ──
        // Simulates the sharp initial shockwave of a meteor strike
        this._noise(t,        0.04, 0.65, 10000);  // sharp crack at t=0
        this._noise(t + 0.01, 0.07, 0.50, 6500);   // secondary crack
        this._noise(t + 0.02, 0.10, 0.38, 4200);   // crack body

        // ── Layer 2: Thunderous low BOOM — rapid pitch drop sine (cannon thud) ──
        const osc1 = ctx.createOscillator();
        const g1   = ctx.createGain();
        osc1.type  = 'sine';
        osc1.frequency.setValueAtTime(260, t);
        osc1.frequency.exponentialRampToValueAtTime(28, t + 0.45);
        g1.gain.setValueAtTime(0.75, t);
        g1.gain.exponentialRampToValueAtTime(0.001, t + 0.48);
        osc1.connect(g1); g1.connect(this._masterGain);
        osc1.start(t); osc1.stop(t + 0.48);

        // ── Layer 3: Sub bass thud — felt as much as heard ──
        const osc2 = ctx.createOscillator();
        const g2   = ctx.createGain();
        osc2.type  = 'triangle';
        osc2.frequency.setValueAtTime(80, t);
        osc2.frequency.exponentialRampToValueAtTime(15, t + 0.35);
        g2.gain.setValueAtTime(0.60, t);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
        osc2.connect(g2); g2.connect(this._masterGain);
        osc2.start(t); osc2.stop(t + 0.38);

        // ── Layer 4: Fiery explosion debris — mid-freq sizzle tail ──
        this._noise(t + 0.03, 0.28, 0.30, 3000);   // sizzle / fire crackle
        this._noise(t + 0.08, 0.40, 0.22, 1800);   // low rolling fire sound
        this._noise(t + 0.18, 0.55, 0.14, 1000);   // deep rumbling debris

        // ── Layer 5: Bright metallic ping + harmonic ring (real impact ring) ──
        this._tone(520, t + 0.01, 0.15, 0.10, 'sine',     0.18);
        this._tone(260, t + 0.02, 0.20, 0.08, 'sine',     0.14);
        this._tone(130, t + 0.03, 0.28, 0.06, 'triangle', 0.20);

        // ── Layer 6: Sawtooth distorted punch — adds grit and energy ──
        const osc3 = ctx.createOscillator();
        const g3   = ctx.createGain();
        osc3.type  = 'sawtooth';
        osc3.frequency.setValueAtTime(200, t);
        osc3.frequency.exponentialRampToValueAtTime(40, t + 0.20);
        g3.gain.setValueAtTime(0, t);
        g3.gain.linearRampToValueAtTime(0.22, t + 0.01);
        g3.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc3.connect(g3); g3.connect(this._masterGain);
        osc3.start(t); osc3.stop(t + 0.22);
    }

    playMilestone(remaining, total) {
        const pct = remaining / total;
        let key = null;
        if      (remaining === 10)          key = '10';
        else if (pct <= 0.25 && pct > 0.10) key = '25pct';
        else if (pct <= 0.50 && pct > 0.25) key = '50pct';
        if (!key || this._milestonesHit.has(key)) return;
        this._milestonesHit.add(key);
        const ctx = this._resume();
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

    // ── Speech — native TTS on Android, browser fallback on desktop ───────────

    speak(text) {
        if (document.hidden) return;

        if (_ttsReady && _nativeTTS) {
            // Native path — works reliably in Capacitor WebView
            this._speakNative(text, 0.9).catch(() => {
                // Native failed — try browser fallback
                this._speakBrowser(text);
            });
        } else {
            // Browser path — Vite dev server / desktop Chrome
            this._speakBrowser(text);
        }
    }

    _speakBrowser(text) {
        if (!this._hasSpeech) return;
        try {
            window.speechSynthesis.cancel();
            const utt  = new SpeechSynthesisUtterance(text);
            utt.lang   = 'en-US';
            utt.rate   = 0.90;
            utt.pitch  = 1.0;
            utt.volume = 1.0;
            window.speechSynthesis.speak(utt);
        } catch (e) {}
    }

    speakCommentary(text) {
        if (document.hidden) return;
        if (_ttsReady && _nativeTTS) {
            // Skip commentary if already speaking winner announcement
            _nativeTTS.getSupportedLanguages?.()
                .then(() => this._speakNative(text, 1.0))
                .catch(() => {});
        } else if (this._hasSpeech) {
            try {
                if (window.speechSynthesis.speaking) return;
                const utt  = new SpeechSynthesisUtterance(text);
                utt.lang   = 'en-US';
                utt.rate   = 1.0;
                utt.volume = 0.85;
                window.speechSynthesis.speak(utt);
            } catch (e) {}
        }
    }

    // ── Background music (HTMLAudioElement, loops until stopBGM) ─────────────
    // Use playPhase('qualify' | 'elimination' | 'champion') — filenames in BgmConfig.js

    playPhase(phase, { loop } = {}) {
        const entry = BGM[phase];
        if (!entry?.file) {
            this.stopBGM();
            return;
        }
        // Champion sting plays once by default (no endless tada loop)
        const shouldLoop = loop != null ? loop : (phase !== 'champion');
        this.playBGM(BGM_BASE + entry.file, entry.volume ?? 0.18, { loop: shouldLoop });
    }

    playBGM(src, volume = 0.18, { loop = true } = {}) {
        this.stopBGM();
        try {
            const a = new Audio();
            a.preload = 'auto';
            a.loop = !!loop;
            if (loop) a.setAttribute('loop', 'loop');
            else a.removeAttribute('loop');
            a.volume = Math.max(0, Math.min(1, volume));
            // Fallback if native loop fails on some WebViews
            if (loop) {
                a.addEventListener('ended', () => {
                    if (this._bgm === a) {
                        try {
                            a.currentTime = 0;
                            a.play().catch(() => {});
                        } catch (e) {}
                    }
                });
            } else {
                a.addEventListener('ended', () => {
                    if (this._bgm === a) this.stopBGM();
                });
            }
            a.src = src;
            this._bgm = a;
            const tryPlay = () => a.play().catch(() => {});
            a.addEventListener('canplay', tryPlay, { once: true });
            tryPlay();
        } catch (e) {
            this._bgm = null;
        }
    }

    stopBGM() {
        if (this._bgm) {
            const a = this._bgm;
            this._bgm = null;
            try {
                a.loop = false;
                a.onended = null;
                a.pause();
                a.currentTime = 0;
                a.removeAttribute('src');
                a.src = '';
                a.load();
            } catch (e) {}
        }
        // Nuclear: stop ANY lingering HTMLAudioElements (looping battle BGM after 3-2-1)
        try {
            if (typeof document !== 'undefined') {
                document.querySelectorAll('audio').forEach((el) => {
                    try {
                        el.loop = false;
                        el.onended = null;
                        el.pause();
                        el.currentTime = 0;
                        el.removeAttribute('src');
                        el.src = '';
                    } catch (_) {}
                });
            }
        } catch (_) {}
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
        if (this._bgm) {
            try { this._bgm.volume = Math.max(0, Math.min(1, v * 0.6)); } catch (e) {}
        }
    }

    destroy() {
        document.removeEventListener('visibilitychange', this._handleVisibility);
        this.stopBGM();
        this._stopNativeTTS();
        if (this._hasSpeech) {
            try { window.speechSynthesis.cancel(); } catch (e) {}
        }
        if (this._ctx) {
            try { this._ctx.close(); } catch (e) {}
            this._ctx = null;
        }
    }
}
