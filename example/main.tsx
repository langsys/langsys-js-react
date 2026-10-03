import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Checks } from './Checks';
import { Testbed } from './Testbed';

// Note: intentionally not wrapped in <StrictMode> so the demo's one-time
// `LangsysApp.init` isn't double-invoked in dev. Your real app should keep
// StrictMode on — the SDK tolerates the remount, it just adds dev noise here.
//
// `?testbed=1` swaps the demo for the write-gating E2E testbed (see Testbed.tsx),
// which is driven by example/e2e/write-gating.mjs. `?checks=1` shows the feature checks
// against the contract double (see TESTING.md).
const query = new URLSearchParams(window.location.search);
createRoot(document.getElementById('root')!).render(
    query.has('testbed') ? <Testbed /> : query.has('checks') ? <Checks /> : <App />
);
