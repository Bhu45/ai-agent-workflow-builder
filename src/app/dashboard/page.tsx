/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useAuthenticationStatus, useSignOut, useNhostClient } from '@nhost/nextjs';
import { useOrganization } from '@/hooks/useOrganization';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { GET_WORKFLOWS_BY_ORG, CREATE_WORKFLOW } from '@/graphql/workflows';

export default function Dashboard() {
  const { isAuthenticated, isLoading } = useAuthenticationStatus();
  const { activeOrg, organizations, setActiveOrg, loading: orgLoading, refreshOrgs } = useOrganization();
  const { signOut } = useSignOut();
  const router = useRouter();
  const nhost = useNhostClient();
  type Workflow = { id: string; name: string; description: string };
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);

  const [newOrgName, setNewOrgName] = useState('');
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [orgError, setOrgError] = useState('');

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setCreatingOrg(true);
    setOrgError('');
    try {
      const res = await nhost.graphql.request(
        `mutation CreateOrgAction($name: String!) { createOrganization(name: $name) { id } }`,
        { name: newOrgName }
      );
      if (res.error) {
        const errMsg = Array.isArray(res.error) ? res.error[0]?.message : (res.error as any).message;
        throw new Error(errMsg || 'Failed to create organization');
      }
      await refreshOrgs();
      setNewOrgName('');
    } catch (err: any) {
      setOrgError(err.message || 'An error occurred');
    } finally {
      setCreatingOrg(false);
    }
  };

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    let mounted = true;
    async function fetchWorkflows() {
      if (activeOrg?.id) {
        setLoadingWorkflows(true);
        const { data, error } = await nhost.graphql.request(GET_WORKFLOWS_BY_ORG, { orgId: activeOrg.id });
        if (mounted && !error) {
          setWorkflows(data?.workflows || []);
        }
        if (mounted) setLoadingWorkflows(false);
      }
    }
    fetchWorkflows();
    return () => { mounted = false; };
  }, [activeOrg?.id, nhost.graphql]);

  const handleCreateWorkflow = async () => {
    if (!activeOrg) return;
    const name = prompt('Workflow Name:');
    if (!name) return;
    const { data, error } = await nhost.graphql.request(CREATE_WORKFLOW, { orgId: activeOrg.id, name, description: '' });
    if (!error && data?.insert_workflows_one) {
      // Refresh list
      const res = await nhost.graphql.request(GET_WORKFLOWS_BY_ORG, { orgId: activeOrg.id });
      setWorkflows(res.data?.workflows || []);
    }
  };

  if (isLoading || orgLoading) return <p>Loading dashboard...</p>;
  if (!isAuthenticated) return null;

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}>
      <header style={{ background: '#ffffff', borderBottom: '1px solid #e5e7eb', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#111827' }}>Workflow Builder</h1>
          {organizations.length > 0 && (
            <select
              value={activeOrg?.id || ''}
              onChange={(e) => {
                const org = organizations.find((o) => o.id === e.target.value);
                setActiveOrg(org || null);
              }}
              style={{ padding: '0.375rem 2rem 0.375rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', background: '#f9fafb', fontSize: '0.875rem', color: '#374151', cursor: 'pointer', appearance: 'none', backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'%3e%3c/polyline%3e%3c/svg%3e")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center', backgroundSize: '1em' }}
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <button onClick={signOut} style={{ padding: '0.375rem 0.75rem', fontSize: '0.875rem', color: '#4b5563', background: 'transparent', border: '1px solid #d1d5db', borderRadius: '0.375rem', cursor: 'pointer', transition: 'all 0.2s' }}>Sign Out</button>
      </header>

      <main style={{ maxWidth: '1024px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        {organizations.length === 0 ? (
          <div style={{ background: '#ffffff', padding: '3rem 2rem', borderRadius: '0.5rem', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)', maxWidth: '28rem', margin: '4rem auto', textAlign: 'center', border: '1px solid #f3f4f6' }}>
            <div style={{ width: '48px', height: '48px', background: '#eff6ff', color: '#3b82f6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line></svg>
            </div>
            <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem', fontWeight: 600, color: '#111827' }}>Create your organization</h2>
            <p style={{ color: '#6b7280', marginBottom: '2rem', fontSize: '0.95rem', lineHeight: 1.5 }}>You need an organization to create and manage AI workflows. Set one up to get started.</p>
            <form onSubmit={handleCreateOrg} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ textAlign: 'left' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.25rem' }}>Organization Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Acme Corp" 
                  value={newOrgName} 
                  onChange={(e) => setNewOrgName(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.625rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', outline: 'none', transition: 'border-color 0.15s', fontSize: '0.95rem', color: '#111827', boxSizing: 'border-box' }}
                />
              </div>
              {orgError && (
                <div style={{ padding: '0.75rem', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '0.375rem', color: '#b91c1c', fontSize: '0.875rem', textAlign: 'left', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <svg style={{ flexShrink: 0, marginTop: '2px' }} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                  <span>{orgError}</span>
                </div>
              )}
              <button 
                type="submit" 
                disabled={creatingOrg}
                style={{ padding: '0.625rem 1rem', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '0.375rem', cursor: creatingOrg ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: '0.95rem', transition: 'background-color 0.2s', marginTop: '0.5rem', opacity: creatingOrg ? 0.7 : 1 }}
              >
                {creatingOrg ? 'Creating...' : 'Create Organization'}
              </button>
            </form>
          </div>
        ) : activeOrg ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
              <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                  Organization Quota
                </h3>
                <div style={{ marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '2rem', fontWeight: 700, color: '#111827' }}>{activeOrg.quota_used}</span>
                  <span style={{ fontSize: '1rem', color: '#6b7280', marginLeft: '0.25rem' }}>/ {activeOrg.quota_limit} workflows</span>
                </div>
                <div style={{ width: '100%', height: '8px', background: '#f3f4f6', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: (activeOrg.quota_used / activeOrg.quota_limit) > 0.9 ? '#ef4444' : '#3b82f6', width: `${Math.min(100, (activeOrg.quota_used / activeOrg.quota_limit) * 100)}%`, transition: 'width 0.5s ease' }}></div>
                </div>
                {activeOrg.quota_used >= activeOrg.quota_limit * 0.9 && (
                  <p style={{ margin: '0.75rem 0 0 0', color: '#dc2626', fontSize: '0.875rem', fontWeight: 500 }}>⚠️ Quota is near exhaustion</p>
                )}
              </div>
              
              <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                  Your Role
                </h3>
                <div style={{ display: 'inline-flex', alignItems: 'center', padding: '0.25rem 0.75rem', background: '#f3f4f6', borderRadius: '999px', fontSize: '0.875rem', fontWeight: 500, color: '#374151', textTransform: 'capitalize' }}>
                  {activeOrg.role}
                </div>
              </div>
            </section>

            <section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#111827' }}>Workflows</h2>
                {['owner', 'editor'].includes(activeOrg.role || '') && (
                  <button 
                    onClick={handleCreateWorkflow} 
                    style={{ padding: '0.5rem 1rem', background: '#111827', color: '#ffffff', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'background-color 0.2s' }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    New Workflow
                  </button>
                )}
              </div>
              
              {loadingWorkflows ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
                  <p>Loading workflows...</p>
                </div>
              ) : workflows.length === 0 ? (
                <div style={{ background: '#ffffff', border: '1px dashed #d1d5db', borderRadius: '0.5rem', padding: '4rem 2rem', textAlign: 'center' }}>
                  <svg style={{ margin: '0 auto 1rem', color: '#9ca3af' }} xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                  <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.125rem', fontWeight: 600, color: '#374151' }}>No workflows found</h3>
                  <p style={{ margin: '0 0 1.5rem 0', color: '#6b7280', fontSize: '0.95rem' }}>Get started by creating your first automated workflow.</p>
                  {['owner', 'editor'].includes(activeOrg.role || '') && (
                     <button onClick={handleCreateWorkflow} style={{ padding: '0.5rem 1rem', background: '#ffffff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '0.375rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.875rem', transition: 'all 0.2s' }}>
                       Create Workflow
                     </button>
                  )}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                  {workflows.map((wf: any) => (
                    <div key={wf.id} style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
                      <div>
                        <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', fontWeight: 600, color: '#111827' }}>{wf.name}</h3>
                        <p style={{ margin: '0 0 0.5rem 0', color: '#6b7280', fontSize: '0.875rem' }}>{wf.description || 'No description provided.'}</p>
                        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Created {new Date(wf.created_at).toLocaleDateString()}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        {wf.workflow_runs && wf.workflow_runs.length > 0 && (
                          <Link href={`/workflows/${wf.id}/runs/${wf.workflow_runs[0].id}`} style={{ textDecoration: 'none' }}>
                            <button style={{ padding: '0.5rem 0.875rem', background: '#f3f4f6', color: '#374151', border: '1px solid transparent', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500, transition: 'background-color 0.2s' }}>
                              View Last Run
                            </button>
                          </Link>
                        )}
                        <Link href={`/workflows/${wf.id}/edit`} style={{ textDecoration: 'none' }}>
                          <button style={{ padding: '0.5rem 0.875rem', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500, transition: 'all 0.2s' }}>
                            Edit Builder
                          </button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}
