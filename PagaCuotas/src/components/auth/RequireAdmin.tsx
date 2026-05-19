import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { getAdminToken, verifyAdminSession } from '../../lib/adminApi';

type AuthState = 'checking' | 'authorized' | 'unauthorized';

export default function RequireAdmin({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [state, setState] = useState<AuthState>(() => (getAdminToken() ? 'checking' : 'unauthorized'));

  useEffect(() => {
    let cancelled = false;
    if (!getAdminToken()) {
      setState('unauthorized');
      return;
    }
    setState('checking');
    verifyAdminSession().then((ok) => {
      if (cancelled) return;
      setState(ok ? 'authorized' : 'unauthorized');
    });
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (state === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-main">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (state === 'unauthorized') {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
