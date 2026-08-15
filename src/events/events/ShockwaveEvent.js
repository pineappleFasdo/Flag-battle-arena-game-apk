import Matter from "matter-js";

/**
 * SHOCKWAVE
 * Every ~2.5 seconds an explosion detonates at a random point inside
 * the arena, blasting all nearby flags radially outward. Flags closer
 * to the blast epicentre get hit harder (inverse-distance scaling).
 * Multiple blasts per round from different positions — chaotic, fair,
 * and visually readable because the origin point changes each time.
 */
export default class ShockwaveEvent {
    name  = "SHOCKWAVE";
    color = "#FF8800";
    icon  = "💥";

    _frame      = 0;
    _blastTimer = 0;
    _BLAST_EVERY = 150; // frames between blasts (~2.5 s at 60fps)
    _blastX     = 0;
    _blastY     = 0;
    _blastActive = 0;   // frames of active blast (for visual pop)
    _BLAST_FRAMES = 8;
    _BLAST_RADIUS = 0;  // set on each blast from arena radius

    start({ arena }) {
        this._frame      = 0;
        this._blastTimer = 75; // first blast fires after ~1.25 s
        this._blastActive = 0;
        this._BLAST_RADIUS = arena.radius * 0.85;
    }

    update({ arena, flagManager }) {
        this._frame++;
        this._blastTimer++;
        if (this._blastActive > 0) this._blastActive--;

        if (this._blastTimer < this._BLAST_EVERY) return;
        this._blastTimer = 0;
        this._blastActive = this._BLAST_FRAMES;

        // Random epicentre inside the arena (biased toward centre so blast
        // hits many flags rather than landing near empty wall)
        const angle  = Math.random() * Math.PI * 2;
        const radius = Math.random() * arena.radius * 0.55;
        this._blastX = arena.cx + Math.cos(angle) * radius;
        this._blastY = arena.cy + Math.sin(angle) * radius;

        const bx    = this._blastX;
        const by    = this._blastY;
        const flags = flagManager.flags;

        for (const flag of flags) {
            const body = flag.body;
            Matter.Sleeping.set(body, false);

            const dx   = body.position.x - bx;
            const dy   = body.position.y - by;
            const dist = Math.hypot(dx, dy) || 1;

            if (dist > this._BLAST_RADIUS) continue;

            // Inverse-distance: close flags get blasted hard
            const falloff  = 1 - dist / this._BLAST_RADIUS;
            const strength = 0.030 * falloff * falloff;

            Matter.Body.applyForce(body, body.position, {
                x: (dx / dist) * strength,
                y: (dy / dist) * strength,
            });
        }
    }

    end() {}
}
