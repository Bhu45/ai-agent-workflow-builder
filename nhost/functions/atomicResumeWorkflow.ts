import { Request, Response } from 'express';
import { GraphQLClient } from 'graphql-request';

export default async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.APP_ACTION_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { runId, stepRunId, userId, approved } = req.body;
  if (!runId || !stepRunId || !userId || approved === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const endpoint = process.env.NHOST_GRAPHQL_URL || 'http://localhost:8080/v1/graphql';
    
  const adminSecret = process.env.NHOST_ADMIN_SECRET;
  if (!adminSecret) return res.status(500).json({ error: 'Misconfig' });

  const client = new GraphQLClient(endpoint, {
    headers: { 'x-hasura-admin-secret': adminSecret },
  });

  const runStatus = approved ? "running" : "failed";
  const stepStatus = approved ? "completed" : "failed";
  const output = {
    approved,
    approved_by: userId,
    approved_at: new Date().toISOString()
  };

  const mutation = `
    mutation AtomicApprove(
      $runId: uuid!, 
      $stepRunId: uuid!, 
      $userId: uuid!, 
      $runStatus: run_statuses_enum!, 
      $stepStatus: run_statuses_enum!,
      $output: jsonb!
    ) {
      update_workflow_runs(
        where: { 
          id: { _eq: $runId }, 
          status: { _eq: "paused" },
          workflow: {
            organization: {
              org_members: {
                user_id: { _eq: $userId },
                role: { _in: ["owner", "editor"] }
              }
            }
          }
        },
        _set: { status: $runStatus }
      ) {
        affected_rows
      }
      
      update_step_runs(
        where: {
          id: { _eq: $stepRunId },
          status: { _eq: "paused" },
          workflow_step: { type: { _eq: "approval_gate" } }
        },
        _set: {
          status: $stepStatus,
          output: $output,
          completed_at: "now()"
        }
      ) {
        affected_rows
      }
    }
  `;

  try {
    const data: any = await client.request(mutation, {
      runId, stepRunId, userId, runStatus, stepStatus, output
    });

    return res.status(200).json({
      runAffected: data.update_workflow_runs?.affected_rows || 0,
      stepAffected: data.update_step_runs?.affected_rows || 0
    });
  } catch (err: any) {
    if (err.response && err.response.errors) {
      const errorMsg = JSON.stringify(err.response.errors, null, 2);
      console.error('[atomicResumeWorkflow.ts] GraphQL Error:', errorMsg);
      return res.status(500).json({ error: 'Database execution failed: ' + errorMsg });
    } else {
      const errorMsg = err.message || err;
      console.error('[atomicResumeWorkflow.ts] Execution Error:', errorMsg);
      return res.status(500).json({ error: 'Database execution failed: ' + errorMsg });
    }
  }
};
