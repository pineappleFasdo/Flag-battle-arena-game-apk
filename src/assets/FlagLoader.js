export default class FlagLoader {

    constructor() {
        this.cache = {};
    }

    load(code) {

        if (this.cache[code]) {
            return this.cache[code];
        }

        const img = new Image();

        img.src = `https://flagcdn.com/w80/${code}.png`;

        this.cache[code] = img;

        return img;

    }

}