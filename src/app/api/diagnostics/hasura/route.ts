import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const endpoint = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN 
      ? `https://${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.nhost.run/v1/metadata`
      : 'http://localhost:8080/v1/metadata';

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET || ''
      },
      body: JSON.stringify({
        type: "export_metadata",
        args: {}
      })
    });

    const data = await res.json();
    return NextResponse.json({
      functions: data.metadata?.sources?.find((s: any) => s.name === 'default')?.functions || [],
      error: data.error || null,
      path: data.path || null
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
