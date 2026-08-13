/**
 * GameFont.js
 * Single source of truth for the canvas gaming font stack.
 * Orbitron is loaded via <link> in index.html; the fallback chain
 * keeps text readable even before the web-font arrives.
 */

export const GAME_FONT = `'Orbitron', 'Courier New', monospace`;

/**
 * Returns a CSS font string ready for ctx.font.
 * @param {number} weight  – 400 | 500 | 600 | 700 | 800 | 900
 * @param {number} size    – px size (number)
 */
export function gf(weight, size) {
    return `${weight} ${size}px ${GAME_FONT}`;
}
