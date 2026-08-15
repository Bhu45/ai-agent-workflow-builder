import { Request, Response } from 'express';
import { GraphQLClient } from 'graphql-request';

export default async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.APP_ACTION_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { orgId, runId, data } = req.body;
  
  const endpoint = process.env.NHOST_GRAPHQL_URL || 'http://localhost:8080/v1/graphql';
  const adminSecret = process.env.NHOST_ADMIN_SECRET;

  const client = new GraphQLClient(endpoint, {
    headers: { 'x-hasura-admin-secret': adminSecret || '' },
  });

  const mutation = `
    mutation InsertNotification($orgId: uuid!, $runId: uuid!, $message: String!) {
      insert_notifications_one(object: { org_id: $orgId, run_id: $runId, message: $message }) {
        id
      }
    }
  `;

  try {
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    await client.request(mutation, { orgId, runId, message });
    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('[internalNotify] Error:', err);
    return res.status(500).json({ error: 'Database execution failed' });
  }
};
