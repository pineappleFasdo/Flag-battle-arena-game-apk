import Matter from "matter-js";

/**
 * GRAVITY WELLS
 * Two gravity wells sit at the left and right thirds of the arena,
 * each pulling flags toward it with inverse-square attraction. Flags
 * accumulate at both poles and cluster into two rival groups. Every
 * ~5 seconds the wells slowly drift to new positions, breaking up the
 * clusters and forcing flags to chase the new gravity source.
 */
export default class GravityWellsEvent {
    name  = "GRAVITY WELLS";
    color = "#9966FF";
    icon  = "🪐";

    _frame     = 0;
    _wells     = [];  // [{ x, y, targetX, targetY }]
    _MOVE_EVERY = 300; // frames between well migrations
    _moveTimer  = 0;
    _STRENGTH   = 0.0016;
    _MAX_DIST_R = 0.75; // wells only pull within this fraction of arena radius

    start({ arena }) {
        this._frame     = 0;
        this._moveTimer = 0;
        this._wells     = this._generateWells(arena);
    }

    _generateWells(arena) {
        const cx = arena.cx;
        const cy = arena.cy;
        const R  = arena.radius * 0.40;
        // Left and right wells
        return [
            { x: cx - R, y: cy, targetX: cx - R, targetY: cy },
            { x: cx + R, y: cy, targetX: cx + R, targetY: cy },
        ];
    }

    _randomiseTargets(arena) {
        const cx = arena.cx;
        const cy = arena.cy;
        const R  = arena.radius * 0.42;
        for (let i = 0; i < this._wells.length; i++) {
            const angle = (i / this._wells.length) * Math.PI * 2
                + Math.random() * 0.9 - 0.45;
            this._wells[i].targetX = cx + Math.cos(angle) * R * (0.6 + Math.random() * 0.4);
            this._wells[i].targetY = cy + Math.sin(angle) * R * (0.6 + Math.random() * 0.4);
        }
    }

    update({ arena, flagManager }) {
        this._frame++;
        this._moveTimer++;

        // Drift wells toward their targets
        for (const w of this._wells) {
            w.x += (w.targetX - w.x) * 0.012;
            w.y += (w.targetY - w.y) * 0.012;
        }

        // Periodically pick new target positions
        if (this._moveTimer >= this._MOVE_EVERY) {
            this._moveTimer = 0;
            this._randomiseTargets(arena);
        }

        const flags   = flagManager.flags;
        const maxDist = arena.radius * this._MAX_DIST_R;
        const offset  = this._frame & 1;

        for (let i = offset; i < flags.length; i += 2) {
            const body = flags[i].body;
            if (body.isSleeping) Matter.Sleeping.set(body, false);

            for (const w of this._wells) {
                const dx   = w.x - body.position.x;
                const dy   = w.y - body.position.y;
                const dist = Math.hypot(dx, dy) || 1;

                if (dist > maxDist) continue;

                // Inverse-square pull, soft cap so flags don't tunnel through
                const raw      = this._STRENGTH / (dist * 0.06 + 1);
                const strength = Math.min(raw, 0.0022);

                Matter.Body.applyForce(body, body.position, {
                    x: (dx / dist) * strength,
                    y: (dy / dist) * strength,
                });
            }
        }
    }

    end() {}
}
