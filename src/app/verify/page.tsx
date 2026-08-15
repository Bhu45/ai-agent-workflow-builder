'use client';

import { useEffect, useState } from 'react';
import { useAuthenticationStatus } from '@nhost/nextjs';
import Link from 'next/link';

export default function VerifyPage() {
  const { isAuthenticated, isLoading } = useAuthenticationStatus();
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      // Nhost returns tokens or errors in the URL hash (e.g., #error=...&errorDescription=...)
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      
      const errDesc = params.get('errorDescription');
      const err = params.get('error');
      
      if (errDesc) {
        setErrorMsg(decodeURIComponent(errDesc.replace(/\+/g, '%20')));
      } else if (err) {
        setErrorMsg(decodeURIComponent(err.replace(/\+/g, '%20')));
      }
    }
  }, []);

  if (isLoading) {
    return (
      <div className="page" style={{ display: 'flex', justifyContent: 'center', paddingTop: '10vh' }}>
        <div className="card" style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
          <h2 style={{ marginTop: 0 }}>Verifying...</h2>
          <p className="muted">Please wait while we verify your email address.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ display: 'flex', justifyContent: 'center', paddingTop: '10vh' }}>
      <div className="card" style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
        {errorMsg ? (
          <>
            <h2 style={{ marginTop: 0, color: 'var(--danger)' }}>Verification Failed</h2>
            <p className="alert-error" style={{ margin: '1rem 0' }}>{errorMsg}</p>
            <Link href="/login" className="button-secondary">Return to Login</Link>
          </>
        ) : isAuthenticated ? (
          <>
            <h2 style={{ marginTop: 0, color: 'var(--success)' }}>Email verified successfully</h2>
            <p className="muted" style={{ margin: '1rem 0' }}>Your email has been verified. You can now log in to your account.</p>
            <Link href="/login" className="button-primary">Go to Login</Link>
          </>
        ) : (
          <>
            <h2 style={{ marginTop: 0 }}>Verification Status</h2>
            <p className="muted" style={{ margin: '1rem 0' }}>
              We could not confirm your verification from the URL, or it may have already been verified.
            </p>
            <Link href="/login" className="button-primary">Continue to Login</Link>
          </>
        )}
      </div>
    </div>
  );
}
