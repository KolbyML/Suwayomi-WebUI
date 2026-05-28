/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import React, { useEffect, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { IMangaGridProps, MangaGrid } from '@/features/manga/components/MangaGrid.tsx';
import { GridLayout } from '@/base/Base.types.ts';
import { useMetadataServerSettings } from '@/features/settings/services/ServerSettingsMetadata.ts';
import { logStartupMetricAfterPaint } from '@/Manatan/utils/startupMetrics.ts';

interface LibraryMangaGridProps
    extends Required<Pick<IMangaGridProps, 'isSelectModeActive' | 'selectedMangaIds' | 'handleSelection' | 'mangas'>>,
        Pick<IMangaGridProps, 'retry' | 'message' | 'messageExtra' | 'persistKey'> {
    showFilteredOutMessage: boolean;
    isLoading: boolean;
}

const loadMoreNoop = () => undefined;

export const LibraryMangaGrid: React.FC<LibraryMangaGridProps> = ({
    showFilteredOutMessage,
    message,
    messageExtra,
    mangas,
    isLoading,
    persistKey,
    ...gridProps
}) => {
    const { t } = useTranslation();

    const {
        settings: { gridLayout },
    } = useMetadataServerSettings();

    useLayoutEffect(() => {
        document.body.style.overflowY = gridLayout === GridLayout.List ? 'auto' : 'scroll';
        return () => {
            document.body.style.overflowY = 'auto';
        };
    }, []);

    useEffect(() => {
        if (isLoading) {
            return;
        }

        return logStartupMetricAfterPaint(
            'library_grid_painted',
            {
                mangaCount: mangas.length,
                isEmpty: mangas.length === 0,
                gridLayout,
                persistKey: persistKey ?? 'library-manga-grid',
                showFilteredOutMessage,
            },
            'library_grid_painted',
        );
    }, [gridLayout, isLoading, mangas.length, persistKey, showFilteredOutMessage]);

    return (
        <MangaGrid
            gridWrapperProps={{ sx: { p: 1 } }}
            {...gridProps}
            mangas={mangas}
            isLoading={isLoading}
            persistKey={persistKey}
            hasNextPage={false}
            loadMore={loadMoreNoop}
            message={showFilteredOutMessage ? t('library.error.label.no_matches') : message}
            messageExtra={showFilteredOutMessage ? undefined : messageExtra}
            gridLayout={gridLayout}
        />
    );
};
