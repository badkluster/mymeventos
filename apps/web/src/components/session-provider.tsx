'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { getCurrentUser, logout as logoutRequest, type SessionUser } from '@/lib/auth';
import { SESSION_EXPIRED_EVENT } from '@/lib/api';

type Session = {
  user: SessionUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  sessionExpired: boolean;
  establishSession: (user: SessionUser) => void;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children, checkSession = true }: { children: ReactNode; checkSession?: boolean }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(checkSession);
  const [sessionChecked, setSessionChecked] = useState(!checkSession);
  const [sessionExpired, setSessionExpired] = useState(false);
  const hadAuthenticatedSession = useRef(false);

  const establishSession = (nextUser: SessionUser) => {
    hadAuthenticatedSession.current = true;
    setUser(nextUser);
    setSessionChecked(true);
    setLoading(false);
    setSessionExpired(false);
  };

  const refreshSession = async () => {
    setLoading(true);
    try {
      const nextUser = await getCurrentUser();
      hadAuthenticatedSession.current = true;
      setUser(nextUser);
      setSessionExpired(false);
    } catch {
      setUser(null);
    } finally {
      setSessionChecked(true);
      setLoading(false);
    }
  };

  useEffect(() => {
    const endExpiredSession = () => {
      const wasAuthenticated = hadAuthenticatedSession.current;
      hadAuthenticatedSession.current = false;
      setUser(null);
      setSessionChecked(true);
      setLoading(false);
      if (wasAuthenticated) setSessionExpired(true);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, endExpiredSession);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, endExpiredSession);
  }, []);

  useEffect(() => {
    if (!checkSession || sessionChecked) return;
    let mounted = true;
    void getCurrentUser()
      .then((nextUser) => {
        if (!mounted) return;
        hadAuthenticatedSession.current = true;
        setUser(nextUser);
        setSessionExpired(false);
      })
      .catch(() => { if (mounted) setUser(null); })
      .finally(() => {
        if (!mounted) return;
        setSessionChecked(true);
        setLoading(false);
      });
    return () => { mounted = false; };
  }, [checkSession, sessionChecked]);

  // Permissions and salon scope live in the database and may be changed by another
  // administrator while this session remains open. Re-sync silently when the user
  // returns to the tab/app so the menu and route guards do not keep stale access data.
  useEffect(() => {
    if (!checkSession || !sessionChecked) return;
    let mounted = true;
    const syncSession = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void getCurrentUser()
        .then((nextUser) => {
          if (!mounted) return;
          hadAuthenticatedSession.current = true;
          setUser(nextUser);
          setSessionExpired(false);
        })
        .catch(() => { if (mounted) setUser(null); });
    };
    window.addEventListener('focus', syncSession);
    document.addEventListener('visibilitychange', syncSession);
    return () => {
      mounted = false;
      window.removeEventListener('focus', syncSession);
      document.removeEventListener('visibilitychange', syncSession);
    };
  }, [checkSession, sessionChecked]);

  const logout = async () => {
    await logoutRequest();
    hadAuthenticatedSession.current = false;
    setUser(null);
    setSessionChecked(true);
    setLoading(false);
    setSessionExpired(false);
  };

  return <SessionContext.Provider value={{ user, loading, isAuthenticated: Boolean(user), sessionExpired, establishSession, refreshSession, logout }}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within SessionProvider');
  return context;
}
