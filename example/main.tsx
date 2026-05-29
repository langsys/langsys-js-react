import { createRoot } from 'react-dom/client';
import { App } from './App';

// Note: intentionally not wrapped in <StrictMode> so the demo's one-time
// `LangsysApp.init` isn't double-invoked in dev. Your real app should keep
// StrictMode on — the SDK tolerates the remount, it just adds dev noise here.
createRoot(document.getElementById('root')!).render(<App />);
