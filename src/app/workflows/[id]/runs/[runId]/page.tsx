/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useAuthenticationStatus, useNhostClient } from '@nhost/nextjs';
// @ts-expect-error Types missing in some Apollo versions
import { useSubscription } from '@apollo/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useRouter } from 'next/navigation';
import { useEffect, useState, use } from 'react';
import gql from 'graphql-tag';
import { SUBSCRIBE_WORKFLOW_RUN } from '@/graphql/subscriptions';

const SUB_QUERY = gql`${SUBSCRIBE_WORKFLOW_RUN}`;

export default function WorkflowRunMonitor({ params }: { params: Promise<{ id: string, runId: string }> }) {
  const { id, runId } = use(params);
  const { isAuthenticated, isLoading: authLoading } = useAuthenticationStatus();
  const { activeOrg, loading: orgLoading } = useOrganization();
  const router = useRouter();
  const nhost = useNhostClient();
  const [approving, setApproving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const { data, loading, error: subError } = useSubscription(SUB_QUERY, {
    variables: { runId },
    skip: !runId || !isAuthenticated
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  if (authLoading || orgLoading || loading) return <div style={{ padding: '2rem' }}>Loading execution monitor...</div>;
  if (!isAuthenticated || !activeOrg) return null;

  if (subError) {
    return <div style={{ padding: '2rem', color: 'red' }}>Error loading subscription: {subError.message}</div>;
  }

  const run = data?.workflow_runs_by_pk;
  if (!run) {
    return <div style={{ padding: '2rem' }}>Run not found or unauthorized.</div>;
  }

  const isOwnerOrEditor = activeOrg.role === 'owner' || activeOrg.role === 'editor';

  const handleApprove = async (approved: boolean) => {
    setApproving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/actions/approveStep', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${nhost.auth.getAccessToken()}`
        },
        body: JSON.stringify({
          action: { name: 'approveStep' },
          input: { workflow_run_id: runId, approved },
          session_variables: { 'x-hasura-user-id': nhost.auth.getUser()?.id }
        })
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.message || 'Approval failed');
      // Subscriptions will automatically update the UI!
    } catch (err: any) {
      setErrorMsg(err.message || 'Approval request failed');
    } finally {
      setApproving(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#4caf50';
      case 'failed': return '#f44336';
      case 'running': return '#2196f3';
      case 'paused': return '#ff9800';
      default: return '#9e9e9e';
    }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <button onClick={() => router.push(`/workflows/${id}/edit`)} style={{ marginBottom: '1rem', cursor: 'pointer' }}>&larr; Back to Builder</button>
          <h1>Run Execution Monitor</h1>
          <p>
            Run ID: <code>{runId}</code><br/>
            Status: <strong style={{ color: getStatusColor(run.status) }}>{run.status.toUpperCase()}</strong>
          </p>
        </div>
      </header>

      {errorMsg && (
        <div style={{ padding: '1rem', background: '#ffebee', color: '#c62828', borderRadius: '4px', marginBottom: '2rem' }}>
          {errorMsg}
        </div>
      )}

      {run.error && (
        <div style={{ padding: '1rem', background: '#ffebee', borderLeft: '4px solid #c62828', marginBottom: '2rem' }}>
          <strong>Workflow Error:</strong> {run.error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        {run.step_runs && run.step_runs.map((stepRun: any, index: number) => {
          const isLast = index === run.step_runs.length - 1;
          const isApprovalPaused = stepRun.status === 'paused' && stepRun.workflow_step?.type === 'approval_gate';

          return (
            <div key={stepRun.id} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ 
                border: `2px solid ${getStatusColor(stepRun.status)}`, 
                borderRadius: '8px', 
                padding: '1.5rem', 
                background: '#fff',
                position: 'relative',
                boxShadow: stepRun.status === 'running' ? '0 0 10px rgba(33,150,243,0.3)' : 'none'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div>
                    <strong style={{ fontSize: '1.2rem', display: 'block', marginBottom: '0.25rem' }}>
                      Step {stepRun.workflow_step?.position}: {stepRun.workflow_step?.type.toUpperCase().replace('_', ' ')}
                    </strong>
                    <span style={{ 
                      fontSize: '0.8rem', 
                      background: getStatusColor(stepRun.status), 
                      color: '#fff', 
                      padding: '0.2rem 0.5rem', 
                      borderRadius: '12px' 
                    }}>
                      {stepRun.status}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '0.8rem', color: '#666' }}>
                    {stepRun.started_at && <div>Started: {new Date(stepRun.started_at).toLocaleTimeString()}</div>}
                    {stepRun.completed_at && <div>Finished: {new Date(stepRun.completed_at).toLocaleTimeString()}</div>}
                  </div>
                </div>

                {stepRun.error && (
                  <div style={{ marginTop: '1rem', padding: '1rem', background: '#fff3f3', border: '1px solid #ffcdd2', borderRadius: '4px', color: '#c62828', fontSize: '0.9rem' }}>
                    <strong>Error:</strong> {stepRun.error}
                  </div>
                )}

                {stepRun.output && (
                  <div style={{ marginTop: '1rem' }}>
                    <strong style={{ fontSize: '0.9rem' }}>Output:</strong>
                    <pre style={{ 
                      background: '#f5f5f5', 
                      padding: '1rem', 
                      borderRadius: '4px', 
                      overflowX: 'auto',
                      fontSize: '0.85rem',
                      marginTop: '0.5rem',
                      maxHeight: '300px'
                    }}>
                      {JSON.stringify(stepRun.output, null, 2)}
                    </pre>
                  </div>
                )}

                {isApprovalPaused && (
                  <div style={{ marginTop: '1.5rem', padding: '1.5rem', background: '#fff8e1', border: '1px solid #ffecb3', borderRadius: '8px', textAlign: 'center' }}>
                    <h3 style={{ margin: '0 0 1rem 0', color: '#ff8f00' }}>Paused — awaiting approval</h3>
                    {!isOwnerOrEditor ? (
                      <p style={{ color: '#666' }}>You do not have permission to approve this step. Waiting for Owner or Editor.</p>
                    ) : (
                      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                        <button 
                          onClick={() => handleApprove(false)} 
                          disabled={approving}
                          style={{ padding: '0.75rem 2rem', background: '#fff', border: '1px solid #f44336', color: '#f44336', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          Deny
                        </button>
                        <button 
                          onClick={() => handleApprove(true)} 
                          disabled={approving}
                          style={{ padding: '0.75rem 2rem', background: '#4caf50', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          {approving ? 'Processing...' : 'Approve'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {!isLast && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 0' }}>
                  <div style={{ width: '4px', height: '30px', background: '#ccc' }}></div>
                </div>
              )}
            </div>
          );
        })}

        {(!run.step_runs || run.step_runs.length === 0) && (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
            {run.status === 'running' ? 'Initializing first step...' : 'No steps recorded.'}
          </div>
        )}
      </div>
    </div>
  );
}
