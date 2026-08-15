import { NextResponse } from 'next/server';
import { GraphQLClient } from 'graphql-request';

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
    
    // The JWT is forwarded from Hasura because forward_client_headers: true is set in actions.yaml
    const authHeader = req.headers.get('authorization');

    if (!authHeader) {
      return NextResponse.json(
        { message: 'Unable to create organization. Missing authorization.', extensions: { code: 'UNAUTHORIZED' } },
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

    const endpoint = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN 
      ? `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.graphql.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1`
      : 'http://localhost:8080/v1/graphql';

    // Use the user's forwarded JWT token. No NHOST_ADMIN_SECRET is required!
    const userClient = new GraphQLClient(endpoint, {
      headers: {
        authorization: authHeader
      }
    });

    const mutation = `
      mutation CallCreateOrgFunction($name: String!) {
        create_organization_atomic(args: { org_name: $name }) {
          id
        }
      }
    `;

    console.log('[Action] createOrganization mutation stage: EXECUTE_DB_FUNCTION');
    const data: any = await userClient.request(mutation, { name: name.trim() });
    
    const orgId = data?.create_organization_atomic?.[0]?.id;
    if (!orgId) {
      throw new Error('GraphQL transaction succeeded but returned no ID');
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
