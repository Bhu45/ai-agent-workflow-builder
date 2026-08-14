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
    const result = await signUpEmailPassword(email, password);
    if (result.isSuccess) {
      router.push('/dashboard');
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '100px auto', fontFamily: 'sans-serif' }}>
      <h1>Sign Up</h1>
      <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
          {isLoading ? 'Loading...' : 'Sign Up'}
        </button>
      </form>
      {isError && <p style={{ color: 'red' }}>{error?.message}</p>}
      <p style={{ marginTop: '1rem' }}>
        Already have an account? <Link href="/login">Login</Link>
      </p>
    </div>
  );
}
