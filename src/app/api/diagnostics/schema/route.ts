import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const endpoint = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN 
      ? `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.graphql.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run/v1`
      : 'http://localhost:8080/v1/graphql';

    // Introspection query to check if create_organization_atomic is in mutation_root
    // We test as the 'user' role!
    const query = `
      query IntrospectionQuery {
        __type(name: "mutation_root") {
          name
          fields(includeDeprecated: true) {
            name
          }
        }
      }
    `;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET || '',
        'x-hasura-role': 'user',
        'x-hasura-user-id': '00000000-0000-0000-0000-000000000000'
      },
      body: JSON.stringify({ query })
    });

    const data = await res.json();
    
    if (data.errors) {
      return NextResponse.json({ success: false, errors: data.errors });
    }

    const fields = data.data?.__type?.fields || [];
    const hasFunction = fields.some((f: any) => f.name === 'create_organization_atomic');

    return NextResponse.json({
      success: true,
      has_create_organization_atomic_mutation: hasFunction,
      role_tested: 'user',
      fields_available: fields.map((f: any) => f.name)
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
