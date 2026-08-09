// StatsManager.js — session + persistent match statistics

const STORAGE_KEY = "flagBattle_stats";

export default class StatsManager {

    constructor() {
        const saved = this._load();

        // Persistent
        this.totalMatches     = saved.totalMatches ?? 0;
        this.highestWinsCode  = saved.highestWinsCode ?? null;
        this.highestWinsName  = saved.highestWinsName ?? null;
        this.highestWinsCount = saved.highestWinsCount ?? 0;
        this.longestSurviveCode = saved.longestSurviveCode ?? null;
        this.longestSurviveName = saved.longestSurviveName ?? null;
        this.longestSurviveMs   = saved.longestSurviveMs ?? 0;
        this.fastestElimCode  = saved.fastestElimCode ?? null;
        this.fastestElimName  = saved.fastestElimName ?? null;
        this.fastestElimMs    = saved.fastestElimMs ?? Infinity;
        this.streakCode       = saved.streakCode ?? null;
        this.streakName       = saved.streakName ?? null;
        this.streakCount      = saved.streakCount ?? 0;

        // Per-match (reset each round)
        this._matchStart      = 0;
        this._aliveSince      = new Map(); // code → timestamp when still in arena
        this._firstElimMs     = null;
        this._firstElimCountry = null;
        this._matchLongestMs  = 0;
        this._matchLongestCountry = null;
    }

    // ── Persistence ──────────────────────────────────────────────────────────

    _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch { return {}; }
    }

    _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                totalMatches: this.totalMatches,
                highestWinsCode: this.highestWinsCode,
                highestWinsName: this.highestWinsName,
                highestWinsCount: this.highestWinsCount,
                longestSurviveCode: this.longestSurviveCode,
                longestSurviveName: this.longestSurviveName,
                longestSurviveMs: this.longestSurviveMs,
                fastestElimCode: this.fastestElimCode,
                fastestElimName: this.fastestElimName,
                fastestElimMs: this.fastestElimMs === Infinity ? null : this.fastestElimMs,
                streakCode: this.streakCode,
                streakName: this.streakName,
                streakCount: this.streakCount,
            }));
        } catch { /* private mode */ }
    }

    // ── Match lifecycle ──────────────────────────────────────────────────────

    /** Call when a new round starts (countdown → playing). */
    beginMatch(flags) {
        this._matchStart = Date.now();
        this._aliveSince = new Map();
        this._firstElimMs = null;
        this._firstElimCountry = null;
        this._matchLongestMs = 0;
        this._matchLongestCountry = null;

        for (const flag of flags ?? []) {
            const code = flag.country?.code;
            if (code) this._aliveSince.set(code, this._matchStart);
        }
    }

    /**
     * Call when flags are eliminated this frame.
     * @param {Array} newlyEliminated - Flag objects removed this frame
     */
    onEliminations(newlyEliminated) {
        if (!newlyEliminated?.length) return;
        const now = Date.now();

        for (const flag of newlyEliminated) {
            const code = flag.country?.code;
            const name = flag.country?.name;
            if (!code) continue;

            const born = this._aliveSince.get(code) ?? this._matchStart;
            const lived = now - born;
            this._aliveSince.delete(code);

            // Fastest elimination (shortest time to die)
            if (this._firstElimMs === null || lived < this._firstElimMs) {
                this._firstElimMs = lived;
                this._firstElimCountry = { code, name };
            }
            if (lived < this.fastestElimMs) {
                this.fastestElimMs = lived;
                this.fastestElimCode = code;
                this.fastestElimName = name;
            }

            // Track longest among eliminated too (survivor may still beat it)
            if (lived > this._matchLongestMs) {
                this._matchLongestMs = lived;
                this._matchLongestCountry = { code, name };
            }
        }
    }

    /**
     * Call when a winner (or tie) is declared.
     * @param {object} winner - Flag or { isTie, countries }
     * @param {Array} remainingFlags - still-alive flags (winner)
     * @param {object} winsMap - WinnerManager._wins for highest-wins
     */
    endMatch(winner, remainingFlags = [], winsMap = {}) {
        const now = Date.now();
        this.totalMatches++;

        // Survivors lived until now
        for (const flag of remainingFlags) {
            const code = flag.country?.code;
            const name = flag.country?.name;
            if (!code) continue;
            const born = this._aliveSince.get(code) ?? this._matchStart;
            const lived = now - born;
            if (lived > this._matchLongestMs) {
                this._matchLongestMs = lived;
                this._matchLongestCountry = { code, name };
            }
            if (lived > this.longestSurviveMs) {
                this.longestSurviveMs = lived;
                this.longestSurviveCode = code;
                this.longestSurviveName = name;
            }
        }

        // Also compare eliminated longest
        if (this._matchLongestMs > this.longestSurviveMs && this._matchLongestCountry) {
            this.longestSurviveMs = this._matchLongestMs;
            this.longestSurviveCode = this._matchLongestCountry.code;
            this.longestSurviveName = this._matchLongestCountry.name;
        }

        // Streak
        if (winner && !winner.isTie && winner.country) {
            const code = winner.country.code;
            const name = winner.country.name;
            if (this.streakCode === code) {
                this.streakCount++;
            } else {
                this.streakCode = code;
                this.streakName = name;
                this.streakCount = 1;
            }
        } else {
            // Tie breaks streak
            this.streakCode = null;
            this.streakName = null;
            this.streakCount = 0;
        }

        // Highest wins from wins map
        let topCode = null, topName = null, topWins = 0;
        for (const [code, entry] of Object.entries(winsMap)) {
            if (entry.wins > topWins) {
                topWins = entry.wins;
                topCode = code;
                topName = entry.name;
            }
        }
        if (topWins > 0) {
            this.highestWinsCode = topCode;
            this.highestWinsName = topName;
            this.highestWinsCount = topWins;
        }

        this._save();
    }

    /** Full reset (Start Playing / clear session). */
    clear() {
        this.totalMatches = 0;
        this.highestWinsCode = null;
        this.highestWinsName = null;
        this.highestWinsCount = 0;
        this.longestSurviveCode = null;
        this.longestSurviveName = null;
        this.longestSurviveMs = 0;
        this.fastestElimCode = null;
        this.fastestElimName = null;
        this.fastestElimMs = Infinity;
        this.streakCode = null;
        this.streakName = null;
        this.streakCount = 0;
        this._aliveSince = new Map();
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
    }

    // ── Snapshot for UI ──────────────────────────────────────────────────────

    getSnapshot() {
        return {
            totalMatches: this.totalMatches,
            longestSurvive: this.longestSurviveName
                ? { name: this.longestSurviveName, ms: this.longestSurviveMs }
                : null,
            fastestElim: this.fastestElimName && this.fastestElimMs !== Infinity
                ? { name: this.fastestElimName, ms: this.fastestElimMs }
                : null,
            streak: this.streakCount > 0
                ? { name: this.streakName, count: this.streakCount }
                : null,
            highestWins: this.highestWinsCount > 0
                ? { name: this.highestWinsName, wins: this.highestWinsCount }
                : null,
        };
    }

    static formatMs(ms) {
        if (ms == null || !Number.isFinite(ms)) return "—";
        const s = ms / 1000;
        if (s < 60) return `${s.toFixed(1)}s`;
        const m = Math.floor(s / 60);
        const rs = Math.floor(s % 60);
        return `${m}m ${rs}s`;
    }
}