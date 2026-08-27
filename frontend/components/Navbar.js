'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { motion, AnimatePresence } from 'framer-motion';
import Logo from '@/components/decor/Logo';

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

  const activeKey = pathname === '/' ? 'home'
    : pathname.startsWith('/destinations') ? 'destinations'
    : pathname.startsWith('/map') ? 'map'
    : pathname.startsWith('/profile') ? 'profile' : '';

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open]);

  function go(href) { setOpen(false); router.push(href); }
  function doLogout() { setOpen(false); logout(); router.push('/'); }

  return (
    <nav className="nav">
      <div className="container nav-inner">
        <Link href="/" className="brand" onClick={() => setOpen(false)}>
          <Logo /> Hamro <span className="accent">Pokhara</span>
        </Link>

        <div className="nav-links">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={activeKey === l.key ? 'active' : ''}>{l.label}</Link>
          ))}
        </div>
        <div className="nav-right">
          {!ready ? null : user ? (
            <>
              <Link href="/profile" className="avatar-sm" title={user.username} style={{ textAlign: 'center' }}>{user.username?.[0]?.toUpperCase()}</Link>
              <button className="btn btn-outline" onClick={doLogout}>Log out</button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-outline">Log in</Link>
              <Link href="/register" className="btn btn-primary">Sign up</Link>
            </>
          )}
        </div>

        <div className="nav-mobile-actions">
          {ready && user && (
            <button className="avatar-sm nav-avatar-btn" title={user.username} aria-label="Open account menu" onClick={() => setOpen(true)}>
              {user.username?.[0]?.toUpperCase()}
            </button>
          )}
          <button className="hamburger" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? '✕' : '☰'}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div key="bd" className="nav-drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
        )}
        {open && (
          <motion.aside key="dr" className="nav-drawer" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}>
            <div className="drawer-head">
              <span className="brand"><Logo size={28} /> Hamro <span className="accent">Pokhara</span></span>
              <button className="drawer-close" aria-label="Close menu" onClick={() => setOpen(false)}>✕</button>
            </div>
            <nav className="nav-drawer-links">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className={activeKey === l.key ? 'active' : ''} onClick={() => setOpen(false)}>{l.label}</Link>
              ))}
            </nav>
            <div className="nav-drawer-account">
              {!ready ? null : user ? (
                <>
                  <div className="drawer-user">
                    <span className="avatar-lg" style={{ width: 52, height: 52, fontSize: '1.3rem' }}>{user.username?.[0]?.toUpperCase()}</span>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--lake-800)' }}>{user.username}</div>
                      <div className="muted" style={{ fontSize: '.82rem' }}>{user.email}</div>
                    </div>
                  </div>
                  <button className="btn btn-outline btn-block" onClick={() => go('/profile')}>My profile</button>
                  <button className="btn btn-primary btn-block" onClick={doLogout}>Log out</button>
                </>
              ) : (
                <>
                  <button className="btn btn-outline btn-block" onClick={() => go('/login')}>Log in</button>
                  <button className="btn btn-primary btn-block" onClick={() => go('/register')}>Sign up</button>
                </>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </nav>
  );
}
