/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import IconButton from '@mui/material/IconButton';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import { useNavigate } from 'react-router-dom';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import {
    createUpdateMetadataServerSettings,
    useMetadataServerSettings,
} from '@/features/settings/services/ServerSettingsMetadata.ts';
import { StyledGroupedVirtuoso } from '@/base/components/virtuoso/StyledGroupedVirtuoso.tsx';
import { StyledGroupHeader } from '@/base/components/virtuoso/StyledGroupHeader.tsx';
import { StyledGroupItemWrapper } from '@/base/components/virtuoso/StyledGroupItemWrapper.tsx';
import { VirtuosoUtil } from '@/lib/virtuoso/Virtuoso.util.tsx';
import { isPinnedOrLastUsedSource, translateExtensionLanguage } from '@/features/extension/Extensions.utils.ts';
import { useAppAction } from '@/features/navigation-bar/hooks/useAppAction.ts';
import { DefaultLanguage } from '@/base/utils/Languages.ts';
import { AnimeSourceCard, AnimeSourceInfo } from '@/features/browse/sources/components/AnimeSourceCard.tsx';
import { Sources as SourceService } from '@/features/source/services/Sources.ts';
import { SourceLanguageSelect } from '@/features/source/components/SourceLanguageSelect.tsx';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { useOCR } from '@/Manatan/context/OCRContext.tsx';
import { resolveBrowseLanguages } from '@/features/source/services/SourceLanguageDefaults.ts';
import { useTransientResumeRetry } from '@/base/hooks/useTransientResumeRetry.ts';
import { MetadataBrowseSettings } from '@/features/browse/Browse.types.ts';
import { doesMetadataKeyExistIn } from '@/features/metadata/Metadata.utils.ts';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';
import { AppRoutes } from '@/base/AppRoute.constants.ts';

