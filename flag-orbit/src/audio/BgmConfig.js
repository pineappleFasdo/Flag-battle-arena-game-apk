// BGM config — put mp3 files in public/audio/
// Change only the file names (and volume) here. No other code needed.
// Missing files are silently skipped.

export const BGM = {
    // Qualification / battle rounds
    qualify: {
        file:   'hot-heat.mp3',
        volume: 0.18,
    },
    // Last Flag Standing / elimination (final mode)
    elimination: {
        file:   'killing-time.mp3',
        volume: 0.18,
    },
    // Champion / winner screen
    champion: {
        file:   'there-it-is.mp3',
        volume: 0.22,
    },
};

export const BGM_BASE = '/audio/';
