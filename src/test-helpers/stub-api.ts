import { vi } from 'vitest';

/**
 * A stand-in for the API's transport, for tests whose clause is about what the SDK sends or does
 * in-process, never about what a server stored: it answers every request from `fetch` itself,
 * with no listening socket, so it runs wherever `npm test` does. It records every request, and
 * nothing it answers is evidence of what a real API does (spec CONF-1, CONF-2): a test that needs
 * an answer to assert on is a contract test.
 */
export const STUB_API_URL = 'https://api.stub.invalid/api';

export interface RecordedRequest {
    method: string;
    path: string;
    body: any;
}

export interface StubbedApi {
    requests: RecordedRequest[];
    /** The items every registration request carried, in the order sent. */
    items(): Array<Record<string, unknown>>;
    restore(): void;
}

const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

/**
 * `catalog` is what a catalog read answers, by locale then category: the stand-in's own content,
 * which a test sets so the core has something to render from.
 */
export function stubApi({
    writeEnabled = true,
    catalog = {},
}: { writeEnabled?: boolean; catalog?: Record<string, Record<string, unknown>> } = {}): StubbedApi {
    const requests: RecordedRequest[] = [];
    const authorization = {
        key_type: writeEnabled ? 'write' : 'read',
        write_enabled: writeEnabled,
        auto_discovery: false,
        langsys_settings: { translatable_items: { batch_limit: 200 } },
    };
    const answer = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = new URL(String(input instanceof Request ? input.url : input));
        const path = url.pathname.replace(/^\/api\//, '');
        const method = init?.method ?? 'GET';
        requests.push({ method, path, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
        if (path.startsWith('authorize-project/')) return json({ status: true, ...authorization, data: authorization });
        if (path === 'translations')
            return json({
                status: true,
                write_enabled: writeEnabled,
                data: catalog[url.searchParams.get('locale') ?? ''] ?? {},
            });
        if (path === 'discovery/hint') return new Response(null, { status: 204 });
        return json({ status: true, data: {} });
    };
    vi.stubGlobal('fetch', answer);
    return {
        requests,
        items: () =>
            requests
                .filter((r) => r.method === 'POST' && r.path === 'translatable-items')
                .flatMap((r) => (r.body?.translatable_items ?? []) as Array<Record<string, unknown>>),
        restore: () => vi.unstubAllGlobals(),
    };
}
