/**
 * LongBattleMode — 5 Hour Championship
 *
 * 1. 40-minute rounds run until total session time reaches 5 hours.
 * 2. Each round: highest wins. At timeout, Round Winner is shown ~1 minute,
 *    then the next 40-min round starts (wins reset).
 * 3. All unique Round Winners enter a Grand Final elimination
 *    (Last Flag Standing / sudden-death style) → one Grand Champion.
 * 4. Round winners flash below the leaderboard at random intervals.
 */
export default class LongBattleMode {
    static ID = "long_battle";
    static TITLE = "5 Hour Championship";

    /** Full session wall-clock (5 hours). */
    static get SESSION_MS() {
        try {
            if (typeof localStorage !== "undefined" && localStorage.getItem("flag_battle_lb_fast") === "1") {
                // Fast test: ~3.5 min session (7 × 30s) so full flow is testable quickly
                return 7 * 30 * 1000;
            }
        } catch { /* private mode */ }
        return 5 * 60 * 60 * 1000;
    }

    /** Each highest-wins segment length. */
    static get SEGMENT_MS() {
        try {
            if (typeof localStorage !== "undefined" && localStorage.getItem("flag_battle_lb_fast") === "1") {
                return 30 * 1000; // 30s per round in FAST test
            }
        } catch { /* private mode */ }
        return 40 * 60 * 1000;
    }

    /** How long to show the Round Winner before next round starts. */
    static get ROUND_WINNER_DISPLAY_MS() {
        try {
            if (typeof localStorage !== "undefined" && localStorage.getItem("flag_battle_lb_fast") === "1") {
                return 5 * 1000; // 5s in FAST test
            }
        } catch { /* private mode */ }
        return 60 * 1000; // 1 minute
    }

    /** Expected max full segments (info / UI only). */
    static get MAX_SEGMENTS() {
        return Math.max(1, Math.floor(LongBattleMode.SESSION_MS / LongBattleMode.SEGMENT_MS));
    }

    // Back-compat for any code still reading these names
    static get SEGMENTS() { return LongBattleMode.MAX_SEGMENTS; }
    static get DURATION_MS() { return LongBattleMode.SESSION_MS; }

    constructor(game) {
        this.game = game;
        this.sessionStartTime = 0;
        this.segmentStartTime = 0;
        this.segmentIndex = 0; // 0-based current segment
        this.ended = false;
        this.inGrandFinal = false;
        this.champion = null;
        this.tiedCountries = [];
        /** @type {Array<{code,name,image,wins,segment}>} */
        this.segmentWinners = [];
        this.lastSegmentWinner = null;
        this.lastSegmentWinnerAt = 0;
    }

    onSessionStart() {
        this.sessionStartTime = Date.now();
        this.segmentStartTime = this.sessionStartTime;
        this.segmentIndex = 0;
        this.ended = false;
        this.inGrandFinal = false;
        this.champion = null;
        this.tiedCountries = [];
        this.segmentWinners = [];
        this.lastSegmentWinner = null;
        this.lastSegmentWinnerAt = 0;
        this._segmentPauseOffsetMs = 0;

        this.game._qualifyPool = this.game._shuffle([...this.game.allCountries]);
        this.game._qualifyWinners = [];
        this.game.isFinalMode = false;
        this.game.sessionStartTime = this.sessionStartTime;
        this.game.QUALIFY_DURATION_MS = LongBattleMode.SEGMENT_MS;

        this.game.winnerManager.clearWins();
        this.game.leaderboardRenderer?.reset();
    }

    pickBatch() {
        const g = this.game;
        if (g._qualifyPool.length < 2) {
            g._qualifyPool = g._shuffle([...g.allCountries]);
        }
        const size = Math.min(g.roundSize, g._qualifyPool.length);
        const batch = g._qualifyPool.splice(0, size);
        g._qualifyPool.push(...batch);
        return batch;
    }

    /**
     * After each arena battle win during a 40-min segment.
     * @returns {'continue'|'segment_end'|'grand_final'|'end'}
     */
    onRoundComplete(winner) {
        if (this.ended) return "end";
        if (this.inGrandFinal) return "continue";

        if (this.isSegmentTimeUp()) {
            return this._closeSegment();
        }
        return "continue";
    }

    isSegmentTimeUp() {
        if (this.ended || this.inGrandFinal) return false;
        const elapsed = Date.now() - this.segmentStartTime - (this._segmentPauseOffsetMs ?? 0);
        return elapsed >= LongBattleMode.SEGMENT_MS;
    }

    isSessionTimeUp() {
        return Date.now() - this.sessionStartTime >= LongBattleMode.SESSION_MS;
    }

    remainingSegmentMs() {
        if (this.inGrandFinal) return 0;
        const elapsed = Date.now() - this.segmentStartTime - (this._segmentPauseOffsetMs ?? 0);
        return Math.max(0, LongBattleMode.SEGMENT_MS - elapsed);
    }

    remainingSessionMs() {
        return Math.max(0, LongBattleMode.SESSION_MS - (Date.now() - this.sessionStartTime));
    }

