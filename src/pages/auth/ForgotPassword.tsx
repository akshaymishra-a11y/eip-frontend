import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthShell } from '../../components/layout/AuthShell';
import { Button, Icon } from '../../components/ui';
import { supabase } from '../../lib/supabase';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Enter your email address.');
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
    } else {
      setMessage('If an account exists for that email, a reset link is on its way.');
    }
  };

  return (
    <AuthShell>
      <div className="bg-surface border border-border rounded-lg shadow-sm p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto w-12 h-12 bg-primary text-white rounded-xl flex items-center justify-center shadow-sm mb-3">
            <Icon name="lock_reset" className="text-[24px]" />
          </div>
          <h2 className="text-xl font-semibold text-text-primary">Forgot Password</h2>
          <p className="text-sm text-text-secondary mt-1">
            Enter the email address associated with your account, and we&apos;ll send you a link to reset your
            password.
          </p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
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
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-10 pl-10 pr-4 bg-white border border-border rounded-md text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
          {message && <p className="text-sm text-success">{message}</p>}

          <Button type="submit" variant="primary" className="w-full h-11" disabled={loading}>
            {loading ? 'Sending…' : 'Reset Password'}
          </Button>
        </form>
        <div className="mt-6 text-center">
          <Link to="/login" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary">
            <Icon name="arrow_back" className="text-[16px]" />
            Back to Login
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
