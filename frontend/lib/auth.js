'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getToken, setToken, clearAuth, getStoredUser, setStoredUser, api } from '@/lib/api';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const u = getStoredUser();
    setUser(u);
    setReady(true);
  }, []);

  const login = useCallback(async (identifier, password) => {
    const r = await api('/api/auth/login', { method: 'POST', body: { identifier, password } });
    setToken(r.token); setStoredUser(r.user); setUser(r.user);
    return r;
  }, []);

  const register = useCallback(async (username, email, password) => {
    const r = await api('/api/auth/register', { method: 'POST', body: { username, email, password } });
    setToken(r.token); setStoredUser(r.user); setUser(r.user);
    return r;
  }, []);

  const logout = useCallback(() => {
    clearAuth(); setUser(null);
  }, []);

  return <AuthCtx.Provider value={{ user, ready, login, register, logout, setUser }}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('useAuth must be used within AuthProvider');
  return c;
}

export function toast(msg) {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 2600);
}
