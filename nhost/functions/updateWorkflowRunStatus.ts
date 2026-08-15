import { Request, Response } from 'express';
import { GraphQLClient } from 'graphql-request';

export default async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.APP_ACTION_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { runId, status, error } = req.body;
  if (!runId || !status) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const endpoint = process.env.NHOST_GRAPHQL_URL || 'http://localhost:8080/v1/graphql';
    
  const adminSecret = process.env.NHOST_ADMIN_SECRET;
  if (!adminSecret) return res.status(500).json({ error: 'Misconfig' });

  const client = new GraphQLClient(endpoint, {
    headers: { 'x-hasura-admin-secret': adminSecret },
  });

  const completedAt = ['completed', 'failed'].includes(status) ? '"now()"' : 'null';

  const mutation = `
    mutation UpdateRun($runId: uuid!, $status: String!, $error: String) {
      update_workflow_runs_by_pk(
        pk_columns: { id: $runId },
        _set: { 
          status: $status, 
          error: $error,
          completed_at: ${completedAt}
        }
      ) { id }
    }
  `;

  try {
    const data: any = await client.request(mutation, { runId, status, error });
    return res.status(200).json({ id: data.update_workflow_runs_by_pk?.id });
  } catch (err: any) {
    if (err.response && err.response.errors) {
      console.error('[updateWorkflowRunStatus.ts] GraphQL Error:', JSON.stringify(err.response.errors, null, 2));
    } else {
      console.error('[updateWorkflowRunStatus.ts] Execution Error:', err.message || err);
    }
    return res.status(500).json({ error: 'Database execution failed' });
  }
};
