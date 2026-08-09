import Matter from "matter-js";

export default class DrainSystem {

    constructor(engine, world, arena) {

        this.engine = engine;
        this.world  = world;
        this.arena  = arena;
        this.sensor = null;

        // Set true by ShrinkingArenaEvent
        this.shrinkMode = false;
    }


    createSensor() {
        this.sensor = Matter.Bodies.circle(
            0, 0,
            this.arena.radius * 0.1,
            { isStatic: true, isSensor: true, label: "drain" }
        );
        Matter.World.add(this.world, this.sensor);
    }


    getGapWindow() {
        const gapStart     = this.arena.gapStart || 0;
        const segmentCount = this.arena.segmentCount;
        const gapSize      = this.arena.gapSize;

        const gapCenterIndex = gapStart + gapSize / 2;
        const gapCenterAngle = (gapCenterIndex / segmentCount) * Math.PI * 2;
        const gapHalfAngle   = (gapSize / segmentCount) * Math.PI;

        return { gapCenterAngle, gapHalfAngle };
    }


    update() {
        if (!this.sensor) return;

        const { gapCenterAngle } = this.getGapWindow();

        Matter.Body.setPosition(this.sensor, {
            x: this.arena.cx + Math.cos(gapCenterAngle) * this.arena.radius,
            y: this.arena.cy + Math.sin(gapCenterAngle) * this.arena.radius,
        });
    }


    applyDrainForce(flags) {

        const { gapCenterAngle, gapHalfAngle } = this.getGapWindow();
        const cx = this.arena.cx;
        const cy = this.arena.cy;

        // Wider funnel early → more exits; shrink mode pulls almost everything
        const funnelHalfAngle = this.shrinkMode
            ? Math.PI
            : Math.max(gapHalfAngle * 4.2, 0.35);

        const tangentialMult = this.shrinkMode ? 12 : 1.35;
        const ejectMult      = this.shrinkMode ? 9  : 1.4;

        for (const flag of flags) {

            const body = flag.body;
            const dx   = body.position.x - cx;
            const dy   = body.position.y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;

            // Shrink-only air bleed so boosted forces stick
            if (this.shrinkMode) {
                Matter.Body.setVelocity(body, {
                    x: body.velocity.x * 0.985,
                    y: body.velocity.y * 0.985,
                });
            }

            const flagAngle = Math.atan2(dy, dx);

            let diff = flagAngle - gapCenterAngle;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));

            // PERFORMANCE: Only apply force when flag is near the rim
            const nearWall = dist > this.arena.radius * (this.shrinkMode ? 0.40 : 0.55);
            if (!nearWall) continue;
            if (Math.abs(diff) > funnelHalfAngle) continue;

            const closeness = this.shrinkMode
                ? (1 - Math.abs(diff) / Math.PI)
                : (1 - Math.abs(diff) / funnelHalfAngle);

            // Stronger tangential pull → flags line up with gap faster
            const tangentialStrength = 0.00085 * closeness * tangentialMult;

            const tx  = -Math.sin(flagAngle);
            const ty  =  Math.cos(flagAngle);
            const dir = diff > 0 ? -1 : 1;

            Matter.Body.applyForce(body, body.position, {
                x: tx * tangentialStrength * dir,
                y: ty * tangentialStrength * dir,
            });

            // Radial eject once aligned
            const inGapWindow = Math.abs(diff) < gapHalfAngle * (this.shrinkMode ? 1.6 : 1.15);
            const atBoundary  = dist > this.arena.radius * 0.70;

            if (inGapWindow && atBoundary) {
                const ejectStrength = 0.0038 * ejectMult;

                Matter.Body.applyForce(body, body.position, {
                    x: (dx / dist) * ejectStrength,
                    y: (dy / dist) * ejectStrength,
                });

                Matter.Body.setAngularVelocity(
                    body,
                    body.angularVelocity + (Math.random() - 0.5) * 0.18
                );
            }
        }
    }


    draw(ctx) {
        if (!this.sensor) return;

        ctx.beginPath();
        ctx.arc(
            this.sensor.position.x,
            this.sensor.position.y,
            this.sensor.circleRadius,
            0, Math.PI * 2
        );
        ctx.strokeStyle = "rgba(255,60,60,0.5)";
        ctx.stroke();
    }

}