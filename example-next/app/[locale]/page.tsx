import { Client } from '../Client';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    return (
        <main>
            <Client locale={locale} />
        </main>
    );
}
