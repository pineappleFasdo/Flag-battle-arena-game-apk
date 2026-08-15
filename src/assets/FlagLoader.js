// FlagLoader — loads flag images from flagcdn.com and caches them.
// w160 = crisp on 2× DPR screens, small download (~3-8 KB each).

export default class FlagLoader {

    constructor() {
        this.cache    = {};
        this._loaded  = 0;
        this._total   = 0;
    }

    load(code) {
        if (this.cache[code]) return this.cache[code];
        const img  = new Image();
        img.src    = `https://flagcdn.com/w160/${code}.png`;
        this.cache[code] = img;
        return img;
    }

    /**
     * Kick off parallel loading of every country code.
     * @param {string[]}  codes       - array of ISO codes
     * @param {function}  onProgress  - called with (loaded, total) each time an image settles
     * @param {function}  onComplete  - called once when all images have settled (load or error)
     */
    preloadAll(codes, onProgress, onComplete) {
        const unique = [...new Set(codes)];
        this._total  = unique.length;
        this._loaded = 0;

        if (this._total === 0) { onComplete?.(); return; }

        const settle = () => {
            this._loaded++;
            onProgress?.(this._loaded, this._total);
            if (this._loaded >= this._total) onComplete?.();
        };

        for (const code of unique) {
            if (this.cache[code]?.complete && this.cache[code].naturalWidth > 0) {
                // Already fully loaded from a prior call
                settle();
                continue;
            }
            const img = this.load(code);
            if (img.complete && img.naturalWidth > 0) {
                settle();
            } else {
                img.onload  = settle;
                img.onerror = settle;  // count errors too so we don't hang
            }
        }
    }
}
