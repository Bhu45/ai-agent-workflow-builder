import { NextResponse } from 'next/server';
import { createWorkflowRun } from '@/workflow-engine/api';

export async function POST(req: Request) {
  try {
    console.log('[Action] triggerWorkflowRun request received');
    const body = await req.json();

    // 1. Authenticate Request from Hasura
    const actionSecret = req.headers.get('x-hasura-admin-secret');
    if (actionSecret !== process.env.APP_ACTION_SECRET) {
      console.error('[Action] triggerWorkflowRun: Unauthorized. Secret mismatch.');
      return NextResponse.json(
        { message: 'Unable to start workflow. Please try again.', extensions: { code: 'UNAUTHORIZED' } },
        { status: 400 }
      );
    }

    // 2. Extract Hasura Action Payload
    const userId = body.session_variables?.['x-hasura-user-id'];
    const workflowId = body.input?.workflow_id;
    const initialInput = body.input?.initial_input || {};

    // 2. Validate Inputs
    if (!userId) {
      console.error('[Action] triggerWorkflowRun: Missing x-hasura-user-id');
      return NextResponse.json(
        { message: 'Unable to start workflow. Please try again.', extensions: { code: 'UNAUTHORIZED' } },
        { status: 400 }
      );
    }
    console.log(`[Action] Authenticated x-hasura-user-id present: ${userId}`);

    if (!workflowId) {
      console.error('[Action] triggerWorkflowRun: Missing workflow_id');
      return NextResponse.json(
        { message: 'Workflow ID is required.', extensions: { code: 'BAD_REQUEST' } },
        { status: 400 }
      );
    }
    console.log(`[Action] Workflow ID: ${workflowId}`);
    
    console.log(`[Action] triggerWorkflowRun called for workflow ${workflowId} by user ${userId}`);

    // Extract forwarded Authorization token
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.error('[Action] triggerWorkflowRun: Missing Authorization header from Hasura');
      return NextResponse.json(
        { message: 'Unable to start workflow. Please try again.', extensions: { code: 'UNAUTHORIZED' } },
        { status: 400 }
      );
    }

    const { fetchWorkflowAsUser, checkQuota } = require('@/workflow-engine/api');
    
    // 3. Enforce Quota BEFORE creating run
    const workflow = await fetchWorkflowAsUser(workflowId, authHeader);
    if (!workflow) {
      return NextResponse.json(
        { message: 'Workflow not found or unauthorized.', extensions: { code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }

    const orgId = workflow.org_id;
    const hasQuota = await checkQuota(orgId, authHeader);
    if (!hasQuota) {
      console.error(`[Action] triggerWorkflowRun: Quota exhausted for org ${orgId}`);
      return NextResponse.json(
        { message: 'Organization quota exhausted.', extensions: { code: 'QUOTA_EXHAUSTED' } },
        { status: 400 }
      );
    }

    // Create the workflow run and return immediately to prevent Action timeout.
    // Execution will be handled asynchronously by an Event Trigger on workflow_runs insert.
    console.log(`[Action] Creating workflow run for ${workflowId}...`);
    const runId = await createWorkflowRun(workflowId, initialInput, userId, authHeader);

    console.log(`[Action] Run created successfully. runId=${runId}. Returning to Hasura.`);

    return NextResponse.json({
      run_id: runId,
      status: 'running',
    });

  } catch (error: any) {
    console.error('[Action] Error in triggerWorkflowRun:', error.message || error);
    
    // Log full GraphQL error if available
    if (error.response?.errors) {
      console.error('[Action] GraphQL Error Detail:');
      error.response.errors.forEach((err: any) => {
        console.error(JSON.stringify({
          message: err.message,
          extensions: err.extensions,
          path: err.path,
          operationName: error.request?.operationName || 'unknown'
        }, null, 2));
      });
    }

    // Keep internal errors in logs, return safe generic message to client
    return NextResponse.json(
      { message: 'Unable to start workflow. Please try again.', extensions: { code: 'INTERNAL_ERROR' } },
      { status: 400 }
    );
  }
}
