import Matter from "matter-js";

export default class EliminationManager {

    constructor(arena, world) {

        this.arena      = arena;
        this.world      = world;
        this.eliminated = [];

        this._lastBatchSize = 0;

        // Fixed outer boundary for classic modes. During shrink, we also
        // accept flags outside the *current* wall + buffer.
        this._outerBoundary = arena.radius + 40;
    }

    reset() {
        this._outerBoundary = this.arena.radius + 40;
        this._lastBatchSize = 0;
    }

    update(flagManager) {

        const survivors = [];
        let   removed   = 0;

        // Live threshold: max(original outer, current radius + buffer)
        // so shrinking doesn't trap flags outside the moving wall, and
        // classic mode still needs a real exit past the original rim.
        // Past orange rim so flags that clear both gaps count as eliminated
        // SmoothArena (Classic test / 5H GF): tight cut-off so flags don't
        // linger visibly outside the ring. Default modes keep a wider buffer.
        let rimExtra;
        if (this.arena.isSmoothArena) {
            rimExtra = 12;
        } else if (this.arena.rimEnabled) {
            rimExtra = (this.arena.rimRadius - this.arena.radius) + (this.arena.rimThickness || 10) + 8;
        } else {
            rimExtra = 28;
        }
        const liveBoundary = this.arena.isSmoothArena
            ? (this.arena.radius + rimExtra)
            : Math.max(this._outerBoundary, this.arena.radius + rimExtra);

        for (const flag of flagManager.flags) {

            const dx = flag.body.position.x - this.arena.cx;
            const dy = flag.body.position.y - this.arena.cy;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > liveBoundary) {
                Matter.World.remove(this.world, flag.body);
                this.eliminated.push(flag);
                removed++;
                continue;
            }

            survivors.push(flag);
        }

        this._lastBatchSize   = removed;
        flagManager.flags     = survivors;
    }

}