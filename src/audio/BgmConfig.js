// BGM config — put mp3 files in public/audio/
// Change only the file names (and volume) here. No other code needed.
// Missing files are silently skipped.

export const BGM = {
    // Qualification / battle rounds
    qualify: {
        file:   'Chariots-of-War.mp3',
        volume: 0.3,
    },
    // Last Flag Standing / elimination (final mode) — stops when champion crowns
    elimination: {
        file:   'Refresher-Dyalla.mp3',
        volume: 0.22,
    },
    // 5H championship page — low looping BGM
    champion: {
        file:   'Free-Beats.mp3',
        volume: 0.10,
    },
};

export const BGM_BASE = '/audio/';
