/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useAuthenticationStatus, useNhostClient } from '@nhost/nextjs';
import { useOrganization } from '@/hooks/useOrganization';
import { useRouter } from 'next/navigation';
import { useEffect, useState, use } from 'react';
import { 
  GET_WORKFLOW_BY_ID, 
  UPDATE_WORKFLOW, 
  REPLACE_WORKFLOW_STEPS,
  UPSERT_WORKFLOW_TRIGGER,
  TRIGGER_WORKFLOW_RUN
} from '@/graphql/workflows';

export default function WorkflowBuilder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isAuthenticated, isLoading: authLoading } = useAuthenticationStatus();
  const { activeOrg, loading: orgLoading } = useOrganization();
  const router = useRouter();
  const nhost = useNhostClient();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<any[]>([]);
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [webhookSecret, setWebhookSecret] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [running, setRunning] = useState(false);
  const [runInput, setRunInput] = useState('');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    let mounted = true;
    async function fetchWf() {
      if (id && activeOrg) {
        setLoading(true);
        const { data, error } = await nhost.graphql.request(GET_WORKFLOW_BY_ID, { id });
        if (mounted) {
          if (error) {
            setErrorMsg(Array.isArray(error) ? error[0].message : (error as any).message);
            setNotFound(true);
          } else if (data?.workflows_by_pk) {
            const wf = data.workflows_by_pk;
            setName(wf.name);
            setDescription(wf.description || '');
            setSteps(wf.workflow_steps || []);
            
            const wh = (wf.workflow_triggers || []).find((t: any) => t.type === 'webhook');
            if (wh) {
              setWebhookEnabled(wh.enabled);
              setWebhookSecret(wh.config?.secret || '');
            }
          } else {
            setNotFound(true);
          }
          setLoading(false);
        }
      }
    }
    fetchWf();
    return () => { mounted = false; };
  }, [id, activeOrg, nhost.graphql]);

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg('');
    try {
      // 1. Update name/desc
      await nhost.graphql.request(UPDATE_WORKFLOW, { id, name, description });

      // 2. Replace steps
      const formattedSteps = steps.map((s, idx) => ({
        workflow_id: id,
        position: idx + 1,
        type: s.type,
        config: s.config || {}
      }));
      await nhost.graphql.request(REPLACE_WORKFLOW_STEPS, { workflowId: id, steps: formattedSteps });

      // 3. Upsert Webhook
      // Only owners can enable webhooks (server side will enforce if set up, but we also pass it here)
      if (webhookEnabled && !webhookSecret) {
        throw new Error("Webhook secret cannot be empty if enabled.");
      }
      await nhost.graphql.request(UPSERT_WORKFLOW_TRIGGER, {
        workflowId: id,
        type: 'webhook',
        enabled: webhookEnabled,
        config: webhookEnabled ? { secret: webhookSecret } : {}
      });

      alert('Workflow saved successfully!');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving workflow');
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async () => {
    const input = runInput.trim();
    if (!input) {
      setErrorMsg('Please enter a Run Input before starting the workflow.');
      return;
    }

    setRunning(true);
    setErrorMsg('');
    try {
      const { data, error } = await nhost.graphql.request(TRIGGER_WORKFLOW_RUN, {
        workflow_id: id,
        initial_input: { text: input }
      });

      if (error) {
        throw new Error(Array.isArray(error) ? error[0].message : (error as any).message || 'Run failed');
      }
      
      const runId = data?.triggerWorkflowRun?.run_id;
      if (!runId) throw new Error('No run ID returned from action');

      router.push(`/workflows/${id}/runs/${runId}`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error triggering run');
      setRunning(false);
    }
  };

  const addStep = (type: string) => {
    const newStep = {
      id: `temp-${Date.now()}`,
      type,
      config: type === 'llm_call' ? { prompt: '' } : 
              type === 'http_request' ? { url: '', method: 'GET' } : 
              type === 'conditional_branch' ? { conditionStr: '', branchIfTrue: null, branchIfFalse: null } :
              {}
    };
    setSteps([...steps, newStep]);
  };

  const removeStep = (index: number) => {
    const newSteps = [...steps];
    newSteps.splice(index, 1);
    setSteps(newSteps);
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === steps.length - 1) return;
    const newSteps = [...steps];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const temp = newSteps[index];
    newSteps[index] = newSteps[targetIdx];
    newSteps[targetIdx] = temp;
    setSteps(newSteps);
  };

  const updateStepConfig = (index: number, key: string, value: any) => {
    const newSteps = [...steps];
    newSteps[index].config = { ...newSteps[index].config, [key]: value };
    setSteps(newSteps);
  };

  if (authLoading || orgLoading || loading) return <div style={{ padding: '2rem' }}>Loading builder...</div>;
  if (!isAuthenticated || !activeOrg) return null;

  if (notFound) {
    return (
      <div className="page" style={{ display: 'flex', justifyContent: 'center', paddingTop: '10vh' }}>
        <div className="card" style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
          <h2 style={{ color: 'var(--danger)', marginTop: 0 }}>Access Denied</h2>
          <p className="muted" style={{ margin: '1rem 0' }}>This workflow does not exist or you do not have permission to access it.</p>
          <button onClick={() => router.push('/dashboard')} className="button-primary">Return to Dashboard</button>
        </div>
      </div>
    );
  }

  const isOwner = activeOrg.role === 'owner';
  const isEditor = activeOrg.role === 'editor';
  const canEdit = isOwner || isEditor;

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: '900px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <button onClick={() => router.push('/dashboard')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', padding: 0, marginBottom: '1rem', fontSize: '0.875rem', fontWeight: 500 }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              Back to Dashboard
            </button>
            <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem', fontWeight: 600 }}>Workflow Builder</h1>
            <p className="muted" style={{ margin: 0 }}>Editing as <strong style={{ color: 'var(--text)' }}>{activeOrg.role}</strong> in <strong style={{ color: 'var(--text)' }}>{activeOrg.name}</strong></p>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            {canEdit && (
              <button onClick={handleSave} disabled={saving} className="button-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                {saving ? 'Saving...' : 'Save Workflow'}
              </button>
            )}
            {canEdit && (
              <button onClick={handleRun} disabled={running} className="button-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                {running ? 'Starting...' : 'Run Now'}
              </button>
            )}
          </div>
        </header>

        {errorMsg && (
          <div className="alert-error" style={{ marginBottom: '2rem' }}>
            {errorMsg}
          </div>
        )}

        <div className="card" style={{ marginBottom: '2rem' }}>
          <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.125rem', fontWeight: 600 }}>General Info</h3>
          <div style={{ marginBottom: '1rem' }}>
            <label className="label">Name</label>
            <input 
              type="text" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              disabled={!canEdit}
              style={{ width: '100%' }} 
            />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea 
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              disabled={!canEdit}
              rows={3}
              style={{ width: '100%', resize: 'vertical' }} 
            />
          </div>
        </div>

        <div className="card" style={{ marginBottom: '2rem' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.125rem', fontWeight: 600 }}>Run Input</h3>
          <p className="muted" style={{ marginBottom: '1rem' }}>This input is passed to the first workflow step when you click Run Now.</p>
          <textarea
            value={runInput}
            onChange={(e) => setRunInput(e.target.value)}
            disabled={!canEdit}
            placeholder="Example: Write a professional LinkedIn post about how AI is transforming personal finance."
            rows={4}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>

        <div className="card" style={{ marginBottom: '2rem', background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.125rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Webhook Trigger
            {!isOwner && <span style={{ fontSize: '0.75rem', background: '#ffed4a', color: '#856404', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 600 }}>Owner Only</span>}
          </h3>
          <p className="muted" style={{ marginBottom: '1.5rem' }}>Trigger this workflow remotely via HTTP POST.</p>
          
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: webhookEnabled ? '1.5rem' : 0, cursor: 'pointer', fontWeight: 500 }}>
            <input 
              type="checkbox" 
              checked={webhookEnabled} 
              onChange={(e) => setWebhookEnabled(e.target.checked)} 
              disabled={!isOwner}
              style={{ width: 'auto' }}
            />
            Enable Webhook
          </label>
          
          {webhookEnabled && (
            <div>
              <label className="label">Secret Token</label>
              <input 
                type="password" 
                value={webhookSecret} 
                onChange={(e) => setWebhookSecret(e.target.value)} 
                disabled={!isOwner}
                placeholder="Enter a secure token"
                style={{ width: '100%', marginBottom: '1rem' }} 
              />
              {webhookSecret && (
                 <div style={{ background: 'var(--surface)', padding: '1rem', border: '1px dashed var(--border)', borderRadius: '4px', wordBreak: 'break-all', fontSize: '0.875rem' }}>
                   <strong style={{ color: 'var(--text)' }}>Webhook URL: </strong> 
                   <code style={{ color: 'var(--primary)' }}>{typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/{id}</code>
                   <br/><br/>
                   <span className="muted">Send a POST request with header: <code style={{ color: 'var(--text)' }}>Authorization: Bearer {webhookSecret.replace(/./g, '*')}</code></span>
                 </div>
              )}
            </div>
          )}
        </div>

        <div>
          <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.125rem', fontWeight: 600 }}>Steps</h3>
          {steps.length === 0 ? (
            <div className="card" style={{ padding: '3rem', textAlign: 'center', borderStyle: 'dashed' }}>
              <p className="muted">No steps added yet. Add a step below to build your workflow.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {steps.map((step, idx) => {
                const requiresOwner = step.type === 'db_write' || step.type === 'notify';
                return (
                  <div key={step.id || idx} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ background: 'var(--surface-muted)', padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <button onClick={() => moveStep(idx, 'up')} disabled={idx === 0 || !canEdit} style={{ cursor: 'pointer', background: 'none', border: 'none', padding: '2px', color: idx === 0 ? 'var(--border)' : 'var(--text-secondary)' }} aria-label="Move Up">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
                          </button>
                          <button onClick={() => moveStep(idx, 'down')} disabled={idx === steps.length - 1 || !canEdit} style={{ cursor: 'pointer', background: 'none', border: 'none', padding: '2px', color: idx === steps.length - 1 ? 'var(--border)' : 'var(--text-secondary)' }} aria-label="Move Down">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                          </button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ background: 'var(--surface)', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', fontWeight: 600, fontSize: '0.875rem', border: '1px solid var(--border)' }}>
                            {String(idx + 1).padStart(2, '0')}
                          </div>
                          <span style={{ fontWeight: 600, fontSize: '1rem' }}>{step.type.toUpperCase().replace('_', ' ')}</span>
                          {requiresOwner && <span style={{ fontSize: '0.7rem', background: '#ffed4a', color: '#856404', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 600 }}>Owner Only</span>}
                        </div>
                      </div>
                      {canEdit && (
                        <button onClick={() => removeStep(idx)} style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500, padding: '0.5rem' }}>
                          Delete
                        </button>
                      )}
                    </div>
                    <div style={{ padding: '1.5rem' }}>
                      {step.type === 'llm_call' && (
                        <div>
                          <label className="label">System Prompt</label>
                          <textarea 
                            value={step.config.prompt || ''} 
                            onChange={(e) => updateStepConfig(idx, 'prompt', e.target.value)}
                            disabled={!canEdit}
                            rows={3}
                            style={{ width: '100%', resize: 'vertical' }}
                          />
                        </div>
                      )}
                      {step.type === 'http_request' && (
                        <div style={{ display: 'flex', gap: '1rem' }}>
                          <select 
                            value={step.config.method || 'GET'} 
                            onChange={(e) => updateStepConfig(idx, 'method', e.target.value)}
                            disabled={!canEdit}
                          >
                            <option>GET</option><option>POST</option><option>PUT</option>
                          </select>
                          <input 
                            type="text" 
                            value={step.config.url || ''} 
                            onChange={(e) => updateStepConfig(idx, 'url', e.target.value)}
                            disabled={!canEdit}
                            placeholder="https://api.example.com/data"
                            style={{ flexGrow: 1 }}
                          />
                        </div>
                      )}
                      {step.type === 'conditional_branch' && (
                        <div>
                          <label className="label">If previous output contains string:</label>
                          <input 
                            type="text" 
                            value={step.config.conditionStr || ''} 
                            onChange={(e) => updateStepConfig(idx, 'conditionStr', e.target.value)}
                            disabled={!canEdit}
                            style={{ width: '100%', marginBottom: '1rem' }}
                          />
                          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                            <div style={{ flex: '1 1 200px' }}>
                              <label className="label">Branch if True (Step Position):</label>
                              <input 
                                type="number" 
                                value={step.config.branchIfTrue || ''} 
                                onChange={(e) => updateStepConfig(idx, 'branchIfTrue', parseInt(e.target.value))}
                                disabled={!canEdit}
                                style={{ width: '100%' }}
                              />
                            </div>
                            <div style={{ flex: '1 1 200px' }}>
                              <label className="label">Branch if False (Step Position):</label>
                              <input 
                                type="number" 
                                value={step.config.branchIfFalse || ''} 
                                onChange={(e) => updateStepConfig(idx, 'branchIfFalse', parseInt(e.target.value))}
                                disabled={!canEdit}
                                style={{ width: '100%' }}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                      {step.type === 'approval_gate' && (
                        <p className="muted" style={{ margin: 0 }}>Workflow will pause and wait for manual approval by an Owner or Editor before continuing.</p>
                      )}
                      {step.type === 'db_write' && (
                        <p className="muted" style={{ margin: 0 }}>Saves the output to the organization database (Simulated).</p>
                      )}
                      {step.type === 'notify' && (
                        <p className="muted" style={{ margin: 0 }}>Sends a notification with the output (Simulated).</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {canEdit && (
            <div className="card" style={{ marginTop: '2rem', padding: '2rem', textAlign: 'center', borderStyle: 'dashed' }}>
              <p style={{ margin: '0 0 1rem 0', fontWeight: 600 }}>Add Step</p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button onClick={() => addStep('llm_call')} className="button-secondary">LLM Call</button>
                <button onClick={() => addStep('http_request')} className="button-secondary">HTTP Request</button>
                <button onClick={() => addStep('conditional_branch')} className="button-secondary">Conditional Branch</button>
                <button onClick={() => addStep('approval_gate')} className="button-secondary">Approval Gate</button>
                {isOwner && (
                  <>
                    <button onClick={() => addStep('db_write')} className="button-secondary" style={{ background: '#fffbeb', borderColor: '#fef3c7', color: '#92400e' }}>DB Write (Owner)</button>
                    <button onClick={() => addStep('notify')} className="button-secondary" style={{ background: '#fffbeb', borderColor: '#fef3c7', color: '#92400e' }}>Notify (Owner)</button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
