import Matter from "matter-js";

export default class Flag {

    constructor(world, country, x, y, width, height) {

        this.country = country;
        this.width   = width;
        this.height  = height;

        this.body = Matter.Bodies.rectangle(
            x, y,
            this.width, this.height,
            {
                label       : "flag",
                restitution : 0.6,
                friction    : 0.005,
                frictionAir : 0.020,
                density     : 0.0012,
                chamfer     : { radius: Math.max(1, width * 0.06) },
                sleepThreshold: 80,
            }
        );

        Matter.World.add(world, this.body);

        const speed = Math.max(1.2, this.width * 0.12);
        const angle = Math.random() * Math.PI * 2;

        Matter.Body.setVelocity(this.body, {
            x: Math.cos(angle) * speed,
            y: Math.sin(angle) * speed
        });

        Matter.Body.setAngularVelocity(
            this.body,
            (Math.random() - 0.5) * 0.12
        );

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
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

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