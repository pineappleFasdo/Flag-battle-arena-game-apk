import Matter from "matter-js";

/**
 * BLACK HOLE
 * A wandering gravity well orbits the arena interior, dragging flags
 * toward it. Every ~5 s it jumps to a new position. Flags near the
 * singularity get flung outward with a slingshot burst, increasing
 * their chance of reaching the gap.
 */
export default class BlackHoleEvent {
    name  = "BLACK HOLE";
    color = "#6600CC";
    icon  = "🌑";

    _frame      = 0;
    _orbitAngle = 0;
    _orbitSpeed = 0.018;
    _jumpTimer  = 0;
    _JUMP_EVERY = 300; // frames between jumps
    _hx = 0;
    _hy = 0;

    start({ arena }) {
        this._frame      = 0;
        this._orbitAngle = Math.random() * Math.PI * 2;
        this._jumpTimer  = 0;
        this._updatePos(arena);
    }

    _updatePos(arena) {
        const r = arena.radius * (0.30 + Math.random() * 0.30);
        this._hx = arena.cx + Math.cos(this._orbitAngle) * r;
        this._hy = arena.cy + Math.sin(this._orbitAngle) * r;
    }

    update({ arena, flagManager }) {
        this._frame++;
        this._orbitAngle += this._orbitSpeed;
        this._jumpTimer++;

        // Drift hole position smoothly
        const targetX = arena.cx + Math.cos(this._orbitAngle) * arena.radius * 0.38;
        const targetY = arena.cy + Math.sin(this._orbitAngle) * arena.radius * 0.38;
        this._hx += (targetX - this._hx) * 0.015;
        this._hy += (targetY - this._hy) * 0.015;

        // Teleport to new orbit position every JUMP_EVERY frames
        if (this._jumpTimer >= this._JUMP_EVERY) {
            this._jumpTimer  = 0;
            this._orbitAngle = Math.random() * Math.PI * 2;
            this._updatePos(arena);
        }

        const flags = flagManager.flags;
        const len   = flags.length;
        // Process every flag every frame — force is distance-dependent
        for (let i = 0; i < len; i++) {
            const body = flags[i].body;
            Matter.Sleeping.set(body, false);

            const dx   = this._hx - body.position.x;
            const dy   = this._hy - body.position.y;
            const dist = Math.hypot(dx, dy) || 1;

            // Inverse-square attraction up to radius*0.55
            if (dist < arena.radius * 0.55) {
                const strength = Math.min(0.0018, 0.0024 / (dist * 0.04 + 1));
                Matter.Body.applyForce(body, body.position, {
                    x: (dx / dist) * strength,
                    y: (dy / dist) * strength,
                });
            }

            // Slingshot: flags within 18 px get flung outward
            if (dist < 18) {
                const nx = -dx / dist;
                const ny = -dy / dist;
                Matter.Body.applyForce(body, body.position, {
                    x: nx * 0.018,
                    y: ny * 0.018,
                });
            }
        }
    }

    end() {}
}
