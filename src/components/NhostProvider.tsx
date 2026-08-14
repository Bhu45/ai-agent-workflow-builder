'use client';

import { NhostProvider as Provider } from '@nhost/nextjs';
import { NhostApolloProvider } from '@nhost/react-apollo';
import { nhost } from '../lib/nhost';

export function NhostProvider({ children }: { children: React.ReactNode }) {
  return (
    <Provider nhost={nhost}>
      <NhostApolloProvider nhost={nhost}>
        {children}
      </NhostApolloProvider>
    </Provider>
  );
}
