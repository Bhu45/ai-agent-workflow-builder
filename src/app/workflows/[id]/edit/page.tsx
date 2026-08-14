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
  UPSERT_WORKFLOW_TRIGGER 
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
  const [running, setRunning] = useState(false);

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
          if (error) setErrorMsg(Array.isArray(error) ? error[0].message : (error as any).message);
          else if (data?.workflows_by_pk) {
            const wf = data.workflows_by_pk;
            setName(wf.name);
            setDescription(wf.description || '');
            setSteps(wf.workflow_steps || []);
            
            const wh = (wf.workflow_triggers || []).find((t: any) => t.type === 'webhook');
            if (wh) {
              setWebhookEnabled(wh.enabled);
              setWebhookSecret(wh.config?.secret || '');
            }
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
    setRunning(true);
    setErrorMsg('');
    try {
      // Trigger run via Action endpoint directly (or GraphQL if we mapped it)
      const res = await fetch('/api/actions/triggerWorkflowRun', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${nhost.auth.getAccessToken()}`
        },
        body: JSON.stringify({
          action: { name: 'triggerWorkflowRun' },
          input: { workflow_id: id, initial_input: {} },
          session_variables: { 'x-hasura-user-id': nhost.auth.getUser()?.id }
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Run failed');
      
      router.push(`/workflows/${id}/runs/${data.run_id}`);
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

  const isOwner = activeOrg.role === 'owner';
  const isEditor = activeOrg.role === 'editor';
  const canEdit = isOwner || isEditor;

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '900px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <button onClick={() => router.push('/dashboard')} style={{ marginBottom: '1rem', cursor: 'pointer' }}>&larr; Back to Dashboard</button>
          <h1>Workflow Builder</h1>
          <p>Editing as <strong>{activeOrg.role}</strong> in <strong>{activeOrg.name}</strong></p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          {canEdit && (
            <button onClick={handleSave} disabled={saving} style={{ padding: '0.75rem 1.5rem', background: '#000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              {saving ? 'Saving...' : 'Save Workflow'}
            </button>
          )}
          {canEdit && (
            <button onClick={handleRun} disabled={running} style={{ padding: '0.75rem 1.5rem', background: '#0070f3', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              {running ? 'Starting...' : 'Run Now'}
            </button>
          )}
        </div>
      </header>

      {errorMsg && (
        <div style={{ padding: '1rem', background: '#ffebee', color: '#c62828', borderRadius: '4px', marginBottom: '2rem' }}>
          {errorMsg}
        </div>
      )}

      <div style={{ background: '#f5f5f5', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem' }}>
        <h3>General Info</h3>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Name</label>
          <input 
            type="text" 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            disabled={!canEdit}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid #ccc' }} 
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Description</label>
          <textarea 
            value={description} 
            onChange={(e) => setDescription(e.target.value)} 
            disabled={!canEdit}
            rows={3}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid #ccc' }} 
          />
        </div>
      </div>

      <div style={{ background: '#eef', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          Webhook Trigger
          {!isOwner && <span style={{ fontSize: '0.75rem', background: '#ffc107', padding: '0.1rem 0.4rem', borderRadius: '4px', color: '#000' }}>Owner Only</span>}
        </h3>
        <p style={{ fontSize: '0.9rem', color: '#666' }}>Trigger this workflow remotely via HTTP POST.</p>
        
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <input 
            type="checkbox" 
            checked={webhookEnabled} 
            onChange={(e) => setWebhookEnabled(e.target.checked)} 
            disabled={!isOwner}
          />
          Enable Webhook
        </label>
        
        {webhookEnabled && (
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Secret Token</label>
            <input 
              type="password" 
              value={webhookSecret} 
              onChange={(e) => setWebhookSecret(e.target.value)} 
              disabled={!isOwner}
              placeholder="Enter a secure token"
              style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid #ccc', marginBottom: '1rem' }} 
            />
            {webhookSecret && (
               <div style={{ background: '#fff', padding: '1rem', border: '1px dashed #ccc', borderRadius: '4px', wordBreak: 'break-all' }}>
                 <strong>Webhook URL: </strong> 
                 <code>{typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/{id}</code>
                 <br/><br/>
                 <small>Send a POST request with header: <code>Authorization: Bearer {webhookSecret.replace(/./g, '*')}</code></small>
               </div>
            )}
          </div>
        )}
      </div>

      <div>
        <h3>Steps</h3>
        {steps.length === 0 ? (
          <p style={{ color: '#666' }}>No steps added yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {steps.map((step, idx) => {
              const requiresOwner = step.type === 'db_write' || step.type === 'notify';
              return (
                <div key={step.id || idx} style={{ border: '1px solid #ddd', borderRadius: '8px', background: '#fff', overflow: 'hidden' }}>
                  <div style={{ background: '#fafafa', padding: '1rem', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <button onClick={() => moveStep(idx, 'up')} disabled={idx === 0 || !canEdit} style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>▲</button>
                        <button onClick={() => moveStep(idx, 'down')} disabled={idx === steps.length - 1 || !canEdit} style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>▼</button>
                      </div>
                      <div>
                        <strong style={{ fontSize: '1.2rem', marginRight: '0.5rem' }}>{String(idx + 1).padStart(2, '0')}</strong>
                        <span style={{ fontWeight: 'bold' }}>{step.type.toUpperCase().replace('_', ' ')}</span>
                        {requiresOwner && <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', background: '#ffc107', padding: '0.1rem 0.4rem', borderRadius: '4px', color: '#000' }}>Owner Only</span>}
                      </div>
                    </div>
                    {canEdit && (
                      <button onClick={() => removeStep(idx)} style={{ color: 'red', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
                    )}
                  </div>
                  <div style={{ padding: '1.5rem' }}>
                    {step.type === 'llm_call' && (
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem' }}>System Prompt</label>
                        <textarea 
                          value={step.config.prompt || ''} 
                          onChange={(e) => updateStepConfig(idx, 'prompt', e.target.value)}
                          disabled={!canEdit}
                          rows={3}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
                        />
                      </div>
                    )}
                    {step.type === 'http_request' && (
                      <div style={{ display: 'flex', gap: '1rem' }}>
                        <select 
                          value={step.config.method || 'GET'} 
                          onChange={(e) => updateStepConfig(idx, 'method', e.target.value)}
                          disabled={!canEdit}
                          style={{ padding: '0.5rem' }}
                        >
                          <option>GET</option><option>POST</option><option>PUT</option>
                        </select>
                        <input 
                          type="text" 
                          value={step.config.url || ''} 
                          onChange={(e) => updateStepConfig(idx, 'url', e.target.value)}
                          disabled={!canEdit}
                          placeholder="https://api.example.com/data"
                          style={{ flexGrow: 1, padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
                        />
                      </div>
                    )}
                    {step.type === 'conditional_branch' && (
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem' }}>If previous output contains string:</label>
                        <input 
                          type="text" 
                          value={step.config.conditionStr || ''} 
                          onChange={(e) => updateStepConfig(idx, 'conditionStr', e.target.value)}
                          disabled={!canEdit}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', marginBottom: '1rem' }}
                        />
                        <div style={{ display: 'flex', gap: '1rem' }}>
                          <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Branch if True (Step Position):</label>
                            <input 
                              type="number" 
                              value={step.config.branchIfTrue || ''} 
                              onChange={(e) => updateStepConfig(idx, 'branchIfTrue', parseInt(e.target.value))}
                              disabled={!canEdit}
                              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Branch if False (Step Position):</label>
                            <input 
                              type="number" 
                              value={step.config.branchIfFalse || ''} 
                              onChange={(e) => updateStepConfig(idx, 'branchIfFalse', parseInt(e.target.value))}
                              disabled={!canEdit}
                              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                    {step.type === 'approval_gate' && (
                      <p style={{ color: '#666', margin: 0 }}>Workflow will pause and wait for manual approval by an Owner or Editor before continuing.</p>
                    )}
                    {step.type === 'db_write' && (
                      <p style={{ color: '#666', margin: 0 }}>Saves the output to the organization database (Simulated).</p>
                    )}
                    {step.type === 'notify' && (
                      <p style={{ color: '#666', margin: 0 }}>Sends a notification with the output (Simulated).</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {canEdit && (
          <div style={{ marginTop: '2rem', padding: '1rem', border: '1px dashed #ccc', borderRadius: '8px', textAlign: 'center' }}>
            <p style={{ marginBottom: '1rem', fontWeight: 'bold' }}>Add Step</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button onClick={() => addStep('llm_call')} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>LLM Call</button>
              <button onClick={() => addStep('http_request')} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>HTTP Request</button>
              <button onClick={() => addStep('conditional_branch')} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>Conditional Branch</button>
              <button onClick={() => addStep('approval_gate')} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>Approval Gate</button>
              {isOwner && (
                <>
                  <button onClick={() => addStep('db_write')} style={{ padding: '0.5rem 1rem', cursor: 'pointer', background: '#fff3cd' }}>DB Write (Owner)</button>
                  <button onClick={() => addStep('notify')} style={{ padding: '0.5rem 1rem', cursor: 'pointer', background: '#fff3cd' }}>Notify (Owner)</button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
