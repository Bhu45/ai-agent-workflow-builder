import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    diagnostics: {
      APP_ACTION_SECRET_CONFIGURED: !!process.env.APP_ACTION_SECRET,
      NHOST_ADMIN_SECRET_CONFIGURED: !!process.env.NHOST_ADMIN_SECRET,
      GEMINI_API_KEY_CONFIGURED: !!process.env.GEMINI_API_KEY,
      NODE_ENV: process.env.NODE_ENV,
    }
  });
}
