/**
 * SmoothArenaPhysics — standalone competitor-style arena (pass 2).
 *
 * NOT based on ArenaPhysics. Used only for Long Battle (5H) Grand Final.
 *
 * Pass-2 goals vs World Flags-style footage:
 *  - Straight-line motion only (NO circular / orbital / swirl forces)
 *  - Sustained linear speed, strong wall bounce, no spin
 *  - Mild radial center push only when packed
 *  - Near gap: pure outward (radial) push — clean straight exits
 *  - One ring only — no secondary rim
 */
import Matter from "matter-js";

const STATE_INTRO   = "INTRO";
const STATE_OPENING = "OPENING";
const STATE_PLAYING = "PLAYING";

export default class SmoothArenaPhysics {
    /**
     * @param {Matter.World} world
     * @param {number} cx
     * @param {number} cy
     * @param {number} radius
     */
    constructor(world, cx, cy, radius) {
        this.world  = world;
        this.cx     = cx;
        this.cy     = cy;
        this.radius = radius;

        this.angle            = 0;
        this.rotationSpeed    = 0.014;
        this.gapSize          = 0;
        this.initialGapSize   = 6;
        this.maxGapSize       = 12;
        this.gapStart         = 0;
        this.segmentCount     = 56;
        this.state             = STATE_INTRO;
        this.introTimer       = 0;
        this.introDuration    = 70;
        this.openingTimer     = 0;
        this.openingDuration  = 90;
        this.totalFlags       = 0;
        this.remainingFlags   = 0;
        this._flagsRef        = null;
        this._shakeX = 0;
        this._shakeY = 0;
        this._swayX  = 0;
        this._swayY  = 0;

        this.rimEnabled   = false;
        this.rimSegments  = [];
        this.rimAngle     = 0;
        this.rimGapSize   = 0;
        this.rimRadius    = radius;
        this.rimThickness = 0;

        this.segments = [];
        this._segCosines = new Float64Array(this.segmentCount);
        this._segSines   = new Float64Array(this.segmentCount);
        this._segAngles  = new Float64Array(this.segmentCount);
        this._tick = 0;

        // Motion constants (tuned for lively but readable play)
        this._minSpeed     = 2.2;
        this._maxSpeed     = 11;
        this._wallBounce   = 0.92;
        this._airDrag      = 0.012;

        this._buildSegments();
        this.syncWalls();
    }

    _buildSegments() {
        for (const w of this.segments) {
            try { Matter.World.remove(this.world, w); } catch (_) {}
        }
        this.segments = [];

        const n = this.segmentCount;
        const arc = (Math.PI * 2) / n;
        const wallLen = this.radius * arc * 1.12;
        const wallThick = 5;

        for (let i = 0; i < n; i++) {
            const a = i * arc;
            this._segCosines[i] = Math.cos(a);
            this._segSines[i]   = Math.sin(a);
            this._segAngles[i]  = a + Math.PI / 2;

            const wall = Matter.Bodies.rectangle(
                this.cx + this._segCosines[i] * this.radius,
                this.cy + this._segSines[i] * this.radius,
                wallLen,
                wallThick,
                {
                    isStatic: true,
                    label: "arenaWall",
                    restitution: this._wallBounce,
                    friction: 0.001,
                    frictionStatic: 0.001,
                    slop: 0.08,
                    collisionFilter: { category: 0x0001, mask: 0xFFFFFFFF },
                    render: { visible: false },
                }
            );
            Matter.Body.setAngle(wall, this._segAngles[i]);
            this.segments.push(wall);
            Matter.World.add(this.world, wall);
        }
    }

    syncWalls() {
        if (!this.segments.length) {
            this._buildSegments();
            return;
        }
        const n = this.segmentCount;
        const arc = (Math.PI * 2) / n;
        for (let i = 0; i < n; i++) {
            const a = i * arc;
            this._segCosines[i] = Math.cos(a);
            this._segSines[i]   = Math.sin(a);
            this._segAngles[i]  = a + Math.PI / 2;
            const wall = this.segments[i];
            if (!wall) continue;
            Matter.Body.setPosition(wall, {
                x: this.cx + this._segCosines[i] * this.radius,
                y: this.cy + this._segSines[i] * this.radius,
            });
            Matter.Body.setAngle(wall, this._segAngles[i]);
            wall.collisionFilter.mask = 0xFFFFFFFF;
            wall.restitution = this._wallBounce;
        }
        this.gapSize = 0;
        this.gapStart = 0;
    }

