const colorMap = {
    terracotta: 'bg-terracotta-100 text-terracotta-700 dark:bg-terracotta-700 dark:text-white',
    amber: 'bg-amber-100 text-amber-700',
    coral: 'bg-coral-100 text-coral-600',
    sand: 'bg-sand-200 text-charcoal-700 dark:bg-sand-300 dark:text-charcoal-800',
    green: 'bg-emerald-100 text-emerald-700',
};

export default function Badge({ children, color = 'terracotta', className = '' }) {
    return (
        <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium 
        transition-transform duration-150 hover:scale-105
        ${colorMap[color] || colorMap.terracotta} ${className}`}
        >
            {children}
        </span>
    );
}
