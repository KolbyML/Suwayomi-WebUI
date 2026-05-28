/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Stack from '@mui/material/Stack';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ReaderSettingReadingMode } from '@/features/reader/settings/layout/components/ReaderSettingReadingMode.tsx';
import { ReaderService } from '@/features/reader/services/ReaderService.ts';
import { DefaultSettingFootnote } from '@/features/reader/settings/components/DefaultSettingFootnote.tsx';
import { ReaderSettingAutoScroll } from '@/features/reader/auto-scroll/settings/ReaderSettingAutoScroll.tsx';
import { CheckboxInput } from '@/base/components/inputs/CheckboxInput.tsx';
import { useReaderAutoScrollStore, useReaderSettingsStore } from '@/features/reader/stores/ReaderStore.ts';

const BaseReaderBottomBarMobileQuickSettings = () => {
    const { t } = useTranslation();
    const { isActive, toggleActive } = useReaderAutoScrollStore((state) => ({
        isActive: state.autoScroll.isActive,
        toggleActive: state.autoScroll.toggleActive,
    }));
    const { readingMode, readingDirection, autoScroll } = useReaderSettingsStore((state) => ({
        readingMode: state.settings.readingMode,
        readingDirection: state.settings.readingDirection,
        autoScroll: state.settings.autoScroll,
    }));

    return (
        <Stack sx={{ gap: 2 }}>
            <DefaultSettingFootnote />
            <ReaderSettingReadingMode
                readingMode={readingMode}
                readingDirection={readingDirection}
                setReadingModePreset={({ readingMode: nextReadingMode, readingDirection: nextReadingDirection }) => {
                    ReaderService.updateSetting('readingMode', nextReadingMode);
                    ReaderService.updateSetting('readingDirection', nextReadingDirection);
                }}
                isDefaultable
                onDefault={() => {
                    ReaderService.deleteSetting('readingMode');
                    ReaderService.deleteSetting('readingDirection');
                }}
            />
            <CheckboxInput
                label={t('reader.settings.auto_scroll.title')}
                checked={isActive}
                onChange={() => toggleActive()}
            />
            <ReaderSettingAutoScroll
                autoScroll={autoScroll}
                setAutoScroll={(...args) => ReaderService.updateSetting('autoScroll', ...args)}
            />
        </Stack>
    );
};

export const ReaderBottomBarMobileQuickSettings = memo(BaseReaderBottomBarMobileQuickSettings);
