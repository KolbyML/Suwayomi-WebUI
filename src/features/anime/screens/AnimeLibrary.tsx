/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Chip, { ChipProps } from '@mui/material/Chip';
import Link from '@mui/material/Link';
import IconButton from '@mui/material/IconButton';
import Add from '@mui/icons-material/Add';
import FilterListIcon from '@mui/icons-material/FilterList';
import RefreshIcon from '@mui/icons-material/Refresh';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import LibraryAddCheckIcon from '@mui/icons-material/LibraryAddCheck';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { styled, useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useQueryParam, NumberParam, StringParam } from 'use-query-params';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { TabPanel } from '@/base/components/tabs/TabPanel.tsx';
import { TabsMenu } from '@/base/components/tabs/TabsMenu.tsx';
import { TabsWrapper } from '@/base/components/tabs/TabsWrapper.tsx';
import { useAppTitle } from '@/features/navigation-bar/hooks/useAppTitle.ts';
import { useAppAction } from '@/features/navigation-bar/hooks/useAppAction.ts';
import { requestManager, RequestManager } from '@/lib/requests/RequestManager.ts';
import { AnimeGridCard } from '@/features/anime/components/AnimeGridCard.tsx';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { AppbarSearch } from '@/base/components/AppbarSearch.tsx';
import { SearchParam } from '@/base/Base.types.ts';
import { SelectableCollectionSelectMode } from '@/base/collection/components/SelectableCollectionSelectMode.tsx';
import { useSelectableCollection } from '@/base/collection/hooks/useSelectableCollection.ts';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';
import { useMetadataServerSettings } from '@/features/settings/services/ServerSettingsMetadata.ts';
import { useResizeObserver } from '@/base/hooks/useResizeObserver.tsx';
import { useNavBarContext } from '@/features/navigation-bar/NavbarContext.tsx';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { SelectionFAB } from '@/base/collection/components/SelectionFAB.tsx';
import { AnimeSelectionMenuItems } from '@/features/anime/components/AnimeSelectionMenuItems.tsx';
import { LocalVideoDropOverlay } from '@/features/anime/reader/components/LocalVideoDropOverlay.tsx';
import { useLocalVideoDropTarget } from '@/features/anime/reader/hooks/useLocalVideoDropTarget.ts';
import { BrowseTab } from '@/features/browse/Browse.types.ts';
import {
    ensureAnimeSystemCategory,
    isAnimeCategoryLoading,
    shouldPersistAnimeCategoryAnimes,
    shouldShowDefaultAnimeCategory,
    SYSTEM_ANIME_CATEGORY_ID,
} from '@/features/anime/screens/AnimeLibraryTabState.util.ts';
import { useManatanAnimeLibrarySort, useManatanLocalAnimeVideoPicker } from '@/Manatan/anime/AnimePrivateAdapters.ts';

const EMPTY_STATE_GRACE_MS = 220;

const TitleWithSizeTag = styled('span')({
    display: 'flex',
    alignItems: 'center',
});

const TitleSizeTag = ({ sx, ...props }: ChipProps) => (
    <Chip {...props} size="small" sx={{ ...sx, marginLeft: '5px' }} />
);

type AnimeLibraryEntry = {
    id: number;
    title: string;
    sourceId?: string;
    thumbnailUrl?: string | null;
    inLibrary?: boolean;
    url?: string | null;
    inLibraryAt?: number | null;
};

type AnimeLibraryCategory = {
    id: number;
    name: string;
    animes?: { totalCount?: number };
    mangas?: { totalCount?: number };
};

const getCategoryTotalCount = (category: AnimeLibraryCategory | undefined | null): number =>
    category?.animes?.totalCount ?? category?.mangas?.totalCount ?? 0;

const hasSameAnimeIds = (prev: AnimeLibraryEntry[], next: AnimeLibraryEntry[]): boolean =>
    prev.length === next.length && prev.every((anime, index) => anime.id === next[index]?.id);

