import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthShell } from '../../components/layout/AuthShell';
import { Button, Icon } from '../../components/ui';
import { supabase } from '../../lib/supabase';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Enter your email and password.');
      return;
    }
    setLoading(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    navigate('/');
  };

  return (
    <AuthShell>
      <div className="bg-surface border border-border rounded-lg shadow-sm p-8">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-text-primary">Sign in</h2>
          <p className="text-sm text-text-secondary mt-1">Enter your credentials to access your organization dashboard.</p>
        </div>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide" htmlFor="email">
              Email Address
            </label>
            <div className="relative">
              <Icon name="mail" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[20px]" />
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-10 pl-10 pr-4 bg-white border border-border rounded-md text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide" htmlFor="password">
                Password
              </label>
              <Link to="/forgot-password" className="text-xs font-semibold text-primary hover:underline">
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Icon name="lock" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[20px]" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 pl-10 pr-10 bg-white border border-border rounded-md text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
              >
                <Icon name={showPassword ? 'visibility_off' : 'visibility'} className="text-[20px]" />
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberDevice}
              onChange={(e) => setRememberDevice(e.target.checked)}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20"
            />
            Remember this device for 30 days
          </label>

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button type="submit" variant="primary" className="w-full h-11" disabled={loading}>
            <span>{loading ? 'Signing in…' : 'Sign In to Platform'}</span>
            {!loading && <Icon name="arrow_forward" className="text-[18px]" />}
          </Button>
        </form>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">Or continue with</span>
          <div className="flex-1 h-px bg-border" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled
            title="Coming soon"
            className="h-10 flex items-center justify-center gap-2 border border-border rounded-md text-sm font-medium text-text-secondary cursor-not-allowed opacity-70"
          >
            <Icon name="vpn_key" className="text-[18px]" />
            SSO
          </button>
          <button
            type="button"
            disabled
            title="Coming soon"
            className="h-10 flex items-center justify-center gap-2 border border-border rounded-md text-sm font-medium text-text-secondary cursor-not-allowed opacity-70"
          >
            <Icon name="hub" className="text-[18px]" />
            GitHub
          </button>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-text-secondary">
            Don&apos;t have an account?{' '}
            <Link to="/signup" className="font-semibold text-primary hover:underline">
              Request Access / Signup
            </Link>
          </p>
        </div>
      </div>
      <div className="mt-6 flex items-center justify-center gap-2 text-xs text-text-muted">
        <span>Privacy Policy</span>
        <span>·</span>
        <span>Service Status</span>
        <span>·</span>
        <span>Support</span>
      </div>
    </AuthShell>
  );
}
