'use client';

// ============================================================
// WealthPulse — Shared layout & data-display primitives
// ============================================================

import { Group, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import { formatCurrency } from '@/lib/format';

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
    return (
        <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm" mb="lg">
            <div>
                <Title order={1}>{title}</Title>
                {description && <Text size="sm" c="var(--wp-text-2)" mt={4}>{description}</Text>}
            </div>
            {actions && <Group gap="xs">{actions}</Group>}
        </Group>
    );
}

export function Panel({
    title, actions, children, padded = true, className, style,
}: {
    title?: ReactNode;
    actions?: ReactNode;
    children: ReactNode;
    padded?: boolean;
    className?: string;
    style?: React.CSSProperties;
}) {
    return (
        <section className={`wp-panel${className ? ` ${className}` : ''}`} style={style}>
            {(title || actions) && (
                <div className="wp-panel-header">
                    <div className="wp-panel-title">{title}</div>
                    {actions && <Group gap={6} wrap="nowrap">{actions}</Group>}
                </div>
            )}
            {padded ? <div className="wp-panel-body">{children}</div> : children}
        </section>
    );
}

export type Tone = 'pos' | 'neg' | 'neutral' | 'warn';

export function toneOf(value: number | null | undefined): Tone {
    if (value === null || value === undefined || value === 0 || !Number.isFinite(value)) return 'neutral';
    return value > 0 ? 'pos' : 'neg';
}

export const toneColor = (tone: Tone) =>
    tone === 'pos' ? 'var(--wp-pos)' : tone === 'neg' ? 'var(--wp-neg)' : tone === 'warn' ? 'var(--wp-warn)' : undefined;

export interface StatItem {
    label: string;
    value: ReactNode;
    tone?: Tone;
    sub?: ReactNode;
    subTone?: Tone;
}

export function StatStrip({ items }: { items: StatItem[] }) {
    return (
        <div className="wp-panel">
            <div className="wp-stats" style={{ '--wp-stats-cols': items.length } as React.CSSProperties}>
                {items.map(item => (
                    <div className="wp-stat" key={item.label}>
                        <div className="wp-label">{item.label}</div>
                        <div className="wp-stat-value" style={{ color: toneColor(item.tone ?? 'neutral') }}>{item.value}</div>
                        {item.sub !== undefined && item.sub !== null && (
                            <div className="wp-stat-sub" style={{ color: toneColor(item.subTone ?? 'neutral') }}>{item.sub}</div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Colored number; `children` is the already formatted value. */
export function Signed({ value, children, size }: { value: number | null | undefined; children: ReactNode; size?: string }) {
    return <Text span inherit={!size} size={size} c={toneColor(toneOf(value))}>{children}</Text>;
}

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
    return (
        <Stack align="center" gap={6} py={48} px="md">
            <Text fw={600}>{title}</Text>
            {description && <Text size="sm" c="var(--wp-text-2)" ta="center" maw={460}>{description}</Text>}
            {action && <div style={{ marginTop: 10 }}>{action}</div>}
        </Stack>
    );
}

// --- Charts ------------------------------------------------------------------

export const SERIES_COLORS = ['var(--wp-c1)', 'var(--wp-c2)', 'var(--wp-c3)', 'var(--wp-c4)', 'var(--wp-c5)', 'var(--wp-c6)'];

export const axisProps = {
    axisLine: false,
    tickLine: false,
    tickMargin: 8,
} as const;

interface TooltipEntry {
    name?: string | number;
    value?: unknown;
    color?: string;
    dataKey?: unknown;
    /** The data row this entry belongs to. */
    payload?: unknown;
}

/**
 * Recharts tooltip content. `rows` maps a payload entry to label/value, or
 * null to hide it.
 */
export function ChartTooltip({
    active, payload, label, title, rows,
}: {
    active?: boolean;
    payload?: TooltipEntry[];
    label?: unknown;
    title?: (label: unknown) => ReactNode;
    rows?: (entry: TooltipEntry) => { label: ReactNode; value: ReactNode; color?: string } | null;
}) {
    if (!active || !payload?.length) return null;
    const render = rows ?? ((e: TooltipEntry) => ({ label: String(e.name ?? ''), value: formatCurrency(Number(e.value)), color: e.color }));
    return (
        <div className="wp-chart-tooltip">
            <div className="wp-faint" style={{ fontSize: 11 }}>{title ? title(label) : String(label ?? '')}</div>
            {payload.map((e, i) => {
                const r = render(e);
                if (!r) return null;
                return (
                    <div className="wp-chart-tooltip-row" key={i}>
                        <span className="wp-muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {r.color && <span className="wp-dot" style={{ background: r.color }} />}
                            {r.label}
                        </span>
                        <span style={{ fontWeight: 600 }}>{r.value}</span>
                    </div>
                );
            })}
        </div>
    );
}

// --- Status pill ---------------------------------------------------------------

/**
 * Small dot-marked status label. Deliberately never green or red: those mean
 * gain and loss everywhere else in the app.
 */
export function Pill({ tone = 'neutral', children, title }: { tone?: 'neutral' | 'accent' | 'warn'; children: ReactNode; title?: string }) {
    return (
        <span className={`wp-pill wp-pill-${tone}`} title={title}>
            <span className="wp-pill-dot" />
            {children}
        </span>
    );
}
