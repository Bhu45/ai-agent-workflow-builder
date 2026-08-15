'use client';

import { useState } from 'react';
import { useSignUpEmailPassword } from '@nhost/nextjs';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signUpEmailPassword, isLoading, isError, error } = useSignUpEmailPassword();
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await signUpEmailPassword(email, password, {
      redirectTo: `${window.location.origin}/verify`
    });
    if (result.isSuccess) {
      router.push('/dashboard');
    }
  };

  return (
    <div className="page" style={{ display: 'flex', justifyContent: 'center', paddingTop: '10vh' }}>
      <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
        <h1 style={{ marginTop: 0, marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: 600 }}>Sign Up</h1>
        <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
            {isLoading ? 'Loading...' : 'Sign Up'}
          </button>
        </form>
        {isError && <div className="alert-error" style={{ marginTop: '1rem' }}>{error?.message}</div>}
        <p className="muted" style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          Already have an account? <Link href="/login" style={{ color: 'var(--primary)', fontWeight: 500 }}>Login</Link>
        </p>
      </div>
    </div>
  );
}
