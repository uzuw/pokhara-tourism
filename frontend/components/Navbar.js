'use client';
import Link from 'next/link';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, ready, logout } = useAuth();
  const [open, setOpen] = useState(false);

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

  function go(href) { setOpen(false); router.push(href); }
  function doLogout() { setOpen(false); logout(); router.push('/'); }

  return (
    <nav className="nav">
      <div className="container nav-inner">
        <Link href="/" className="brand" onClick={() => setOpen(false)}>
          <span className="logo">🌊</span> Pokhara <span className="accent">Tú</span>
        </Link>

        <button className="hamburger" aria-label="Toggle menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>☰</button>

        <div className={`nav-links ${open ? 'open' : ''}`}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={activeKey === l.key ? 'active' : ''} onClick={() => setOpen(false)}>{l.label}</Link>
          ))}
        </div>

        <div className={`nav-right ${open ? 'open' : ''}`}>
          {!ready ? null : user ? (
            <>
              <Link href="/profile" className="avatar-sm" title={user.username} style={{ textAlign: 'center' }} onClick={() => setOpen(false)}>{user.username?.[0]?.toUpperCase()}</Link>
              <button className="btn btn-outline" onClick={doLogout}>Log out</button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-outline" onClick={() => setOpen(false)}>Log in</Link>
              <Link href="/register" className="btn btn-primary" onClick={() => setOpen(false)}>Sign up</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
