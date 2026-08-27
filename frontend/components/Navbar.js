'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, ready, logout } = useAuth();

  const links = [
    { href: '/', label: 'Home', key: 'home' },
    { href: '/destinations', label: 'Destinations', key: 'destinations' },
    { href: '/map', label: 'Map', key: 'map' },
  ];
  if (user) links.push({ href: '/profile', label: 'Profile', key: 'profile' });

  const activeKey = pathname === '/' ? 'home'
    : pathname.startsWith('/destinations') ? 'destinations'
    : pathname.startsWith('/map') ? 'map'
    : pathname.startsWith('/profile') ? 'profile' : '';

  function doLogout() { logout(); router.push('/'); }

  return (
    <nav className="nav">
      <div className="container nav-inner">
        <Link href="/" className="brand"><span className="logo">🌊</span> Pokhara <span style={{ color: 'var(--teal-500)' }}>Tú</span></Link>
        <button className="hamburger" onClick={() => document.querySelector('.nav-links')?.classList.toggle('open')}>☰</button>
        <div className="nav-links">
          {links.map((l) => <Link key={l.href} href={l.href} className={activeKey === l.key ? 'active' : ''}>{l.label}</Link>)}
        </div>
        <div className="nav-right">
          {!ready ? null : user ? (
            <>
              <Link href="/profile" className="avatar-sm" title={user.username} style={{ textAlign: 'center' }}>{user.username?.[0]?.toUpperCase()}</Link>
              <button className="btn btn-ghost" style={{ color: 'var(--ink)', background: 'var(--surface)', border: '1px solid var(--line)' }} onClick={doLogout}>Log out</button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-outline">Log in</Link>
              <Link href="/register" className="btn btn-primary">Sign up</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