export function AnimeSources({ tabsMenuHeight }: { tabsMenuHeight: number }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const {
        metadata,
        settings: { showNsfw, animeSourceLanguages, lastUsedSourceId },
    } = useMetadataServerSettings();
    const {
        settings: { yomitanLanguage },
    } = useOCR();
    const updateMetadataServerSettings = useMemo(
        () =>
            createUpdateMetadataServerSettings<
                keyof Pick<MetadataBrowseSettings, 'animeSourceLanguages' | 'animeExtensionLanguages'>
            >(),
        [],
    );
    const hasSavedAnimeSourceLanguages = useMemo(
        () => doesMetadataKeyExistIn(metadata, 'animeSourceLanguages'),
        [metadata],
    );
    const shownLangs = useMemo(
        () =>
            resolveBrowseLanguages({
                configuredLanguages: animeSourceLanguages,
                hasExplicitLanguageSetting: hasSavedAnimeSourceLanguages,
                yomitanLanguage,
            }),
        [hasSavedAnimeSourceLanguages, animeSourceLanguages, yomitanLanguage],
    );

    const {
        data,
        loading: isLoading,
        error,
        refetch,
    } = requestManager.useGetAnimeSourceList({ notifyOnNetworkStatusChange: true });
    const refetchRef = useRef(refetch);
    useEffect(() => {
        refetchRef.current = refetch;
    }, [refetch]);
    const refreshSources = useCallback(() => {
        refetchRef.current().catch(defaultPromiseErrorHandler('AnimeSources::refetch'));
    }, []);
    const { shouldSuppressError } = useTransientResumeRetry({
        hasError: Boolean(error),
        hasData: Boolean(data?.animeSources?.nodes.length),
        retry: refreshSources,
    });
    const sources = data?.animeSources?.nodes as AnimeSourceInfo[] | undefined;
    const filteredSources = useMemo(() => {
        const allSources = sources ?? [];
        const fullyFiltered = SourceService.filter(allSources, {
            showNsfw,
            languages: shownLangs,
            keepLocalSource: true,
            enabled: true,
        });
        const hasNonLocal = (items: AnimeSourceInfo[]) => items.some((source) => !SourceService.isLocalSource(source));

        if (hasNonLocal(fullyFiltered) || !allSources.length) {
            return fullyFiltered;
        }

        const enabledOnly = SourceService.filter(allSources, {
            showNsfw,
            keepLocalSource: true,
            enabled: true,
        });
        if (hasNonLocal(enabledOnly as AnimeSourceInfo[])) {
            return enabledOnly as AnimeSourceInfo[];
        }

        const languageOnly = SourceService.filter(allSources, {
            showNsfw,
            languages: shownLangs,
            keepLocalSource: true,
        });
        if (hasNonLocal(languageOnly as AnimeSourceInfo[])) {
            return languageOnly as AnimeSourceInfo[];
        }

        return fullyFiltered;
    }, [sources, showNsfw, shownLangs]);
    const sourcesForLanguageSelect = useMemo(
        () =>
            SourceService.filter(sources ?? [], {
                showNsfw,
                keepLocalSource: true,
            }),
        [sources, showNsfw],
    );
    const sourcesByLanguage = useMemo<Array<[string, AnimeSourceInfo[]]>>(() => {
        const lastUsedSource = SourceService.getLastUsedSource(lastUsedSourceId, filteredSources);
        const groupedByLanguageTuple = Object.entries(SourceService.groupByLanguage(filteredSources)) as Array<
            [string, AnimeSourceInfo[]]
        >;

        if (lastUsedSource) {
            return [[DefaultLanguage.LAST_USED_SOURCE, [lastUsedSource]], ...groupedByLanguageTuple];
        }

        return groupedByLanguageTuple;
    }, [filteredSources, lastUsedSourceId]);

    const sourceLanguagesList = useMemo(
        () => SourceService.getLanguages(sourcesForLanguageSelect),
        [sourcesForLanguageSelect],
    );
    const setShownLangs = useCallback(
        (languages: string[]) => {
            updateMetadataServerSettings('animeSourceLanguages', languages);
            updateMetadataServerSettings('animeExtensionLanguages', languages);
        },
        [updateMetadataServerSettings],
    );

    const visibleSources = useMemo<AnimeSourceInfo[]>(
        () => sourcesByLanguage.map(([, sourcesOfLanguage]) => sourcesOfLanguage).flat(1),
        [sourcesByLanguage],
    );
    const groupCounts = useMemo(
        () => sourcesByLanguage.map((sourceGroup) => sourceGroup[1].length),
        [sourcesByLanguage],
    );
    const computeItemKey = VirtuosoUtil.useCreateGroupedComputeItemKey(
        groupCounts,
        useCallback((index) => sourcesByLanguage[index]?.[0] ?? 'unknown', [sourcesByLanguage]),
        useCallback(
            (index, groupIndex) => `${sourcesByLanguage[groupIndex]?.[0] ?? 'unknown'}_${visibleSources[index].id}`,
            [sourcesByLanguage, visibleSources],
        ),
    );
    const appAction = useMemo(
        () => (
            <>
                <CustomTooltip title={t('search.title.global_search')}>
                    <IconButton
                        onClick={() => navigate(AppRoutes.animeSources.childRoutes.searchAll.path())}
                        color="inherit"
                    >
                        <TravelExploreIcon />
                    </IconButton>
                </CustomTooltip>
                <SourceLanguageSelect
                    selectedLanguages={shownLangs}
                    setSelectedLanguages={setShownLangs}
                    languages={sourceLanguagesList}
                    sources={sourcesForLanguageSelect}
                    sourceScope="anime"
                    onMetaUpdated={refreshSources}
                />
            </>
        ),
        [t, navigate, shownLangs, setShownLangs, sourceLanguagesList, sourcesForLanguageSelect, refreshSources],
    );

    useAppAction(appAction, [appAction]);

    if (isLoading) {
        return <LoadingPlaceholder />;
    }

    if (error && !shouldSuppressError) {
        return (
            <EmptyViewAbsoluteCentered
                message={t('global.error.label.failed_to_load_data')}
                messageExtra={getErrorMessage(error)}
                retry={() => refetch().catch(defaultPromiseErrorHandler('AnimeSources::refetch'))}
            />
        );
    }

    if (error && shouldSuppressError) {
        return <LoadingPlaceholder />;
    }

    if (sources?.length === 0) {
        return <EmptyViewAbsoluteCentered message={t('source.error.label.no_sources_found')} />;
    }

    if (!filteredSources.length) {
        return <EmptyViewAbsoluteCentered message={t('global.error.label.no_matching_results' as any)} />;
    }

    return (
        <StyledGroupedVirtuoso
            persistKey="anime-sources"
            useWindowScroll={false}
            heightToSubtract={tabsMenuHeight}
            overscan={window.innerHeight * 0.5}
            groupCounts={groupCounts}
            computeItemKey={computeItemKey}
            groupContent={(index) => (
                <StyledGroupHeader key={sourcesByLanguage[index]?.[0] ?? 'unknown'} isFirstItem={!index}>
                    <Typography variant="h5" component="h2">
                        {translateExtensionLanguage(sourcesByLanguage[index]?.[0] ?? 'unknown')}
                    </Typography>
                </StyledGroupHeader>
            )}
            itemContent={(index, groupIndex) => {
                const language = sourcesByLanguage[groupIndex]?.[0] ?? 'unknown';
                const source = visibleSources[index];
                if (!source) {
                    return null;
                }
                return (
                    <StyledGroupItemWrapper>
                        <AnimeSourceCard
                            source={source}
                            showSourceRepo
                            showLanguage={isPinnedOrLastUsedSource(language)}
                            onMetaUpdated={refreshSources}
                        />
                    </StyledGroupItemWrapper>
                );
            }}
        />
    );
}
