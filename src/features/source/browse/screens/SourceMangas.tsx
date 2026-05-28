/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import IconButton from '@mui/material/IconButton';
import SettingsIcon from '@mui/icons-material/Settings';
import { useQueryParam, StringParam } from 'use-query-params';
import { useTranslation } from 'react-i18next';
import Link from '@mui/material/Link';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { styled } from '@mui/material/styles';
import FavoriteIcon from '@mui/icons-material/Favorite';
import NewReleasesIcon from '@mui/icons-material/NewReleases';
import FilterListIcon from '@mui/icons-material/FilterList';
import AddIcon from '@mui/icons-material/Add';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';
import {
    requestManager,
    AbortableApolloUseMutationPaginatedResponse,
    SPECIAL_ED_SOURCES,
} from '@/lib/requests/RequestManager.ts';
import { SourceGridLayout } from '@/features/source/components/SourceGridLayout.tsx';
import { AppbarSearch } from '@/base/components/AppbarSearch.tsx';
import { SourceOptions } from '@/features/source/browse/components/SourceOptions.tsx';
import { BaseMangaGrid } from '@/features/manga/components/BaseMangaGrid.tsx';
import { GetSourceMangasFetchMutation, GetSourceMangasFetchMutationVariables } from '@/lib/requests/types.ts';
import {
    updateMetadataServerSettings,
    useMetadataServerSettings,
} from '@/features/settings/services/ServerSettingsMetadata.ts';
import { useSessionStorage } from '@/base/hooks/useStorage.tsx';
import { MANGA_GRID_SNAPSHOT_KEY } from '@/features/manga/components/MangaGrid.tsx';
import { createUpdateSourceMetadata, useGetSourceMetadata } from '@/features/source/services/SourceMetadata.ts';
import { makeToast } from '@/base/utils/Toast.ts';
import { IPos, SavedSourceSearch, SourceFilters, SourceIdInfo } from '@/features/source/Source.types.ts';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { EmptyView } from '@/base/components/feedback/EmptyView.tsx';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { MangaIdInfo } from '@/features/manga/Manga.types.ts';
import { GridLayout, SearchParam, TranslationKey } from '@/base/Base.types.ts';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { Sources } from '@/features/source/services/Sources.ts';
import { useAppTitleAndAction } from '@/features/navigation-bar/hooks/useAppTitleAndAction.ts';
import { useNavBarContext } from '@/features/navigation-bar/NavbarContext.tsx';
import { VirtuosoUtil } from '@/lib/virtuoso/Virtuoso.util.tsx';
import { IconWebView } from '@/assets/icons/IconWebView.tsx';
import { openExternalUrl } from '@/Manatan/utils/openExternalUrl.ts';
import {
    SOURCE_BROWSE_HELP_URL,
    SourceBrowseErrorView,
    SourceBrowseSetupView,
} from '@/features/source/browse/components/SourceBrowseErrorView.tsx';
import {
    getNativeSourceSetupState,
    getSourceBrowseDisplayMessage,
} from '@/features/source/browse/services/sourceBrowseError.ts';
import {
    LocalMangaImportDialog,
    LocalSeriesOption,
} from '@/features/source/browse/components/LocalMangaImportDialog.tsx';
import { MANATAN_SOURCE_GRID_LAYOUT_META_KEY, useServerMetaState } from '@/Manatan/services/ServerMetaStorage.ts';
import { MANATAN_LOCAL_MANGA_GUIDE_URL } from '@/Manatan/branding/ManatanBranding.tsx';

const DEFAULT_SOURCE: SourceIdInfo = { id: '-1' };
const LOCAL_MANGA_GUIDE_URL = MANATAN_LOCAL_MANGA_GUIDE_URL;

const ContentTypeMenu = styled('div')(({ theme }) => ({
    display: 'flex',
    position: 'sticky',
    width: '100%',
    zIndex: 1,
    padding: theme.spacing(1),
    gap: theme.spacing(1),
    backgroundColor: theme.palette.background.default,
}));

const ContentTypeButton = styled(Button)(() => ({}));

const StyledGridWrapper = styled(Box)(() => ({
    minHeight: '100%',
    position: 'relative',
}));

