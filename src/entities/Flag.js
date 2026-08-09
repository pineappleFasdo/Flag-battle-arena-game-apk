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
                restitution : 0.88,
                friction    : 0.01,
                frictionAir : 0.006,
                density     : 0.0012,
                chamfer     : { radius: Math.max(1, width * 0.06) },
                sleepThreshold: 80,
            }
        );

        Matter.World.add(world, this.body);

        const speed = Math.max(1.8, this.width * 0.18);
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

        const img = this.country.image;

        // Always prefer the real flag image when it is loaded
        if (img && img.complete && img.naturalWidth > 0) {
            // Only clip rounded corners on larger flags (saves CPU on tiny ones)
            if (w >= 16) {
                const radius = Math.max(1.5, w * 0.08);
                ctx.beginPath();
                if (typeof ctx.roundRect === "function") {
                    ctx.roundRect(-w / 2, -h / 2, w, h, radius);
                } else {
                    ctx.rect(-w / 2, -h / 2, w, h);
                }
                ctx.clip();
            }
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
        } else {
            // Fallback only while image is still loading
            ctx.fillStyle = "#446688";
            ctx.fillRect(-w / 2, -h / 2, w, h);
        }

        ctx.restore();
    }

}