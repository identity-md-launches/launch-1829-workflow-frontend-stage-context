import React from 'react';
import ReactDOM from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/space-grotesk';
import './styles.css';
import { loadRuntime } from './config';
import { App } from './App';
const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <div className="boot">
    <h1>Beg the Swarm.</h1>
    <p>Verifying deployment…</p>
  </div>,
);
loadRuntime()
  .then((rt) =>
    root.render(
      <React.StrictMode>
        <WagmiProvider config={rt.wagmi}>
          <QueryClientProvider
            client={
              new QueryClient({
                defaultOptions: {
                  queries: { retry: 1, refetchOnWindowFocus: false },
                },
              })
            }
          >
            <App rt={rt} />
          </QueryClientProvider>
        </WagmiProvider>
      </React.StrictMode>,
    ),
  )
  .catch((error) =>
    root.render(
      <main className="boot">
        <h1>Beg the Swarm.</h1>
        <p role="alert">
          {error instanceof Error
            ? error.message
            : 'Deployment could not be loaded.'}
        </p>
        <button onClick={() => location.reload()}>Reload configuration</button>
      </main>,
    ),
  );
