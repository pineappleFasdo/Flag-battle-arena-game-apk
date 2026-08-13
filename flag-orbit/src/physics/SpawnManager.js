export default class SpawnManager {

    /**
     * Hex-grid spawn with edge margin + micro-jitter so flags don't start
     * perfectly aligned (reduces early jamming).
     *
     * @returns {{ positions: {x,y}[], spacing: number }}
     */
    static generate(cx, cy, spawnRadius, count) {

        // Leave a clearer margin from the wall so flags don't spawn already
        // touching it (common cause of early stuck/wedging).
        const usableRadius = Math.max(20, spawnRadius * 0.92);

        let chosenSpacing = 8;

        for (let s = 120; s >= 8; s -= 0.5) {
            const slots = SpawnManager._countSlots(usableRadius, s);
            if (slots >= count) {
                chosenSpacing = s;
                break;
            }
        }

        const positions = SpawnManager._buildPositions(
            cx, cy, usableRadius, chosenSpacing
        );

        // Shuffle so country order isn't fixed to the grid
        for (let i = positions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [positions[i], positions[j]] = [positions[j], positions[i]];
        }

        // Micro-jitter (±12% of spacing) — breaks perfect lattice contact
        const jitter = chosenSpacing * 0.12;
        for (const p of positions) {
            p.x += (Math.random() - 0.5) * 2 * jitter;
            p.y += (Math.random() - 0.5) * 2 * jitter;
            // Keep inside usable circle after jitter
            const dx = p.x - cx;
            const dy = p.y - cy;
            const d  = Math.hypot(dx, dy);
            if (d > usableRadius - 2) {
                const s = (usableRadius - 2) / d;
                p.x = cx + dx * s;
                p.y = cy + dy * s;
            }
        }

        return {
            positions : positions.slice(0, count),
            spacing   : chosenSpacing
        };
    }


    static _countSlots(spawnRadius, spacing) {

        const vSpacing = spacing * 0.866;
        let count = 0;

        for (
            let y = -spawnRadius + spacing;
            y <= spawnRadius - spacing;
            y += vSpacing
        ) {
            const row = Math.round(y / vSpacing);
            const rowOffset = row % 2 === 0 ? 0 : spacing / 2;

            for (
                let x = -spawnRadius + spacing;
                x <= spawnRadius - spacing;
                x += spacing
            ) {
                const px = x + rowOffset;
                if (Math.hypot(px, y) <= spawnRadius - spacing) {
                    count++;
                }
            }
        }

        return count;
    }


    static _buildPositions(cx, cy, spawnRadius, spacing) {

        const vSpacing = spacing * 0.866;
        const positions = [];

        for (
            let y = -spawnRadius + spacing;
            y <= spawnRadius - spacing;
            y += vSpacing
        ) {
            const row = Math.round(y / vSpacing);
            const rowOffset = row % 2 === 0 ? 0 : spacing / 2;

            for (
                let x = -spawnRadius + spacing;
                x <= spawnRadius - spacing;
                x += spacing
            ) {
                const px = x + rowOffset;
                if (Math.hypot(px, y) <= spawnRadius - spacing) {
                    positions.push({ x: cx + px, y: cy + y });
                }
            }
        }

        return positions;
    }

}