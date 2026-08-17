// Theme pack — visuals only. Modes (Highest Wins / Qualifier) stay separate.
// ui* fields drive NEXT BATTLE / ROUND WINNER / panels so other themes
// only need to swap these values.

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
        ui: {
            panel: '#101D38',
            panelDeep: '#080F1E',
            border: '#2E62E8',
            title: '#38D5FF',
            text: '#F4F7FF',
            muted: '#91A7C9',
            glow: '61, 124, 255',
            overlay: 'rgba(5, 8, 22, 0.55)',
            ray1: 'rgba(61, 124, 255, 1)',
            ray2: 'rgba(16, 29, 56, 1)',
        },
    },
    space: {
        id: 'space',
        name: 'Space',
        icon: '🚀',
        bg: '#010008',
        ring: 'rgba(160, 120, 255, 0.95)',
        ringGlow: 'rgba(120, 200, 255, 0.40)',
        ringOuter: 'rgba(100, 80, 200, 0.30)',
        accent: '#A078FF',
        stars: true,
        ui: {
            panel: '#120A28',
            panelDeep: '#060312',
            border: '#A078FF',
            title: '#B8A0FF',
            text: '#F0E8FF',
            muted: '#9B8AD8',
            glow: '160, 120, 255',
            overlay: 'rgba(4, 2, 12, 0.60)',
            ray1: 'rgba(160, 120, 255, 1)',
            ray2: 'rgba(40, 20, 80, 1)',
        },
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
        ui: {
            panel: '#2A1008',
            panelDeep: '#120404',
            border: '#FF5A1E',
            title: '#FFB070',
            text: '#FFF0E8',
            muted: '#C89880',
            glow: '255, 90, 30',
            overlay: 'rgba(18, 4, 4, 0.60)',
            ray1: 'rgba(255, 90, 30, 1)',
            ray2: 'rgba(80, 20, 10, 1)',
        },
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
        ui: {
            panel: '#0A2430',
            panelDeep: '#021018',
            border: '#1EC8B4',
            title: '#5EE8D4',
            text: '#E8FFFC',
            muted: '#7AB0A8',
            glow: '30, 200, 180',
            overlay: 'rgba(2, 16, 24, 0.60)',
            ray1: 'rgba(30, 200, 180, 1)',
            ray2: 'rgba(10, 40, 50, 1)',
        },
    },
};

export const THEME_LIST = Object.values(THEMES);
export const DEFAULT_THEME = 'classic';

/** Safe UI palette from current theme (falls back to classic). */
export function themeUI(theme) {
    return theme?.ui || THEMES.classic.ui;
}
