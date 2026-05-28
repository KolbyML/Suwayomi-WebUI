/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { type MouseEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import SettingsIcon from '@mui/icons-material/Settings';
import { useTranslation } from 'react-i18next';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { AnimeGridCard } from '@/features/anime/components/AnimeGridCard.tsx';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { AppbarSearch } from '@/base/components/AppbarSearch.tsx';
import { SourceGridLayout } from '@/features/source/components/SourceGridLayout.tsx';
import { useAppTitleAndAction } from '@/features/navigation-bar/hooks/useAppTitleAndAction.ts';
import { IconWebView } from '@/assets/icons/IconWebView.tsx';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';
import { GridLayout } from '@/base/Base.types.ts';
import { AnimeListCard } from '@/features/anime/components/AnimeListCard.tsx';
import { updateMetadataServerSettings } from '@/features/settings/services/ServerSettingsMetadata.ts';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { useIntersectionObserver } from '@/base/hooks/useIntersectionObserver.tsx';
import { Sources } from '@/features/source/services/Sources.ts';
import { toggleAnimeLibraryState } from '@/features/anime/services/AnimeLibrary.ts';
import { MANATAN_LOCAL_ANIME_GUIDE_URL } from '@/Manatan/branding/ManatanBranding.tsx';
import { openManatanExternalUrl, useManatanSourceGridLayout } from '@/Manatan/anime/AnimePrivateAdapters.ts';
import {
    SOURCE_BROWSE_HELP_URL,
    SourceBrowseErrorView,
    SourceBrowseSetupView,
} from '@/features/source/browse/components/SourceBrowseErrorView.tsx';
import {
    getNativeSourceSetupState,
    getSourceBrowseDisplayMessage,
} from '@/features/source/browse/services/sourceBrowseError.ts';
import { SourceOptions } from '@/features/source/browse/components/SourceOptions.tsx';
import { IPos, SourceFilters } from '@/features/source/Source.types.ts';
import { useSessionStorage } from '@/base/hooks/useStorage.tsx';
import { makeToast } from '@/base/utils/Toast.ts';
import { AnimeSourceContentType } from '@/features/anime/browse/AnimeSourceBrowse.types.ts';

const LOCAL_ANIME_GUIDE_URL = MANATAN_LOCAL_ANIME_GUIDE_URL;

type AnimeSourceBrowseResult = {
    id: number;
    title: string;
    thumbnailUrl?: string | null;
    sourceId: string;
    url?: string | null;
    inLibrary?: boolean;
};

export const AnimeSourceBrowse = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const { sourceId } = useParams<{ sourceId: string }>();
    const [searchParams] = useSearchParams();
    const query = searchParams.get('query') ?? '';

    const locationState = (location.state ?? {}) as {
        contentType?: AnimeSourceContentType;
    };
    const initialContentType = locationState.contentType ?? AnimeSourceContentType.POPULAR;

    const [contentType, setContentType] = useState(initialContentType);
    const [animeEntries, setAnimeEntries] = useState<AnimeSourceBrowseResult[]>([]);
    const [hasNextPage, setHasNextPage] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [filtersToApply, setFiltersToApply] = useSessionStorage<IPos[]>(`anime-source-${sourceId}-filters`, []);
    const [dialogFiltersToApply, setDialogFiltersToApply] = useState<IPos[]>(filtersToApply);
    const [sourceFilterOverride, setSourceFilterOverride] = useState<SourceFilters[] | null>(null);
    const [gridLayout] = useManatanSourceGridLayout();
    const loadMoreAnchorRef = useRef<HTMLDivElement | null>(null);
    const fetchRequestIdRef = useRef(0);
    const isLoadingMoreRef = useRef(false);

    const {
        data: sourceData,
        loading: sourceLoading,
        error: sourceError,
    } = requestManager.useGetAnimeSourceBrowse(sourceId ?? '-1', { notifyOnNetworkStatusChange: true });
    const [fetchSourceAnimes, { loading: listLoading, error: listError }] = requestManager.useGetSourceAnimes();
    const fetchSourceAnimesRef = useRef(fetchSourceAnimes);

    useEffect(() => {
        fetchSourceAnimesRef.current = fetchSourceAnimes;
    }, [fetchSourceAnimes]);

    const fetchAnimePage = useCallback(
        async (page: number, append: boolean) => {
            if (!sourceId) {
                return;
            }

            fetchRequestIdRef.current += 1;
            const requestId = fetchRequestIdRef.current;
            if (page > 1) {
                isLoadingMoreRef.current = true;
                setIsLoadingMore(true);
            }

            try {
                const result = await fetchSourceAnimesRef.current({
                    variables: {
                        input: {
                            source: sourceId,
                            type: contentType,
                            page,
                            query: contentType === AnimeSourceContentType.SEARCH ? query : undefined,
                            filters: contentType === AnimeSourceContentType.SEARCH ? filtersToApply : undefined,
                        },
                    },
                });

                if (requestId !== fetchRequestIdRef.current) {
                    return;
                }

                const payload = result.data?.fetchSourceAnime;
                const nextEntries = (payload?.animes ?? []) as AnimeSourceBrowseResult[];
                const nextHasNextPage = !!payload?.hasNextPage;

                setCurrentPage(page);
                setHasNextPage(nextHasNextPage);
                setAnimeEntries((previous) => {
                    if (!append) {
                        return nextEntries;
                    }
                    const byId = new Map<number, AnimeSourceBrowseResult>();
                    previous.forEach((entry) => byId.set(entry.id, entry));
                    nextEntries.forEach((entry) => byId.set(entry.id, entry));
                    return [...byId.values()];
                });
            } catch {
                // keep current list on page-load failures
            } finally {
                if (page > 1 && requestId === fetchRequestIdRef.current) {
                    isLoadingMoreRef.current = false;
                    setIsLoadingMore(false);
                }
            }
        },
        [sourceId, contentType, query, filtersToApply],
    );

    useEffect(() => {
        setContentType(initialContentType);
        setSourceFilterOverride(null);
    }, [sourceId, initialContentType]);

    useEffect(() => {
        setDialogFiltersToApply(filtersToApply);
    }, [sourceId, filtersToApply]);

    useEffect(() => {
        if (!sourceId) {
            navigate(AppRoutes.browse.path());
            return;
        }
        setAnimeEntries([]);
        setCurrentPage(1);
        setHasNextPage(false);
        fetchAnimePage(1, false).catch(() => {});
    }, [sourceId, contentType, query, fetchAnimePage, navigate]);

    useEffect(() => {
        if (!query || contentType === AnimeSourceContentType.SEARCH) {
            return;
        }
        setContentType(AnimeSourceContentType.SEARCH);
    }, [query, contentType]);

    useEffect(() => {
        if (!sourceId) {
            return;
        }
        updateMetadataServerSettings('lastUsedSourceId', sourceId).catch(
            defaultPromiseErrorHandler('AnimeSourceBrowse::setLastUsedSourceId'),
        );
    }, [sourceId]);

    const loadMore = useCallback(() => {
        if (!hasNextPage || isLoadingMoreRef.current || isLoadingMore || listLoading) {
            return;
        }
        isLoadingMoreRef.current = true;
        setIsLoadingMore(true);
        fetchAnimePage(currentPage + 1, true).catch(() => {});
    }, [hasNextPage, isLoadingMore, listLoading, fetchAnimePage, currentPage]);

    useIntersectionObserver(
        loadMoreAnchorRef,
        useCallback(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    loadMore();
                }
            },
            [loadMore],
        ),
        { rootMargin: '600px 0px' },
    );

    const source = sourceData?.animeSource;
    const isLocalSource = sourceId === Sources.LOCAL_SOURCE_ID;
    const filters = sourceFilterOverride ?? ((source?.filters ?? []) as SourceFilters[]);
    const isLoading = sourceLoading || (listLoading && animeEntries.length === 0);
    const error = sourceError ?? (!animeEntries.length ? listError : undefined);
    const handleLocalGuideClick = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
        if (openManatanExternalUrl(LOCAL_ANIME_GUIDE_URL)) {
            event.preventDefault();
        }
    }, []);
    const resetFilters = async () => {
        setDialogFiltersToApply([]);

        if (!sourceId || isLocalSource) {
            return;
        }

        try {
            const refreshedFilters = await requestManager.fetchAnimeSourceFilters(sourceId, { reset: true });
            setSourceFilterOverride(refreshedFilters as SourceFilters[]);
        } catch (resetError) {
            makeToast(t('global.error.label.failed_to_load_data'), 'error', getErrorMessage(resetError));
        }
    };
    const sourceOptions =
        contentType === AnimeSourceContentType.SEARCH && filters.length ? (
            <SourceOptions
                sourceFilter={filters}
                updateFilterValue={setDialogFiltersToApply}
                setTriggerUpdate={() => {
                    setFiltersToApply(dialogFiltersToApply);
                }}
                resetFilterValue={resetFilters}
                update={dialogFiltersToApply}
            />
        ) : null;
    const localSourceGuide = isLocalSource ? (
        <>
            <span>{t('source.local_source.label.checkout')} </span>
            <Link href={LOCAL_ANIME_GUIDE_URL} target="_blank" rel="noreferrer" onClick={handleLocalGuideClick}>
                {t('source.local_source.label.guide')}
            </Link>
        </>
    ) : undefined;
    const errorMessageExtra = isLocalSource ? (
        <>
            {error ? <span>{getErrorMessage(error)} </span> : null}
            {localSourceGuide}
        </>
    ) : (
        getErrorMessage(error)
    );
    const rawErrorMessage = getErrorMessage(error);
    const errorMessage = getSourceBrowseDisplayMessage(rawErrorMessage, t('global.error.label.failed_to_load_data'));
    const sourceSetupState = getNativeSourceSetupState(source, rawErrorMessage, sourceId);
    const webViewUrl = source?.baseUrl ? requestManager.getWebviewUrl(source.baseUrl) : undefined;

    useAppTitleAndAction(
        source?.displayName ?? t('source.title_one'),
        <>
            <AppbarSearch />
            <SourceGridLayout />
            <CustomTooltip title={t('global.button.open_webview')} disabled={!source?.baseUrl}>
                {source?.baseUrl ? (
                    <IconButton
                        href={requestManager.getWebviewUrl(source.baseUrl)}
                        rel="noreferrer"
                        target="_blank"
                        color="inherit"
                    >
                        <IconWebView />
                    </IconButton>
                ) : (
                    <IconButton disabled color="inherit">
                        <IconWebView />
                    </IconButton>
                )}
            </CustomTooltip>
            {source?.isConfigurable && (
                <CustomTooltip title={t('settings.title')}>
                    <IconButton
                        onClick={() => navigate(AppRoutes.animeSources.childRoutes.configure.path(sourceId ?? '-1'))}
                        aria-label="display more actions"
                        edge="end"
                        color="inherit"
                    >
                        <SettingsIcon />
                    </IconButton>
                </CustomTooltip>
            )}
        </>,
        [source],
    );

    if (isLoading) {
        return <LoadingPlaceholder />;
    }

    if (error || !source) {
        if (sourceSetupState && sourceId) {
            return (
                <SourceBrowseSetupView
                    absolute
                    title={sourceSetupState.title}
                    message={sourceSetupState.message}
                    configureLabel={sourceSetupState.configureLabel}
                    onConfigure={() => navigate(AppRoutes.animeSources.childRoutes.configure.path(sourceId))}
                    onRetry={() => fetchAnimePage(1, false)}
                />
            );
        }

        return (
            <SourceBrowseErrorView
                absolute
                message={errorMessage}
                webViewUrl={webViewUrl}
                onRetry={() => fetchAnimePage(1, false)}
                onHelp={() => {
                    openManatanExternalUrl(SOURCE_BROWSE_HELP_URL);
                }}
                footer={errorMessageExtra}
            />
        );
    }

    if (!animeEntries.length) {
        return (
            <>
                <EmptyViewAbsoluteCentered message="No anime found in this source." messageExtra={localSourceGuide} />
                {sourceOptions}
            </>
        );
    }

    return (
        <Stack gap={2} sx={{ p: 2 }}>
            <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                <Typography variant="h5" component="h1">
                    {source.displayName}
                </Typography>
                <Button
                    size="small"
                    variant={contentType === AnimeSourceContentType.POPULAR ? 'contained' : 'outlined'}
                    onClick={() => setContentType(AnimeSourceContentType.POPULAR)}
                >
                    {t('global.button.popular')}
                </Button>
                {source.supportsLatest && (
                    <Button
                        size="small"
                        variant={contentType === AnimeSourceContentType.LATEST ? 'contained' : 'outlined'}
                        onClick={() => setContentType(AnimeSourceContentType.LATEST)}
                    >
                        {t('global.button.latest')}
                    </Button>
                )}
                <Button
                    size="small"
                    variant={contentType === AnimeSourceContentType.SEARCH ? 'contained' : 'outlined'}
                    onClick={() => setContentType(AnimeSourceContentType.SEARCH)}
                >
                    {t('global.button.search' as any)}
                </Button>
            </Stack>
            <Grid container spacing={1}>
                {animeEntries.map((anime: AnimeSourceBrowseResult) => (
                    <Grid key={anime.id} size={gridLayout === GridLayout.List ? 12 : { xs: 6, sm: 4, md: 3, lg: 2 }}>
                        {gridLayout === GridLayout.List ? (
                            <AnimeListCard
                                anime={anime}
                                linkTo={AppRoutes.anime.childRoutes.details.path(anime.id)}
                                mode="source"
                                inLibraryIndicator
                                onToggleLibrary={async () => {
                                    const nextState = !anime.inLibrary;
                                    await toggleAnimeLibraryState(anime.id, nextState);
                                    setAnimeEntries((current) =>
                                        current.map((entry) =>
                                            entry.id === anime.id ? { ...entry, inLibrary: nextState } : entry,
                                        ),
                                    );
                                }}
                            />
                        ) : (
                            <AnimeGridCard
                                anime={anime}
                                linkTo={AppRoutes.anime.childRoutes.details.path(anime.id)}
                                gridLayout={gridLayout}
                                mode="source"
                                inLibraryIndicator
                                onLibraryChange={(nextState) => {
                                    setAnimeEntries((current) =>
                                        current.map((entry) =>
                                            entry.id === anime.id ? { ...entry, inLibrary: nextState } : entry,
                                        ),
                                    );
                                }}
                            />
                        )}
                    </Grid>
                ))}
            </Grid>
            {hasNextPage && <div ref={loadMoreAnchorRef} style={{ height: 1, width: '100%' }} />}
            {sourceOptions}
        </Stack>
    );
};
