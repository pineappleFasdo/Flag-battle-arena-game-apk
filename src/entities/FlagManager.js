import Matter from "matter-js";
import Flag   from "./Flag";

export default class FlagManager {

    // Soft speed cap (px/frame equivalent) — stops turbo explosions
    static MAX_SPEED = 12;

    // Below this speed for STILL_FRAMES → considered stuck
    static STILL_SPEED   = 0.35;
    static STILL_FRAMES  = 50;   // ~0.83 s — slightly less aggressive

    constructor(world) {
        this.world = world;
        this.flags = [];
    }


    addFlag(country, x, y, width, height) {
        const flag = new Flag(this.world, country, x, y, width, height);
        this.flags.push(flag);
        return flag;
    }


    /**
     * Optional arena ref for anti-stuck nudges toward the gap / away from wall.
     */
    update(arena = null) {

        const maxSpd = FlagManager.MAX_SPEED;

        for (let i = this.flags.length - 1; i >= 0; i--) {
            const flag = this.flags[i];
            const body = flag.body;

            if (body.toRemove) {
                Matter.World.remove(this.world, body);
                this.flags.splice(i, 1);
                continue;
            }

            // ── Speed clamp ────────────────────────────────────────────────
            const vx = body.velocity.x;
            const vy = body.velocity.y;
            const spd = Math.hypot(vx, vy);
            if (spd > maxSpd) {
                const s = maxSpd / spd;
                Matter.Body.setVelocity(body, { x: vx * s, y: vy * s });
            }

            // ── Anti-stuck (only when near wall — early-game center flags ignored) ──
            if (spd < FlagManager.STILL_SPEED) {
                flag._stillFrames = (flag._stillFrames || 0) + 1;
            } else {
                flag._stillFrames = 0;
            }

            if (flag._stillFrames >= FlagManager.STILL_FRAMES) {
                flag._stillFrames = 0;

                // PERFORMANCE: Skip expensive gap-angle math unless flag is near the rim
                if (arena) {
                    const dx = body.position.x - arena.cx;
                    const dy = body.position.y - arena.cy;
                    const dist = Math.hypot(dx, dy) || 1;

                    if (dist < arena.radius * 0.50) {
                        // Deep in the center — just a tiny random kick, no gap bias
                        const kick = 1.8 + Math.random() * 2.2;
                        const angle = Math.random() * Math.PI * 2;
                        Matter.Body.setVelocity(body, {
                            x: Math.cos(angle) * kick,
                            y: Math.sin(angle) * kick,
                        });
                        continue;
                    }

                    // Near wall → bias toward gap
                    const kick = 2.5 + Math.random() * 3.5;
                    const gapAngle = ((arena.gapStart || 0) + (arena.gapSize || 0) / 2)
                        / arena.segmentCount * Math.PI * 2;
                    const angle = gapAngle + (Math.random() - 0.5) * 0.8;

                    Matter.Body.setVelocity(body, {
                        x: Math.cos(angle) * kick,
                        y: Math.sin(angle) * kick,
                    });
                } else {
                    const kick = 2.5 + Math.random() * 3.5;
                    const angle = Math.random() * Math.PI * 2;
                    Matter.Body.setVelocity(body, {
                        x: Math.cos(angle) * kick,
                        y: Math.sin(angle) * kick,
                    });
                }

                Matter.Body.setAngularVelocity(
                    body,
                    (Math.random() - 0.5) * 0.2
                );
            }
        }
    }


    draw(ctx) {
        for (const flag of this.flags) {
            flag.draw(ctx);
        }
    }

}