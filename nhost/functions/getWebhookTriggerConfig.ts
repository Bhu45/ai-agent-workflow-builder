import { Request, Response } from 'express';
import { GraphQLClient } from 'graphql-request';

export default async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.APP_ACTION_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { workflowId } = req.body;
  if (!workflowId) return res.status(400).json({ error: 'Missing required fields' });

  const endpoint = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN 
    ? `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.graphql.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1`
    : 'http://localhost:8080/v1/graphql';
    
  const adminSecret = process.env.NHOST_ADMIN_SECRET;
  if (!adminSecret) return res.status(500).json({ error: 'Misconfig' });

  const client = new GraphQLClient(endpoint, {
    headers: { 'x-hasura-admin-secret': adminSecret },
  });

  const query = `
    query GetWebhookTrigger($workflowId: uuid!) {
      workflow_triggers(where: { workflow_id: { _eq: $workflowId }, type: { _eq: "webhook" }, enabled: { _eq: true } }) {
        id
        config
        workflow {
          organization {
            id
          }
        }
      }
    }
  `;

  try {
    const data: any = await client.request(query, { workflowId });
    return res.status(200).json(data.workflow_triggers[0] || null);
  } catch (err: any) {
    console.error('Error fetching webhook config:', err.message || err);
    return res.status(500).json({ error: 'DB execution failed' });
  }
};
