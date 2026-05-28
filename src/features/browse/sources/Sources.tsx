/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import IconButton from '@mui/material/IconButton';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Typography from '@mui/material/Typography';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { DefaultLanguage } from '@/base/utils/Languages.ts';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { SourceCard } from '@/features/browse/sources/components/SourceCard.tsx';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { isPinnedOrLastUsedSource, translateExtensionLanguage } from '@/features/extension/Extensions.utils.ts';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { Sources as SourceService } from '@/features/source/services/Sources.ts';
import {
    createUpdateMetadataServerSettings,
    useMetadataServerSettings,
} from '@/features/settings/services/ServerSettingsMetadata.ts';
import { useAppAction } from '@/features/navigation-bar/hooks/useAppAction.ts';
import { StyledGroupedVirtuoso } from '@/base/components/virtuoso/StyledGroupedVirtuoso.tsx';
import { VirtuosoUtil } from '@/lib/virtuoso/Virtuoso.util.tsx';
import { StyledGroupHeader } from '@/base/components/virtuoso/StyledGroupHeader.tsx';
import { StyledGroupItemWrapper } from '@/base/components/virtuoso/StyledGroupItemWrapper.tsx';
import { SourceLanguageSelect } from '@/features/source/components/SourceLanguageSelect.tsx';
import { useOCR } from '@/Manatan/context/OCRContext.tsx';
import { resolveBrowseLanguages } from '@/features/source/services/SourceLanguageDefaults.ts';
import { useTransientResumeRetry } from '@/base/hooks/useTransientResumeRetry.ts';
import { MetadataBrowseSettings } from '@/features/browse/Browse.types.ts';
import { doesMetadataKeyExistIn } from '@/features/metadata/Metadata.utils.ts';

