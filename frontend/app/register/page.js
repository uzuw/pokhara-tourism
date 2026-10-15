'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { getToken } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (getToken()) router.replace('/profile'); }, [router]);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const next = new URLSearchParams(location.search).get('next') || '/profile';
      await register(form.username, form.email, form.password);
      router.push(next);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand" style={{ marginBottom: 18 }}><span className="logo">🌊</span> Pokhara <span style={{ color: 'var(--teal-500)' }}>Tú</span></div>
        <h1>Create your account</h1>
        <p className="sub">Free forever. Rate spots, write reviews, build your log.</p>
        {err && <div className="form-error" style={{ display: 'block' }}>{err}</div>}
        <form onSubmit={submit}>
          <div className="field"><label>Username</label><input value={form.username} onChange={(e) => set('username', e.target.value)} required minLength={3} placeholder="traveler_01" /></div>
          <div className="field"><label>Email</label><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required placeholder="you@email.com" /></div>
          <div className="field"><label>Password</label><input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} required minLength={8} maxLength={72} autoComplete="new-password" placeholder="at least 8 characters" /><div className="hint">8+ characters, not all digits. We hash it with scrypt — we never see it.</div></div>
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? <span className="spinner" /> : 'Create account'}</button>
        </form>
        <div className="auth-switch">Already have an account? <Link href="/login">Log in</Link></div>
      </div>
    </div>
  );
}
