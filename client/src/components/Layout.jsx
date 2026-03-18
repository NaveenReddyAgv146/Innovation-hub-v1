import { useState, useCallback, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { authService } from '../services/endpoints';
import { COMPANY_LOGO_URL, COMPANY_NAME } from '../config/branding';
import { getAssignedAdminTrack, hasTrackDashboardAccess, isSuperAdmin } from '../utils/access';

const THEME_STORAGE_KEY = 'poc_theme';

export default function Layout({ children }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [theme, setTheme] = useState(() =>
        localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
    );
    const user = useAuthStore((s) => s.user);
    const adminTrack = getAssignedAdminTrack(user);
    const logoutStore = useAuthStore((s) => s.logout);
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogout = useCallback(async () => {
        try {
            await authService.logout();
        } catch {
            /* logout even if API fails */
        }
        logoutStore();
        navigate('/login');
    }, [logoutStore, navigate]);

    const navItems = [
        { path: '/dashboard', label: 'Dashboard', icon: HomeIcon },
        { path: '/pocs', label: 'Contributions', icon: BoltIcon },
    ];

    if (user?.role === 'viewer') {
        navItems.push({ path: '/pocs?interested=true', label: 'Interested', icon: StarIcon });
    }

    if (user?.role === 'admin' || user?.role === 'developer') {
        navItems.push({ path: '/pocs/new', label: 'New Contribution Brief', icon: PlusIcon });
    }

    if (user?.role === 'admin') {
        navItems.push({ path: '/admin/idea-reviews', label: 'Contribution Reviews', icon: ReviewIcon });
        navItems.push({ path: '/admin/user-interests', label: 'User Interests', icon: StarIcon });
    }

    if (isSuperAdmin(user)) {
        navItems.push({ path: '/users', label: 'Users', icon: UsersIcon });
    }

    if (hasTrackDashboardAccess(user)) {
        navItems.push({ path: '/dashboard/track', label: `My Track Dashboard`, icon: ScopeIcon });
    }

    const isInterestedRoute =
        location.pathname === '/pocs' &&
        new URLSearchParams(location.search).get('interested') === 'true';
    const isActive = (path) => {
        if (path === '/pocs?interested=true') return isInterestedRoute;
        if (path === '/pocs') return (location.pathname === '/pocs' || location.pathname.startsWith('/pocs/')) && !isInterestedRoute;
        return location.pathname === path || (path !== '/dashboard' && location.pathname.startsWith(path) && path !== '/pocs/new');
    };
    const isDark = theme === 'dark';

    useEffect(() => {
        const root = document.documentElement;
        root.classList.toggle('dark', isDark);
        localStorage.setItem(THEME_STORAGE_KEY, theme);
    }, [theme, isDark]);

    const toggleTheme = () => {
        setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
    };

    return (
        <div className="min-h-screen bg-warm-white">
            {/* Mobile top bar */}
            <header className="lg:hidden fixed top-0 inset-x-0 z-40 bg-white/80 backdrop-blur-md border-b border-sand-200">
                <div className="flex items-center justify-between px-4 h-14">
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="p-2 rounded-lg text-charcoal-600 hover:bg-sand-100"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                    <span className="font-bold text-terracotta-600 text-lg">{COMPANY_NAME}</span>
                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-lg text-charcoal-600 hover:bg-sand-100"
                        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                    >
                        {isDark ? <SunIcon /> : <MoonIcon />}
                    </button>
                </div>
            </header>

            {/* Sidebar overlay for mobile */}
            {sidebarOpen && (
                <div
                    className="lg:hidden fixed inset-0 z-40 bg-charcoal-800/30 backdrop-blur-sm"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-sand-200 
          flex flex-col transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
            >
                {/* Brand */}
                <div className="px-6 py-5 border-b border-sand-100">
                    <Link to="/dashboard" className="flex items-center gap-2.5" onClick={() => setSidebarOpen(false)}>
                        <img src={COMPANY_LOGO_URL} alt={`${COMPANY_NAME} logo`} className="w-9 h-9 rounded-xl object-cover shadow-sm bg-white" />
                        <span className="font-bold text-charcoal-800 text-lg">{COMPANY_NAME}</span>
                    </Link>
                </div>

                {/* Nav links */}
                <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                    {navItems.map(({ path, label, icon: Icon }) => (
                        <Link
                            key={path}
                            to={path}
                            onClick={() => setSidebarOpen(false)}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                ${isActive(path)
                                    ? 'bg-terracotta-50 text-terracotta-600 shadow-sm'
                                    : 'text-charcoal-600 hover:bg-sand-50 hover:text-charcoal-800'
                                }`}
                        >
                            <Icon active={isActive(path)} />
                            {label}
                        </Link>
                    ))}
                </nav>

                {/* User info + logout */}
                <div className="px-4 py-4 border-t border-sand-100">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-300 to-terracotta-400 flex items-center justify-center text-white font-semibold text-sm shadow-sm">
                            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-charcoal-800 truncate">{user?.name}</p>
                            <p className="text-xs text-charcoal-500 capitalize">
                                {user?.role}{adminTrack ? ` · ${adminTrack}` : ''}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={toggleTheme}
                        className="w-full mb-2 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-charcoal-600 hover:bg-sand-100 hover:text-charcoal-800 transition-colors"
                    >
                        {isDark ? <SunIcon /> : <MoonIcon />}
                        {isDark ? 'Light Mode' : 'Dark Mode'}
                    </button>
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-charcoal-600 hover:bg-coral-50 hover:text-coral-600 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <main className="lg:ml-64 min-h-screen pt-14 lg:pt-0">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
                    {children}
                </div>
            </main>
        </div>
    );
}

/* ---- Inline SVG Nav Icons ---- */

function HomeIcon({ active }) {
    return (
        <svg className={`w-5 h-5 ${active ? 'text-terracotta-500' : 'text-charcoal-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
        </svg>
    );
}

function BoltIcon({ active }) {
    return (
        <svg className={`w-5 h-5 ${active ? 'text-terracotta-500' : 'text-charcoal-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
    );
}

function PlusIcon({ active }) {
    return (
        <svg className={`w-5 h-5 ${active ? 'text-terracotta-500' : 'text-charcoal-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
    );
}

function UsersIcon({ active }) {
    return (
        <svg className={`w-5 h-5 ${active ? 'text-terracotta-500' : 'text-charcoal-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m0 0V21" />
        </svg>
    );
}

function ReviewIcon({ active }) {
    return (
        <svg className={`w-5 h-5 ${active ? 'text-terracotta-500' : 'text-charcoal-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
    );
}

function StarIcon({ active }) {
    return (
        <svg className={`w-5 h-5 ${active ? 'text-terracotta-500' : 'text-charcoal-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.965a1 1 0 00.95.69h4.17c.969 0 1.372 1.24.588 1.81l-3.373 2.45a1 1 0 00-.364 1.118l1.289 3.965c.3.922-.755 1.688-1.54 1.118l-3.373-2.45a1 1 0 00-1.176 0l-3.373 2.45c-.784.57-1.838-.196-1.539-1.118l1.288-3.965a1 1 0 00-.363-1.118l-3.374-2.45c-.784-.57-.38-1.81.588-1.81h4.17a1 1 0 00.951-.69l1.285-3.965z" />
        </svg>
    );
}

function ScopeIcon({ active }) {
    return (
        <svg className={`w-5 h-5 ${active ? 'text-terracotta-500' : 'text-charcoal-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 1016 0 8 8 0 10-16 0m8-6v2m0 8v2m6-6h-2M8 12H6m6 0h.01" />
        </svg>
    );
}

function MoonIcon() {
    return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z" />
        </svg>
    );
}

function SunIcon() {
    return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364 6.364l-1.414-1.414M7.05 7.05 5.636 5.636m12.728 0-1.414 1.414M7.05 16.95l-1.414 1.414M12 8a4 4 0 100 8 4 4 0 000-8z" />
        </svg>
    );
}
