/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Box from '@mui/material/Box';
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { OptionsPanel } from '@/base/components/modals/OptionsPanel.tsx';

interface IProps<T = string> {
    open: boolean;
    onClose: () => void;
    tabs: T[];
    tabTitle: (key: T) => React.ReactNode;
    tabContent: (key: T) => React.ReactNode;
    minHeight?: number;
}

interface ScrollMetrics {
    scrollable: boolean;
    thumbHeight: number;
    thumbTop: number;
}

const SCROLLBAR_INSET = 8;
const MIN_THUMB_HEIGHT = 32;

const ScrollableTabContent = ({ children }: { children: React.ReactNode }) => {
    const ref = useRef<HTMLDivElement | null>(null);
    const [metrics, setMetrics] = useState<ScrollMetrics>({
        scrollable: false,
        thumbHeight: MIN_THUMB_HEIGHT,
        thumbTop: SCROLLBAR_INSET,
    });

    const updateMetrics = useCallback(() => {
        const element = ref.current;
        if (!element) return;

        const scrollable = element.scrollHeight > element.clientHeight + 1;
        if (!scrollable) {
            setMetrics((previous) =>
                previous.scrollable
                    ? { scrollable: false, thumbHeight: MIN_THUMB_HEIGHT, thumbTop: SCROLLBAR_INSET }
                    : previous,
            );
            return;
        }

        const trackHeight = Math.max(element.clientHeight - SCROLLBAR_INSET * 2, MIN_THUMB_HEIGHT);
        const thumbHeight = Math.max(
            MIN_THUMB_HEIGHT,
            Math.round((element.clientHeight / element.scrollHeight) * trackHeight),
        );
        const maxThumbTop = SCROLLBAR_INSET + Math.max(trackHeight - thumbHeight, 0);
        const maxScrollTop = Math.max(element.scrollHeight - element.clientHeight, 1);
        const thumbTop = Math.round(
            SCROLLBAR_INSET + (maxThumbTop - SCROLLBAR_INSET) * (element.scrollTop / maxScrollTop),
        );

        setMetrics({ scrollable, thumbHeight, thumbTop });
    }, []);

    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return undefined;

        updateMetrics();
        window.setTimeout(updateMetrics, 0);

        if (typeof ResizeObserver === 'undefined') return undefined;

        const observer = new ResizeObserver(updateMetrics);
        observer.observe(element);
        Array.from(element.children).forEach((child) => observer.observe(child));

        return () => observer.disconnect();
    }, [children, updateMetrics]);

    return (
        <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <Stack
                ref={ref}
                data-testid="options-panel-content"
                onScroll={updateMetrics}
                sx={{
                    alignItems: 'stretch',
                    flex: 1,
                    height: '100%',
                    justifyContent: 'flex-start',
                    minHeight: 0,
                    overflowY: 'auto',
                    overscrollBehavior: 'contain',
                    px: 3,
                    py: 1,
                    scrollbarGutter: 'stable',
                    WebkitOverflowScrolling: 'touch',
                }}
            >
                {children}
            </Stack>
            {metrics.scrollable && (
                <Box
                    data-testid="options-panel-scrollbar"
                    sx={{
                        bgcolor: 'action.disabledBackground',
                        borderRadius: 999,
                        bottom: SCROLLBAR_INSET,
                        opacity: 0.95,
                        pointerEvents: 'none',
                        position: 'absolute',
                        right: 4,
                        top: SCROLLBAR_INSET,
                        width: 4,
                    }}
                >
                    <Box
                        sx={{
                            bgcolor: 'text.secondary',
                            borderRadius: 999,
                            height: `${metrics.thumbHeight}px`,
                            left: 0,
                            opacity: 0.9,
                            position: 'absolute',
                            right: 0,
                            top: `${metrics.thumbTop - SCROLLBAR_INSET}px`,
                        }}
                    />
                </Box>
            )}
        </Box>
    );
};

export const OptionsTabs = <T extends string = string>({
    open,
    onClose,
    tabs,
    tabTitle,
    tabContent,
    minHeight,
}: IProps<T>) => {
    const [tabNum, setTabNum] = useState(0);

    return (
        <OptionsPanel open={open} onClose={onClose} minHeight={minHeight}>
            <Tabs
                value={tabNum}
                variant="fullWidth"
                onChange={(e, newTab) => setTabNum(newTab)}
                indicatorColor="primary"
                textColor="primary"
                sx={{ flexShrink: 0 }}
            >
                {tabs.map((tab, tabIndex) => (
                    <Tab key={tab} value={tabIndex} label={tabTitle(tab)} />
                ))}
            </Tabs>
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
                {tabs.map((tab, tabIndex) => (
                    <Box
                        key={tab}
                        role="tabpanel"
                        hidden={tabIndex !== tabNum}
                        id={`simple-tabpanel-${tabIndex}`}
                        sx={{
                            display: tabIndex === tabNum ? 'flex' : 'none',
                            inset: 0,
                            minHeight: 0,
                            overflow: 'hidden',
                            position: 'absolute',
                        }}
                    >
                        {tabIndex === tabNum && <ScrollableTabContent>{tabContent(tab)}</ScrollableTabContent>}
                    </Box>
                ))}
            </Box>
        </OptionsPanel>
    );
};
