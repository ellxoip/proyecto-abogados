import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getClientSession, getClientToken } from '../../lib/clientPortal';

export default function RequireClientSession({ children }: { children: ReactNode }) {
  const location = useLocation();
  const session = getClientSession();
  const token = getClientToken();

  if (!session || !token) {
    return <Navigate to="/client/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
