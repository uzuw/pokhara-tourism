'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { getToken } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (getToken()) router.replace('/profile'); }, [router]);

  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const next = new URLSearchParams(location.search).get('next') || '/profile';
      await login(identifier, password);
      router.push(next);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand" style={{ marginBottom: 18 }}><span className="logo">🌊</span> Pokhara <span style={{ color: 'var(--teal-500)' }}>Tú</span></div>
        <h1>Welcome back</h1>
        <p className="sub">Log in to rate spots and keep your travel log.</p>
        {err && <div className="form-error" style={{ display: 'block' }}>{err}</div>}
        <form onSubmit={submit}>
          <div className="field"><label>Email or username</label><input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required placeholder="you@email.com" /></div>
          <div className="field"><label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" /></div>
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? <span className="spinner" /> : 'Log in'}</button>
        </form>
        <div className="auth-switch">New here? <Link href="/register">Create an account</Link></div>
      </div>
    </div>
  );
}
