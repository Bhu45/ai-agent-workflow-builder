import { Request, Response } from 'express';
import { GraphQLClient } from 'graphql-request';

export default async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.APP_ACTION_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { stepRunId, status, output, error } = req.body;
  if (!stepRunId || !status) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const endpoint = process.env.NHOST_GRAPHQL_URL || 'http://localhost:8080/v1/graphql';
    
  const adminSecret = process.env.NHOST_ADMIN_SECRET;
  if (!adminSecret) return res.status(500).json({ error: 'Misconfig' });

  const client = new GraphQLClient(endpoint, {
    headers: { 'x-hasura-admin-secret': adminSecret },
  });

  const completedAt = ['completed', 'failed', 'skipped'].includes(status) ? '"now()"' : 'null';

  const mutation = `
    mutation UpdateStepRun($stepRunId: uuid!, $status: run_statuses_enum!, $output: jsonb, $error: String) {
      update_step_runs_by_pk(
        pk_columns: { id: $stepRunId },
        _set: { 
          status: $status, 
          output: $output, 
          error: $error,
          completed_at: ${completedAt}
        }
      ) { id }
    }
  `;

  try {
    const enumStatus = status.toUpperCase();
    const data: any = await client.request(mutation, { stepRunId, status: enumStatus, output, error });
    return res.status(200).json({ id: data.update_step_runs_by_pk?.id });
  } catch (err: any) {
    if (err.response && err.response.errors) {
      console.error('[updateStepRun.ts] GraphQL Error:', JSON.stringify(err.response.errors, null, 2));
    } else {
      console.error('[updateStepRun.ts] Execution Error:', err.message || err);
    }
    return res.status(500).json({ error: 'Database execution failed' });
  }
};