    setTotalFlags(count) {
        this.totalFlags = count;
        this.remainingFlags = count;
    }

    setRemainingFlags(count) {
        this.remainingFlags = count;
        if (this.state !== STATE_PLAYING) return;
        const total = Math.max(1, this.totalFlags);
        const ratio = Math.max(0, Math.min(1, count / total));
        const t = 1 - ratio;
        const eased = t * t * (3 - 2 * t); // smoothstep
        const g = Math.round(
            this.initialGapSize + (this.maxGapSize - this.initialGapSize) * eased
        );
        this.gapSize = Math.max(this.initialGapSize, Math.min(this.maxGapSize, g));
    }

    startOpening() {
        this.state = STATE_OPENING;
        this.openingTimer = 0;
        this.gapSize = 1;
    }

    update() {
        this._tick++;

        if (this.state === STATE_INTRO) {
            this.introTimer++;
            this.rotationSpeed = 0.012 + 0.005 * Math.sin(this.introTimer * 0.06);
            if (this.introTimer >= this.introDuration) this.startOpening();
        } else if (this.state === STATE_OPENING) {
            this.openingTimer++;
            const t = Math.min(1, this.openingTimer / this.openingDuration);
            const eased = 1 - Math.pow(1 - t, 2.0);
            this.gapSize = Math.max(1, Math.round(this.initialGapSize * eased));
            this.rotationSpeed = 0.013;
            if (this.openingTimer >= this.openingDuration) {
                this.state = STATE_PLAYING;
                this.gapSize = this.initialGapSize;
            }
        } else {
            const remainRatio = this.remainingFlags / Math.max(1, this.totalFlags);
            this.rotationSpeed = 0.014 + (1 - remainRatio) * 0.006;
        }

        this.angle += this.rotationSpeed;
        if (this.angle > Math.PI * 2) this.angle -= Math.PI * 2;

        const effectiveGap = this.state === STATE_PLAYING ? this.gapSize : 0;
        this.gapStart = Math.floor((this.angle / (Math.PI * 2)) * this.segmentCount);

        for (let i = 0; i < this.segmentCount; i++) {
            const wall = this.segments[i];
            if (!wall) continue;
            const inGap =
                ((i - this.gapStart + this.segmentCount) % this.segmentCount) < effectiveGap;
            wall.collisionFilter.mask = inGap ? 0 : 0xFFFFFFFF;
            Matter.Body.setPosition(wall, {
                x: this.cx + this._segCosines[i] * this.radius,
                y: this.cy + this._segSines[i] * this.radius,
            });
            Matter.Body.setAngle(wall, this._segAngles[i]);
        }

        // Competitor-style continuous motion (only while playing)
        if (this.state === STATE_PLAYING) {
            this._stirFlags();
        }
    }

