// ============================================================
// WealthPulse AI — Mock Data
// Canned content for the AI chat widget, which is switched off in lib/features.ts.
// ============================================================

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
}

// AI chat initial messages
export const initialChatMessages: ChatMessage[] = [
    {
        id: 'msg1',
        role: 'assistant',
        content: '👋 Merhaba! Ben WealthPulse AI Danışmanınızım. Portföyünüz hakkında sorularınızı yanıtlayabilir, piyasa analizi yapabilir ve yatırım stratejileri hakkında bilgi verebilirim.\n\n**Not:** Verdiğim bilgiler yatırım tavsiyesi niteliğinde değildir.',
        timestamp: new Date().toISOString(),
    },
];

// Format helpers (moved to lib/format.ts)
export { formatCurrency, formatPercent, formatNumber } from './format';
