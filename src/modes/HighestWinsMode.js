/**
 * HighestWinsMode — separate home-page session mode.
 *
 * Rules:
 *  - 40-minute session of normal arena rounds
 *  - Every country stays eligible every round (winners do NOT sit out)
 *  - No Last Standing / Final Mode
 *  - When time is up, the country with the most wins is the session champion
 *
 * Kept fully isolated from classic Qualifier so future home events
 * can be added the same way without touching Game.js qualify paths.
 */
export default class HighestWinsMode {
    static ID = "highest_wins";
    static TITLE = "Highest Winner Wins";
    static DURATION_MS = 40 * 60 * 1000;

    constructor(game) {
        this.game = game;
        this.sessionStartTime = 0;
        this.ended = false;
        this.champion = null; // { code, name, wins, image }
    }

    /** Called once when this mode starts from the home screen. */
    onSessionStart() {
        this.sessionStartTime = Date.now();
        this.ended = false;
        this.champion = null;
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
     * If time is up, end the session with highest-wins champion.
     * @returns {'continue'|'end'}
     */
    onRoundComplete(winner) {
        if (this.ended) return "end";

        const elapsed = Date.now() - this.sessionStartTime;
        if (elapsed >= HighestWinsMode.DURATION_MS) {
            this._declareChampion();
            return "end";
        }
        return "continue";
    }

    /** True when the 40-minute clock has finished. */
    isTimeUp() {
        if (this.ended) return true;
        return Date.now() - this.sessionStartTime >= HighestWinsMode.DURATION_MS;
    }

    remainingMs() {
        return Math.max(0, HighestWinsMode.DURATION_MS - (Date.now() - this.sessionStartTime));
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
