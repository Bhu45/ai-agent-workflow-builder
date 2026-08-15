import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const actionSecret = req.headers.get('x-hasura-admin-secret');
    if (actionSecret !== process.env.APP_ACTION_SECRET) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const notification = payload.event?.data?.new;
    
    if (notification && notification.message) {
      console.log(`[Notification Webhook] Sent notification for Org ${notification.org_id}: ${notification.message}`);
      // In a real app, send an email or slack message here
    }

    return NextResponse.json({ status: 'ok' });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}
