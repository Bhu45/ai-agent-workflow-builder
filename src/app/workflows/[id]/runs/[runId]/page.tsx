/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useAuthenticationStatus, useNhostClient } from '@nhost/nextjs';
import { useSubscription } from '@apollo/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useRouter } from 'next/navigation';
import { useEffect, useState, use } from 'react';
import gql from 'graphql-tag';
import { SUBSCRIBE_WORKFLOW_RUN } from '@/graphql/subscriptions';

const SUB_QUERY = gql`${SUBSCRIBE_WORKFLOW_RUN}`;

const APPROVE_STEP_MUTATION = gql`
  mutation ApproveStep($workflowRunId: uuid!, $approved: Boolean!) {
    approveStep(
      workflow_run_id: $workflowRunId
      approved: $approved
    ) {
      run_id
      status
    }
  }
`;

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
      const { error: graphqlError } = await nhost.graphql.request(
        APPROVE_STEP_MUTATION,
        {
          workflowRunId: runId,
          approved
        }
      );
      
      if (graphqlError) {
        const errors = Array.isArray(graphqlError) ? graphqlError : [graphqlError];
        throw new Error((errors[0] as any)?.message || 'Approval failed');
      }
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
    <div className="page">
      <div className="container" style={{ maxWidth: '800px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <button onClick={() => router.push(`/workflows/${id}/edit`)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', padding: 0, marginBottom: '1rem', fontSize: '0.875rem', fontWeight: 500 }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              Back to Builder
            </button>
            <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem', fontWeight: 600 }}>Run Execution Monitor</h1>
            <p className="muted" style={{ margin: 0 }}>
              Run ID: <code style={{ color: 'var(--text)' }}>{runId}</code><br/>
              Status: <strong style={{ color: getStatusColor(run.status) }}>{run.status.toUpperCase()}</strong>
            </p>
          </div>
        </header>

        {errorMsg && (
          <div className="alert-error" style={{ marginBottom: '2rem' }}>
            {errorMsg}
          </div>
        )}

        {run.error && (
          <div className="alert-error" style={{ marginBottom: '2rem' }}>
            <strong>Workflow Error:</strong> {run.error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {run.step_runs && run.step_runs.map((stepRun: any, index: number) => {
            const isLast = index === run.step_runs.length - 1;
            const isApprovalPaused = stepRun.status === 'paused' && stepRun.workflow_step?.type === 'approval_gate';

            return (
              <div key={stepRun.id} style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="card" style={{ 
                  border: `2px solid ${getStatusColor(stepRun.status)}`, 
                  padding: '1.5rem', 
                  position: 'relative',
                  boxShadow: stepRun.status === 'running' ? '0 0 10px rgba(33,150,243,0.3)' : '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
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
                    <div className="muted" style={{ textAlign: 'right', fontSize: '0.8rem' }}>
                      {stepRun.started_at && <div>Started: {new Date(stepRun.started_at).toLocaleTimeString()}</div>}
                      {stepRun.completed_at && <div>Finished: {new Date(stepRun.completed_at).toLocaleTimeString()}</div>}
                    </div>
                  </div>

                  {stepRun.error && (
                    <div className="alert-error" style={{ marginTop: '1rem' }}>
                      <strong>Error:</strong> {stepRun.error}
                    </div>
                  )}

                  {stepRun.output && (
                    <div style={{ marginTop: '1rem' }}>
                      <strong style={{ fontSize: '0.9rem' }}>Output:</strong>
                      <pre style={{ 
                        background: '#0f172a', 
                        color: '#f8fafc',
                        padding: '1rem', 
                        borderRadius: '0.375rem', 
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
                    <div style={{ marginTop: '1.5rem', padding: '1.5rem', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px', textAlign: 'center' }}>
                      <h3 style={{ margin: '0 0 1rem 0', color: '#b45309' }}>Paused — awaiting approval</h3>
                      {!isOwnerOrEditor ? (
                        <p className="muted">You do not have permission to approve this step. Waiting for Owner or Editor.</p>
                      ) : (
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                          <button 
                            onClick={() => handleApprove(false)} 
                            disabled={approving}
                            className="button-secondary"
                            style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                          >
                            Deny
                          </button>
                          <button 
                            onClick={() => handleApprove(true)} 
                            disabled={approving}
                            className="button-primary"
                            style={{ background: 'var(--success)' }}
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
                    <div style={{ width: '4px', height: '30px', background: 'var(--border)' }}></div>
                  </div>
                )}
              </div>
            );
          })}

          {(!run.step_runs || run.step_runs.length === 0) && (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <p className="muted">{run.status === 'running' ? 'Initializing first step...' : 'No steps recorded.'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
