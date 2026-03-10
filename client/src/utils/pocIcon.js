const ICON_VARIANTS = [
    [
        'M11 3a1 1 0 012 0v1.07a6 6 0 012.85 10.9A4 4 0 0112 19a4 4 0 01-3.85-4.03A6 6 0 0111 4.07V3z',
        'M10 22h4',
    ],
    [
        'M4 7h16v10H4z',
        'M9 7V5h6v2',
        'M9 17v2h6v-2',
        'M2 10h2m16 0h2M2 14h2m16 0h2',
    ],
    [
        'M7 18a4 4 0 110-8 5 5 0 019.8 1A3.5 3.5 0 1117.5 18H7z',
        'M8 14h8',
    ],
    [
        'M12 3l7 3v6c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6l7-3z',
        'M9.5 12.5l1.8 1.8 3.2-3.2',
    ],
    [
        'M5 14l3 5h8l3-5-7-9-7 9z',
        'M12 10v4',
        'M10.5 12.5h3',
    ],
];

export function getPocIconPaths(seed) {
    const value = String(seed || 'poc');
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash << 5) - hash + value.charCodeAt(i);
        hash |= 0;
    }
    return ICON_VARIANTS[Math.abs(hash) % ICON_VARIANTS.length];
}
