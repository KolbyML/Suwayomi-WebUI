/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Typography from '@mui/material/Typography';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { StringParam, useQueryParam } from 'use-query-params';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import PushPinIcon from '@mui/icons-material/PushPin';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import FilterListIcon from '@mui/icons-material/FilterList';
import IconButton from '@mui/material/IconButton';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useElementSize } from '@mantine/hooks';
import { d } from 'koration';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { AppbarSearch } from '@/base/components/AppbarSearch.tsx';
import { useDebounce } from '@/base/hooks/useDebounce.ts';
import { EmptyView } from '@/base/components/feedback/EmptyView.tsx';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { translateExtensionLanguage } from '@/features/extension/Extensions.utils.ts';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { Sources } from '@/features/source/services/Sources.ts';
import { SourceDisplayNameInfo, SourceIdInfo } from '@/features/source/Source.types.ts';
import {
    createUpdateMetadataServerSettings,
    useMetadataServerSettings,
} from '@/features/settings/services/ServerSettingsMetadata.ts';
import { useAppTitleAndAction } from '@/features/navigation-bar/hooks/useAppTitleAndAction.ts';
import { getSourceMetadata } from '@/features/source/services/SourceMetadata.ts';
import { makeToast } from '@/base/utils/Toast.ts';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';
import { MUIUtil } from '@/lib/mui/MUI.util.ts';
import { SearchParam } from '@/base/Base.types.ts';
import { resolveBrowseLanguages } from '@/features/source/services/SourceLanguageDefaults.ts';
import { useOCR } from '@/Manatan/context/OCRContext.tsx';
import { MetadataBrowseSettings } from '@/features/browse/Browse.types.ts';
import { doesMetadataKeyExistIn } from '@/features/metadata/Metadata.utils.ts';
import { AnimeGridCard } from '@/features/anime/components/AnimeGridCard.tsx';
import { AnimeSourceContentType } from '@/features/anime/browse/AnimeSourceBrowse.types.ts';
import { AnimeSourceInfo } from '@/features/browse/sources/components/AnimeSourceCard.tsx';

type AnimeSearchResult = {
    id: number;
    title: string;
    thumbnailUrl?: string | null;
    sourceId?: string;
    url?: string | null;
    inLibrary?: boolean;
};
type SourceLoadingState = { isLoading: boolean; hasResults: boolean; emptySearch: boolean; error: any };
type SourceToLoadingStateMap = Map<string, SourceLoadingState>;

const compareSourceByName = (sourceA: SourceDisplayNameInfo, sourceB: SourceDisplayNameInfo): number =>
    sourceA.displayName.localeCompare(sourceB.displayName);

const compareSourcesBySearchResult = (
    sourceA: AnimeSourceInfo,
    sourceB: AnimeSourceInfo,
    sourceToFetchedStateMap: SourceToLoadingStateMap,
): -1 | 0 | 1 => {
    const isSourceAPinned = getSourceMetadata(sourceA).isPinned;
    const isSourceBPinned = getSourceMetadata(sourceB).isPinned;

    const sourceAState = sourceToFetchedStateMap.get(sourceA.id);
    const sourceBState = sourceToFetchedStateMap.get(sourceB.id);

    const isSourceAFetched = !sourceAState?.isLoading;
    const hasSourceAError = !!sourceAState?.error;
    const isSourceASearchResultEmpty = !sourceAState?.hasResults && !hasSourceAError;

    const isSourceBFetched = !sourceBState?.isLoading;
    const hasSourceBError = !!sourceBState?.error;
    const isSourceBSearchResultEmpty = !sourceBState?.hasResults && !hasSourceBError;

    if (isSourceAFetched && !isSourceBFetched) {
        return -1;
    }
    if (!isSourceAFetched && isSourceBFetched) {
        return 1;
    }

    if (isSourceASearchResultEmpty && !isSourceBSearchResultEmpty) {
        return 1;
    }
    if (isSourceBSearchResultEmpty && !isSourceASearchResultEmpty) {
        return -1;
    }

    if (!hasSourceAError && hasSourceBError) {
        return -1;
    }
    if (hasSourceAError && !hasSourceBError) {
        return 1;
    }

    if (isSourceAPinned && !isSourceBPinned) {
        return -1;
    }
    if (!isSourceAPinned && isSourceBPinned) {
        return 1;
    }

    return 0;
};
const TRIGGER_SEARCH_THRESHOLD = d(1).seconds.inWholeMilliseconds;

