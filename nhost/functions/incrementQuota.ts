import { Request, Response } from 'express';
import { GraphQLClient } from 'graphql-request';

export default async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.APP_ACTION_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { orgId } = req.body;
  if (!orgId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const endpoint = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN 
    ? `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.graphql.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1`
    : 'http://localhost:8080/v1/graphql';
    
  const adminSecret = process.env.NHOST_ADMIN_SECRET;
  if (!adminSecret) return res.status(500).json({ error: 'Misconfig' });

  const client = new GraphQLClient(endpoint, {
    headers: { 'x-hasura-admin-secret': adminSecret },
  });

  const mutation = `
    mutation IncrementQuota($orgId: uuid!) {
      update_organizations(
        where: { id: { _eq: $orgId }, quota_used: { _lt: quota_limit } },
        _inc: { quota_used: 1 }
      ) {
        affected_rows
      }
    }
  `;

  try {
    const data: any = await client.request(mutation, { orgId });
    return res.status(200).json({ success: data.update_organizations.affected_rows > 0 });
  } catch (err: any) {
    console.error('Error incrementing quota:', err.message || err);
    return res.status(500).json({ error: 'DB execution failed' });
  }
};
