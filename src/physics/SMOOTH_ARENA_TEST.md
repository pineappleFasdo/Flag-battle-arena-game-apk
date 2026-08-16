# SmoothArenaPhysics — test notes (5H Grand Final only)

## What this is
Standalone arena physics (does **not** inherit ArenaPhysics). Applied **only** when
Long Battle Mode enters Grand Final elimination.

## How to test without waiting 5 hours
1. In browser console / localStorage:
   `localStorage.setItem("flag_battle_lb_fast", "1")`
2. Start **5 Hour Championship** from home.
3. Fast mode: ~30s segments, short winner display → reach Grand Final quickly.
4. Optional shortcuts (if present in your build): Shift+M style skips remain as before.

## Expected in Grand Final
- One cyan/white ring, **no orange rim**
- Flags do not spin (orientation locked)
- Soft bounce, flags drift more in the center
- Cleaner exits through the single gap
- Event forced to **CLASSIC** (no earthquake forces)

## Scope guard
- Highest Winner Wins: untouched
- 40-min qualifier: untouched  
- Long Battle 40-min segments: still use default ArenaPhysics
- Only Grand Final uses SmoothArenaPhysics; restored on champion screen

## Files
- `src/physics/SmoothArenaPhysics.js` — new
- `src/core/Game.js` — activate/restore + Classic event + flag tune (GF only)
