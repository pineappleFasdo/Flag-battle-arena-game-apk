import Matter from "matter-js";

/**
 * QUICKSAND
 * A sticky zone fills the centre of the arena. Flags that drift into it
 * get their velocity heavily damped — almost frozen in place. Flags near
 * the wall move freely. The zone slowly pulses in size so its boundary
 * is visually telegraphed. Flags trapped near the centre can't reach the
 * gap, which creates a strategic drain effect near the edges.
 */
export default class QuicksandEvent {
    name  = "QUICKSAND";
    color = "#C8A040";
    icon  = "🏜️";

    _frame    = 0;
    _DRAG     = 0.60;  // velocity multiplier per frame inside zone (1.0 = no drag, 0 = instant stop)
    _BASE_R   = 0.45;  // base radius as fraction of arena radius
    _PULSE    = 0.08;  // pulse amplitude (fraction of arena radius)
    _PULSE_SPEED = 0.022;

    start() {
        this._frame = 0;
    }

    update({ arena, flagManager }) {
        this._frame++;

        // Zone radius pulses so players can see the boundary breathe
        const pulse  = Math.sin(this._frame * this._PULSE_SPEED);
        const zoneR  = arena.radius * (this._BASE_R + this._PULSE * pulse);
        const zoneR2 = zoneR * zoneR; // squared for cheap distance check

        const cx     = arena.cx;
        const cy     = arena.cy;
        const flags  = flagManager.flags;
        const offset = this._frame & 1;

        for (let i = offset; i < flags.length; i += 2) {
            const body = flags[i].body;
            if (body.isSleeping) continue;

            const dx   = body.position.x - cx;
            const dy   = body.position.y - cy;
            const dist2 = dx * dx + dy * dy;

            if (dist2 > zoneR2) continue; // outside zone — leave alone

            // Smooth drag falloff: full drag at centre, lessens toward edge
            const dist     = Math.sqrt(dist2);
            const t        = 1 - dist / zoneR; // 1 at centre, 0 at edge
            const drag     = 1 - (1 - this._DRAG) * t;

            Matter.Body.setVelocity(body, {
                x: body.velocity.x * drag,
                y: body.velocity.y * drag,
            });
        }
    }

    end() {}
}
