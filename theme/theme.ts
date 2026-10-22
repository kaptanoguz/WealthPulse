'use client';

import { createTheme, MantineColorsTuple } from '@mantine/core';

// Restrained blue used for primary actions, focus and the main data series.
const accent: MantineColorsTuple = [
    '#eaf1ff',
    '#d3e1fd',
    '#a6c1f8',
    '#76a0f3',
    '#4f84ee',
    '#3873ec',
    '#2c6aeb',
    '#1f59d1',
    '#164fbc',
    '#0044a6',
];

// Neutral greys for the dark scheme; Mantine reads inputs, menus and modals from these.
const dark: MantineColorsTuple = [
    '#e6e8eb',
    '#c1c7cd',
    '#9aa3ad',
    '#6b7480',
    '#2e343d',
    '#232830',
    '#181c22',
    '#12151a',
    '#0b0d10',
    '#07080a',
];

const fontStack = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

export const theme = createTheme({
    fontFamily: fontStack,
    fontFamilyMonospace: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    primaryColor: 'accent',
    primaryShade: { light: 6, dark: 5 },
    colors: { accent, dark },
    defaultRadius: 'md',
    radius: { xs: '4px', sm: '6px', md: '8px', lg: '12px', xl: '16px' },
    fontSizes: { xs: '11px', sm: '13px', md: '14px', lg: '16px', xl: '20px' },
    headings: {
        fontFamily: fontStack,
        fontWeight: '600',
        sizes: {
            h1: { fontSize: '20px', lineHeight: '1.3' },
            h2: { fontSize: '16px', lineHeight: '1.35' },
            h3: { fontSize: '14px', lineHeight: '1.4' },
        },
    },
    components: {
        Paper: { defaultProps: { shadow: 'none' } },
        Button: { defaultProps: { size: 'sm' } },
        ActionIcon: { defaultProps: { variant: 'subtle', color: 'gray' } },
        Badge: { defaultProps: { radius: 'sm', variant: 'light' } },
        Tooltip: { defaultProps: { openDelay: 300, withArrow: false, fz: 'xs' } },
        Modal: { defaultProps: { centered: true, radius: 'lg', overlayProps: { backgroundOpacity: 0.45, blur: 2 } } },
        Menu: { defaultProps: { shadow: 'md', radius: 'md' } },
        SegmentedControl: { defaultProps: { size: 'xs', radius: 'md' } },
        Table: { defaultProps: { verticalSpacing: 8, horizontalSpacing: 12 } },
    },
});
