import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Icon } from '../components/ui';
import { createOrganization } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { describeSupabaseError } from '../lib/errors';
import { useOrg } from '../lib/org-context';

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
  return slug || 'your-org';
}

export default function CreateOrganization() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signOut } = useAuth();
  const { refresh } = useOrg();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Organization name is required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await createOrganization({ name: name.trim(), description: description.trim() || undefined });
      await refresh();
      navigate('/');
    } catch (err) {
      setError(describeSupabaseError(err, 'Could not create organization.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-14 bg-surface border-b border-border flex items-center justify-between px-4 shrink-0">
        <button
          type="button"
          onClick={() => signOut()}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-background text-text-primary"
        >
          <Icon name="close" />
        </button>
        <div className="text-lg font-bold text-primary">Setup</div>
        <div className="w-10 h-10" />
      </header>

      <main className="flex-1 flex items-center justify-center p-gutter">
        <div className="w-full max-w-md space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Create Organization</h1>
            <p className="text-sm text-text-secondary mt-1">Set up your primary workspace to collaborate with your team.</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-lg shadow-sm p-5 space-y-5">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-text-primary" htmlFor="orgName">
                Organization Name <span className="text-danger">*</span>
              </label>
              <div className="relative">
                <Icon name="domain" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[20px]" />
                <input
                  id="orgName"
                  required
                  placeholder="e.g. Acme Corp"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-10 pl-10 pr-3 bg-white border border-border rounded-md text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-text-primary" htmlFor="orgDesc">
                Description (Optional)
              </label>
              <textarea
                id="orgDesc"
                rows={3}
                placeholder="What does your organization do?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-3 bg-white border border-border rounded-md text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
              />
            </div>

            <div className="bg-background rounded-md p-3 border border-border">
              <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mb-1">
                <Icon name="link" className="text-[16px]" />
                Workspace URL
              </div>
              <div className="text-sm text-text-primary truncate">
                app.engineeringintelligence.com/<span className={name ? 'text-primary' : 'text-text-secondary'}>{slugify(name)}</span>
              </div>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <Button type="submit" variant="primary" className="w-full h-11" disabled={loading}>
              <span>{loading ? 'Creating…' : 'Create Organization'}</span>
              {!loading && <Icon name="arrow_forward" className="text-[18px]" />}
            </Button>
            <p className="text-center text-xs text-text-secondary">
              By creating an organization, you agree to our Terms of Service.
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}
