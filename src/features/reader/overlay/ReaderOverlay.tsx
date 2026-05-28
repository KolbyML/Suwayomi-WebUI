/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Box from '@mui/material/Box';
import { memo, MouseEvent, TouchEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ReaderSettings } from '@/features/reader/settings/screens/ReaderSettings.tsx';
import { ReaderPageNumber } from '@/features/reader/overlay/components/ReaderPageNumber.tsx';
import { StandardReaderProgressBar } from '@/features/reader/overlay/progress-bar/desktop/StandardReaderProgressBar.tsx';
import { ReaderNavBarDesktop } from '@/features/reader/overlay/navigation/desktop/ReaderNavBarDesktop.tsx';
import { ReaderOverlayHeaderMobile } from '@/features/reader/overlay/mobile/ReaderOverlayHeaderMobile.tsx';
import { ReaderBottomBarMobile } from '@/features/reader/overlay/navigation/mobile/ReaderBottomBarMobile.tsx';
import { ReaderService } from '@/features/reader/services/ReaderService.ts';
import { withPropsFrom } from '@/base/hoc/withPropsFrom.tsx';
import { useResizeObserver } from '@/base/hooks/useResizeObserver.tsx';
import {
    getReaderOverlayStore,
    getReaderTapZoneStore,
    useReaderOverlayStore,
} from '@/features/reader/stores/ReaderStore.ts';

const OVERLAY_DISMISS_CAPTURE_MS = 450;

const BaseReaderOverlay = ({
    isDesktop,
    isMobile,
}: Pick<ReturnType<typeof ReaderService.useOverlayMode>, 'isDesktop' | 'isMobile'>) => {
    const isVisible = useReaderOverlayStore((state) => state.overlay.isVisible);

    const [areSettingsOpen, setAreSettingsOpen] = useState(false);

    const [mobileHeaderHeight, setMobileHeaderHeight] = useState(0);
    const [isDismissCaptureActive, setIsDismissCaptureActive] = useState(false);
    const mobileHeaderRef = useRef<HTMLDivElement>(null);
    const dismissCaptureTimeoutRef = useRef<number | null>(null);
    useResizeObserver(
        mobileHeaderRef,
        useCallback(() => setMobileHeaderHeight(mobileHeaderRef.current?.clientHeight ?? 0), [isMobile]),
    );

    useEffect(
        () => () => {
            if (dismissCaptureTimeoutRef.current != null) {
                window.clearTimeout(dismissCaptureTimeoutRef.current);
            }
        },
        [],
    );

    const startDismissCapture = useCallback(() => {
        setIsDismissCaptureActive(true);

        if (dismissCaptureTimeoutRef.current != null) {
            window.clearTimeout(dismissCaptureTimeoutRef.current);
        }

        dismissCaptureTimeoutRef.current = window.setTimeout(() => {
            dismissCaptureTimeoutRef.current = null;
            setIsDismissCaptureActive(false);
        }, OVERLAY_DISMISS_CAPTURE_MS);
    }, []);

    const dismissOverlay = useCallback(
        (event: MouseEvent<HTMLDivElement> | TouchEvent<HTMLDivElement>) => {
            if (event.type !== 'touchstart') {
                event.preventDefault();
            }
            event.stopPropagation();
            getReaderTapZoneStore().setShowPreview(false);
            getReaderOverlayStore().setIsVisible(false);
            startDismissCapture();
        },
        [startDismissCapture],
    );

    const consumeDismissCapture = useCallback((event: MouseEvent<HTMLDivElement> | TouchEvent<HTMLDivElement>) => {
        if (event.type !== 'touchstart') {
            event.preventDefault();
        }
        event.stopPropagation();
    }, []);

    return (
        <Box sx={{ position: 'absolute', width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
            {isMobile && (isVisible || isDismissCaptureActive) && (
                <Box
                    sx={{
                        position: 'fixed',
                        inset: 0,
                        pointerEvents: 'all',
                        background: 'transparent',
                        zIndex: 0,
                    }}
                    onMouseDown={isVisible ? dismissOverlay : consumeDismissCapture}
                    onTouchStart={isVisible ? dismissOverlay : consumeDismissCapture}
                    onClick={isVisible ? dismissOverlay : consumeDismissCapture}
                />
            )}
            {isDesktop && (
                <>
                    <StandardReaderProgressBar />
                    <ReaderNavBarDesktop isVisible={isVisible} openSettings={() => setAreSettingsOpen(true)} />
                </>
            )}

            {isMobile && (
                <>
                    <ReaderOverlayHeaderMobile ref={mobileHeaderRef} isVisible={isVisible} />
                    <ReaderBottomBarMobile
                        openSettings={() => setAreSettingsOpen(true)}
                        isVisible={isVisible}
                        topOffset={mobileHeaderHeight}
                    />
                </>
            )}

            <ReaderSettings isOpen={areSettingsOpen} close={() => setAreSettingsOpen(false)} />

            <ReaderPageNumber />
        </Box>
    );
};

export const ReaderOverlay = withPropsFrom(
    memo(BaseReaderOverlay),
    [ReaderService.useOverlayMode],
    ['isDesktop', 'isMobile'],
);
