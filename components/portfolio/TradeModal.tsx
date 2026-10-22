'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
    Modal, Stack, SegmentedControl, Select, TextInput, NumberInput, Group, Button, Text, SimpleGrid, Alert,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
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
    /** Suggested unit price in `currency`. */
    price?: number;
    quantity?: number;
}

interface GoldApiItem {
    key: string;
    buying: number;
    selling: number;
}

const DEFAULT_CURRENCY: Record<AssetType, Currency> = {
    stock: 'TRY', etf: 'USD', gold: 'TRY', forex: 'TRY', crypto: 'USD', fund: 'TRY',
};

const SYMBOL_PLACEHOLDER: Record<AssetType, string> = {
    stock: 'THYAO', etf: 'SPY', gold: '', forex: '', crypto: 'BTC', fund: 'YAY',
};

const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const numberProps = { thousandSeparator: '.', decimalSeparator: ',', hideControls: true } as const;

// --- One trade form for the whole app; any page or the command palette opens it ---

let modalState: { opened: boolean; preset?: TradePreset; key: number } = { opened: false, key: 0 };
const modalListeners = new Set<() => void>();
const CLOSED = modalState;

function setModal(next: typeof modalState) {
    modalState = next;
    modalListeners.forEach(l => l());
}

export function openTrade(preset?: TradePreset) {
    setModal({ opened: true, preset, key: modalState.key + 1 });
}

export function closeTrade() {
    setModal({ ...modalState, opened: false });
}

/** Mounted once in the app shell. */
export function TradeModalHost() {
    const { opened, preset, key } = useSyncExternalStore(
        l => { modalListeners.add(l); return () => { modalListeners.delete(l); }; },
        () => modalState,
        () => CLOSED,
    );
    return (
        <Modal opened={opened} onClose={closeTrade} title={<Text fw={600}>Yeni işlem</Text>} size={560}>
            {/* Keyed per opening, so every opening starts from a clean form. */}
            {opened && <TradeForm key={key} preset={preset} onDone={closeTrade} />}
        </Modal>
    );
}

