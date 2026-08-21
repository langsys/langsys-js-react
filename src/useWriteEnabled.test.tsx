// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { StrictMode, createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { act } from 'react';
import { writeEnabled } from 'langsys-js-typescript';
import { useWriteEnabled } from './hooks.js';

/**
 * `writeEnabled` is browser-authoritative: the base SDK only ever writes it
 * client-side, so it is `undefined` for the whole of a server render and
 * resolves some time after the client boots.
 *
 * That makes the `getServerSnapshot` argument load-bearing rather than
 * cosmetic. React uses it BOTH on the server and for the hydration render on
 * the client — so if it read the live signal, a session whose authorization
 * landed before hydration would render markup disagreeing with the server HTML
 * and React would discard the server-rendered subtree.
 *
 * These tests exercise the real sequence rather than asserting the wiring:
 * render on the "server" with the value unknown, resolve it, then hydrate.
 */

/** Renders the tri-state verbatim so `undefined` and `false` stay distinguishable. */
function Probe() {
    const enabled = useWriteEnabled();
    return createElement('span', { id: 'probe' }, String(enabled));
}

afterEach(() => {
    writeEnabled.set(undefined);
    document.body.innerHTML = '';
});

describe('useWriteEnabled', () => {
    it('reports undefined during server rendering even once the signal holds a value', () => {
        writeEnabled.set(true);
        // getServerSnapshot is pinned, so SSR output never leaks a client-only value.
        expect(renderToString(createElement(Probe))).toContain('>undefined<');
    });

    it('hydrates without mismatch when authorization resolves before hydration', async () => {
        // 1. Server render, capability genuinely unknown.
        const ssrHtml = renderToString(createElement(Probe));
        expect(ssrHtml).toContain('>undefined<');

        const container = document.createElement('div');
        container.innerHTML = ssrHtml;
        document.body.appendChild(container);
        const serverNode = container.querySelector('#probe');

        // 2. Authorization lands before the client hydrates — the race this guards.
        writeEnabled.set(true);

        // 3. Hydration must agree with the server HTML, then flip to the real value.
        const errors: unknown[] = [];
        await act(async () => {
            hydrateRoot(container, createElement(Probe), {
                onRecoverableError: (error) => errors.push(error),
            });
        });

        expect(errors).toEqual([]); // a mismatch surfaces here as a recoverable error
        expect(container.querySelector('#probe')).toBe(serverNode); // server DOM reused, not thrown away
        expect(container.querySelector('#probe')?.textContent).toBe('true'); // real value after hydration
    });

    it('keeps false and undefined distinct, and tracks later changes', async () => {
        const container = document.createElement('div');
        container.innerHTML = renderToString(createElement(Probe));
        document.body.appendChild(container);

        await act(async () => {
            hydrateRoot(container, createElement(Probe));
        });
        // Nothing has resolved yet: unknown, NOT read-only.
        expect(container.querySelector('#probe')?.textContent).toBe('undefined');

        await act(async () => {
            writeEnabled.set(false);
        });
        expect(container.querySelector('#probe')?.textContent).toBe('false');

        await act(async () => {
            writeEnabled.set(true);
        });
        expect(container.querySelector('#probe')?.textContent).toBe('true');
    });

    it('survives StrictMode double-invocation without resubscribing away its value', async () => {
        const tree = createElement(StrictMode, null, createElement(Probe));
        const container = document.createElement('div');
        container.innerHTML = renderToString(tree);
        document.body.appendChild(container);

        writeEnabled.set(true);

        // StrictMode mounts, unmounts and remounts effects; a non-stable snapshot
        // or subscribe identity would tear or loop here.
        await act(async () => {
            hydrateRoot(container, tree);
        });
        expect(container.querySelector('#probe')?.textContent).toBe('true');
    });
});
