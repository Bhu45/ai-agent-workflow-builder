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

    const mutation = `
      mutation CreateOrganization($name: String!, $userId: uuid!) {
        insert_organizations_one(object: {
          name: $name,
          org_members: {
            data: [{ user_id: $userId, role: "owner" }]
          }
        }) {
          id
        }
      }
    `;

    const data: any = await adminGraphQLClient.request(mutation, { name: name.trim(), userId });

    if (!data.insert_organizations_one?.id) {
      throw new Error('GraphQL mutation succeeded but returned no ID');
    }

    return NextResponse.json({
      id: data.insert_organizations_one.id
    });
  } catch (error: any) {
    console.error('[Action] Error creating organization:', error);
    return NextResponse.json(
      { message: 'Unable to create organization. Please try again.', extensions: { code: 'INTERNAL_ERROR' } },
      { status: 400 }
    );
  }
}
