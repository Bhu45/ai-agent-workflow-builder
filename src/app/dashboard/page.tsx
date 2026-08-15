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
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Workflow Builder Dashboard</h1>
        <button onClick={signOut} style={{ padding: '0.5rem' }}>Sign Out</button>
      </header>

      <section style={{ marginTop: '2rem', padding: '1rem', background: '#f5f5f5', borderRadius: '4px' }}>
        <h2>Organization Context</h2>
        {organizations.length === 0 ? (
          <div style={{ background: '#fff', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginTop: '2rem', textAlign: 'center' }}>
            <h2 style={{ marginBottom: '1rem' }}>Welcome to AI Workflow Builder!</h2>
            <p style={{ color: '#666', marginBottom: '2rem' }}>You do not belong to any organizations yet. Create one to get started.</p>
            <form onSubmit={handleCreateOrg} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '300px', margin: '0 auto' }}>
              <input 
                type="text" 
                placeholder="Organization Name" 
                value={newOrgName} 
                onChange={(e) => setNewOrgName(e.target.value)}
                required
                style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid #ccc' }}
              />
              <button 
                type="submit" 
                disabled={creatingOrg}
                style={{ padding: '0.75rem', background: '#2196f3', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                {creatingOrg ? 'Creating...' : 'Create Organization'}
              </button>
              {orgError && <p style={{ color: 'red', fontSize: '0.85rem' }}>{orgError}</p>}
            </form>
          </div>
        ) : (
          <div>
            <label style={{ marginRight: '1rem' }}>Switch Organization:</label>
            <select
              value={activeOrg?.id || ''}
              onChange={(e) => {
                const org = organizations.find((o) => o.id === e.target.value);
                setActiveOrg(org || null);
              }}
              style={{ padding: '0.5rem' }}
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.role})
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      {activeOrg && (
        <section style={{ marginTop: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#eef', padding: '1rem', borderRadius: '4px', marginBottom: '2rem' }}>
            <div>
              <h3>Organization Quota</h3>
              <p>
                Used: <strong>{activeOrg.quota_used}</strong> / {activeOrg.quota_limit} 
                ({Math.round((activeOrg.quota_used / activeOrg.quota_limit) * 100)}%)
              </p>
              {activeOrg.quota_used >= activeOrg.quota_limit * 0.9 && (
                <p style={{ color: 'red', fontWeight: 'bold' }}>⚠️ Warning: Quota is near or at exhaustion.</p>
              )}
            </div>
            <div>
              <strong>Role: {activeOrg.role}</strong>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Workflows for {activeOrg.name}</h2>
            {['owner', 'editor'].includes(activeOrg.role || '') && (
              <button 
                onClick={handleCreateWorkflow} 
                style={{ padding: '0.75rem 1.5rem', background: '#0070f3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                + New Workflow
              </button>
            )}
          </div>
          
          {loadingWorkflows ? (
            <p>Loading workflows...</p>
          ) : workflows.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', background: '#f9f9f9', borderRadius: '4px', marginTop: '1rem' }}>
              <p>No workflows found.</p>
              {['owner', 'editor'].includes(activeOrg.role || '') && (
                 <button onClick={handleCreateWorkflow} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>Create your first workflow</button>
              )}
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, marginTop: '1rem' }}>
              {workflows.map((wf: any) => (
                <li key={wf.id} style={{ border: '1px solid #eaeaea', padding: '1.5rem', marginBottom: '1rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: '0 0 0.5rem 0' }}>{wf.name}</h3>
                    <p style={{ margin: 0, color: '#666' }}>{wf.description || 'No description'}</p>
                    <small style={{ color: '#999', display: 'block', marginTop: '0.5rem' }}>
                      Created: {new Date(wf.created_at).toLocaleString()}
                    </small>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <Link href={`/workflows/${wf.id}/edit`}>
                      <button style={{ padding: '0.5rem 1rem', background: '#eee', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' }}>Edit Builder</button>
                    </Link>
                    {wf.workflow_runs && wf.workflow_runs.length > 0 && (
                      <Link href={`/workflows/${wf.id}/runs/${wf.workflow_runs[0].id}`}>
                        <button style={{ padding: '0.5rem 1rem', background: '#e0f7fa', border: '1px solid #b2ebf2', borderRadius: '4px', cursor: 'pointer' }}>View Last Run</button>
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
