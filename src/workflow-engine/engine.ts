/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  fetchWorkflowAsUser,
  fetchWorkflowAsAdmin,
  checkQuota,
  incrementQuota,
  createWorkflowRun,
  updateWorkflowRunStatus,
  createStepRun,
  updateStepRunStatus,
  internalDbWrite
} from './api';
import { executeLlmCall } from './steps/llm';
import { executeHttpRequest } from './steps/http';

export type ExecutionContext = 
  | { type: 'user'; userId: string }
  | { type: 'webhook'; orgId: string };

export async function executeWorkflow(workflowId: string, context: ExecutionContext, initialInput: any = {}) {
  console.log(`[Engine] executeWorkflow started for workflowId=${workflowId}`);
  let workflow;
  let userRole: string | null = null;

  try {
    console.log(`[Engine] Looking up workflow ${workflowId} as context type: ${context.type}`);
    if (context.type === 'user') {
      workflow = await fetchWorkflowAsUser(workflowId, context.userId);
      console.log(`[Engine] fetchWorkflowAsUser completed. Workflow found: ${!!workflow}`);
      userRole = workflow?.organization?.org_members?.[0]?.role;
      if (!userRole || !['owner', 'editor'].includes(userRole)) {
        throw new Error(`Insufficient permissions to execute workflow. Role: ${userRole}`);
      }
    } else {
      workflow = await fetchWorkflowAsAdmin(workflowId);
      console.log(`[Engine] fetchWorkflowAsAdmin completed. Workflow found: ${!!workflow}`);
      if (workflow && workflow.org_id !== context.orgId) {
        throw new Error('Unauthorized org match');
      }
      // Webhooks run as system triggers without a specific user role.
      userRole = null;
    }

    if (!workflow) {
      throw new Error('Unauthorized or workflow not found');
    }

    const orgId = workflow.org_id;

    // 2. Check quota (Do not increment yet)
    const hasQuota = await checkQuota(orgId);
    if (!hasQuota) {
      throw new Error('Organization quota exceeded');
    }

    // 3. Create Workflow Run
    console.log(`[Engine] Creating workflow run for workflow ${workflowId}...`);
    const runId = await createWorkflowRun(workflowId);
    console.log(`[Engine] Started workflow run ${runId} for workflow ${workflowId}`);

    // Execution happens asynchronously via Event Trigger. We just return.
    return { runId, status: 'running' };

  } catch (err: any) {
    console.error(`[Engine] Fatal error in executeWorkflow for ${workflowId}:`, err.message || err);
    throw err;
  }
}

export async function executeWorkflowFromRun(runId: string, workflowId: string, initialInput: any = {}) {
  console.log(`[Engine] executeWorkflowFromRun started for runId=${runId}, workflowId=${workflowId}`);
  
  try {
    const workflow = await fetchWorkflowAsAdmin(workflowId);
    if (!workflow) throw new Error('Workflow not found');
    
    const orgId = workflow.org_id;

    let currentInput = initialInput;
    const steps = workflow.workflow_steps || [];
    console.log(`[Engine] Workflow has ${steps.length} steps`);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      
      // Create step_run
      console.log(`[Engine] Creating step run for step ${step.id} (position ${step.position}, type ${step.type})...`);
      const stepRunId = await createStepRun(runId, step.id, currentInput);
      console.log(`[Engine] Executing step ${step.position}: ${step.type} (run ID: ${stepRunId})`);

    try {
      let output: any = null;

      switch (step.type) {
        case 'llm_call':
          output = await executeLlmCall(step.config, typeof currentInput === 'string' ? currentInput : JSON.stringify(currentInput));
          break;

        case 'http_request':
          output = await executeHttpRequest(step.config, currentInput);
          break;

        case 'conditional_branch':
          // Config: { conditionStr: "positive", branchIfTrue: 3, branchIfFalse: 4 }
          const conditionStr = step.config.conditionStr || '';
          const inputStr = JSON.stringify(currentInput).toLowerCase();
          const isTrue = inputStr.includes(conditionStr.toLowerCase());
          
          output = { conditionMet: isTrue };
          
          // Wait, conditional branch should jump to another position? Or we just record it.
          // In a simple linear model, if the branch determines the next step, we could modify `i`
          // based on config.branchIfTrue / config.branchIfFalse, but to keep it simple,
          // let's just use it to skip certain downstream steps based on a flag, or jump.
          // Let's implement jump.
          const nextPosition = isTrue ? step.config.branchIfTrue : step.config.branchIfFalse;
          if (nextPosition) {
            const nextStepIndex = steps.findIndex((s: any) => s.position === nextPosition);
            if (nextStepIndex !== -1) {
              i = nextStepIndex - 1; // -1 because the loop increments i
            }
          }
          break;

        case 'approval_gate':
          // PAUSE EXECUTION
          console.log(`[Engine] Pausing at approval gate step ${step.id}`);
          await updateStepRunStatus(stepRunId, 'paused');
          await updateWorkflowRunStatus(runId, 'paused');
          return { runId, status: 'paused', message: 'Workflow paused for approval' };

        case 'db_write':
          await internalDbWrite(orgId, runId, currentInput);
          output = { success: true };
          break;

        case 'notify':
          // Real implementation would send email/webhook
          console.log(`[Engine] Notify: ${JSON.stringify(currentInput)}`);
          output = { notified: true };
          break;

        default:
          throw new Error(`Unknown step type: ${step.type}`);
      }

      await updateStepRunStatus(stepRunId, 'completed', output);
      currentInput = output;

    } catch (err: any) {
      console.error(`[Engine] Step ${step.id} failed:`, err.message);
      await updateStepRunStatus(stepRunId, 'failed', null, err.message);
      await updateWorkflowRunStatus(runId, 'failed', `Step ${step.position} failed: ${err.message}`);
      return { runId, status: 'failed', error: err.message };
    }
  }

  console.log(`[Engine] Workflow run ${runId} steps finished. Incrementing quota.`);
  
  const quotaGranted = await incrementQuota(orgId);
  if (!quotaGranted) {
    await updateWorkflowRunStatus(runId, 'failed', 'Quota exhausted during execution by concurrent runs');
    return { runId, status: 'failed', error: 'Quota exhausted during execution by concurrent runs' };
  }

  await updateWorkflowRunStatus(runId, 'completed');
  return { runId, status: 'completed', output: currentInput };
  } catch (err: any) {
    console.error(`[Engine] Fatal error in executeWorkflow for ${workflowId}:`, err.message || err);
    throw err;
  }
}