    /**
     * Keep energy high, spread the pack, bias near-rim flags toward the gap.
     * Does not apply spin.
     */
    _stirFlags() {
        const flags = this._flagsRef;
        if (!flags || !flags.length) return;

        const cx = this.cx;
        const cy = this.cy;
        const R  = this.radius;
        const n  = flags.length;
        const gapCenter =
            ((this.gapStart + this.gapSize / 2) / this.segmentCount) * Math.PI * 2;
        const gapHalf =
            (this.gapSize / this.segmentCount) * Math.PI;

        const offset = this._tick & 1;

        for (let i = offset; i < n; i += 2) {
            const flag = flags[i];
            const body = flag?.body;
            if (!body || body.toRemove) continue;

            if (body.isSleeping) {
                try { Matter.Sleeping.set(body, false); } catch (_) {}
            }

            // Horizontal-straight: lock angle to 0 (no tilt / no rotation)
            Matter.Body.setAngularVelocity(body, 0);
            if (body.angle !== 0) {
                Matter.Body.setAngle(body, 0);
            }

            const px = body.position.x;
            const py = body.position.y;
            const dx = px - cx;
            const dy = py - cy;
            const dist = Math.hypot(dx, dy) || 0.001;
            const ang = Math.atan2(dy, dx);

            let vx = body.velocity.x;
            let vy = body.velocity.y;
            let spd = Math.hypot(vx, vy);

            // ── 1) Keep minimum linear speed (straight-line travel) ───────
            if (spd < this._minSpeed) {
                // Reuse current heading if any; otherwise pick a random straight direction
                const heading = spd > 0.12 ? Math.atan2(vy, vx) : Math.random() * Math.PI * 2;
                const boost = this._minSpeed + Math.random() * 1.2;
                vx = Math.cos(heading) * boost;
                vy = Math.sin(heading) * boost;
                Matter.Body.setVelocity(body, { x: vx, y: vy });
                spd = boost;
            }

            // ── 2) Mild center push only if deeply packed (radial, not orbital)
            if (dist < R * 0.38 && n > 3) {
                const push = 0.00007 * (R * 0.38 - dist);
                Matter.Body.applyForce(body, body.position, {
                    x: (dx / dist) * push,
                    y: (dy / dist) * push,
                });
            }

            // ── 3) Near gap sector on the rim: push STRAIGHT outward through gap
            //     (no tangential/swirl — pure radial exit)
            if (dist > R * 0.68) {
                let dAng = ang - gapCenter;
                while (dAng > Math.PI) dAng -= Math.PI * 2;
                while (dAng < -Math.PI) dAng += Math.PI * 2;
                if (Math.abs(dAng) < gapHalf * 1.2) {
                    const out = 0.00022;
                    Matter.Body.applyForce(body, body.position, {
                        x: (dx / dist) * out,
                        y: (dy / dist) * out,
                    });
                }
            }

            // ── 4) Cap max speed (keep velocity direction — straight paths)
            vx = body.velocity.x;
            vy = body.velocity.y;
            spd = Math.hypot(vx, vy);
            if (spd > this._maxSpeed) {
                const s = this._maxSpeed / spd;
                Matter.Body.setVelocity(body, { x: vx * s, y: vy * s });
            }

            // Occasional straight-line micro-kick (random direction, no curve)
            if ((this._tick + i) % 100 === 0) {
                const kick = 0.7 + Math.random() * 1.1;
                const a = Math.random() * Math.PI * 2;
                Matter.Body.setVelocity(body, {
                    x: body.velocity.x + Math.cos(a) * kick,
                    y: body.velocity.y + Math.sin(a) * kick,
                });
                Matter.Body.setAngularVelocity(body, 0);
            }
        }
    }

    destroy() {
        for (const w of this.segments) {
            try { Matter.World.remove(this.world, w); } catch (_) {}
        }
        this.segments = [];
        this._flagsRef = null;
    }

    /**
     * Apply competitor body props after spawn. No spin, lively bounce.
     */
    static tuneFlagBodies(flags) {
        if (!flags || !flags.length) return;
        for (const flag of flags) {
            const body = flag?.body;
            if (!body) continue;

            body.restitution    = 0.88;
            body.friction       = 0.004;
            body.frictionAir    = 0.012;
            body.frictionStatic = 0.004;
            body.slop           = 0.06;
            body.density        = 0.001;
            body.sleepThreshold = Infinity; // never sleep during GF

            try {
                Matter.Body.setInertia(body, Infinity);
                Matter.Body.setAngularVelocity(body, 0);
                Matter.Body.setAngle(body, 0);
            } catch (_) {}

            try { Matter.Sleeping.set(body, false); } catch (_) {}

            // Strong initial launch so the round starts energetic
            const a = Math.random() * Math.PI * 2;
            const s = 3.5 + Math.random() * 3.5;
            Matter.Body.setVelocity(body, {
                x: Math.cos(a) * s,
                y: Math.sin(a) * s,
            });
        }
    }
}