export const AnimeLibrary = () => {
    const { t } = useTranslation();
    const location = useLocation();
    const theme = useTheme();
    const isCompactActions = useMediaQuery(theme.breakpoints.down('sm'));
    const [tabSearchParam, setTabSearchParam] = useQueryParam(SearchParam.TAB, NumberParam);
    const [query] = useQueryParam(SearchParam.QUERY, StringParam);
    const [sort, setSort] = useManatanAnimeLibrarySort();
    const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
    const [overflowAnchor, setOverflowAnchor] = useState<null | HTMLElement>(null);
    const [isSelectModeActive, setIsSelectModeActive] = useState(false);
    const {
        localVideoInputRef,
        nativeAnimePlayerRuntime,
        localVideoPlaybackEnabled,
        handleLocalVideoFile,
        handleLocalVideoInputChange,
        openLocalVideoPicker,
    } = useManatanLocalAnimeVideoPicker();

    const {
        settings: { mangaGridItemWidth, showTabSize },
    } = useMetadataServerSettings();
    const { navBarWidth } = useNavBarContext();
    const gridWrapperRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState(
        gridWrapperRef.current?.offsetWidth ?? Math.max(0, document.documentElement.offsetWidth - navBarWidth),
    );

    const {
        data: categoriesData,
        loading: areCategoriesLoading,
        error: categoriesError,
        refetch: refetchCategories,
    } = requestManager.useGetAnimeCategoriesSettings({ notifyOnNetworkStatusChange: true });

    const categoriesFromServer = useMemo<AnimeLibraryCategory[]>(
        () => (categoriesData?.categories.nodes ?? []) as AnimeLibraryCategory[],
        [categoriesData?.categories.nodes],
    );
    const categories = useMemo(() => ensureAnimeSystemCategory(categoriesFromServer), [categoriesFromServer]);
    const zeroIdCategories = useMemo(
        () => categories.filter((category) => category.id === SYSTEM_ANIME_CATEGORY_ID),
        [categories],
    );
    const customCategories = useMemo(
        () => categories.filter((category) => category.id !== SYSTEM_ANIME_CATEGORY_ID),
        [categories],
    );
    const customCategoryAnimeCount = customCategories.reduce(
        (count, category) => count + getCategoryTotalCount(category),
        0,
    );
    const sortedZeroIdCategories = [...zeroIdCategories].sort(
        (categoryA, categoryB) => getCategoryTotalCount(categoryA) - getCategoryTotalCount(categoryB),
    );
    const uncategorizedCategory = sortedZeroIdCategories[0];
    const allCategory = sortedZeroIdCategories[sortedZeroIdCategories.length - 1];
    const isAmbiguousSingleZeroCategory = zeroIdCategories.length === 1 && customCategories.length > 0;

    const customCategoryIdsKey = useMemo(
        () =>
            customCategories
                .map((category) => category.id)
                .sort((a, b) => a - b)
                .join(','),
        [customCategories],
    );
    const customCategoryIds = useMemo(
        () => (customCategoryIdsKey ? customCategoryIdsKey.split(',').map((id) => Number(id)) : []),
        [customCategoryIdsKey],
    );

    const [ambiguousUncategorizedCount, setAmbiguousUncategorizedCount] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;

        if (!isAmbiguousSingleZeroCategory || !allCategory) {
            setAmbiguousUncategorizedCount((prev) => (prev == null ? prev : null));
            return () => {
                cancelled = true;
            };
        }

        const deriveAmbiguousUncategorizedCount = async () => {
            try {
                const [allResponse, ...customResponses] = await Promise.all([
                    requestManager.getAnimeCategoryAnimes(allCategory.id).response,
                    ...customCategoryIds.map(
                        (categoryId) => requestManager.getAnimeCategoryAnimes(categoryId).response,
                    ),
                ]);

                const allAnimes = allResponse.data?.animes.nodes ?? [];
                const categorizedAnimeIds = new Set<number>();
                customResponses.forEach((response) => {
                    const nodes = response.data?.animes.nodes ?? [];
                    nodes.forEach((anime: { id: number }) => categorizedAnimeIds.add(anime.id));
                });

                const nextCount = allAnimes.reduce(
                    (count: number, anime: { id: number }) => count + (categorizedAnimeIds.has(anime.id) ? 0 : 1),
                    0,
                );

                if (!cancelled) {
                    setAmbiguousUncategorizedCount((prev) => (prev === nextCount ? prev : nextCount));
                }
            } catch {
                if (!cancelled) {
                    setAmbiguousUncategorizedCount((prev) => prev);
                }
            }
        };

        deriveAmbiguousUncategorizedCount();

        return () => {
            cancelled = true;
        };
    }, [
        allCategory?.id,
        allCategory?.animes?.totalCount,
        allCategory?.mangas?.totalCount,
        customCategoryIds,
        isAmbiguousSingleZeroCategory,
    ]);

    const inferredUncategorizedCount = useMemo(() => {
        if (!uncategorizedCategory) {
            return 0;
        }

        if (!isAmbiguousSingleZeroCategory) {
            return getCategoryTotalCount(uncategorizedCategory);
        }

        if (ambiguousUncategorizedCount != null) {
            return ambiguousUncategorizedCount;
        }

        return Math.max(0, getCategoryTotalCount(allCategory) - customCategoryAnimeCount);
    }, [
        allCategory,
        ambiguousUncategorizedCount,
        customCategoryAnimeCount,
        isAmbiguousSingleZeroCategory,
        uncategorizedCategory,
    ]);

    const shouldShowDefaultCategory = shouldShowDefaultAnimeCategory({
        hasUncategorizedCategory: !!uncategorizedCategory,
        isAmbiguousSingleZeroCategory,
        ambiguousUncategorizedCount,
        inferredUncategorizedCount,
    });

    const tabs = useMemo(() => {
        const nextTabs = [...customCategories];

        if (shouldShowDefaultCategory && uncategorizedCategory) {
            nextTabs.unshift(uncategorizedCategory);
        }

        if (!nextTabs.length && allCategory && getCategoryTotalCount(allCategory) > 0) {
            nextTabs.push(allCategory);
        }

        return nextTabs;
    }, [allCategory, customCategories, shouldShowDefaultCategory, uncategorizedCategory]);

    const [selectedTabId, setSelectedTabId] = useState<number | null>(tabSearchParam ?? null);
    const rawTabSearchParam = useMemo(
        () => new URLSearchParams(location.search).get(SearchParam.TAB),
        [location.search],
    );
    const hasPendingTabParamParsing = tabSearchParam == null && /^\d+$/.test(rawTabSearchParam ?? '');

    useEffect(() => {
        if (!tabs.length) {
            return;
        }

        if (hasPendingTabParamParsing) {
            return;
        }

        const hasUrlTab = tabSearchParam != null && tabs.some((tab) => tab.id === tabSearchParam);
        if (hasUrlTab) {
            setSelectedTabId((prev) => (prev === tabSearchParam ? prev : tabSearchParam));
            return;
        }

        if (selectedTabId != null && tabs.some((tab) => tab.id === selectedTabId)) {
            return;
        }

        const fallbackTabId = tabs[0].id;
        setSelectedTabId((prev) => (prev === fallbackTabId ? prev : fallbackTabId));
        if (tabSearchParam != null && tabSearchParam !== fallbackTabId) {
            setTabSearchParam(fallbackTabId);
        }
    }, [tabs, tabSearchParam, selectedTabId, setTabSearchParam, hasPendingTabParamParsing]);

    const activeTab =
        tabs.find((tab) => tab.id === (selectedTabId ?? tabSearchParam)) ??
        tabs.find((tab) => tab.id === tabSearchParam) ??
        tabs.find((tab) => tab.id === selectedTabId);
    const [isTabTransitioning, setIsTabTransitioning] = useState(true);

    useEffect(() => {
        setIsTabTransitioning(true);
        const timeoutId = window.setTimeout(() => {
            setIsTabTransitioning(false);
        }, EMPTY_STATE_GRACE_MS);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [activeTab?.id]);

    const {
        data: animesData,
        loading: areAnimesLoading,
        error: animesError,
        refetch: refetchAnimes,
    } = requestManager.useGetAnimeCategoryAnimes(activeTab?.id ?? 0, {
        skip: !activeTab,
        notifyOnNetworkStatusChange: true,
    });

    const [categoryAnimesByTabId, setCategoryAnimesByTabId] = useState<Record<number, AnimeLibraryEntry[]>>({});
    const [categoryRequestStartedByTabId, setCategoryRequestStartedByTabId] = useState<Record<number, boolean>>({});
    const [activeTabFetchCycle, setActiveTabFetchCycle] = useState<{ tabId: number | null; sawLoading: boolean }>({
        tabId: null,
        sawLoading: false,
    });
    const fetchedCategoryAnimes = useMemo<AnimeLibraryEntry[]>(
        () => animesData?.animes.nodes ?? [],
        [animesData?.animes.nodes],
    );

    useEffect(() => {
        setActiveTabFetchCycle({ tabId: activeTab?.id ?? null, sawLoading: false });
    }, [activeTab?.id]);

    useEffect(() => {
        if (!activeTab || !areAnimesLoading) {
            return;
        }

        setActiveTabFetchCycle((prev) => {
            if (prev.tabId === activeTab.id && prev.sawLoading) {
                return prev;
            }

            return {
                tabId: activeTab.id,
                sawLoading: true,
            };
        });

        setCategoryRequestStartedByTabId((prev) => {
            if (prev[activeTab.id]) {
                return prev;
            }

            return {
                ...prev,
                [activeTab.id]: true,
            };
        });
    }, [activeTab?.id, areAnimesLoading]);

    const hasStartedCategoryRequest =
        !!activeTab && Object.prototype.hasOwnProperty.call(categoryRequestStartedByTabId, activeTab.id);
    const canPersistFetchedCategoryAnimes = shouldPersistAnimeCategoryAnimes({
        activeTabId: activeTab?.id,
        areAnimesLoading,
        hasAnimesError: !!animesError,
        hasStartedCategoryRequest,
        activeTabFetchCycle,
    });

    useEffect(() => {
        if (!activeTab || !canPersistFetchedCategoryAnimes) {
            return;
        }

        setCategoryAnimesByTabId((prev) => {
            const previous = prev[activeTab.id] ?? [];
            if (hasSameAnimeIds(previous, fetchedCategoryAnimes)) {
                return prev;
            }

            return {
                ...prev,
                [activeTab.id]: fetchedCategoryAnimes,
            };
        });
    }, [
        activeTab?.id,
        canPersistFetchedCategoryAnimes,
        areAnimesLoading,
        animesError,
        hasStartedCategoryRequest,
        activeTabFetchCycle.tabId,
        activeTabFetchCycle.sawLoading,
        fetchedCategoryAnimes,
    ]);

    const hasCachedCategoryAnimes =
        !!activeTab && Object.prototype.hasOwnProperty.call(categoryAnimesByTabId, activeTab.id);
    const categoryAnimes = useMemo(() => {
        if (activeTab && hasCachedCategoryAnimes) {
            return categoryAnimesByTabId[activeTab.id];
        }

        return [] as AnimeLibraryEntry[];
    }, [activeTab?.id, categoryAnimesByTabId, hasCachedCategoryAnimes]);

    const isAmbiguousDefaultTabActive =
        !!activeTab &&
        isAmbiguousSingleZeroCategory &&
        shouldShowDefaultCategory &&
        activeTab.id === uncategorizedCategory?.id;

    const [inferredUncategorizedAnimes, setInferredUncategorizedAnimes] = useState<AnimeLibraryEntry[]>([]);
    const [inferredUncategorizedLoading, setInferredUncategorizedLoading] = useState(false);
    const [inferredUncategorizedError, setInferredUncategorizedError] = useState<Error | null>(null);

    useEffect(() => {
        let cancelled = false;

        if (!isAmbiguousDefaultTabActive || !hasCachedCategoryAnimes) {
            setInferredUncategorizedAnimes((prev) => (prev.length ? [] : prev));
            setInferredUncategorizedError((prev) => (prev ? null : prev));
            setInferredUncategorizedLoading((prev) => (prev ? false : prev));
            return () => {
                cancelled = true;
            };
        }

        const deriveUncategorizedAnimes = async () => {
            setInferredUncategorizedLoading(true);
            setInferredUncategorizedError((prev) => (prev ? null : prev));

            try {
                const categorizedAnimeIds = new Set<number>();

                customCategoryIds.forEach((categoryId) => {
                    const cachedCategoryAnimes = categoryAnimesByTabId[categoryId] ?? [];
                    cachedCategoryAnimes.forEach((anime) => categorizedAnimeIds.add(anime.id));
                });

                const categoriesWithoutCache = customCategoryIds.filter(
                    (categoryId) => !Object.prototype.hasOwnProperty.call(categoryAnimesByTabId, categoryId),
                );

                if (categoriesWithoutCache.length > 0) {
                    const idsByCategory = await Promise.all(
                        categoriesWithoutCache.map(async (categoryId) => {
                            const response = await requestManager.getAnimeCategoryAnimes(categoryId).response;
                            const nodes = response.data?.animes.nodes ?? [];

                            return nodes
                                .map((anime: { id?: number }) => Number(anime?.id ?? 0))
                                .filter((id: number) => Number.isFinite(id) && id > 0);
                        }),
                    );

                    idsByCategory.forEach((ids: number[]) => {
                        ids.forEach((id) => categorizedAnimeIds.add(id));
                    });
                }

                const nextUncategorizedAnimes = categoryAnimes.filter((anime) => !categorizedAnimeIds.has(anime.id));

                if (!cancelled) {
                    setInferredUncategorizedAnimes((prev) =>
                        hasSameAnimeIds(prev, nextUncategorizedAnimes) ? prev : nextUncategorizedAnimes,
                    );
                    setAmbiguousUncategorizedCount((prev) =>
                        prev === nextUncategorizedAnimes.length ? prev : nextUncategorizedAnimes.length,
                    );
                }
            } catch (e) {
                if (!cancelled) {
                    setInferredUncategorizedError(e as Error);
                }
            } finally {
                if (!cancelled) {
                    setInferredUncategorizedLoading(false);
                }
            }
        };

        deriveUncategorizedAnimes();

        return () => {
            cancelled = true;
        };
    }, [
        categoryAnimes,
        categoryAnimesByTabId,
        customCategoryIds,
        hasCachedCategoryAnimes,
        isAmbiguousDefaultTabActive,
    ]);

    const sourceAnimes = isAmbiguousDefaultTabActive ? inferredUncategorizedAnimes : categoryAnimes;
    const sourceAnimesLoading = isAnimeCategoryLoading({
        hasCachedCategoryAnimes,
        areAnimesLoading,
        hasStartedCategoryRequest,
        isAmbiguousDefaultTabActive,
        inferredUncategorizedLoading,
    });
    const sourceAnimesError = animesError ?? (isAmbiguousDefaultTabActive ? inferredUncategorizedError : null);

    const filteredAnimes = useMemo(() => {
        const normalizedQuery = query?.trim().toLowerCase() ?? '';
        const result = normalizedQuery
            ? sourceAnimes.filter((anime) => anime.title.toLowerCase().includes(normalizedQuery))
            : sourceAnimes;

        return [...result].sort((a, b) => {
            switch (sort) {
                case 'titleAsc':
                    return a.title.localeCompare(b.title);
                case 'titleDesc':
                    return b.title.localeCompare(a.title);
                case 'addedAsc':
                    return (a.inLibraryAt ?? 0) - (b.inLibraryAt ?? 0);
                case 'addedDesc':
                default:
                    return (b.inLibraryAt ?? 0) - (a.inLibraryAt ?? 0);
            }
        });
    }, [query, sort, sourceAnimes]);

    const animeIds = useMemo(() => filteredAnimes.map((anime) => anime.id), [filteredAnimes]);
    const currentSelectionKey = useMemo(() => `anime-library-${activeTab?.id ?? 0}`, [activeTab?.id]);
    const {
        areNoItemsForKeySelected,
        areAllItemsForKeySelected,
        selectedItemIds,
        handleSelectAll,
        handleSelection,
        clearSelection,
    } = useSelectableCollection<number, string>(filteredAnimes.length, {
        itemIds: animeIds,
        currentKey: currentSelectionKey,
    });

    const handleSelect = useCallback(
        (id: number, selected: boolean, isShiftKey?: boolean) => {
            setIsSelectModeActive(!!(selectedItemIds.length + (selected ? 1 : -1)));
            handleSelection(id, selected, { selectRange: isShiftKey });
        },
        [handleSelection, selectedItemIds.length],
    );

    useResizeObserver(
        gridWrapperRef,
        useCallback(() => {
            const gridWidth = gridWrapperRef.current?.offsetWidth;
            setDimensions(gridWidth ?? document.documentElement.offsetWidth - navBarWidth);
        }, [navBarWidth]),
    );

    const gridColumns = Math.max(1, Math.ceil(dimensions / mangaGridItemWidth));
    const inferredDefaultTabCount = shouldShowDefaultCategory ? inferredUncategorizedCount : 0;
    const librarySize = getCategoryTotalCount(allCategory) || getCategoryTotalCount(tabs[0]);
    const emptyLibraryMessageExtra = (
        <span>
            Click plus or drag-n-drop video file for quick local playback. Go to{' '}
            <Link component={RouterLink} to={AppRoutes.browse.path(BrowseTab.ANIME_SOURCES)} color="inherit">
                Browse
            </Link>{' '}
            to add Shows to Library.
        </span>
    );

    const refetchLibraryData = useCallback(() => {
        Promise.all([refetchAnimes(), refetchCategories()]).catch(
            defaultPromiseErrorHandler('AnimeLibrary::refetchLibraryData'),
        );
    }, [refetchAnimes, refetchCategories]);

    const selectedAnimes = useMemo(
        () =>
            selectedItemIds
                .map((id) => filteredAnimes.find((anime) => anime.id === id))
                .filter((anime): anime is AnimeLibraryEntry => !!anime),
        [selectedItemIds, filteredAnimes],
    );

    const selectionFab = useMemo(() => {
        if (!isSelectModeActive) {
            return null;
        }

        return (
            <SelectionFAB selectedItemsCount={selectedItemIds.length} title={'Video' as any}>
                {(handleClose) => (
                    <AnimeSelectionMenuItems
                        animes={selectedAnimes}
                        onClose={() => {
                            handleClose();
                            setIsSelectModeActive(false);
                            clearSelection();
                        }}
                        onLibraryChange={refetchLibraryData}
                    />
                )}
            </SelectionFAB>
        );
    }, [isSelectModeActive, selectedItemIds.length, selectedAnimes, clearSelection, refetchLibraryData]);

    useEffect(() => {
        const handleLibraryUpdated = () => {
            setCategoryAnimesByTabId({});
            setCategoryRequestStartedByTabId({});
            setInferredUncategorizedAnimes([]);
            setInferredUncategorizedError(null);
            setAmbiguousUncategorizedCount(null);
            refetchLibraryData();
        };

        window.addEventListener(RequestManager.LIBRARY_UPDATED_EVENT, handleLibraryUpdated);

        return () => {
            window.removeEventListener(RequestManager.LIBRARY_UPDATED_EVENT, handleLibraryUpdated);
        };
    }, [refetchLibraryData]);

    const { isDragActive } = useLocalVideoDropTarget({
        enabled: localVideoPlaybackEnabled && !nativeAnimePlayerRuntime,
        onDropFile: handleLocalVideoFile,
    });

    useAppTitle(
        <TitleWithSizeTag>
            Video
            {showTabSize && <TitleSizeTag sx={{ color: 'inherit' }} label={librarySize} />}
        </TitleWithSizeTag>,
        'Video',
        [showTabSize, librarySize],
    );
    useAppAction(
        <>
            {localVideoPlaybackEnabled && (
                <>
                    {!nativeAnimePlayerRuntime && (
                        <Box
                            component="input"
                            ref={localVideoInputRef}
                            type="file"
                            accept="video/*,.mkv,.mp4,.m4v,.mov,.webm,.avi,.ts,.m2ts"
                            onChange={handleLocalVideoInputChange}
                            sx={{ display: 'none' }}
                        />
                    )}
                    {!isCompactActions && (
                        <CustomTooltip title="Play local video file">
                            <IconButton color="inherit" onClick={openLocalVideoPicker}>
                                <Add />
                            </IconButton>
                        </CustomTooltip>
                    )}
                </>
            )}
            <AppbarSearch />
            <CustomTooltip title={t('chapter.action.filter_and_sort.label')}>
                <IconButton
                    aria-label={t('chapter.action.filter_and_sort.label')}
                    onClick={(event) => setMenuAnchor(event.currentTarget)}
                    color="inherit"
                >
                    <FilterListIcon />
                </IconButton>
            </CustomTooltip>
            {!isCompactActions && (
                <CustomTooltip title={t('global.button.refresh')}>
                    <IconButton color="inherit" onClick={() => refetchLibraryData()}>
                        <RefreshIcon />
                    </IconButton>
                </CustomTooltip>
            )}
            {isCompactActions && (
                <CustomTooltip title={t('global.label.more')}>
                    <IconButton
                        color="inherit"
                        aria-label={t('global.label.more')}
                        onClick={(event) => setOverflowAnchor(event.currentTarget)}
                    >
                        <MoreVertIcon />
                    </IconButton>
                </CustomTooltip>
            )}
            {!!filteredAnimes.length && (!isCompactActions || isSelectModeActive) && (
                <SelectableCollectionSelectMode
                    isActive={isSelectModeActive}
                    areAllItemsSelected={areAllItemsForKeySelected}
                    areNoItemsSelected={areNoItemsForKeySelected}
                    onSelectAll={(selectAll) => handleSelectAll(selectAll, animeIds)}
                    onModeChange={(checked) => {
                        setIsSelectModeActive(checked);
                        if (checked) {
                            handleSelectAll(true, animeIds);
                        } else {
                            tabs.forEach((tab) => handleSelectAll(false, [], `anime-library-${tab.id}`));
                            clearSelection();
                        }
                    }}
                />
            )}
        </>,
        [
            animeIds,
            areAllItemsForKeySelected,
            areNoItemsForKeySelected,
            clearSelection,
            filteredAnimes.length,
            handleSelectAll,
            isCompactActions,
            isSelectModeActive,
            tabs,
            handleLocalVideoInputChange,
            openLocalVideoPicker,
            localVideoPlaybackEnabled,
            nativeAnimePlayerRuntime,
        ],
    );

    const overflowMenu = (
        <Menu anchorEl={overflowAnchor} open={Boolean(overflowAnchor)} onClose={() => setOverflowAnchor(null)}>
            {!!filteredAnimes.length && !isSelectModeActive && (
                <MenuItem
                    onClick={() => {
                        setOverflowAnchor(null);
                        setIsSelectModeActive(true);
                        handleSelectAll(true, animeIds);
                    }}
                >
                    <ListItemIcon>
                        <LibraryAddCheckIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>{t('global.button.select_all')}</ListItemText>
                </MenuItem>
            )}
            {localVideoPlaybackEnabled && (
                <MenuItem
                    onClick={() => {
                        setOverflowAnchor(null);
                        openLocalVideoPicker();
                    }}
                >
                    <ListItemIcon>
                        <Add fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Play local video file</ListItemText>
                </MenuItem>
            )}
            <MenuItem
                onClick={() => {
                    setOverflowAnchor(null);
                    refetchLibraryData();
                }}
            >
                <ListItemIcon>
                    <RefreshIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>{t('global.button.refresh')}</ListItemText>
            </MenuItem>
        </Menu>
    );

    const filterMenu = (
        <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
            <MenuItem
                selected={sort === 'addedDesc'}
                onClick={() => {
                    setSort('addedDesc');
                    setMenuAnchor(null);
                }}
            >
                Recently added
            </MenuItem>
            <MenuItem
                selected={sort === 'addedAsc'}
                onClick={() => {
                    setSort('addedAsc');
                    setMenuAnchor(null);
                }}
            >
                Added date (oldest)
            </MenuItem>
            <MenuItem
                selected={sort === 'titleAsc'}
                onClick={() => {
                    setSort('titleAsc');
                    setMenuAnchor(null);
                }}
            >
                Title (A-Z)
            </MenuItem>
            <MenuItem
                selected={sort === 'titleDesc'}
                onClick={() => {
                    setSort('titleDesc');
                    setMenuAnchor(null);
                }}
            >
                Title (Z-A)
            </MenuItem>
        </Menu>
    );

    const toolbarMenus = (
        <>
            {overflowMenu}
            {filterMenu}
        </>
    );

    const handleTabChange = (newTab: number) => {
        setSelectedTabId(newTab);
        setTabSearchParam(newTab);
    };

    const renderAnimeGrid = () => {
        if (sourceAnimesError) {
            return (
                <EmptyViewAbsoluteCentered
                    message={t('global.error.label.failed_to_load_data')}
                    messageExtra={getErrorMessage(sourceAnimesError)}
                    retry={() => refetchLibraryData()}
                />
            );
        }

        if (sourceAnimesLoading || (isTabTransitioning && filteredAnimes.length === 0)) {
            return <LoadingPlaceholder />;
        }

        if (!filteredAnimes.length) {
            return (
                <EmptyViewAbsoluteCentered
                    message={t('library.error.label.empty')}
                    messageExtra={emptyLibraryMessageExtra}
                />
            );
        }

        return (
            <Stack sx={{ p: 2 }}>
                <Box
                    ref={gridWrapperRef}
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
                        gap: 1,
                    }}
                >
                    {filteredAnimes.map((anime) => (
                        <Box key={anime.id}>
                            <AnimeGridCard
                                anime={anime}
                                linkTo={AppRoutes.anime.childRoutes.details.path(anime.id)}
                                onLibraryChange={() => refetchLibraryData()}
                                selected={isSelectModeActive ? selectedItemIds.includes(anime.id) : null}
                                onSelect={handleSelect}
                            />
                        </Box>
                    ))}
                </Box>
                {selectionFab}
            </Stack>
        );
    };

    if (categoriesError) {
        return (
            <>
                {toolbarMenus}
                <EmptyViewAbsoluteCentered
                    message={t('global.error.label.failed_to_load_data')}
                    messageExtra={getErrorMessage(categoriesError)}
                    retry={() => refetchLibraryData()}
                />
            </>
        );
    }

    if (areCategoriesLoading || (!activeTab && tabs.length > 0)) {
        return (
            <>
                {toolbarMenus}
                <LoadingPlaceholder />
            </>
        );
    }

    if (!tabs.length) {
        return (
            <>
                {toolbarMenus}
                <EmptyViewAbsoluteCentered
                    message={t('library.error.label.empty')}
                    messageExtra={emptyLibraryMessageExtra}
                />
            </>
        );
    }

    return (
        <>
            <LocalVideoDropOverlay open={isDragActive} />
            {toolbarMenus}
            {tabs.length === 1 ? (
                renderAnimeGrid()
            ) : (
                <TabsWrapper>
                    <TabsMenu value={activeTab?.id ?? tabs[0].id} onChange={(e, newTab) => handleTabChange(newTab)}>
                        {tabs.map((tab) => {
                            const isDefaultTab =
                                shouldShowDefaultCategory &&
                                customCategories.length > 0 &&
                                tab.id === uncategorizedCategory?.id;
                            let tabTitle = tab.name;
                            if (isDefaultTab) {
                                tabTitle = t('global.label.default');
                            } else if (tab.id === SYSTEM_ANIME_CATEGORY_ID) {
                                tabTitle = t('extension.language.all');
                            }
                            const tabCount = isDefaultTab ? inferredDefaultTabCount : getCategoryTotalCount(tab);

                            return (
                                <Tab
                                    sx={{ flexGrow: 1, maxWidth: 'unset' }}
                                    key={tab.id}
                                    label={
                                        <TitleWithSizeTag>
                                            {tabTitle}
                                            {showTabSize ? <TitleSizeTag label={tabCount} /> : null}
                                        </TitleWithSizeTag>
                                    }
                                    value={tab.id}
                                />
                            );
                        })}
                    </TabsMenu>
                    {tabs.map((tab) => (
                        <TabPanel key={tab.id} index={tab.id} currentIndex={activeTab?.id ?? tabs[0].id}>
                            {tab.id === (activeTab?.id ?? tabs[0].id) && renderAnimeGrid()}
                        </TabPanel>
                    ))}
                </TabsWrapper>
            )}
        </>
    );
};
