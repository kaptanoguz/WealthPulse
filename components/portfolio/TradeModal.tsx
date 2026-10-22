'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    Modal, Stack, SegmentedControl, Select, TextInput, NumberInput, Group, Button, Text, Paper, Alert,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconInfoCircle } from '@tabler/icons-react';
import {
    AssetType, Currency, ASSET_TYPE_LABELS, ASSET_TYPES, GOLD_NAMES, FOREX_NAMES, holdingKey, quantityHeld,
} from '@/lib/portfolio';
import { portfolioActions, usePortfolioState } from '@/lib/portfolio-store';
import { formatCurrency, formatNumber } from '@/lib/format';

export interface TradePreset {
    side?: 'buy' | 'sell';
    type?: AssetType;
    symbol?: string;
    name?: string;
    currency?: Currency;
}

interface GoldApiItem {
    key: string;
    buying: number;
    selling: number;
}

const DEFAULT_CURRENCY: Record<AssetType, Currency> = {
    stock: 'TRY', etf: 'USD', gold: 'TRY', forex: 'TRY', crypto: 'USD', fund: 'TRY',
};

const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function TradeModal({ opened, onClose, preset }: { opened: boolean; onClose: () => void; preset?: TradePreset }) {
    return (
        <Modal opened={opened} onClose={onClose} title="İşlem Ekle" size="lg" centered
            styles={{ header: { background: 'var(--wp-bg-card)', borderBottom: '1px solid var(--wp-border)' }, body: { background: 'var(--wp-bg-card)' } }}
        >
            {/* Mounted only while open, so every opening starts from a clean form. */}
            {opened && <TradeForm preset={preset} onDone={onClose} />}
        </Modal>
    );
}

