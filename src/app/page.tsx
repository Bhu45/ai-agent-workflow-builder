'use client';

import { useAuthenticationStatus } from '@nhost/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
  const { isAuthenticated, isLoading } = useAuthenticationStatus();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.push('/dashboard');
      } else {
        router.push('/login');
      }
    }
  }, [isLoading, isAuthenticated, router]);

  return (
    <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <p className="muted">Loading...</p>
    </div>
  );
}
