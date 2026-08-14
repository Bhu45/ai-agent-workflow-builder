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
    <div style={{ maxWidth: '400px', margin: '100px auto', fontFamily: 'sans-serif' }}>
      <h1>Login</h1>
      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
          />
        </div>
        <div>
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
          />
        </div>
        <button type="submit" disabled={isLoading} style={{ padding: '0.75rem', cursor: 'pointer' }}>
          {isLoading ? 'Loading...' : 'Login'}
        </button>
      </form>
      {isError && <p style={{ color: 'red' }}>{error?.message}</p>}
      <p style={{ marginTop: '1rem' }}>
        Don&apos;t have an account? <Link href="/signup">Sign up</Link>
      </p>
    </div>
  );
}
