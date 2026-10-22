import { notFound } from 'next/navigation';
import { FEATURES } from '@/lib/features';

export default function ModuleLayout({ children }: { children: React.ReactNode }) {
    if (!FEATURES.reports) notFound();
    return children;
}
