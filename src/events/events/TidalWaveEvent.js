import Matter from "matter-js";

/**
 * TIDAL WAVE
 * A wave front sweeps left→right across the arena, pushing flags in its
 * path like a flood. Flags on the leading edge get hit hardest; flags
 * behind the wave are left to settle. After crossing, the wave resets
 * from the other side and sweeps back. Creates a clear sloshing crowd
 * motion that looks like a real wave washing through.
 */
export default class TidalWaveEvent {
    name  = "TIDAL WAVE";
    color = "#0099FF";
    icon  = "🌊";

    _frame      = 0;
    _waveFront  = 0;   // X position of wave front (arena-relative)
    _direction  = 1;   // +1 = sweeping right, -1 = sweeping left
    _WAVE_SPEED = 3.2; // px/frame — readable sweep pace
    _WAVE_WIDTH = 55;  // px — how wide the "crest" zone is
    _STRENGTH   = 0.0028;
    _resetPause = 0;   // brief pause between sweeps

    start({ arena }) {
        this._frame     = 0;
        this._direction = 1;
        // Start from the left edge of the arena
        this._waveFront = arena.cx - arena.radius - 20;
        this._resetPause = 0;
    }

    update({ arena, flagManager }) {
        this._frame++;

        if (this._resetPause > 0) {
            this._resetPause--;
            return;
        }

        // Advance wave front
        this._waveFront += this._WAVE_SPEED * this._direction;

        const cx    = arena.cx;
        const limit = arena.radius + 20;

        // Reset and reverse when wave exits the arena
        if (this._direction === 1 && this._waveFront > cx + limit) {
            this._direction  = -1;
            this._waveFront  = cx + limit;
            this._resetPause = 40; // brief calm before reversal
        } else if (this._direction === -1 && this._waveFront < cx - limit) {
            this._direction  = 1;
            this._waveFront  = cx - limit;
            this._resetPause = 40;
        }

        const wf     = this._waveFront;
        const half   = this._WAVE_WIDTH / 2;
        const flags  = flagManager.flags;
        const offset = this._frame & 1;

        for (let i = offset; i < flags.length; i += 2) {
            const body = flags[i].body;
            if (body.isSleeping) Matter.Sleeping.set(body, false);

            // Distance from flag to wave front (signed, in wave direction)
            const relX = (body.position.x - wf) * this._direction;

            // Only flags within the wave crest zone feel the push
            if (relX < -half || relX > half * 0.4) continue;

            // Falloff: strongest at crest, zero at edges
            const t        = 1 - Math.abs(relX) / half;
            const strength = this._STRENGTH * t * t;

            Matter.Body.applyForce(body, body.position, {
                x: this._direction * strength,
                y: 0,
            });
        }
    }

    end() {}
}
