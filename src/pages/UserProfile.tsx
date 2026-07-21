import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Icon, PageHeader } from '../components/ui';
import { changePassword, updateProfile } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { describeSupabaseError } from '../lib/errors';
import { useOrg } from '../lib/org-context';

function initialsFor(name: string | null, email: string | null) {
  const source = name?.trim() || email || '?';
  return source
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function UserProfile() {
  const { user, signOut } = useAuth();
  const { currentOrganization, organizations } = useOrg();
  const navigate = useNavigate();
  const currentFullName = (user?.user_metadata?.full_name as string | undefined) || '';
  const [fullName, setFullName] = useState(currentFullName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    setChangingPassword(true);
    setPasswordError(null);
    setPasswordSaved(false);
    try {
      await changePassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSaved(true);
      setTimeout(() => setPasswordSaved(false), 2500);
    } catch (err) {
      setPasswordError(describeSupabaseError(err, 'Could not change password.'));
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateProfile(fullName.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(describeSupabaseError(err, 'Could not update profile.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="User Settings" subtitle="Manage your technical profile and account settings." />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-4xl">
        <Card className="p-6 flex flex-col items-center text-center lg:col-span-1 h-fit">
          <div className="w-[72px] h-[72px] rounded-full bg-primary text-white flex items-center justify-center text-2xl font-bold mb-3">
            {initialsFor(currentFullName, user?.email ?? null)}
          </div>
          <p className="text-base font-semibold text-text-primary">{currentFullName || 'Engineering User'}</p>
          <p className="text-sm text-text-secondary">{user?.email}</p>

          <Button variant="secondary" className="w-full mt-6" onClick={() => signOut().then(() => navigate('/login'))} type="button">
            <Icon name="logout" className="text-[16px] text-danger" />
            <span className="text-danger">Sign Out</span>
          </Button>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          <Card className="p-5">
            <h2 className="text-base font-semibold text-text-primary mb-4">General Information</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-text-primary" htmlFor="fullName">
                  Full Name
                </label>
                <input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full h-10 px-3 bg-white border border-border rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
              <p className="text-xs text-text-secondary">Email address ({user?.email}) can&apos;t be changed from here.</p>
              {error && <p className="text-sm text-danger">{error}</p>}
              {saved && <p className="text-sm text-success">Profile updated.</p>}
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </Button>
            </form>
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-semibold text-text-primary mb-2">Account</h2>
            <dl className="divide-y divide-border text-sm">
              <div className="flex items-center justify-between py-2.5">
                <dt className="flex items-center gap-2 text-text-primary">
                  <Icon name="badge" className="text-text-secondary text-[18px]" />
                  User ID
                </dt>
                <dd className="text-text-secondary font-mono text-xs">{user?.id?.slice(0, 8)}…</dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="flex items-center gap-2 text-text-primary">
                  <Icon name="domain" className="text-text-secondary text-[18px]" />
                  Organization
                </dt>
                <dd className="text-text-secondary">{currentOrganization?.name ?? '—'}</dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="flex items-center gap-2 text-text-primary">
                  <Icon name="groups" className="text-text-secondary text-[18px]" />
                  Organizations
                </dt>
                <dd className="text-text-secondary">{organizations.length}</dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="flex items-center gap-2 text-text-primary">
                  <Icon name="event" className="text-text-secondary text-[18px]" />
                  Member Since
                </dt>
                <dd className="text-text-secondary">{user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-semibold text-text-primary mb-4">Security &amp; Access</h2>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-text-primary" htmlFor="newPassword">
                    New Password
                  </label>
                  <input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-10 px-3 bg-white border border-border rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-text-primary" htmlFor="confirmPassword">
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-10 px-3 bg-white border border-border rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>
              </div>
              {passwordError && <p className="text-sm text-danger">{passwordError}</p>}
              {passwordSaved && <p className="text-sm text-success">Password updated.</p>}
              <Button type="submit" variant="primary" disabled={changingPassword}>
                {changingPassword ? 'Updating…' : 'Update Password'}
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
