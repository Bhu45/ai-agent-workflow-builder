import { NextResponse } from 'next/server';
import { adminGraphQLClient } from '@/workflow-engine/api';

export async function POST(req: Request) {
  try {
    const actionSecret = req.headers.get('x-hasura-admin-secret');
    if (actionSecret !== process.env.APP_ACTION_SECRET) {
      return NextResponse.json(
        { message: 'Unable to create organization. Please try again.', extensions: { code: 'UNAUTHORIZED' } },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { name } = body.input || {};
    const sessionVars = body.session_variables || {};
    const userId = sessionVars['x-hasura-user-id'];

    if (!userId) {
      return NextResponse.json(
        { message: 'Unable to create organization. Please try again.', extensions: { code: 'UNAUTHORIZED' } },
        { status: 400 }
      );
    }
    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { message: 'Organization name is required.', extensions: { code: 'BAD_REQUEST' } },
        { status: 400 }
      );
    }

    console.log('[Action] createOrganization mutation stage: START');

    // Generate a UUID server-side to enable a flat multi-mutation transaction in Hasura.
    // This avoids nested-insert schema compatibility issues while guaranteeing atomic rollback.
    const orgId = crypto.randomUUID();

    const mutation = `
      mutation CreateOrgTransaction($orgId: uuid!, $name: String!, $userId: uuid!) {
        insert_organizations_one(object: { id: $orgId, name: $name }) {
          id
        }
        insert_org_members_one(object: { org_id: $orgId, user_id: $userId, role: "owner" }) {
          id
        }
      }
    `;

    console.log('[Action] createOrganization mutation stage: EXECUTE_TRANSACTION');
    const data: any = await adminGraphQLClient.request(mutation, { 
      orgId, 
      name: name.trim(), 
      userId 
    });
    
    if (!data?.insert_organizations_one?.id || !data?.insert_org_members_one?.id) {
      throw new Error('GraphQL transaction succeeded but returned incomplete IDs');
    }

    console.log('[Action] createOrganization mutation stage: COMPLETE');

    return NextResponse.json({
      id: orgId
    });
  } catch (error: any) {
    console.error('[Action] Error creating organization (Diagnostic):');
    if (error.response?.errors) {
      console.error('[Action] Hasura Errors:', JSON.stringify(error.response.errors.map((e: any) => ({
        message: e.message,
        extensions: e.extensions
      }))));
    } else {
      console.error('[Action] Non-GraphQL Error:', error.message);
    }
    return NextResponse.json(
      { message: 'Unable to create organization. Please try again.', extensions: { code: 'INTERNAL_ERROR' } },
      { status: 400 }
    );
  }
}
