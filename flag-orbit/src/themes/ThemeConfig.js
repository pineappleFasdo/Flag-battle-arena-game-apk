// Theme pack — visuals only. Modes (Highest Wins / Qualifier) stay separate.
export const THEMES = {
    classic: {
        id: 'classic',
        name: 'Classic',
        icon: '🏁',
        bg: '#050816',
        ring: 'rgba(61, 124, 255, 0.95)',
        ringGlow: 'rgba(56, 213, 255, 0.35)',
        ringOuter: 'rgba(61, 124, 255, 0.22)',
        accent: '#3D7CFF',
    },
    space: {
        id: 'space',
        name: 'Space',
        icon: '🚀',
        bg: '#02010a',
        ring: 'rgba(160, 120, 255, 0.95)',
        ringGlow: 'rgba(120, 200, 255, 0.40)',
        ringOuter: 'rgba(100, 80, 200, 0.30)',
        accent: '#A078FF',
        stars: true,
    },
    lava: {
        id: 'lava',
        name: 'Lava Deep',
        icon: '🌋',
        bg: '#120404',
        ring: 'rgba(255, 90, 30, 0.95)',
        ringGlow: 'rgba(255, 140, 40, 0.45)',
        ringOuter: 'rgba(200, 50, 20, 0.30)',
        accent: '#FF5A1E',
    },
    deepsea: {
        id: 'deepsea',
        name: 'Deep Sea',
        icon: '🌊',
        bg: '#021018',
        ring: 'rgba(30, 200, 180, 0.95)',
        ringGlow: 'rgba(40, 220, 200, 0.40)',
        ringOuter: 'rgba(20, 120, 140, 0.30)',
        accent: '#1EC8B4',
    },
};

export const THEME_LIST = Object.values(THEMES);
export const DEFAULT_THEME = 'classic';
