/**
 * HighestWinsMode — separate home-page session mode.
 *
 * Rules:
 *  - Repeating 40-minute rounds (no session end — runs until manually stopped)
 *  - Every country stays eligible every round (winners do NOT sit out)
 *  - No Last Standing / Final Mode
 *  - When a 40-min round ends, the country with the most wins in that round
 *    is shown as winner for 1 minute, then the next round starts with a fresh
 *    leaderboard.
 *
 * Kept fully isolated from classic Qualifier so future home events
 * can be added the same way without touching Game.js qualify paths.
 */
export default class HighestWinsMode {
    static ID = "highest_wins";
    static TITLE = "Highest Winner Wins";
    static DURATION_MS = 40 * 60 * 1000;

    /** How long to show the round winner before the next 40-min round starts. */
    static ROUND_WINNER_DISPLAY_MS = 60 * 1000; // 1 minute

    constructor(game) {
        this.game = game;
        this.sessionStartTime = 0;
        this.ended = false;
        this.champion = null; // { code, name, wins, image }

        // Segment tracking — used by _showLongBattleSegmentWinner in Game.js
        this.segmentIndex = 0;          // 0-based; incremented after each 40-min round
        this.lastSegmentWinner = null;  // { code, name, image, wins, segment }
        this.tiedCountries = [];       // top-score ties → sudden death
        this.inGrandFinal = false;      // always false for this mode
    }

    /** Called once when this mode starts from the home screen. */
    onSessionStart() {
        this.sessionStartTime = Date.now();
        this.ended = false;
        this.champion = null;
        this.segmentIndex = 0;
        this.lastSegmentWinner = null;
        this.inGrandFinal = false;
        // All countries always eligible — full shuffle each round
        this.game._qualifyPool = this.game._shuffle([...this.game.allCountries]);
        this.game._qualifyWinners = []; // unused in this mode
        this.game.isFinalMode = false;
        this.game.sessionStartTime = this.sessionStartTime;
        this.game.QUALIFY_DURATION_MS = HighestWinsMode.DURATION_MS;
    }

    /**
     * Pick the next batch of countries for a round.
     * Everyone stays in rotation — no "sit out after win".
     */
    pickBatch() {
        const g = this.game;
        // Reshuffle when pool runs low so the same countries cycle
        if (g._qualifyPool.length < 2) {
            g._qualifyPool = g._shuffle([...g.allCountries]);
        }
        const size = Math.min(g.roundSize, g._qualifyPool.length);
        const batch = g._qualifyPool.splice(0, size);
        // Put them back at the end so they can return next cycles
        g._qualifyPool.push(...batch);
        return batch;
    }

    /**
     * After a round win/tie — do NOT remove winner from pool.
     * If the 40-minute clock is up, record the segment winner, reset the
     * clock for the next round, and return 'segment_end' so Game.js shows
     * the winner for 1 minute then starts a fresh round automatically.
     * @returns {'continue'|'segment_end'}
     */
    onRoundComplete(winner) {
        if (this.ended) return "segment_end";

        const elapsed = Date.now() - this.sessionStartTime;
        if (elapsed >= HighestWinsMode.DURATION_MS) {
            // Check for top-score ties BEFORE recording / clearing the board
            const tied = this._getTopTied();
            if (tied.length >= 2) {
                this.tiedCountries = tied;
                return "sudden_death";
            }
            this.tiedCountries = [];
            this._recordSegmentWinner();
            return "segment_end";
        }
        return "continue";
    }

    /**
     * Countries sharing the highest win count (2+ means sudden death).
     * @returns {Array<{code,name,image,wins}>}
     */
    _getTopTied() {
        const lb = this.game.winnerManager.getLeaderboard();
        if (!lb.length) return [];
        const topWins = lb[0].wins;
        if (!topWins || topWins < 1) return [];
        return lb
            .filter(e => e.wins === topWins)
            .map(e => ({
                code: e.code,
                name: e.name,
                image: e.image,
                wins: e.wins,
            }));
    }

    /** True when the current 40-minute round clock has finished. */
    isTimeUp() {
        if (this.ended) return true;
        return Date.now() - this.sessionStartTime >= HighestWinsMode.DURATION_MS;
    }

    remainingMs() {
        return Math.max(0, HighestWinsMode.DURATION_MS - (Date.now() - this.sessionStartTime));
    }

    /**
     * Record the winner of the completed 40-min round, then reset the clock
     * and leaderboard so the next round starts fresh.
     */
    _recordSegmentWinner() {
        const lb = this.game.winnerManager.getLeaderboard();
        if (lb.length > 0) {
            const top = lb[0];
            this.lastSegmentWinner = {
                code    : top.code,
                name    : top.name,
                image   : top.image,
                wins    : top.wins,
                segment : this.segmentIndex + 1,
            };
        } else {
            this.lastSegmentWinner = null;
        }

        this.segmentIndex += 1;

        // Reset clock and leaderboard for the next 40-min round
        this.sessionStartTime = Date.now();
        this.game.sessionStartTime = this.sessionStartTime;
        this.game.QUALIFY_DURATION_MS = HighestWinsMode.DURATION_MS;
        this.game.winnerManager.clearWins();
        this.game.leaderboardRenderer?.reset();
    }

    /** DEBUG: force the 40-min clock to look like it already expired.
     *  The next call to onRoundComplete() will return 'segment_end'. */
    debugExpireSegment() {
        this.sessionStartTime = Date.now() - HighestWinsMode.DURATION_MS - 1000;
        this.game.sessionStartTime = this.sessionStartTime;
    }

    _declareChampion() {
        this.ended = true;
        const lb = this.game.winnerManager.getLeaderboard();
        if (lb.length === 0) {
            this.champion      = null;
            this.tiedCountries = [];
            return;
        }

        const topWins = lb[0].wins;
        // Collect every country that shares the highest win count
        const tied = lb.filter(e => e.wins === topWins);

        if (tied.length > 1) {
            // Multiple countries share the top score — sudden death needed
            this.champion      = null;
            this.tiedCountries = tied.map(e => ({
                code  : e.code,
                name  : e.name,
                image : e.image,
            }));
            return;
        }

        // Clear winner
        this.tiedCountries = [];
        const top = lb[0];
        this.champion = {
            code    : top.code,
            name    : top.name,
            wins    : top.wins,
            image   : top.image,
            country : {
                code  : top.code,
                name  : top.name,
                image : top.image,
            },
        };
    }

    /** Never enter classic Last Standing final. */
    allowsFinalMode() {
        return false;
    }

    /** Label for UI badges / bottom bar. */
    getDisplayName() {
        return "HIGHEST WINNER WINS";
    }

    getSubtitle() {
        const left = this.game.flagManager?.flags?.length ?? 0;
        return `HIGHEST WINS · ${left} FLAGS LEFT`;
    }
}