    /**
     * Record highest-wins Round Winner for this 40-min block.
     * Then either start next 40-min round or go to Grand Final if 5h is up.
     * @returns {'segment_end'|'grand_final'}
     */
    _closeSegment() {
        const lb = this.game.winnerManager.getLeaderboard();
        let winnerEntry = null;

        if (lb.length > 0) {
            const topWins = lb[0].wins;
            const tied = lb.filter(e => e.wins === topWins);
            winnerEntry = tied[0];
        }

        if (winnerEntry) {
            const img = this.game.flagLoader
                ? this.game.flagLoader.load(winnerEntry.code)
                : winnerEntry.image;
            const rec = {
                code: winnerEntry.code,
                name: winnerEntry.name,
                image: img,
                wins: winnerEntry.wins,
                segment: this.segmentIndex + 1,
            };
            this.segmentWinners.push(rec);
            this.lastSegmentWinner = rec;
            this.lastSegmentWinnerAt = Date.now();
        }

        this.segmentIndex += 1;

        // End of 5 hours (or not enough time for another full 40-min round)
        const sessionElapsed = Date.now() - this.sessionStartTime;
        const noMoreFullRound =
            sessionElapsed >= LongBattleMode.SESSION_MS ||
            (LongBattleMode.SESSION_MS - sessionElapsed) < LongBattleMode.SEGMENT_MS * 0.15;

        if (noMoreFullRound) {
            this.inGrandFinal = true;
            return "grand_final";
        }

        // Next 40-min highest-wins round.
        // Start the clock normally but record a pause offset equal to the
        // winner-display hold so remainingSegmentMs() counts from 40:00 once
        // the screen ends, not immediately.
        const displayHoldMs = LongBattleMode.ROUND_WINNER_DISPLAY_MS ?? 60 * 1000;
        this.segmentStartTime = Date.now();
        this._segmentPauseOffsetMs = displayHoldMs;
        this.game.winnerManager.clearWins();
        this.game.leaderboardRenderer?.reset();
        this.game.QUALIFY_DURATION_MS = LongBattleMode.SEGMENT_MS;
        return "segment_end";
    }

    /** Unique Round Winners for elimination Grand Final. */
    getGrandFinalists() {
        const seen = new Set();
        const list = [];
        for (const w of this.segmentWinners) {
            if (seen.has(w.code)) continue;
            seen.add(w.code);
            list.push({
                code: w.code,
                name: w.name,
                image: w.image,
                country: {
                    code: w.code,
                    name: w.name,
                    image: w.image,
                },
            });
        }
        return list;
    }

    allowsFinalMode() {
        return this.inGrandFinal;
    }

    debugExpireSegment() {
        // Must account for _segmentPauseOffsetMs: isSegmentTimeUp() subtracts it from
        // elapsed, so we need to push segmentStartTime far enough back that even after
        // that subtraction the result is >= SEGMENT_MS.
        this.segmentStartTime = Date.now()
            - LongBattleMode.SEGMENT_MS
            - (this._segmentPauseOffsetMs ?? 0)
            - 1000;
    }

    /**
     * Called by Shift+N (main.js) when the WINNER_SHOW is skipped early and the
     * next segment begins immediately.  Anchors segmentStartTime to RIGHT NOW
     * and clears the pause offset so the 40-min clock counts from this moment.
     */
    onSegmentActuallyStarted() {
        this.segmentStartTime      = Date.now();
        this._segmentPauseOffsetMs = 0;
    }

    debugForceCloseSegment() {
        this.debugExpireSegment();
        return this._closeSegment();
    }

    /**
     * DEBUG: seed N round winners and go to Grand Final.
     * @param {number} n
     */
    debugSeedWinnersAndGotoFinal(n = 5) {
        const pool = this.game.allCountries || [];
        const lb = this.game.winnerManager.getLeaderboard();
        const picks = [];
        for (const e of lb) {
            if (picks.length >= n) break;
            picks.push(e);
        }
        for (const c of pool) {
            if (picks.length >= n) break;
            if (picks.some(p => p.code === c.code)) continue;
            picks.push({ code: c.code, name: c.name, image: c.image, wins: 1 });
        }
        this.segmentWinners = picks.slice(0, n).map((e, i) => ({
            code: e.code,
            name: e.name,
            image: e.image,
            wins: e.wins ?? (3 + i),
            segment: i + 1,
        }));
        this.segmentIndex = this.segmentWinners.length;
        this.inGrandFinal = true;
        this.lastSegmentWinner = this.segmentWinners[this.segmentWinners.length - 1] || null;
        this.lastSegmentWinnerAt = Date.now();
        return this.segmentWinners;
    }

    getDisplayName() {
        if (this.inGrandFinal) return "GRAND FINAL";
        return "5H CHAMPIONSHIP";
    }

    getSubtitle() {
        const left = this.game.flagManager?.flags?.length ?? 0;
        if (this.inGrandFinal) return `GRAND FINAL · ${left} FLAGS`;
        return `ROUND ${this.segmentIndex + 1} · ${left} FLAGS`;
    }

    getSegmentLabel() {
        if (this.inGrandFinal) return "GRAND FINAL";
        return `R${this.segmentIndex + 1}`;
    }
}
