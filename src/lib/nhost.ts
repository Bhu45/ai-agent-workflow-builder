import { NhostClient } from '@nhost/nextjs';

// We use NEXT_PUBLIC_NHOST_SUBDOMAIN and NEXT_PUBLIC_NHOST_REGION
// If neither are set, we can fallback to localhost or just leave it empty so it errors out clearly if not configured.
const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;
const region = process.env.NEXT_PUBLIC_NHOST_REGION;

export const nhost = new NhostClient({
  subdomain: subdomain || 'localhost',
  region: region || '',
});
