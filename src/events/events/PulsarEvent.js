import Matter from "matter-js";

/**
 * PULSAR
 * A neutron-star pulsar: twin jets fire from a spinning core in opposite
 * directions along a rotating axis. Flags near either jet beam get blasted
 * outward; flags NOT in the beam are left alone (no global push/pull).
 * The axis rotates slowly, so every flag eventually gets hit.
 *
 * Visual:  bright core + two elongated beam cones extending to the ring wall.
 * Physics: only flags within ±beamHalfAngle of either jet direction get force.
 */
export default class PulsarEvent {
    name  = "PULSAR";
    color = "#FF3399";
    icon  = "💫";

    _frame    = 0;
    _axisAngle = 0;               // current beam axis angle (rotates each frame)
    _AXIS_SPEED = 0.018;          // rad/frame — one full rotation ≈ 5.8 s at 60fps
    _BEAM_HALF  = Math.PI / 9;   // ±20° cone each side
    _FORCE      = 0.0022;         // outward blast strength (physics-only, no velocity set)

    // Visual pulse rhythm (purely cosmetic)
    _pulsePhase = 0;
    _PULSE_SPEED = 0.10;

    start({ flagManager }) {
        this._frame     = 0;
        this._axisAngle = Math.random() * Math.PI * 2;
        this._pulsePhase = 0;
        for (const flag of flagManager.flags) {
            Matter.Sleeping.set(flag.body, false);
        }
    }

    update({ arena, flagManager }) {
        this._frame++;
        this._axisAngle  += this._AXIS_SPEED;
        this._pulsePhase += this._PULSE_SPEED;

        const cx    = arena.cx;
        const cy    = arena.cy;
        const flags = flagManager.flags;
        const len   = flags.length;
        const axis  = this._axisAngle;

        // Alternate frames for performance
        const offset = this._frame & 1;

        for (let i = offset; i < len; i += 2) {
            const body = flags[i].body;
            if (body.isSleeping) Matter.Sleeping.set(body, false);

            const dx   = body.position.x - cx;
            const dy   = body.position.y - cy;
            const dist = Math.hypot(dx, dy) || 1;

            // Angle from centre to this flag
            const flagAngle = Math.atan2(dy, dx);

            // Check if flag is inside either jet cone:
            //   jet A points along  axis,
            //   jet B points along  axis + π (opposite)
            const dA = this._angleDiff(flagAngle, axis);
            const dB = this._angleDiff(flagAngle, axis + Math.PI);

            const inA = Math.abs(dA) < this._BEAM_HALF;
            const inB = Math.abs(dB) < this._BEAM_HALF;

            if (!inA && !inB) continue;   // not in either beam — skip

            // Falloff: full force at beam centre, zero at edge
            const angleErr   = inA ? dA : dB;
            const falloff    = 1 - Math.abs(angleErr) / this._BEAM_HALF;
            // Intensity pulse so the beam "fires" rhythmically
            const pulse      = 0.55 + 0.45 * Math.abs(Math.sin(this._pulsePhase));
            const strength   = this._FORCE * falloff * pulse;

            // Always push outward from core
            Matter.Body.applyForce(body, body.position, {
                x: (dx / dist) * strength,
                y: (dy / dist) * strength,
            });
        }
    }

    /** Signed smallest difference between two angles, result in [-π, π]. */
    _angleDiff(a, b) {
        let d = ((a - b) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
        return d;
    }

    end() {}
}
