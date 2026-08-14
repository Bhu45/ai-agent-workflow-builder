import type { Metadata } from 'next';
import './globals.css';
import { NhostProvider } from '@/components/NhostProvider';
import { OrganizationProvider } from '@/hooks/useOrganization';

export const metadata: Metadata = {
  title: 'AI Agent Workflow Builder',
  description: 'Multi-tenant AI Workflow Builder',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <NhostProvider>
          <OrganizationProvider>
            {children}
          </OrganizationProvider>
        </NhostProvider>
      </body>
    </html>
  );
}
