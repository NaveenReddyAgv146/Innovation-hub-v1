import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { authService } from '../services/endpoints';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import { COMPANY_LOGO_URL, COMPANY_NAME } from '../config/branding';

export default function Login() {
    const [form, setForm] = useState({ email: '', password: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const setAuth = useAuthStore((s) => s.setAuth);
    const navigate = useNavigate();
    const location = useLocation();

    const from = location.state?.from?.pathname || '/dashboard';

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const { data } = await authService.login(form);
            setAuth(data.user, data.accessToken, data.refreshToken);
            navigate(from, { replace: true });
        } catch (err) {
            setError(err.response?.data?.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-warm-white flex items-center justify-center px-4">
            <div className="w-full max-w-md">
                {/* Brand */}
                <div className="text-center mb-8">
                    <img src={COMPANY_LOGO_URL} alt={`${COMPANY_NAME} logo`} className="mx-auto w-14 h-14 rounded-2xl object-cover shadow-lg mb-4 bg-white" />
                    <h1 className="text-2xl font-bold text-charcoal-800">Welcome back</h1>
                    <p className="text-charcoal-500 mt-1">Sign in to {COMPANY_NAME}</p>
                </div>

                {/* Card */}
                <div className="bg-white rounded-2xl border border-sand-200 shadow-sm p-6 sm:p-8">
                    {error && (
                        <div className="mb-4 p-3 rounded-xl bg-coral-50 border border-coral-200 text-sm text-coral-600">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <Input
                            label="Email"
                            type="email"
                            placeholder="you@company.com"
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                            required
                        />
                        <Input
                            label="Password"
                            type="password"
                            placeholder="••••••••"
                            value={form.password}
                            onChange={(e) => setForm({ ...form, password: e.target.value })}
                            required
                        />
                        <Button type="submit" loading={loading} className="w-full mt-2">
                            Sign In
                        </Button>
                    </form>

                    <p className="text-center text-sm text-charcoal-500 mt-6">
                        Don't have an account?{' '}
                        <Link to="/register" className="text-terracotta-500 font-medium hover:text-terracotta-600">
                            Create one
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
