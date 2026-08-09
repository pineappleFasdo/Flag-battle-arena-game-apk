// ─────────────────────────────────────────────────────────────────────────────
// WinnerManager.js
//
// Tracks the winner of each round and persists win counts in localStorage.
//
// Phase 3: now calls leaderboardRenderer.markDirty(rows, winCode) after every
// win so the renderer can animate the bump and re-sort at the right moment
// without needing to re-sort every frame inside draw().
//
// Tie handling (Phase 2): if two flags drain in the same physics frame the
// count drops 2→0, skipping 1. We detect this via EliminationManager._lastBatchSize
// and call onWin with a { isTie, countries } object so the game doesn't freeze.
// ─────────────────────────────────────────────────────────────────────────────

export default class WinnerManager {

    constructor() {
        this.winner = null;   // Flag on normal win | { isTie, countries } on tie | null
        this.onWin  = null;

        // Injected by Game after the LeaderboardRenderer is created
        this.leaderboardRenderer = null;

        // Persistent win records: { [code]: { name, imageSrc, wins } }
        this._wins       = this._loadWins();
        this._imageCache = {};
    }

    // ── Persistence ───────────────────────────────────────────────────────────

    _loadWins() {
        try {
            const raw = localStorage.getItem("flagBattle_wins");
            return raw ? JSON.parse(raw) : {};
        } catch { return {}; }
    }

    _saveWins() {
        try {
            localStorage.setItem("flagBattle_wins", JSON.stringify(this._wins));
        } catch { /* quota / private mode */ }
    }

    // ── Image reconstruction ──────────────────────────────────────────────────

    _getImage(code, imageSrc) {
        if (!imageSrc) return null;
        if (this._imageCache[code]) return this._imageCache[code];

        if (typeof imageSrc === "string") {
            const img = new Image();
            img.src   = imageSrc;
            this._imageCache[code] = img;
            return img;
        }

        this._imageCache[code] = imageSrc;
        return imageSrc;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /** Wipe all win records (used by full-game reset). */
    clearWins() {
        this._wins = {};
        try { localStorage.removeItem("flagBattle_wins"); } catch { /* quota / private */ }
    }

    /** Sorted descending by win count – ready for LeaderboardRenderer */
    getLeaderboard() {
        return Object.entries(this._wins)
            .map(([code, entry]) => ({
                code,
                name  : entry.name,
                wins  : entry.wins,
                image : this._getImage(code, entry.imageSrc),
            }))
            .sort((a, b) => b.wins - a.wins);
    }

    // ── Game loop ─────────────────────────────────────────────────────────────

    update(flagManager, eliminationManager) {
        if (this.winner)         return;
        if (!flagManager?.flags) return;

        const remaining = flagManager.flags;

        if (remaining.length === 1) {
            this._recordWin(remaining[0]);
            return;
        }

        if (remaining.length === 0) {
            const eliminated = eliminationManager?.eliminated ?? [];
            const batchSize  = eliminationManager?._lastBatchSize ?? 0;
            const tiedFlags  = batchSize >= 2
                ? eliminated.slice(-batchSize)
                : eliminated.slice(-2);

            if (tiedFlags.length >= 2) {
                this._recordTie(tiedFlags);
            } else if (tiedFlags.length === 1) {
                this._recordWin(tiedFlags[0]);
            } else {
                this.winner = { isTie: true, countries: [], isSilent: true };
                if (this.onWin) this.onWin(this.winner);
            }
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    _recordWin(flag) {
        this.winner = flag;

        const { code, name, image } = flag.country;
        if (!this._wins[code]) {
            this._wins[code] = { name, imageSrc: image?.src ?? null, wins: 0 };
        }
        this._wins[code].wins++;
        this._saveWins();

        if (image) this._imageCache[code] = image;

        // ── Phase 3: notify the renderer so it can animate + re-sort ─────────
        if (this.leaderboardRenderer) {
            this.leaderboardRenderer.markDirty(this.getLeaderboard(), code);
        }

        if (this.onWin) this.onWin(flag);
    }

    _recordTie(tiedFlags) {
        const countries = tiedFlags.map(f => f.country);
        this.winner = { isTie: true, countries };
        if (this.onWin) this.onWin(this.winner);
        // Ties don't affect the leaderboard so no markDirty needed
    }

    reset() {
        this.winner = null;
    }
}
