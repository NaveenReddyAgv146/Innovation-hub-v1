const GRADIENTS = [
    'from-terracotta-500 to-coral-500',
    'from-terracotta-700 to-coral-400',
    'from-terracotta-400 to-amber-500',
    'from-coral-500 to-terracotta-800',
    'from-amber-400 to-coral-500',
    'from-terracotta-600 to-terracotta-300',
];

export function getThumbnailGradient(seed = '') {
    const raw = String(seed);
    let hash = 0;
    for (let i = 0; i < raw.length; i += 1) {
        hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
    }
    return GRADIENTS[hash % GRADIENTS.length];
}
