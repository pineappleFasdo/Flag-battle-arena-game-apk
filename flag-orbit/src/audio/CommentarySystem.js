// CommentarySystem.js
// Wraps AudioManager to provide optional commentary lines during gameplay.
// All speech goes through AudioManager.speakCommentary() so the same
// guards and Android fixes apply automatically.

export default class CommentarySystem {

    constructor(audioManager) {
        this._audio = audioManager;
        this._lines = [
            "Incredible battle!",
            "Who will survive?",
            "The tension is rising!",
            "Only the strong remain!",
            "What a clash!",
            "The arena is heating up!",
            "Flags flying everywhere!",
            "Chaos in the arena!",
        ];
        this._lastCommentaryTime = 0;
        this._commentaryCooldown = 12000; // ms between commentary lines
    }

    update() {
        const now = Date.now();
        if (now - this._lastCommentaryTime < this._commentaryCooldown) return;
        this._lastCommentaryTime = now;
        const line = this._lines[Math.floor(Math.random() * this._lines.length)];
        this._audio.speakCommentary(line);
    }

    start() {
        this._lastCommentaryTime = Date.now();
    }

    stop() {
        this._lastCommentaryTime = Infinity;
    }
}
