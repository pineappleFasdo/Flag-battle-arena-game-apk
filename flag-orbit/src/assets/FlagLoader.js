// FIX CRISP: Use w160 images (2× the previous w80) from flagcdn.com.
// On high-DPI screens (devicePixelRatio ≥ 2) the flags were being upscaled
// from 80px-wide images, making them look blurry. w160 images are still small
// (~3–8 KB each) but render crisply at any DPR up to 2.
// flagcdn.com supports: w20, w40, w80, w160, w320, w640, w1280, w2560
// w160 is the sweet spot: crisp on phones, small download, no bandwidth waste.

export default class FlagLoader {

    constructor() {
        this.cache = {};
    }

    load(code) {
        if (this.cache[code]) {
            return this.cache[code];
        }

        const img = new Image();

        // w160 = 160 px wide — crisp at 2× DPR without being heavy
        img.src = `https://flagcdn.com/w160/${code}.png`;

        this.cache[code] = img;

        return img;
    }

}
