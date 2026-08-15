import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const endpoint = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN 
      ? `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.graphql.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1`
      : 'http://localhost:8080/v1/graphql';

    const query = `
      query IntrospectionQuery {
        __type(name: "mutation_root") {
          fields {
            name
          }
        }
      }
    `;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify({ query })
    });

    const data = await res.json();
    
    if (data.errors) {
      console.error('[Diagnostic] Hasura Introspection Errors:', data.errors);
      return NextResponse.json({ success: false, error: 'Introspection failed', details: data.errors });
    }

    const fields = data.data?.__type?.fields || [];
    const hasFunction = fields.some((f: any) => f.name === 'create_organization_atomic');

    return NextResponse.json({
      success: true,
      has_create_organization_atomic: hasFunction
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