export async function resumeWorkflow(runId: string, userId: string, approved: boolean) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getWorkflowRunAsUser, atomicResumeWorkflow } = require('./api');
  const run = await getWorkflowRunAsUser(runId, userId);
  if (!run) throw new Error('Run not found or unauthorized');

  if (run.status !== 'paused') {
    throw new Error(`Cannot resume a run that is ${run.status}`);
  }

  const lastStepRun = run.step_runs[0];
  if (!lastStepRun || lastStepRun.status !== 'paused' || lastStepRun.workflow_step.type !== 'approval_gate') {
    throw new Error('Run does not appear to be paused at a valid approval_gate step');
  }

  const userRole = run.workflow.organization.org_members[0]?.role;
  if (!userRole || !['owner', 'editor'].includes(userRole)) {
    throw new Error('Insufficient permissions');
  }

  // ATOMIC APPROVAL Check
  const { runAffected, stepAffected } = await atomicResumeWorkflow(runId, lastStepRun.id, userId, approved);
  
  if (runAffected === 0 || stepAffected === 0) {
    throw new Error('Approval failed: Unauthorized, invalid state, or simultaneous request');
  }

  if (!approved) {
    return { runId, status: 'failed', message: 'Approval denied' };
  }

  const steps = run.workflow.workflow_steps || [];
  const pausedStepIndex = steps.findIndex((s: any) => s.id === lastStepRun.workflow_step_id);
  if (pausedStepIndex === -1) throw new Error('Paused step not found in workflow definition');

  const orgId = run.workflow.org_id;
  let currentInput = { approved: true };

  // Resume from the next step
  for (let i = pausedStepIndex + 1; i < steps.length; i++) {
    const step = steps[i];
    
    // Create step_run
    const stepRunId = await createStepRun(runId, step.id, currentInput);
    console.log(`[Engine] Executing step ${step.position}: ${step.type}`);

    try {
      let output: any = null;

      switch (step.type) {
        case 'llm_call':
          output = await executeLlmCall(step.config, typeof currentInput === 'string' ? currentInput : JSON.stringify(currentInput));
          break;

        case 'http_request':
          output = await executeHttpRequest(step.config, currentInput);
          break;

        case 'conditional_branch':
          const conditionStr = step.config.conditionStr || '';
          const inputStr = JSON.stringify(currentInput).toLowerCase();
          const isTrue = inputStr.includes(conditionStr.toLowerCase());
          
          output = { conditionMet: isTrue };
          
          const nextPosition = isTrue ? step.config.branchIfTrue : step.config.branchIfFalse;
          if (nextPosition) {
            const nextStepIndex = steps.findIndex((s: any) => s.position === nextPosition);
            if (nextStepIndex !== -1) {
              i = nextStepIndex - 1;
            }
          }
          break;

        case 'approval_gate':
          console.log(`[Engine] Pausing at approval gate step ${step.id}`);
          await updateStepRunStatus(stepRunId, 'paused');
          await updateWorkflowRunStatus(runId, 'paused');
          return { runId, status: 'paused', message: 'Workflow paused for approval' };

        case 'db_write':
          if (userRole !== 'owner') {
            throw new Error('Only owners can execute db_write steps');
          }
          await internalDbWrite(orgId, runId, currentInput);
          output = { success: true };
          break;

        case 'notify':
          if (userRole !== 'owner') {
            throw new Error('Only owners can execute notify steps');
          }
          console.log(`[Engine] Notify: ${JSON.stringify(currentInput)}`);
          output = { notified: true };
          break;

        default:
          throw new Error(`Unknown step type: ${step.type}`);
      }

      await updateStepRunStatus(stepRunId, 'completed', output);
      currentInput = output;

    } catch (err: any) {
      console.error(`[Engine] Step ${step.id} failed:`, err.message);
      await updateStepRunStatus(stepRunId, 'failed', null, err.message);
      await updateWorkflowRunStatus(runId, 'failed', `Step ${step.position} failed: ${err.message}`);
      return { runId, status: 'failed', error: err.message };
    }
  }

  console.log(`[Engine] Workflow run ${runId} steps finished. Incrementing quota.`);
  
  const quotaGranted = await incrementQuota(orgId);
  if (!quotaGranted) {
    await updateWorkflowRunStatus(runId, 'failed', 'Quota exhausted during execution by concurrent runs');
    return { runId, status: 'failed', error: 'Quota exhausted during execution by concurrent runs' };
  }

  await updateWorkflowRunStatus(runId, 'completed');
  return { runId, status: 'completed', output: currentInput };
}