export enum SourceContentType {
    POPULAR,
    LATEST,
    SEARCH,
}

const SOURCE_CONTENT_TYPE_TO_ERROR_MSG_KEY: { [contentType in SourceContentType]: TranslationKey } = {
    [SourceContentType.POPULAR]: 'manga.error.label.no_mangas_found',
    [SourceContentType.LATEST]: 'manga.error.label.no_mangas_found',
    [SourceContentType.SEARCH]: 'manga.error.label.no_matches',
};

const getUniqueMangas = <Manga extends MangaIdInfo & { inLibrary?: boolean }>(mangas: Manga[]): Manga[] => {
    const mangaIdToManga: Record<string, Manga> = {};
    const uniqueMangas: Manga[] = [];

    mangas.forEach((manga) => {
        const existing = mangaIdToManga[manga.id];
        if (!existing) {
            mangaIdToManga[manga.id] = manga;
            uniqueMangas.push(manga);
            return;
        }

        if (!existing.inLibrary && manga.inLibrary) {
            mangaIdToManga[manga.id] = manga;
            const index = uniqueMangas.findIndex((item) => item.id === manga.id);
            if (index >= 0) {
                uniqueMangas[index] = manga;
            }
        }
    });

    return uniqueMangas;
};

const useSourceManga = (
    sourceId: string,
    contentType: SourceContentType,
    searchTerm: string | null | undefined,
    filters: IPos[],
    initialPages: number,
    hideLibraryEntries: boolean,
): [
    AbortableApolloUseMutationPaginatedResponse<GetSourceMangasFetchMutation, GetSourceMangasFetchMutationVariables>[0],
    AbortableApolloUseMutationPaginatedResponse<
        GetSourceMangasFetchMutation,
        GetSourceMangasFetchMutationVariables
    >[1][number] & {
        filteredOutAllItemsOfFetchedPage: boolean;
        duplicateOnlyFetchedPage: boolean;
    },
] => {
    let result: AbortableApolloUseMutationPaginatedResponse<
        GetSourceMangasFetchMutation,
        GetSourceMangasFetchMutationVariables
    >;
    switch (contentType) {
        case SourceContentType.POPULAR:
            result = requestManager.useGetSourcePopularMangas(sourceId, initialPages);
            break;
        case SourceContentType.LATEST:
            result = requestManager.useGetSourceLatestMangas(sourceId, initialPages);
            break;
        case SourceContentType.SEARCH:
            result = requestManager.useSourceSearch(
                sourceId,
                searchTerm ?? '',
                filters.map((filter) => {
                    const { position, state, group } = filter;

                    const isPartOfGroup = group !== undefined;
                    if (isPartOfGroup) {
                        return {
                            position: group,
                            groupChange: {
                                position,
                                [filter.type]: state,
                            },
                        };
                    }

                    return {
                        position,
                        [filter.type]: state,
                    };
                }),
                initialPages,
            );
            break;
        default:
            throw new Error(`Unknown ContentType "${contentType}"`);
    }

    const pages = result[1]!;
    const lastLoadedPageIndex = pages.findLastIndex((page) => !!page.data?.fetchSourceManga);
    const lastLoadedPage = pages[lastLoadedPageIndex];

    const isPageLoading = pages.slice(-1)[0].isLoading;
    let filteredOutAllItemsOfFetchedPage = !isPageLoading;
    let duplicateOnlyFetchedPage = false;
    const items = useMemo(() => {
        type FetchItemsResult = NonNullable<GetSourceMangasFetchMutation['fetchSourceManga']>['mangas'];
        let allItems: FetchItemsResult = [];

        pages.forEach((page, index) => {
            const pageItems = page.data?.fetchSourceManga?.mangas ?? [];
            const nonLibraryPageItems = pageItems.filter((item) => !hideLibraryEntries || !item.inLibrary);
            const previousItemCount = allItems.length;
            const uniqueItems = getUniqueMangas([...allItems, ...nonLibraryPageItems]);

            const isLastPage = !isPageLoading && pages.length === index + 1;
            filteredOutAllItemsOfFetchedPage = isLastPage && !nonLibraryPageItems.length && !!pageItems.length;
            duplicateOnlyFetchedPage =
                isLastPage && !!nonLibraryPageItems.length && uniqueItems.length === previousItemCount;
            allItems = uniqueItems;
        });

        return allItems;
    }, [pages, hideLibraryEntries]);

    if (lastLoadedPageIndex === -1) {
        return [
            result[0],
            {
                ...result[1][result[1].length - 1],
                filteredOutAllItemsOfFetchedPage,
                duplicateOnlyFetchedPage,
            },
        ];
    }

    return [
        result[0],
        {
            ...pages[pages.length - 1],
            data: {
                ...lastLoadedPage!.data,
                fetchSourceManga: {
                    ...lastLoadedPage!.data!.fetchSourceManga,
                    hasNextPage:
                        !duplicateOnlyFetchedPage &&
                        pages.length <= lastLoadedPageIndex + 1 &&
                        !!lastLoadedPage!.data!.fetchSourceManga?.hasNextPage,
                    mangas: items,
                },
            },
            filteredOutAllItemsOfFetchedPage,
            duplicateOnlyFetchedPage,
        },
    ];
};

