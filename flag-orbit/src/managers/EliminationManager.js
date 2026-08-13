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
        const liveBoundary = Math.max(
            this._outerBoundary,
            this.arena.radius + 28
        );

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