const SourceAnimeSearchPreview = React.memo(
    ({
        source,
        onSearchRequestFinished,
        searchString,
        emptyQuery,
        shouldShowOnlySourcesWithResults,
    }: {
        source: AnimeSourceInfo;
        onSearchRequestFinished: (source: SourceIdInfo, state: SourceLoadingState) => void;
        searchString: string | null | undefined;
        emptyQuery: boolean;
    } & Pick<MetadataBrowseSettings, 'shouldShowOnlySourcesWithResults'>) => {
        const { t } = useTranslation();
        const { id, name, displayName, lang } = source;
        const [fetchSourceAnimes, { abortRequest }] = requestManager.useGetSourceAnimes();
        const fetchSourceAnimesRef = useRef(fetchSourceAnimes);
        const abortRequestRef = useRef<(reason?: any) => void>(() => {});
        const [state, setState] = useState<{
            isLoading: boolean;
            error: any;
            animes: AnimeSearchResult[];
        }>({
            isLoading: false,
            error: undefined,
            animes: [],
        });

        abortRequestRef.current = abortRequest;

        useEffect(() => {
            fetchSourceAnimesRef.current = fetchSourceAnimes;
        }, [fetchSourceAnimes]);

        useEffect(() => {
            if (!searchString) {
                abortRequestRef.current(new Error(`SourceAnimeSearchPreview(${id}, ${name}): empty search`));
                setState({ isLoading: false, error: undefined, animes: [] });
                onSearchRequestFinished(source, {
                    isLoading: false,
                    hasResults: false,
                    emptySearch: true,
                    error: undefined,
                });
                return undefined;
            }

            let isActive = true;
            setState({ isLoading: true, error: undefined, animes: [] });
            onSearchRequestFinished(source, {
                isLoading: true,
                hasResults: false,
                emptySearch: false,
                error: undefined,
            });

            fetchSourceAnimesRef
                .current({
                    variables: {
                        input: {
                            source: id,
                            type: AnimeSourceContentType.SEARCH,
                            page: 1,
                            query: searchString,
                        },
                    },
                })
                .then((result) => {
                    if (!isActive) {
                        return;
                    }

                    const animes = (result.data?.fetchSourceAnime?.animes ?? []) as AnimeSearchResult[];
                    setState({ isLoading: false, error: undefined, animes });
                    onSearchRequestFinished(source, {
                        isLoading: false,
                        hasResults: !!animes.length,
                        emptySearch: false,
                        error: undefined,
                    });
                })
                .catch((error) => {
                    if (!isActive) {
                        return;
                    }

                    setState({ isLoading: false, error, animes: [] });
                    onSearchRequestFinished(source, {
                        isLoading: false,
                        hasResults: false,
                        emptySearch: false,
                        error,
                    });
                });

            return () => {
                isActive = false;
                abortRequestRef.current(new Error(`SourceAnimeSearchPreview(${id}, ${name}): search changed`));
            };
        }, [id, name, onSearchRequestFinished, searchString, source]);

        const { isLoading, error, animes } = state;
        const noAnimesFound = !error && !isLoading && !animes.length;

        let errorMessage: string | undefined;
        if (error) {
            errorMessage = t('search.error.label.source_search_failed');
        } else if (noAnimesFound) {
            errorMessage = 'No anime found.';
        }

        if ((!isLoading && !searchString) || emptyQuery) {
            return null;
        }

        if (shouldShowOnlySourcesWithResults && (noAnimesFound || error)) {
            return null;
        }

        return (
            <Box sx={{ pb: 2 }}>
                <Card sx={{ mb: 1 }}>
                    <CardActionArea
                        component={Link}
                        to={AppRoutes.animeSources.childRoutes.browse.path(id, searchString)}
                        sx={{ p: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                        <Box>
                            <Typography variant="h5">{displayName ?? name}</Typography>
                            <Typography variant="caption">{translateExtensionLanguage(lang)}</Typography>
                        </Box>
                        <CustomTooltip title={t('global.button.show_more')}>
                            <IconButton {...MUIUtil.preventRippleProp()}>
                                <ArrowForwardIcon />
                            </IconButton>
                        </CustomTooltip>
                    </CardActionArea>
                </Card>
                {errorMessage ? (
                    <EmptyView
                        sx={{ alignItems: 'start', height: undefined }}
                        noFaces
                        message={errorMessage}
                        messageExtra={getErrorMessage(error)}
                    />
                ) : (
                    <Box
                        sx={{
                            display: 'grid',
                            gridAutoFlow: 'column',
                            gridAutoColumns: {
                                xs: 'minmax(116px, 34vw)',
                                sm: 140,
                                md: 156,
                            },
                            gap: 1,
                            overflowX: 'auto',
                            overscrollBehaviorX: 'contain',
                            pb: 1,
                        }}
                    >
                        {animes.map((anime) => (
                            <AnimeGridCard
                                key={anime.id}
                                anime={anime}
                                linkTo={AppRoutes.anime.childRoutes.details.path(anime.id)}
                                mode="source"
                                inLibraryIndicator
                            />
                        ))}
                    </Box>
                )}
            </Box>
        );
    },
);

export const AnimeSearchAll: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { state } = useLocation<{ shouldShowOnlyPinnedSources?: boolean }>();
    const { ref: filterHeaderRef, height: filterHeaderHeight } = useElementSize();

    const shouldShowOnlyPinnedSources = state?.shouldShowOnlyPinnedSources ?? false;

    const [query] = useQueryParam(SearchParam.QUERY, StringParam);
    const searchString = useDebounce(query, TRIGGER_SEARCH_THRESHOLD);

    const {
        metadata,
        settings: { showNsfw, animeSourceLanguages, shouldShowOnlySourcesWithResults },
    } = useMetadataServerSettings();
    const {
        settings: { yomitanLanguage },
    } = useOCR();
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
    const { data, loading, error, refetch } = requestManager.useGetAnimeSourceList({
        notifyOnNetworkStatusChange: true,
    });
    const refetchRef = useRef(refetch);
    useEffect(() => {
        refetchRef.current = refetch;
    }, [refetch]);
    const refreshSources = useCallback(() => {
        refetchRef.current().catch(defaultPromiseErrorHandler('AnimeSearchAll::refetch'));
    }, []);
    const sources = useMemo<AnimeSourceInfo[]>(
        () => (data?.animeSources?.nodes ?? []) as AnimeSourceInfo[],
        [data?.animeSources?.nodes],
    );

    const [sourceToLoadingStateMap, setSourceToLoadingStateMap] = useState<SourceToLoadingStateMap>(new Map());
    const debouncedSourceToLoadingStateMap = useDebounce(sourceToLoadingStateMap, 500);

    const filteredSources = useMemo(
        () =>
            Sources.filter(sources, {
                showNsfw,
                languages: shownLangs,
                keepLocalSource: true,
                pinned: shouldShowOnlyPinnedSources,
                enabled: true,
            }),
        [sources, showNsfw, shownLangs, shouldShowOnlyPinnedSources],
    );
    const sourcesSortedByName = useMemo(() => [...filteredSources].toSorted(compareSourceByName), [filteredSources]);
    const sourcesSortedByResult = useMemo(
        () =>
            [...sourcesSortedByName].sort((sourceA, sourceB) =>
                compareSourcesBySearchResult(sourceA, sourceB, debouncedSourceToLoadingStateMap),
            ),
        [sourcesSortedByName, debouncedSourceToLoadingStateMap],
    );

    const updateSourceLoadingState = useCallback(
        ({ id }: SourceIdInfo, loadState: SourceLoadingState) => {
            setSourceToLoadingStateMap((currentMap) => {
                const mapCopy = new Map(currentMap);
                mapCopy.set(id, loadState);
                return mapCopy;
            });
        },
        [setSourceToLoadingStateMap],
    );

    const updateMetadataSettings = createUpdateMetadataServerSettings<'shouldShowOnlySourcesWithResults'>((e) =>
        makeToast(t('global.error.label.failed_to_save_changes'), 'error', getErrorMessage(e)),
    );
    const updateSourceFilter = useCallback(
        (shouldShowPinnedOnly: boolean) => {
            navigate(
                {
                    pathname: '',
                    search: query ? `query=${query}` : '',
                },
                {
                    replace: true,
                    state: { ...state, shouldShowOnlyPinnedSources: shouldShowPinnedOnly },
                },
            );
        },
        [navigate, query, state],
    );

    useAppTitleAndAction(t('search.title.global_search'), <AppbarSearch isClosable={false} />, []);

    if (loading) {
        return <LoadingPlaceholder />;
    }

    if (error) {
        return (
            <EmptyViewAbsoluteCentered
                message={t('global.error.label.failed_to_load_data')}
                messageExtra={getErrorMessage(error)}
                retry={refreshSources}
            />
        );
    }

    return (
        <Box sx={{ position: 'relative', px: 1, pb: 1 }}>
            <Stack
                ref={filterHeaderRef}
                sx={{
                    width: '100%',
                    position: 'fixed',
                    zIndex: 1,
                    flexDirection: 'row',
                    gap: 1,
                    pt: 1,
                    pb: 2,
                    px: 1,
                    ml: -1,
                    overflowX: 'auto',
                    background: (theme) => theme.palette.background.default,
                }}
            >
                <Chip
                    icon={<PushPinIcon />}
                    label={t('global.label.pinned')}
                    color={shouldShowOnlyPinnedSources ? 'primary' : 'default'}
                    variant={shouldShowOnlyPinnedSources ? 'filled' : 'outlined'}
                    onClick={() => updateSourceFilter(true)}
                    clickable
                />
                <Chip
                    icon={<DoneAllIcon />}
                    label={t('extension.language.all')}
                    color={!shouldShowOnlyPinnedSources ? 'primary' : 'default'}
                    variant={!shouldShowOnlyPinnedSources ? 'filled' : 'outlined'}
                    onClick={() => updateSourceFilter(false)}
                    clickable
                />
                <Divider orientation="vertical" flexItem />
                <Chip
                    icon={<FilterListIcon />}
                    label={t('search.filter.has_results')}
                    color={shouldShowOnlySourcesWithResults ? 'primary' : 'default'}
                    variant={shouldShowOnlySourcesWithResults ? 'filled' : 'outlined'}
                    onClick={() =>
                        updateMetadataSettings('shouldShowOnlySourcesWithResults', !shouldShowOnlySourcesWithResults)
                    }
                    clickable
                />
            </Stack>
            <Box sx={{ pt: `${filterHeaderHeight}px` }}>
                {sourcesSortedByResult.map((source) => (
                    <SourceAnimeSearchPreview
                        key={source.id}
                        source={source}
                        onSearchRequestFinished={updateSourceLoadingState}
                        searchString={searchString}
                        emptyQuery={!query}
                        shouldShowOnlySourcesWithResults={shouldShowOnlySourcesWithResults}
                    />
                ))}
            </Box>
        </Box>
    );
};
