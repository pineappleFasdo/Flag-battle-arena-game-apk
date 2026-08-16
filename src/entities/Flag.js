import Matter from "matter-js";

export default class Flag {

    /** Set from Game when flag count is high — cheaper canvas draws */
    static crowdDraw = false;


    constructor(world, country, x, y, width, height) {

        this.country = country;
        this.width   = width;
        this.height  = height;

        this.body = Matter.Bodies.rectangle(
            x, y,
            this.width, this.height,
            {
                label       : "flag",
                restitution : 0.92,
                friction    : 0.002,
                frictionAir : 0.012,
                density     : 0.001,
                // No chamfer — keeps orientation stable
                sleepThreshold: Infinity, // never auto-sleep; must keep stirring
            }
        );

        Matter.World.add(world, this.body);

        // Straight horizontal orientation — no tilt / no spin
        Matter.Body.setAngle(this.body, 0);
        Matter.Body.setAngularVelocity(this.body, 0);

        // Immediate motion so flags collide as soon as they appear
        const speed = Math.max(3.5, this.width * 0.35);
        const heading = Math.random() * Math.PI * 2;
        Matter.Body.setVelocity(this.body, {
            x: Math.cos(heading) * speed,
            y: Math.sin(heading) * speed,
        });

        this._stillFrames = 0;
    }


    draw(ctx) {

        const p     = this.body.position;
        const angle = this.body.angle;
        const w     = this.width;
        const h     = this.height;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(angle);

        // No shadow / blur / rounded corners on arena flags
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
        // PERFORMANCE: high-quality smoothing only when field is thin
        if (Flag.crowdDraw) {
            ctx.imageSmoothingEnabled = false;
        } else {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
        }

        const img = this.country.image;

        if (img && img.complete && img.naturalWidth > 0) {
            // Sharp rectangle — no roundRect clip
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
        } else {
            ctx.fillStyle = "#446688";
            ctx.fillRect(-w / 2, -h / 2, w, h);
        }

        ctx.restore();
    }

}