function TradeForm({ preset, onDone }: { preset?: TradePreset; onDone: () => void }) {
    const { trades, fx } = usePortfolioState();
    const initialType = preset?.type ?? 'stock';
    const initialCurrency = preset?.currency
        ?? (initialType === 'gold' && preset?.symbol?.toLowerCase() === 'ons' ? 'USD' : DEFAULT_CURRENCY[initialType]);
    const rateFor = (c: Currency): number | string => (c === 'TRY' ? 1 : fx[c] > 0 ? Number(fx[c].toFixed(4)) : '');

    const [side, setSide] = useState<'buy' | 'sell'>(preset?.side ?? 'buy');
    const [type, setType] = useState<AssetType>(initialType);
    const [symbol, setSymbol] = useState(preset?.symbol ?? '');
    const [name, setName] = useState(preset?.name ?? '');
    const [currency, setCurrencyState] = useState<Currency>(initialCurrency);
    const [date, setDate] = useState(todayIso());
    const [quantity, setQuantity] = useState<number | string>('');
    const [price, setPrice] = useState<number | string>('');
    const [fee, setFee] = useState<number | string>(0);
    const [fxRate, setFxRate] = useState<number | string>(() => rateFor(initialCurrency));
    // 22 ayar bilezik is usually bought by piece; quantity is tracked in grams.
    const [pieces, setPieces] = useState<number | string>('');
    const [gramsPerPiece, setGramsPerPiece] = useState<number | string>('');
    const [goldPrices, setGoldPrices] = useState<GoldApiItem[]>([]);

    const setCurrency = (c: Currency) => {
        setCurrencyState(c);
        setFxRate(rateFor(c));
    };

    useEffect(() => {
        if (type !== 'gold' || goldPrices.length) return;
        fetch('/api/gold')
            .then(r => (r.ok ? r.json() : null))
            .then(j => setGoldPrices(Array.isArray(j?.data) ? j.data : []))
            .catch(() => { /* manual entry still works */ });
    }, [type, goldPrices.length]);

    const isBilezik = type === 'gold' && symbol.toLowerCase() === '22-ayar-bilezik';
    const effectiveQty = isBilezik && Number(pieces) > 0 && Number(gramsPerPiece) > 0
        ? Number(pieces) * Number(gramsPerPiece)
        : Number(quantity);

    const held = useMemo(
        () => (symbol ? quantityHeld(trades, holdingKey(type, symbol)) : 0),
        [trades, type, symbol],
    );

    const goldQuote = goldPrices.find(g => g.key === symbol.toLowerCase());
    const total = effectiveQty * Number(price || 0);

    const pickType = (t: AssetType) => {
        setType(t);
        setSymbol('');
        setName('');
        setCurrency(DEFAULT_CURRENCY[t]);
    };

    const pickGold = (key: string | null) => {
        if (!key) return;
        setSymbol(key);
        setName(GOLD_NAMES[key]);
        setCurrency(key === 'ons' ? 'USD' : 'TRY');
        const g = goldPrices.find(x => x.key === key);
        // You buy at the jeweller's "satış" price and sell at "alış".
        if (g) setPrice(side === 'buy' ? g.selling : g.buying);
    };

    const pickForex = (code: string | null) => {
        if (!code) return;
        setSymbol(code);
        setName(FOREX_NAMES[code]);
        setCurrency('TRY');
    };

    const submit = () => {
        const errors = portfolioActions.addTrade({
            date,
            side,
            type,
            symbol: symbol.trim(),
            name: name.trim(),
            quantity: effectiveQty,
            price: Number(price),
            currency,
            fxRate: currency === 'TRY' ? 1 : Number(fxRate),
            fee: Number(fee) || 0,
        });
        if (errors.length) {
            notifications.show({ title: 'İşlem kaydedilmedi', message: errors.join(' '), color: 'red' });
            return;
        }
        notifications.show({
            title: side === 'buy' ? 'Alış kaydedildi' : 'Satış kaydedildi',
            message: `${formatNumber(effectiveQty, 6)} ${name || symbol}`,
            color: 'green',
        });
        onDone();
    };

    return (
        <Stack gap="sm" mt="sm">
            <SegmentedControl
                fullWidth
                value={side}
                onChange={v => setSide(v as 'buy' | 'sell')}
                data={[{ value: 'buy', label: 'Alış' }, { value: 'sell', label: 'Satış' }]}
                color={side === 'buy' ? 'teal' : 'red'}
            />

            <Group grow>
                <Select
                    label="Varlık türü"
                    data={ASSET_TYPES.map(t => ({ value: t, label: ASSET_TYPE_LABELS[t] }))}
                    value={type}
                    onChange={v => v && pickType(v as AssetType)}
                    allowDeselect={false}
                />
                <TextInput label="Tarih" type="date" value={date} max={todayIso()} onChange={e => setDate(e.currentTarget.value)} required />
            </Group>

            {type === 'gold' ? (
                <Select
                    label="Altın türü"
                    placeholder="Seçin…"
                    data={Object.entries(GOLD_NAMES).map(([value, label]) => ({ value, label }))}
                    value={symbol.toLowerCase() || null}
                    onChange={pickGold}
                    searchable
                    required
                />
            ) : type === 'forex' ? (
                <Select
                    label="Döviz"
                    placeholder="Seçin…"
                    data={Object.entries(FOREX_NAMES).map(([value, label]) => ({ value, label: `${value} — ${label}` }))}
                    value={symbol.toUpperCase() || null}
                    onChange={pickForex}
                    required
                />
            ) : (
                <Group grow align="flex-start">
                    <TextInput
                        label="Sembol"
                        placeholder={type === 'crypto' ? 'BTC' : type === 'etf' ? 'SPY' : type === 'fund' ? 'YAY' : 'THYAO'}
                        description={type === 'stock' || type === 'fund' ? 'TL ise Borsa İstanbul varsayılır' : undefined}
                        value={symbol}
                        onChange={e => setSymbol(e.currentTarget.value.toUpperCase())}
                        required
                    />
                    <TextInput label="Varlık adı" placeholder="Türk Hava Yolları" value={name} onChange={e => setName(e.currentTarget.value)} required />
                </Group>
            )}

            {side === 'sell' && symbol && (
                <Text size="xs" c={held > 0 ? 'dimmed' : 'red'}>
                    Eldeki miktar: {formatNumber(held, 6)}
                </Text>
            )}

            {isBilezik ? (
                <Group grow>
                    <NumberInput label="Bilezik adedi" value={pieces} onChange={setPieces} min={0} decimalScale={0} />
                    <NumberInput label="Tanesi kaç gram" value={gramsPerPiece} onChange={setGramsPerPiece} min={0} decimalScale={2} />
                    <NumberInput label="veya toplam gram" value={quantity} onChange={setQuantity} min={0} decimalScale={3}
                        disabled={Number(pieces) > 0 && Number(gramsPerPiece) > 0} />
                </Group>
            ) : (
                <NumberInput
                    label={type === 'gold' ? 'Miktar (adet / gram)' : 'Miktar'}
                    value={quantity}
                    onChange={setQuantity}
                    min={0}
                    decimalScale={type === 'crypto' ? 8 : 4}
                    thousandSeparator="."
                    decimalSeparator=","
                    required
                />
            )}

            <Group grow align="flex-start">
                <NumberInput
                    label={`Birim fiyat (${currency})`}
                    description={goldQuote ? `Kuyumcu: alış ${formatCurrency(goldQuote.buying)} · satış ${formatCurrency(goldQuote.selling)}` : undefined}
                    value={price}
                    onChange={setPrice}
                    min={0}
                    decimalScale={type === 'crypto' ? 8 : 4}
                    thousandSeparator="."
                    decimalSeparator=","
                    required
                />
                {type !== 'gold' && type !== 'forex' && (
                    <Select
                        label="Para birimi"
                        data={['TRY', 'USD', 'EUR']}
                        value={currency}
                        onChange={v => v && setCurrency(v as Currency)}
                        allowDeselect={false}
                    />
                )}
            </Group>

            <Group grow align="flex-start">
                <NumberInput label={`Komisyon (${currency})`} value={fee} onChange={setFee} min={0} decimalScale={4} />
                {currency !== 'TRY' && (
                    <NumberInput
                        label={`İşlem günü kuru (₺ / ${currency})`}
                        description="TL bazlı maliyet bu kurla hesaplanır"
                        value={fxRate}
                        onChange={setFxRate}
                        min={0}
                        decimalScale={4}
                        required
                    />
                )}
            </Group>

            {total > 0 && (
                <Paper p="sm" radius="md" style={{ background: 'var(--wp-bg-secondary)' }}>
                    <Group justify="space-between">
                        <Text size="sm" c="dimmed">İşlem tutarı</Text>
                        <Text fw={700}>
                            {formatCurrency(total, currency)}
                            {currency !== 'TRY' && Number(fxRate) > 0 && (
                                <Text span c="dimmed" size="xs"> ≈ {formatCurrency(total * Number(fxRate))}</Text>
                            )}
                        </Text>
                    </Group>
                </Paper>
            )}

            {type === 'fund' && (
                <Alert variant="light" color="blue" icon={<IconInfoCircle size={16} />} p="xs">
                    TEFAS fonlarının çoğu için canlı fiyat kaynağı yok; eklendikten sonra fiyatı tablodan elle güncelleyebilirsiniz.
                </Alert>
            )}

            <Button onClick={submit} fullWidth mt="xs" color={side === 'buy' ? 'teal' : 'red'}>
                {side === 'buy' ? 'Alışı Kaydet' : 'Satışı Kaydet'}
            </Button>
        </Stack>
    );
}
