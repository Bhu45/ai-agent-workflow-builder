'use client';

import { useAuthenticationStatus, useNhostClient } from '@nhost/nextjs';
import { useEffect, useState } from 'react';

export default function DiagnosticSchema() {
  const { isAuthenticated, isLoading } = useAuthenticationStatus();
  const nhost = useNhostClient();
  const [result, setResult] = useState<any>(null);
  const [directResult, setDirectResult] = useState<any>(null);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      runDiagnostics();
    }
  }, [isLoading, isAuthenticated]);

  const runDiagnostics = async () => {
    try {
      const token = await nhost.auth.getAccessToken();
      
      // 1. Call API Endpoint
      const res = await fetch('/api/diagnostics/schema', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      setResult(data);

      // 2. Call GraphQL Directly
      const query = `
        query IntrospectionQuery {
          __type(name: "mutation_root") {
            fields {
              name
            }
          }
        }
      `;
      const directData = await nhost.graphql.request(query);
      const fields = directData.data?.__type?.fields || [];
      const hasMutation = fields.some((f: any) => f.name === 'create_organization_atomic');
      
      setDirectResult({
        success: !directData.error,
        has_create_organization_atomic: hasMutation,
        error: directData.error
      });

    } catch (err: any) {
      setResult({ success: false, error: err.message });
      setDirectResult({ success: false, error: err.message });
    }
  };

  if (isLoading) return <p style={{ padding: '2rem' }}>Loading auth state...</p>;
  if (!isAuthenticated) return <p style={{ padding: '2rem' }}>Please log in first.</p>;

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: '800px' }}>
        <h2 style={{ marginBottom: '2rem', fontSize: '1.75rem', fontWeight: 'bold' }}>Authenticated Schema Diagnostic</h2>
        
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.25rem' }}>1. /api/diagnostics/schema Response</h3>
          <p className="muted" style={{ marginBottom: '1rem', fontSize: '0.95rem' }}>Server-side proxy result:</p>
          <pre style={{ background: '#0f172a', color: '#f8fafc', padding: '18px', borderRadius: '10px', overflowX: 'auto', fontSize: '14px', lineHeight: 1.6, margin: 0, fontFamily: 'monospace' }}>
            {result ? JSON.stringify(result, null, 2) : 'Running...'}
          </pre>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.25rem' }}>2. Direct Client GraphQL Introspection</h3>
          <p className="muted" style={{ marginBottom: '1rem', fontSize: '0.95rem' }}>Browser-side direct GraphQL execution:</p>
          <pre style={{ background: '#0f172a', color: '#f8fafc', padding: '18px', borderRadius: '10px', overflowX: 'auto', fontSize: '14px', lineHeight: 1.6, margin: 0, fontFamily: 'monospace' }}>
            {directResult ? JSON.stringify(directResult, null, 2) : 'Running...'}
          </pre>
        </div>
      </div>
    </div>
  );
}