export function SourceMangas() {
    const { t } = useTranslation();
    const { appBarHeight } = useNavBarContext();

    const { sourceId } = useParams<{ sourceId: string }>();

    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { key: locationKey, state: locationState } = location;
    const { contentType: initialContentType = SourceContentType.POPULAR, clearCache = false } =
        useLocation<{
            contentType: SourceContentType;
            clearCache: boolean;
        }>().state ?? {};

    const {
        settings: { hideLibraryEntries },
    } = useMetadataServerSettings();

    const [sourceGridLayout] = useServerMetaState(MANATAN_SOURCE_GRID_LAYOUT_META_KEY, GridLayout.Compact, {
        legacyLocalStorageKey: 'source-grid-layout',
    });
    const [query] = useQueryParam(SearchParam.QUERY, StringParam);
    const [currentFiltersToApply, setCurrentFiltersToApply] = useSessionStorage<IPos[] | undefined>(
        `source-mangas-${sourceId}-filters`,
        [],
    );
    const [filtersToApply, setLocationFiltersToApply] = useSessionStorage<IPos[]>(
        `source-mangas-location-${locationKey}-${sourceId}-filters`,
        currentFiltersToApply ?? [],
    );
    const [dialogFiltersToApply, setDialogFiltersToApply] = useState<IPos[]>(filtersToApply);
    const [sourceFilterOverride, setSourceFilterOverride] = useState<SourceFilters[] | null>(null);
    const [currentContentType, setCurrentContentType] = useSessionStorage<SourceContentType | undefined>(
        `source-mangas-${sourceId}-content-type`,
        initialContentType,
    );
    const [isLocalImportOpen, setIsLocalImportOpen] = useState(false);
    const [contentType, setLocationContentType] = useSessionStorage(
        `source-mangas-location-${locationKey}-${sourceId}-content-type`,
        query ? SourceContentType.SEARCH : currentContentType!,
    );

    const { key: persistedGridStateKey, deleteState: deletePersistedGridState } =
        VirtuosoUtil.usePersistState(MANGA_GRID_SNAPSHOT_KEY);
    const scrollToTop = useCallback(() => {
        deletePersistedGridState();
        window.scrollTo(0, 0);
    }, [persistedGridStateKey]);

    const currentQuery = useRef(query);
    const currentAbortRequest = useRef<(reason: any) => void>(() => {});

    const didSearchChange = currentQuery.current !== query;
    if (didSearchChange && contentType === SourceContentType.SEARCH) {
        currentQuery.current = query;
        currentAbortRequest.current(new Error(`SourceMangas(${sourceId}): search string changed`));
        scrollToTop();
    }

    useEffect(() => {
        setSourceFilterOverride(null);

        return () => {
            setCurrentFiltersToApply(undefined);
            setCurrentContentType(undefined);
            setSourceFilterOverride(null);
        };
    }, [sourceId]);

    const setFiltersToApply = (filters: IPos[]) => {
        setCurrentFiltersToApply(filters);
        setLocationFiltersToApply(filters);
        scrollToTop();
    };

    const setContentType = (newContentType: SourceContentType) => {
        setCurrentContentType(newContentType);
        setLocationContentType(newContentType);
    };

    const gridKey = `${sourceId}:${contentType}:${JSON.stringify(filtersToApply)}:${query ?? ''}`;

    const [
        loadPage,
        { data, error, isLoading: loading, size: lastPageNum, abortRequest, filteredOutAllItemsOfFetchedPage },
    ] = useSourceManga(sourceId, contentType, query, filtersToApply, 1, hideLibraryEntries);
    currentAbortRequest.current = abortRequest;
    const mangas = data?.fetchSourceManga?.mangas ?? [];
    const hasNextPage = !!data?.fetchSourceManga?.hasNextPage;
    const isLoading = loading || (filteredOutAllItemsOfFetchedPage && hasNextPage);
    const { data: sourceData, refetch: refetchSourceBrowse } = requestManager.useGetSourceBrowse(sourceId);
    const source = sourceData?.source;

    const filters = sourceFilterOverride ?? source?.filters ?? [];
    const sourceMetadata = useGetSourceMetadata(source ?? DEFAULT_SOURCE);
    const [savedSearches, setSavedSearches] = useState<Record<string, SavedSourceSearch>>(
        sourceMetadata.savedSearches ?? {},
    );

    useEffect(() => {
        setSavedSearches(sourceMetadata.savedSearches ?? {});
    }, [sourceId, sourceMetadata.savedSearches]);

    const updateSourceMetadata = createUpdateSourceMetadata<'savedSearches'>(source ?? { id: '-1' }, (e) =>
        makeToast(t('global.error.label.failed_to_save_changes'), 'error', getErrorMessage(e)),
    );

    const selectSavedSearch = useCallback(
        (savedSearch: string) => {
            const { query: savedSearchQuery, filters: savedSearchFilters } = savedSearches[savedSearch];

            if (savedSearchFilters) {
                setDialogFiltersToApply(savedSearchFilters);
                setFiltersToApply(savedSearchFilters);
            }

            if (savedSearchQuery) {
                searchParams.set(SearchParam.QUERY, savedSearchQuery);
                setSearchParams(searchParams);
            }
        },
        [savedSearches, locationState],
    );

    const handleSavedSearchesUpdate = useCallback(
        (savedSearch: string, updateType: 'create' | 'delete') => {
            const normalizedSavedSearch = savedSearch.trim();
            if (!normalizedSavedSearch) {
                return;
            }

            if (updateType === 'delete') {
                const savedSearchesCopy = { ...savedSearches };
                delete savedSearchesCopy[normalizedSavedSearch];
                setSavedSearches(savedSearchesCopy);
                updateSourceMetadata('savedSearches', savedSearchesCopy);
                refetchSourceBrowse().catch(defaultPromiseErrorHandler('SourceMangas::refetchSourceBrowse'));
                return;
            }

            const updatedSavedSearches = {
                ...savedSearches,
                [normalizedSavedSearch]: { query: query ?? undefined, filters: dialogFiltersToApply },
            };
            setSavedSearches(updatedSavedSearches);
            updateSourceMetadata('savedSearches', updatedSavedSearches);
            refetchSourceBrowse().catch(defaultPromiseErrorHandler('SourceMangas::refetchSourceBrowse'));
        },
        [savedSearches, query, dialogFiltersToApply, refetchSourceBrowse],
    );

    const message = !isLoading ? t(SOURCE_CONTENT_TYPE_TO_ERROR_MSG_KEY[contentType]) : undefined;
    const isLocalSource = sourceId === Sources.LOCAL_SOURCE_ID;
    const localSeriesOptions = useMemo<LocalSeriesOption[]>(() => {
        const uniqueSeries = new Map<string, LocalSeriesOption>();

        mangas.forEach((manga) => {
            const title = manga.title.trim();
            if (!title) {
                return;
            }

            const key = title.toLocaleLowerCase();
            if (!uniqueSeries.has(key)) {
                uniqueSeries.set(key, {
                    id: manga.id,
                    title,
                    thumbnailUrl: manga.thumbnailUrl ?? null,
                });
            }
        });

        return [...uniqueSeries.values()].sort((left, right) =>
            left.title.localeCompare(right.title, undefined, { sensitivity: 'base' }),
        );
    }, [mangas]);
    const handleLocalGuideClick = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
        if (openExternalUrl(LOCAL_MANGA_GUIDE_URL)) {
            event.preventDefault();
        }
    }, []);
    const messageExtra = isLocalSource ? (
        <>
            <span>{t('source.local_source.label.checkout')} </span>
            <Link href={LOCAL_MANGA_GUIDE_URL} target="_blank" rel="noreferrer" onClick={handleLocalGuideClick}>
                {t('source.local_source.label.guide')}
            </Link>
        </>
    ) : undefined;

    const updateContentType = useCallback(
        (newContentType: SourceContentType, newSearch?: string | null) => {
            setContentType(newContentType);
            scrollToTop();

            if (query && !newSearch) {
                navigate(
                    {
                        pathname: '',
                    },
                    {
                        state: { ...locationState, contentType: newContentType },
                    },
                );
            }
        },
        [setContentType, query, scrollToTop],
    );

    const setSearchContentType = !!query && contentType !== SourceContentType.SEARCH;
    if (setSearchContentType) {
        updateContentType(SourceContentType.SEARCH, query);
    }

    const loadMore = useCallback(() => {
        if (!hasNextPage) {
            return;
        }

        loadPage(lastPageNum + 1);
    }, [lastPageNum, hasNextPage, contentType]);

    const resetFilters = async () => {
        setDialogFiltersToApply([]);

        if (!sourceId || isLocalSource) {
            return;
        }

        try {
            const refreshedFilters = await requestManager.fetchSourceFilters(sourceId, { reset: true });
            setSourceFilterOverride(refreshedFilters as SourceFilters[]);
            refetchSourceBrowse().catch(defaultPromiseErrorHandler('SourceMangas::refetchFiltersAfterReset'));
        } catch (resetError) {
            makeToast(t('global.error.label.failed_to_load_data'), 'error', getErrorMessage(resetError));
        }
    };

    useEffect(() => {
        updateMetadataServerSettings('lastUsedSourceId', sourceId).catch(
            defaultPromiseErrorHandler('SourceMangas::setLastUsedSourceId'),
        );
    }, [sourceId]);

    useEffect(() => {
        if (filteredOutAllItemsOfFetchedPage && hasNextPage && !loading) {
            loadPage(lastPageNum + 1);
        }
    }, [filteredOutAllItemsOfFetchedPage, loading]);

    useEffect(() => {
        if (!clearCache) {
            return;
        }

        const requiresClear = SPECIAL_ED_SOURCES.REVALIDATION_UNSUPPORTED.includes(sourceId);
        if (!requiresClear) {
            return;
        }

        requestManager.clearBrowseCacheFor(sourceId);
    }, [clearCache, sourceId]);

    useAppTitleAndAction(
        source?.displayName ?? t('source.title_one'),
        <>
            <AppbarSearch />
            <SourceGridLayout />
            {isLocalSource && (
                <CustomTooltip title="Local File Import">
                    <IconButton
                        color="inherit"
                        onClick={() => setIsLocalImportOpen(true)}
                        aria-label="Import local manga file"
                    >
                        <AddIcon />
                    </IconButton>
                </CustomTooltip>
            )}
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
                        onClick={() => navigate(AppRoutes.sources.childRoutes.configure.path(sourceId))}
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

    const rawErrorMessage = getErrorMessage(error);
    const errorMessage = getSourceBrowseDisplayMessage(rawErrorMessage, t('global.error.label.failed_to_load_data'));
    const sourceSetupState = getNativeSourceSetupState(source, rawErrorMessage, sourceId);
    const webViewUrl = source?.baseUrl ? requestManager.getWebviewUrl(source.baseUrl) : undefined;
    const helpFooter =
        'This source does not seem to be working right now. Retry, open WebView, or check Help for troubleshooting.';
    const EmptyViewComponent = mangas.length ? EmptyView : EmptyViewAbsoluteCentered;
    let errorView = null;

    if (error) {
        if (mangas.length) {
            errorView = (
                <EmptyViewComponent
                    message={errorMessage}
                    messageExtra={getErrorMessage(error)}
                    retry={() => loadPage(lastPageNum).catch(defaultPromiseErrorHandler('SourceMangas::refetch'))}
                />
            );
        } else if (sourceSetupState) {
            errorView = (
                <SourceBrowseSetupView
                    absolute
                    title={sourceSetupState.title}
                    message={sourceSetupState.message}
                    configureLabel={sourceSetupState.configureLabel}
                    onConfigure={() => navigate(AppRoutes.sources.childRoutes.configure.path(sourceId))}
                    onRetry={async () => {
                        await loadPage(lastPageNum).catch(defaultPromiseErrorHandler('SourceMangas::refetch'));
                    }}
                />
            );
        } else {
            errorView = (
                <SourceBrowseErrorView
                    absolute
                    message={errorMessage}
                    webViewUrl={webViewUrl}
                    onRetry={async () => {
                        await loadPage(lastPageNum).catch(defaultPromiseErrorHandler('SourceMangas::refetch'));
                    }}
                    onHelp={() => {
                        openExternalUrl(SOURCE_BROWSE_HELP_URL);
                    }}
                    footer={helpFooter}
                />
            );
        }
    }

    return (
        <StyledGridWrapper>
            <ContentTypeMenu sx={{ top: `${appBarHeight}px` }}>
                <ContentTypeButton
                    variant={contentType === SourceContentType.POPULAR ? 'contained' : 'outlined'}
                    startIcon={<FavoriteIcon />}
                    onClick={() => updateContentType(SourceContentType.POPULAR)}
                >
                    {t('global.button.popular')}
                </ContentTypeButton>
                {source?.supportsLatest === undefined || source.supportsLatest ? (
                    <ContentTypeButton
                        disabled={!source?.supportsLatest}
                        variant={contentType === SourceContentType.LATEST ? 'contained' : 'outlined'}
                        startIcon={<NewReleasesIcon />}
                        onClick={() => updateContentType(SourceContentType.LATEST)}
                    >
                        {t('global.button.latest')}
                    </ContentTypeButton>
                ) : null}
                <ContentTypeButton
                    variant={contentType === SourceContentType.SEARCH ? 'contained' : 'outlined'}
                    startIcon={<FilterListIcon />}
                    onClick={() => updateContentType(SourceContentType.SEARCH, query)}
                >
                    {t('global.button.filter')}
                </ContentTypeButton>
            </ContentTypeMenu>

            {(isLoading || !error || (!!error && !!mangas.length)) && (
                <BaseMangaGrid
                    // the key needs to include filters and query to force a re-render of the virtuoso grid to prevent https://github.com/petyosi/react-virtuoso/issues/1242
                    key={gridKey}
                    gridWrapperProps={{ sx: { px: 1, pb: 1 } }}
                    mangas={mangas}
                    hasNextPage={hasNextPage}
                    loadMore={loadMore}
                    message={message}
                    messageExtra={messageExtra}
                    isLoading={isLoading}
                    gridLayout={sourceGridLayout}
                    mode="source"
                    inLibraryIndicator
                />
            )}

            {errorView}

            {contentType === SourceContentType.SEARCH && (
                <SourceOptions
                    savedSearches={savedSearches}
                    selectSavedSearch={selectSavedSearch}
                    updateSavedSearches={handleSavedSearchesUpdate}
                    sourceFilter={filters}
                    updateFilterValue={setDialogFiltersToApply}
                    setTriggerUpdate={() => {
                        setFiltersToApply(dialogFiltersToApply);
                    }}
                    resetFilterValue={resetFilters}
                    update={dialogFiltersToApply}
                />
            )}

            <LocalMangaImportDialog
                open={isLocalImportOpen}
                seriesOptions={localSeriesOptions}
                onClose={() => setIsLocalImportOpen(false)}
                onImported={() => {
                    requestManager.clearBrowseCacheFor(sourceId);
                    setIsLocalImportOpen(false);
                    if (contentType === SourceContentType.LATEST) {
                        loadPage(1).catch(defaultPromiseErrorHandler('SourceMangas::reloadAfterLocalImport'));
                        return;
                    }
                    updateContentType(SourceContentType.LATEST);
                }}
            />
        </StyledGridWrapper>
    );
}