function TradeForm({ preset, onDone }: { preset?: TradePreset; onDone: () => void }) {
    const { trades, fx, quotes } = usePortfolioState();
    const initialType = preset?.type ?? 'stock';
    const initialCurrency = preset?.currency
        ?? (initialType === 'gold' && preset?.symbol?.toLowerCase() === 'ons' ? 'USD' : DEFAULT_CURRENCY[initialType]);
    const rateFor = (c: Currency): number | string => (c === 'TRY' ? 1 : fx[c] > 0 ? Number(fx[c].toFixed(4)) : '');
    const knownPrice = (t: AssetType, sym: string) => (sym ? quotes[holdingKey(t, sym)]?.price : undefined);

    const [side, setSide] = useState<'buy' | 'sell'>(preset?.side ?? 'buy');
    const [type, setType] = useState<AssetType>(initialType);
    const [symbol, setSymbol] = useState(preset?.symbol ?? '');
    const [name, setName] = useState(preset?.name ?? '');
    const [currency, setCurrencyState] = useState<Currency>(initialCurrency);
    const [date, setDate] = useState(todayIso());
    const [quantity, setQuantity] = useState<number | string>(preset?.quantity ?? '');
    const [price, setPrice] = useState<number | string>(() => preset?.price ?? knownPrice(initialType, preset?.symbol ?? '') ?? '');
    const [fee, setFee] = useState<number | string>(0);
    const [fxRate, setFxRate] = useState<number | string>(() => rateFor(initialCurrency));
    // 22 ayar bilezik is usually bought by piece; quantity is tracked in grams.
    const [pieces, setPieces] = useState<number | string>('');
    const [gramsPerPiece, setGramsPerPiece] = useState<number | string>('');
    const [goldPrices, setGoldPrices] = useState<GoldApiItem[]>([]);
    const [errors, setErrors] = useState<string[]>([]);

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
    const fromPieces = isBilezik && Number(pieces) > 0 && Number(gramsPerPiece) > 0;
    const effectiveQty = fromPieces ? Number(pieces) * Number(gramsPerPiece) : Number(quantity) || 0;
    const held = useMemo(() => (symbol ? quantityHeld(trades, holdingKey(type, symbol)) : 0), [trades, type, symbol]);
    const goldQuote = goldPrices.find(g => g.key === symbol.toLowerCase());
    const total = effectiveQty * (Number(price) || 0);
    const totalTry = total * (currency === 'TRY' ? 1 : Number(fxRate) || 0) + (Number(fee) || 0) * (currency === 'TRY' ? 1 : Number(fxRate) || 0) * (side === 'buy' ? 1 : -1);
    const ready = symbol.trim() && name.trim() && effectiveQty > 0 && Number(price) > 0 && (currency === 'TRY' || Number(fxRate) > 0);

    const pickType = (t: AssetType) => {
        setType(t);
        setSymbol('');
        setName('');
        setPrice('');
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
        const p = knownPrice('forex', code);
        if (p) setPrice(Number(p.toFixed(4)));
    };

    const submit = () => {
        const result = portfolioActions.addTrade({
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
        if (result.length) {
            setErrors(result);
            return;
        }
        notifications.show({
            title: side === 'buy' ? 'Alış kaydedildi' : 'Satış kaydedildi',
            message: `${formatNumber(effectiveQty, 8)} × ${name || symbol}`,
            color: side === 'buy' ? 'teal' : 'red',
        });
        onDone();
    };

    return (
        <Stack gap="md">
            <SegmentedControl
                fullWidth
                size="sm"
                value={side}
                onChange={v => { setSide(v as 'buy' | 'sell'); setErrors([]); }}
                data={[{ value: 'buy', label: 'Alış' }, { value: 'sell', label: 'Satış' }]}
            />

            <SimpleGrid cols={2} spacing="sm">
                <Select
                    label="Varlık sınıfı"
                    data={ASSET_TYPES.map(t => ({ value: t, label: ASSET_TYPE_LABELS[t] }))}
                    value={type}
                    onChange={v => v && pickType(v as AssetType)}
                    allowDeselect={false}
                />
                <TextInput label="İşlem tarihi" type="date" value={date} max={todayIso()} onChange={e => setDate(e.currentTarget.value)} />
            </SimpleGrid>

            {type === 'gold' ? (
                <Select
                    label="Altın türü"
                    placeholder="Seçin"
                    data={Object.entries(GOLD_NAMES).map(([value, label]) => ({ value, label }))}
                    value={symbol.toLowerCase() || null}
                    onChange={pickGold}
                    searchable
                    description={goldQuote ? `Kuyumcu alış ${formatCurrency(goldQuote.buying)} · satış ${formatCurrency(goldQuote.selling)}` : undefined}
                />
            ) : type === 'forex' ? (
                <Select
                    label="Döviz"
                    placeholder="Seçin"
                    data={Object.entries(FOREX_NAMES).map(([value, label]) => ({ value, label: `${value} · ${label}` }))}
                    value={symbol.toUpperCase() || null}
                    onChange={pickForex}
                />
            ) : (
                <SimpleGrid cols={2} spacing="sm">
                    <TextInput
                        label="Sembol"
                        placeholder={SYMBOL_PLACEHOLDER[type]}
                        description={type === 'stock' || type === 'fund' ? 'TL ise Borsa İstanbul varsayılır' : type === 'crypto' ? 'BTC, ETH, SOL…' : ' '}
                        value={symbol}
                        onChange={e => setSymbol(e.currentTarget.value.toUpperCase().trim())}
                    />
                    <TextInput label="Varlık adı" description=" " placeholder="Türk Hava Yolları" value={name} onChange={e => setName(e.currentTarget.value)} />
                </SimpleGrid>
            )}

            {isBilezik ? (
                <SimpleGrid cols={3} spacing="sm">
                    <NumberInput label="Adet" value={pieces} onChange={setPieces} min={0} decimalScale={0} {...numberProps} />
                    <NumberInput label="Tanesi (gram)" value={gramsPerPiece} onChange={setGramsPerPiece} min={0} decimalScale={2} {...numberProps} />
                    <NumberInput label="veya toplam gram" value={fromPieces ? effectiveQty : quantity} onChange={setQuantity} min={0} decimalScale={3}
                        disabled={fromPieces} {...numberProps} />
                </SimpleGrid>
            ) : (
                <SimpleGrid cols={2} spacing="sm">
                    <NumberInput
                        label={type === 'gold' ? 'Miktar (adet / gram)' : 'Miktar'}
                        description={side === 'sell' && symbol ? `Eldeki: ${formatNumber(held, 8)}` : undefined}
                        value={quantity}
                        onChange={setQuantity}
                        min={0}
                        decimalScale={type === 'crypto' ? 8 : 4}
                        {...numberProps}
                    />
                    <NumberInput
                        label={`Birim fiyat (${currency})`}
                        description={side === 'sell' && symbol ? ' ' : undefined}
                        value={price}
                        onChange={setPrice}
                        min={0}
                        decimalScale={type === 'crypto' || type === 'fund' ? 8 : 4}
                        {...numberProps}
                    />
                </SimpleGrid>
            )}

            {isBilezik && (
                <NumberInput label="Gram fiyatı (TRY)" value={price} onChange={setPrice} min={0} decimalScale={4} {...numberProps} />
            )}

            <SimpleGrid cols={currency !== 'TRY' || (type !== 'gold' && type !== 'forex') ? 3 : 1} spacing="sm">
                {type !== 'gold' && type !== 'forex' && (
                    <Select
                        label="Para birimi"
                        data={['TRY', 'USD', 'EUR']}
                        value={currency}
                        onChange={v => v && setCurrency(v as Currency)}
                        allowDeselect={false}
                    />
                )}
                {currency !== 'TRY' && (
                    <NumberInput
                        label={`Kur (₺/${currency})`}
                        value={fxRate}
                        onChange={setFxRate}
                        min={0}
                        decimalScale={4}
                        {...numberProps}
                    />
                )}
                <NumberInput label={`Komisyon (${currency})`} value={fee} onChange={setFee} min={0} decimalScale={4} {...numberProps} />
            </SimpleGrid>

            {currency !== 'TRY' && (
                <Text size="xs" c="var(--wp-text-3)" mt={-8}>
                    TL maliyet, işlem günündeki kurla hesaplanır; böylece kur kazancı da kâr/zarara yansır.
                </Text>
            )}
            {type === 'fund' && (
                <Text size="xs" c="var(--wp-text-3)" mt={-8}>
                    TEFAS fonlarının çoğu için canlı fiyat kaynağı yok. Eklendikten sonra fiyatı portföy tablosundan güncelleyebilirsiniz.
                </Text>
            )}

            {errors.length > 0 && <Alert color="red" variant="light" p="xs">{errors.join(' ')}</Alert>}

            <Group justify="space-between" pt="sm" style={{ borderTop: '1px solid var(--wp-border)' }}>
                <div>
                    <div className="wp-label">{side === 'buy' ? 'Ödenen' : 'Alınan'} tutar</div>
                    <Text fw={600} size="lg">{formatCurrency(Math.max(0, totalTry))}</Text>
                    {currency !== 'TRY' && total > 0 && <Text size="xs" c="var(--wp-text-3)">{formatCurrency(total, currency)}</Text>}
                </div>
                <Group gap="xs">
                    <Button variant="default" onClick={onDone}>Vazgeç</Button>
                    <Button onClick={submit} disabled={!ready} color={side === 'sell' ? 'red' : undefined}>
                        {side === 'buy' ? 'Alışı kaydet' : 'Satışı kaydet'}
                    </Button>
                </Group>
            </Group>
        </Stack>
    );
}
