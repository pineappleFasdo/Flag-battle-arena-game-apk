import Matter from "matter-js";

export default class Sweeper {

    constructor(world, cx, cy, radius) {

        this.cx = cx;
        this.cy = cy;
        this.radius = radius;

        this.angle = 0;
        this.rotationSpeed = 0.01;

        this.body = Matter.Bodies.rectangle(
            cx,
            cy - radius + 30,
            180,
            12,
            {
                isStatic: true,
                restitution: 1,
                friction: 0,
                render: {
                    visible: false
                }
            }
        );

        Matter.World.add(world, this.body);

    }

    update(arenaAngle) {

        this.angle = arenaAngle;

        const x =
            this.cx +
            Math.cos(this.angle) *
            (this.radius - 30);

        const y =
            this.cy +
            Math.sin(this.angle) *
            (this.radius - 30);

        Matter.Body.setPosition(
            this.body,
            { x, y }
        );

        Matter.Body.setAngle(
            this.body,
            this.angle + Math.PI / 2
        );

    }

}