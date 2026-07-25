import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Testbed } from './Testbed';

// Note: intentionally not wrapped in <StrictMode> so the demo's one-time
// `LangsysApp.init` isn't double-invoked in dev. Your real app should keep
// StrictMode on — the SDK tolerates the remount, it just adds dev noise here.
//
// `?testbed=1` swaps the demo for the write-gating E2E testbed (see Testbed.tsx),
// which is driven by example/e2e/write-gating.spec.ts.
const isTestbed = new URLSearchParams(window.location.search).has('testbed');
createRoot(document.getElementById('root')!).render(isTestbed ? <Testbed /> : <App />);
