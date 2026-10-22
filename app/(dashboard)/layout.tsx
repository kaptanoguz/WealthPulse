import AppLayout from '@/components/layout/AppLayout';
import AiChatWidget from '@/components/ui/AiChatWidget';
import { FEATURES } from '@/lib/features';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <AppLayout>
            {children}
            {FEATURES.aiChat && <AiChatWidget />}
        </AppLayout>
    );
}
