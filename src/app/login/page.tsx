'use client';

import { useState } from 'react';
import { useSignInEmailPassword } from '@nhost/nextjs';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signInEmailPassword, isLoading, isError, error } = useSignInEmailPassword();
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await signInEmailPassword(email, password);
    if (result.isSuccess) {
      router.push('/dashboard');
    }
  };

  return (
    <div className="page" style={{ display: 'flex', justifyContent: 'center', paddingTop: '10vh' }}>
      <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
        <h1 style={{ marginTop: 0, marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: 600 }}>Login</h1>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: '100%' }}
            />
          </div>
          <button type="submit" disabled={isLoading} className="button-primary" style={{ marginTop: '0.5rem' }}>
            {isLoading ? 'Loading...' : 'Login'}
          </button>
        </form>
        {isError && <div className="alert-error" style={{ marginTop: '1rem' }}>{error?.message}</div>}
        <p className="muted" style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          Don&apos;t have an account? <Link href="/signup" style={{ color: 'var(--primary)', fontWeight: 500 }}>Sign up</Link>
        </p>
      </div>
    </div>
  );
}