export function Sources({ tabsMenuHeight }: { tabsMenuHeight: number }) {
    const { t } = useTranslation();

    const {
        metadata,
        settings: { showNsfw, lastUsedSourceId, sourceLanguages },
    } = useMetadataServerSettings();
    const { settings: manatanSettings } = useOCR();
    const updateMetadataServerSettings = useMemo(
        () =>
            createUpdateMetadataServerSettings<
                keyof Pick<MetadataBrowseSettings, 'sourceLanguages' | 'extensionLanguages'>
            >(),
        [],
    );
    const hasSavedSourceLanguages = useMemo(
        () => doesMetadataKeyExistIn(metadata, 'sourceLanguages'),
        [metadata],
    );
    const shownLangs = useMemo(
        () =>
            resolveBrowseLanguages({
                configuredLanguages: sourceLanguages,
                hasExplicitLanguageSetting: hasSavedSourceLanguages,
                yomitanLanguage: manatanSettings.yomitanLanguage,
            }),
        [hasSavedSourceLanguages, sourceLanguages, manatanSettings.yomitanLanguage],
    );
    const setShownLangs = useCallback(
        (languages: string[]) => {
            updateMetadataServerSettings('sourceLanguages', languages);
            updateMetadataServerSettings('extensionLanguages', languages);
        },
        [updateMetadataServerSettings],
    );

    const {
        data,
        loading: isLoading,
        error,
        refetch,
    } = requestManager.useGetSourceList({ notifyOnNetworkStatusChange: true });
    const refetchRef = useRef(refetch);
    useEffect(() => {
        refetchRef.current = refetch;
    }, [refetch]);
    const refreshSources = useCallback(() => {
        refetchRef.current().catch(defaultPromiseErrorHandler('Sources::refetch'));
    }, []);
    const { shouldSuppressError } = useTransientResumeRetry({
        hasError: Boolean(error),
        hasData: Boolean(data?.sources.nodes.length),
        retry: refreshSources,
    });
    const sources = data?.sources.nodes;
    const filteredSources = useMemo(() => {
        const allSources = sources ?? [];
        const fullyFiltered = SourceService.filter(allSources, {
            showNsfw,
            languages: shownLangs,
            keepLocalSource: true,
            enabled: true,
        });
        const hasNonLocal = (items: typeof allSources) => items.some((source) => !SourceService.isLocalSource(source));

        if (hasNonLocal(fullyFiltered) || !allSources.length) {
            return fullyFiltered;
        }

        const enabledOnly = SourceService.filter(allSources, {
            showNsfw,
            keepLocalSource: true,
            enabled: true,
        });
        if (hasNonLocal(enabledOnly)) {
            return enabledOnly;
        }

        const languageOnly = SourceService.filter(allSources, {
            showNsfw,
            languages: shownLangs,
            keepLocalSource: true,
        });
        if (hasNonLocal(languageOnly)) {
            return languageOnly;
        }

        return fullyFiltered;
    }, [sources, shownLangs, showNsfw]);
    const sourcesForLanguageSelect = useMemo(
        () =>
            SourceService.filter(sources ?? [], {
                showNsfw,
                keepLocalSource: true,
            }),
        [sources, showNsfw],
    );
    const sourcesByLanguage = useMemo(() => {
        const lastUsedSource = SourceService.getLastUsedSource(lastUsedSourceId, filteredSources);
        const groupedByLanguageTuple = Object.entries(SourceService.groupByLanguage(filteredSources));

        if (lastUsedSource) {
            return [
                [DefaultLanguage.LAST_USED_SOURCE, [lastUsedSource]],
                ...groupedByLanguageTuple,
            ] satisfies typeof groupedByLanguageTuple;
        }

        return groupedByLanguageTuple;
    }, [filteredSources, lastUsedSourceId]);

    const sourceLanguagesList = useMemo(
        () => SourceService.getLanguages(sourcesForLanguageSelect),
        [sourcesForLanguageSelect],
    );
    const visibleSources = useMemo(
        () => sourcesByLanguage.map(([, sourcesOfLanguage]) => sourcesOfLanguage).flat(1),
        [sourcesByLanguage],
    );

    const groupCounts = useMemo(
        () => sourcesByLanguage.map((sourceGroup) => sourceGroup[1].length),
        [sourcesByLanguage],
    );
    const computeItemKey = VirtuosoUtil.useCreateGroupedComputeItemKey(
        groupCounts,
        useCallback((index) => sourcesByLanguage[index][0], [sourcesByLanguage]),
        useCallback(
            (index, groupIndex) => `${sourcesByLanguage[groupIndex][0]}_${visibleSources[index].id}`,
            [sourcesByLanguage, visibleSources],
        ),
    );

    const navigate = useNavigate();

    const appAction = useMemo(
        () => (
            <>
                <CustomTooltip title={t('search.title.global_search')}>
                    <IconButton
                        onClick={() => navigate(AppRoutes.sources.childRoutes.searchAll.path())}
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
                    sourceScope="manga"
                    onMetaUpdated={refreshSources}
                />
            </>
        ),
        [t, navigate, shownLangs, setShownLangs, sourceLanguagesList, sourcesForLanguageSelect, refreshSources],
    );

    useAppAction(appAction, [appAction]);

    if (isLoading) return <LoadingPlaceholder />;

    if (error && !shouldSuppressError) {
        return (
            <EmptyViewAbsoluteCentered
                message={t('global.error.label.failed_to_load_data')}
                messageExtra={getErrorMessage(error)}
                retry={() => refetch().catch(defaultPromiseErrorHandler('Sources::refetch'))}
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
            persistKey="sources"
            useWindowScroll={false}
            heightToSubtract={tabsMenuHeight}
            overscan={window.innerHeight * 0.5}
            groupCounts={groupCounts}
            computeItemKey={computeItemKey}
            groupContent={(index) => {
                const [language] = sourcesByLanguage[index];

                return (
                    <StyledGroupHeader key={language} isFirstItem={!index}>
                        <Typography variant="h5" component="h2">
                            {translateExtensionLanguage(language)}
                        </Typography>
                    </StyledGroupHeader>
                );
            }}
            itemContent={(index, groupIndex) => {
                const language = sourcesByLanguage[groupIndex][0];
                const source = visibleSources[index];

                return (
                    <StyledGroupItemWrapper>
                        <SourceCard
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
