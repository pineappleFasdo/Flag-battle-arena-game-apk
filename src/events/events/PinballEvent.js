import Matter from "matter-js";

/**
 * PINBALL
 * Three bumper points are placed at fixed positions inside the arena
 * (forming a triangle). Any flag that comes within bumper range gets a
 * sharp radial push away — like hitting a pinball bumper. Bumpers are
 * visible as pulsing circles in the draw hook (drawn by Game._drawCentralOverlay
 * is not available, so bumper positions are stored on arena for ArenaRenderer
 * to optionally use — game still works without visual).
 */
export default class PinballEvent {
    name  = "PINBALL";
    color = "#FF44BB";
    icon  = "🎯";

    _frame       = 0;
    _bumpers     = []; // { x, y, r } — set in start()
    _BUMPER_R    = 0;  // bumper trigger radius (px)
    _KICK_FORCE  = 0.055;

    start({ arena }) {
        this._frame = 0;

        // Place 3 bumpers in a triangle, at ~45% of arena radius
        const R   = arena.radius * 0.44;
        const cx  = arena.cx;
        const cy  = arena.cy;
        this._BUMPER_R = arena.radius * 0.085; // ~8.5% of arena radius

        this._bumpers = [0, 1, 2].map(i => {
            const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
            return {
                x: cx + Math.cos(angle) * R,
                y: cy + Math.sin(angle) * R,
            };
        });

        // Expose to arena so optional rendering can pick it up
        arena._pinballBumpers = this._bumpers;
        arena._pinballBumperR = this._BUMPER_R;
    }

    update({ flagManager }) {
        this._frame++;
        const offset = this._frame & 1;
        const flags  = flagManager.flags;
        const bumpers = this._bumpers;
        const r2arr  = bumpers.map(() => this._BUMPER_R * this._BUMPER_R);

        for (let i = offset; i < flags.length; i += 2) {
            const body = flags[i].body;
            if (body.isSleeping) Matter.Sleeping.set(body, false);

            for (let b = 0; b < bumpers.length; b++) {
                const bump = bumpers[b];
                const dx   = body.position.x - bump.x;
                const dy   = body.position.y - bump.y;
                const dist2 = dx * dx + dy * dy;

                if (dist2 > r2arr[b]) continue;

                const dist = Math.sqrt(dist2) || 1;
                // Kick strength inversely proportional to distance (closer = harder)
                const falloff  = 1 - dist / this._BUMPER_R;
                const strength = this._KICK_FORCE * (0.5 + falloff * 0.5);

                Matter.Body.applyForce(body, body.position, {
                    x: (dx / dist) * strength,
                    y: (dy / dist) * strength,
                });
                // Small angular kick for spin
                Matter.Body.setAngularVelocity(body,
                    body.angularVelocity + (Math.random() - 0.5) * 0.4
                );
                Matter.Sleeping.set(body, false);
            }
        }
    }

    end({ arena }) {
        arena._pinballBumpers = null;
        arena._pinballBumperR = 0;
    }
}
