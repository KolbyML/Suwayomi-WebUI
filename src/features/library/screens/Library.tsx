/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Chip, { ChipProps } from '@mui/material/Chip';
import Tab from '@mui/material/Tab';
import { styled, useTheme } from '@mui/material/styles';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryParam, NumberParam, StringParam } from 'use-query-params';
import { useTranslation } from 'react-i18next';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import RefreshIcon from '@mui/icons-material/Refresh';
import LibraryAddCheckIcon from '@mui/icons-material/LibraryAddCheck';
import useMediaQuery from '@mui/material/useMediaQuery';
import { requestManager, RequestManager } from '@/lib/requests/RequestManager.ts';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { TabPanel } from '@/base/components/tabs/TabPanel.tsx';
import { LibraryToolbarMenu } from '@/features/library/components/LibraryToolbarMenu.tsx';
import { LibraryMangaGrid } from '@/features/library/components/LibraryMangaGrid.tsx';
import { AppbarSearch } from '@/base/components/AppbarSearch.tsx';
import { UpdateChecker } from '@/features/updates/components/UpdateChecker.tsx';
import { useSelectableCollection } from '@/base/collection/hooks/useSelectableCollection.ts';
import { SelectableCollectionSelectMode } from '@/base/collection/components/SelectableCollectionSelectMode.tsx';
import { useGetVisibleLibraryMangas } from '@/features/library/hooks/useGetVisibleLibraryMangas.ts';
import { SelectionFAB } from '@/base/collection/components/SelectionFAB.tsx';
import { MangaActionMenuItems } from '@/features/manga/components/MangaActionMenuItems.tsx';
import { TabsMenu } from '@/base/components/tabs/TabsMenu.tsx';
import { TabsWrapper } from '@/base/components/tabs/TabsWrapper.tsx';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { MangaType } from '@/lib/requests/types.ts';
import { useMetadataServerSettings } from '@/features/settings/services/ServerSettingsMetadata.ts';
import { useAppTitle } from '@/features/navigation-bar/hooks/useAppTitle.ts';
import { useAppAction } from '@/features/navigation-bar/hooks/useAppAction.ts';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { SearchParam } from '@/base/Base.types.ts';
import { logStartupMetric } from '@/Manatan/utils/startupMetrics.ts';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';

const TitleWithSizeTag = styled('span')({
    display: 'flex',
    alignItems: 'center',
});

const TitleSizeTag = ({ sx, ...props }: ChipProps) => (
    <Chip {...props} size="small" sx={{ ...sx, marginLeft: '5px' }} />
);

const hasSameMangaIds = (prev: MangaType[], next: MangaType[]): boolean =>
    prev.length === next.length && prev.every((manga, index) => manga.id === next[index]?.id);

const EMPTY_STATE_GRACE_MS = 220;

export function Library() {
    const { t } = useTranslation();
    const theme = useTheme();
    const isCompactActions = useMediaQuery(theme.breakpoints.down('sm'));
    const [overflowAnchor, setOverflowAnchor] = useState<HTMLElement | null>(null);

    const {
        settings: { showTabSize },
    } = useMetadataServerSettings();

    const {
        data: categoriesResponse,
        error: tabsError,
        loading: areCategoriesLoading,
        refetch: refetchCategories,
    } = requestManager.useGetCategoriesLibrary({ notifyOnNetworkStatusChange: true });
    const categories = categoriesResponse?.categories.nodes ?? [];
    const zeroIdCategories = useMemo(() => categories.filter((category) => category.id === 0), [categories]);
    const customCategories = useMemo(() => categories.filter((category) => category.id !== 0), [categories]);
    const customCategoryMangaCount = customCategories.reduce(
        (count, category) => count + category.mangas.totalCount,
        0,
    );
    const [ambiguousUncategorizedCount, setAmbiguousUncategorizedCount] = useState<number | null>(null);

    const sortedZeroIdCategories = [...zeroIdCategories].sort(
        (categoryA, categoryB) => categoryA.mangas.totalCount - categoryB.mangas.totalCount,
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

    const librarySizeResponse = requestManager.useGetLibraryMangaCount();
    const librarySize = librarySizeResponse.data?.mangas.totalCount ?? 0;

    const inferredUncategorizedCount = useMemo(() => {
        if (!uncategorizedCategory) {
            return 0;
        }

        if (!isAmbiguousSingleZeroCategory) {
            return uncategorizedCategory.mangas.totalCount;
        }

        if (ambiguousUncategorizedCount != null) {
            return ambiguousUncategorizedCount;
        }

        return Math.max(0, (allCategory?.mangas.totalCount ?? 0) - customCategoryMangaCount);
    }, [
        allCategory?.mangas.totalCount,
        ambiguousUncategorizedCount,
        customCategoryMangaCount,
        isAmbiguousSingleZeroCategory,
        uncategorizedCategory,
    ]);

    const shouldShowDefaultCategory = !!uncategorizedCategory && inferredUncategorizedCount > 0;

    useEffect(() => {
        if (tabsError || librarySizeResponse.error) {
            logStartupMetric(
                'library_error_state_ready',
                {
                    hasTabsError: !!tabsError,
                    hasLibrarySizeError: !!librarySizeResponse.error,
                },
                'library_error_state_ready',
            );
        }
    }, [tabsError, librarySizeResponse.error]);

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
                    requestManager.getCategoryMangas(allCategory.id).response,
                    ...customCategoryIds.map((categoryId) => requestManager.getCategoryMangas(categoryId).response),
                ]);

                const allMangas = allResponse.data?.mangas.nodes ?? [];
                const categorizedMangaIds = new Set<number>();
                customResponses.forEach((response) => {
                    const nodes = response.data?.mangas.nodes ?? [];
                    nodes.forEach((manga) => categorizedMangaIds.add(manga.id));
                });

                const nextCount = allMangas.reduce(
                    (count, manga) => count + (categorizedMangaIds.has(manga.id) ? 0 : 1),
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
        allCategory?.mangas.totalCount,
        customCategoryIds,
        isAmbiguousSingleZeroCategory,
        librarySize,
    ]);

    const tabs = (() => {
        const nextTabs = [...customCategories];

        if (shouldShowDefaultCategory && uncategorizedCategory) {
            nextTabs.unshift(uncategorizedCategory);
        }

        if (!nextTabs.length && allCategory && allCategory.mangas.totalCount > 0) {
            nextTabs.push(allCategory);
        }

        return nextTabs;
    })();

    useEffect(() => {
        if (areCategoriesLoading || librarySizeResponse.loading || tabsError || librarySizeResponse.error) {
            return;
        }

        logStartupMetric(
            'library_categories_ready',
            {
                categoryCount: categories.length,
                zeroIdCategoryCount: zeroIdCategories.length,
                tabCount: tabs.length,
                librarySize,
                customCategoryCount: customCategories.length,
            },
            'library_categories_ready',
        );
    }, [
        areCategoriesLoading,
        librarySizeResponse.loading,
        tabsError,
        librarySizeResponse.error,
        categories.length,
        zeroIdCategories.length,
        tabs.length,
        librarySize,
        customCategories.length,
    ]);

    useEffect(() => {
        if (areCategoriesLoading || librarySizeResponse.loading || tabsError || librarySizeResponse.error) {
            return;
        }

        if (tabs.length !== 0) {
            return;
        }

        logStartupMetric(
            'library_empty_state_rendered',
            {
                categoryCount: categories.length,
                librarySize,
            },
            'library_empty_state_rendered',
        );
    }, [
        areCategoriesLoading,
        librarySizeResponse.loading,
        tabsError,
        librarySizeResponse.error,
        tabs.length,
        categories.length,
        librarySize,
    ]);

    const [tabSearchParam, setTabSearchParam] = useQueryParam(SearchParam.TAB, NumberParam);
    const [query] = useQueryParam(SearchParam.QUERY, StringParam);
    const [selectedTabId, setSelectedTabId] = useState<number | null>(tabSearchParam ?? null);

    useEffect(() => {
        logStartupMetric('library_route_mounted', {
            hasQuery: !!query,
        });
    }, [query]);

    useEffect(() => {
        if (!tabs.length) {
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
        if (tabSearchParam !== fallbackTabId) {
            setTabSearchParam(fallbackTabId);
        }
    }, [tabs, tabSearchParam, selectedTabId, setTabSearchParam]);

    const preferredTabId = selectedTabId ?? tabSearchParam;
    const activeTab =
        tabs.find((tab) => tab.id === preferredTabId) ??
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

    useEffect(() => {
        if (!activeTab) {
            return;
        }

        logStartupMetric(
            'library_active_tab_ready',
            {
                activeTabId: activeTab.id,
                tabCount: tabs.length,
                mangaCount: activeTab.mangas.totalCount,
            },
            'library_active_tab_ready',
        );
    }, [activeTab?.id, activeTab?.mangas.totalCount, tabs.length]);

    const isAmbiguousDefaultTabActive =
        !!activeTab &&
        isAmbiguousSingleZeroCategory &&
        shouldShowDefaultCategory &&
        activeTab.id === uncategorizedCategory?.id;

    const {
        data: categoryMangaResponse,
        error: mangaError,
        loading: mangaLoading,
        refetch: refetchCategoryMangas,
    } = requestManager.useGetCategoryMangas(activeTab?.id ?? 0, {
        skip: !activeTab,
        notifyOnNetworkStatusChange: true,
    });
    const [categoryMangasByTabId, setCategoryMangasByTabId] = useState<Record<number, MangaType[]>>({});
    const [categoryRequestStartedByTabId, setCategoryRequestStartedByTabId] = useState<Record<number, boolean>>({});
    const [inferredUncategorizedMangas, setInferredUncategorizedMangas] = useState<MangaType[]>([]);
    const [inferredUncategorizedLoading, setInferredUncategorizedLoading] = useState(false);
    const [inferredUncategorizedError, setInferredUncategorizedError] = useState<Error | null>(null);
    const [activeTabFetchCycle, setActiveTabFetchCycle] = useState<{ tabId: number | null; sawLoading: boolean }>({
        tabId: null,
        sawLoading: false,
    });
    const fetchedCategoryMangas = categoryMangaResponse?.mangas.nodes ?? [];
    const hasStartedCategoryRequest =
        !!activeTab && Object.prototype.hasOwnProperty.call(categoryRequestStartedByTabId, activeTab.id);

    useEffect(() => {
        setActiveTabFetchCycle({ tabId: activeTab?.id ?? null, sawLoading: false });
    }, [activeTab?.id]);

    useEffect(() => {
        if (!activeTab || !mangaLoading) {
            return;
        }

        logStartupMetric(
            'library_category_request_started',
            {
                activeTabId: activeTab.id,
            },
            'library_category_request_started',
        );

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
    }, [activeTab?.id, mangaLoading]);

    useEffect(() => {
        if (
            !activeTab ||
            mangaLoading ||
            mangaError ||
            !hasStartedCategoryRequest ||
            activeTabFetchCycle.tabId !== activeTab.id ||
            !activeTabFetchCycle.sawLoading
        ) {
            return;
        }

        setCategoryMangasByTabId((prev) => {
            const previous = prev[activeTab.id] ?? [];
            if (previous.length === fetchedCategoryMangas.length) {
                const didChange = previous.some((manga, index) => manga.id !== fetchedCategoryMangas[index]?.id);
                if (!didChange) {
                    return prev;
                }
            }
            return {
                ...prev,
                [activeTab.id]: fetchedCategoryMangas as MangaType[],
            };
        });
    }, [
        activeTab?.id,
        mangaLoading,
        mangaError,
        hasStartedCategoryRequest,
        activeTabFetchCycle.tabId,
        activeTabFetchCycle.sawLoading,
        fetchedCategoryMangas,
    ]);

    const hasCachedCategoryMangas =
        !!activeTab && Object.prototype.hasOwnProperty.call(categoryMangasByTabId, activeTab.id);
    const categoryMangas = useMemo(() => {
        if (activeTab && hasCachedCategoryMangas) {
            return categoryMangasByTabId[activeTab.id];
        }
        return [];
    }, [activeTab?.id, hasCachedCategoryMangas, categoryMangasByTabId]);

    useEffect(() => {
        let cancelled = false;

        if (!isAmbiguousDefaultTabActive || !hasCachedCategoryMangas) {
            setInferredUncategorizedMangas((prev) => (prev.length ? [] : prev));
            setInferredUncategorizedError((prev) => (prev ? null : prev));
            setInferredUncategorizedLoading((prev) => (prev ? false : prev));
            return () => {
                cancelled = true;
            };
        }

        const deriveUncategorizedMangas = async () => {
            setInferredUncategorizedLoading(true);
            setInferredUncategorizedError((prev) => (prev ? null : prev));

            try {
                const categorizedMangaIds = new Set<number>();

                customCategoryIds.forEach((categoryId) => {
                    const cachedCategoryMangas = categoryMangasByTabId[categoryId] ?? [];
                    cachedCategoryMangas.forEach((manga) => categorizedMangaIds.add(manga.id));
                });

                const categoriesWithoutCache = customCategoryIds.filter(
                    (categoryId) => !Object.prototype.hasOwnProperty.call(categoryMangasByTabId, categoryId),
                );

                if (categoriesWithoutCache.length > 0) {
                    const idsByCategory: number[][] = await Promise.all(
                        categoriesWithoutCache.map(async (categoryId) => {
                            const response = await requestManager.getCategoryMangas(categoryId).response;
                            const nodes = response.data?.mangas.nodes ?? [];

                            return nodes
                                .map((manga: { id?: number }) => Number(manga?.id ?? 0))
                                .filter((id: number) => Number.isFinite(id) && id > 0);
                        }),
                    );

                    idsByCategory.forEach((ids) => ids.forEach((id: number) => categorizedMangaIds.add(id)));
                }

                const nextUncategorizedMangas = categoryMangas.filter((manga) => !categorizedMangaIds.has(manga.id));

                if (!cancelled) {
                    setInferredUncategorizedMangas((prev) =>
                        hasSameMangaIds(prev, nextUncategorizedMangas) ? prev : nextUncategorizedMangas,
                    );
                }
            } catch (error) {
                if (!cancelled) {
                    setInferredUncategorizedMangas((prev) => (prev.length ? [] : prev));
                    setInferredUncategorizedError((prev) => {
                        const next =
                            error instanceof Error ? error : new Error(t('global.error.label.failed_to_load_data'));
                        return prev?.message === next.message ? prev : next;
                    });
                }
            } finally {
                if (!cancelled) {
                    setInferredUncategorizedLoading((prev) => (prev ? false : prev));
                }
            }
        };

        deriveUncategorizedMangas();

        return () => {
            cancelled = true;
        };
    }, [
        categoryMangas,
        categoryMangasByTabId,
        customCategoryIds,
        customCategoryIdsKey,
        hasCachedCategoryMangas,
        isAmbiguousDefaultTabActive,
        t,
    ]);

    const sourceCategoryMangas = isAmbiguousDefaultTabActive ? inferredUncategorizedMangas : categoryMangas;
    const sourceMangaError = mangaError ?? inferredUncategorizedError;
    const categoryMangasLoading =
        (!hasCachedCategoryMangas && (mangaLoading || !hasStartedCategoryRequest)) ||
        (isAmbiguousDefaultTabActive && inferredUncategorizedLoading);
    const inferredDefaultTabCount = inferredUncategorizedMangas.length || inferredUncategorizedCount;

    const {
        visibleMangas: mangas,
        showFilteredOutMessage,
        filterKey,
    } = useGetVisibleLibraryMangas(sourceCategoryMangas, activeTab);
    const shouldDelayEmptyState = isTabTransitioning && mangas.length === 0 && !sourceMangaError;
    const activeTabGridPersistKey = activeTab ? `library-manga-grid-${activeTab.id}` : 'library-manga-grid';

    useEffect(() => {
        if (!activeTab || categoryMangasLoading) {
            return;
        }

        logStartupMetric(
            'library_data_ready',
            {
                activeTabId: activeTab.id,
                sourceMangaCount: sourceCategoryMangas.length,
                visibleMangaCount: mangas.length,
                filteredOutCount: Math.max(0, sourceCategoryMangas.length - mangas.length),
                isAmbiguousDefaultTabActive,
                hasSourceError: !!sourceMangaError,
            },
            'library_data_ready',
        );
    }, [
        activeTab?.id,
        categoryMangasLoading,
        mangas.length,
        sourceCategoryMangas.length,
        isAmbiguousDefaultTabActive,
        sourceMangaError,
    ]);

    const retryFetchCategoryMangas = useCallback(() => {
        refetchCategoryMangas().catch(defaultPromiseErrorHandler('Library::refetchCategoryMangas'));
    }, [refetchCategoryMangas, activeTab]);

    const startLibraryUpdate = useCallback((categoryId?: number) => {
        requestManager
            .startGlobalUpdate(categoryId !== undefined ? [categoryId] : undefined)
            .response.catch(defaultPromiseErrorHandler('Library::startLibraryUpdate'));
    }, []);

    useEffect(() => {
        const handleLibraryUpdated = () => {
            refetchCategories().catch(defaultPromiseErrorHandler('Library::refetchCategoriesOnLibraryUpdate'));
            librarySizeResponse
                .refetch()
                .catch(defaultPromiseErrorHandler('Library::refetchLibrarySizeOnLibraryUpdate'));

            if (activeTab) {
                refetchCategoryMangas().catch(
                    defaultPromiseErrorHandler('Library::refetchCategoryMangasOnLibraryUpdate'),
                );
            }
        };

        window.addEventListener(RequestManager.LIBRARY_UPDATED_EVENT, handleLibraryUpdated);

        return () => {
            window.removeEventListener(RequestManager.LIBRARY_UPDATED_EVENT, handleLibraryUpdated);
        };
    }, [activeTab?.id, refetchCategories, refetchCategoryMangas, librarySizeResponse.refetch]);

    const mangaIds = useMemo(() => [...new Set(mangas.map((manga) => manga.id))], [mangas]);

    const [isSelectModeActive, setIsSelectModeActive] = useState(false);
    const {
        areNoItemsForKeySelected: areNoItemsSelected,
        areAllItemsForKeySelected: areAllItemsSelected,
        selectedItemIds,
        handleSelectAll,
        handleSelection,
        clearSelection,
    } = useSelectableCollection<MangaType['id'], string>(mangas.length, {
        itemIds: mangaIds,
        currentKey: `${activeTab?.id ?? 'library'}`,
    });

    const handleSelect: typeof handleSelection = useCallback(
        (id, selected, selectOptions) => {
            setIsSelectModeActive(!!(selectedItemIds.length + (selected ? 1 : -1)));
            handleSelection(id, selected, selectOptions);
        },
        [setIsSelectModeActive, handleSelection],
    );
    const handleEnterSelectMode = useCallback(() => {
        setIsSelectModeActive(true);
        handleSelectAll(true, mangaIds);
    }, [handleSelectAll, mangaIds]);

    const selectedMangas = useMemo(
        () =>
            selectedItemIds
                .map((id) => mangas.find((manga) => manga.id === id))
                .filter((manga): manga is (typeof mangas)[number] => !!manga),
        [selectedItemIds.length, mangas],
    );

    const selectionFab = useMemo(() => {
        if (!isSelectModeActive) {
            return null;
        }

        return (
            <SelectionFAB selectedItemsCount={selectedItemIds.length} title="manga.title">
                {(handleClose, setHideMenu) => (
                    <MangaActionMenuItems
                        selectedMangas={selectedMangas}
                        onClose={() => {
                            handleClose();
                            setIsSelectModeActive(false);
                            clearSelection();
                        }}
                        setHideMenu={setHideMenu}
                    />
                )}
            </SelectionFAB>
        );
    }, [isSelectModeActive, selectedMangas]);

    const triggerGlobalSearchButton = useMemo(
        () =>
            !!query && (
                <Box sx={{ p: 2 }}>
                    <Button
                        size="large"
                        component={RouterLink}
                        to={AppRoutes.sources.childRoutes.searchAll.path(query)}
                        sx={{ textTransform: 'none', width: '100%' }}
                    >
                        {t('library.action.label.search_globally', { query })}
                    </Button>
                </Box>
            ),
        [query],
    );
    const emptyLibraryMessageExtra = (
        <span>
            Add content from the{' '}
            <Link component={RouterLink} to={AppRoutes.browse.path()} color="inherit">
                browse tab
            </Link>
            .
        </span>
    );

    useAppTitle(
        <TitleWithSizeTag>
            Manga
            {showTabSize && <TitleSizeTag sx={{ color: 'inherit' }} label={librarySize} />}
        </TitleWithSizeTag>,
        'Manga',
        [showTabSize, librarySize],
    );
    useAppAction(
        <>
            {!isSelectModeActive && activeTab && (
                <>
                    <AppbarSearch />
                    <LibraryToolbarMenu category={activeTab} />
                    {!isCompactActions && <UpdateChecker categoryId={activeTab?.id} />}
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
                </>
            )}
            {!!mangas.length && (!isCompactActions || isSelectModeActive) && (
                <SelectableCollectionSelectMode
                    isActive={isSelectModeActive}
                    areAllItemsSelected={areAllItemsSelected}
                    areNoItemsSelected={areNoItemsSelected}
                    onSelectAll={(selectAll) => handleSelectAll(selectAll, mangaIds)}
                    onModeChange={(checked) => {
                        setIsSelectModeActive(checked);

                        if (checked) {
                            handleSelectAll(true, mangaIds);
                        } else {
                            tabs.forEach((tab) => handleSelectAll(false, [], tab.id.toString()));
                        }
                    }}
                />
            )}
        </>,
        [
            isSelectModeActive,
            areNoItemsSelected,
            areAllItemsSelected,
            activeTab,
            mangas.length,
            isCompactActions,
            mangaIds,
        ],
    );

    const overflowMenu = (
        <Menu anchorEl={overflowAnchor} open={Boolean(overflowAnchor)} onClose={() => setOverflowAnchor(null)}>
            {!!mangas.length && !isSelectModeActive && (
                <MenuItem
                    onClick={() => {
                        setOverflowAnchor(null);
                        handleEnterSelectMode();
                    }}
                >
                    <ListItemIcon>
                        <LibraryAddCheckIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>{t('global.button.select_all')}</ListItemText>
                </MenuItem>
            )}
            <MenuItem
                onClick={() => {
                    setOverflowAnchor(null);
                    startLibraryUpdate();
                }}
            >
                <ListItemIcon>
                    <RefreshIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>{t('library.action.label.update_library')}</ListItemText>
            </MenuItem>
            {activeTab && (
                <MenuItem
                    onClick={() => {
                        setOverflowAnchor(null);
                        startLibraryUpdate(activeTab.id);
                    }}
                >
                    <ListItemIcon>
                        <RefreshIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>{t('library.action.label.update_category')}</ListItemText>
                </MenuItem>
            )}
        </Menu>
    );

    const handleTabChange = (newTab: number) => {
        setSelectedTabId(newTab);
        setTabSearchParam(newTab);
    };

    if (tabsError != null || librarySizeResponse.error) {
        return (
            <EmptyViewAbsoluteCentered
                message={t('global.error.label.failed_to_load_data')}
                messageExtra={tabsError?.message ?? librarySizeResponse.error?.message}
                retry={() => {
                    if (tabsError) {
                        refetchCategories().catch(defaultPromiseErrorHandler('Library::refetchCategories'));
                    }

                    if (librarySizeResponse.error) {
                        librarySizeResponse.refetch().catch(defaultPromiseErrorHandler('Library::refetchLibrarySize'));
                    }
                }}
            />
        );
    }

    if (areCategoriesLoading || librarySizeResponse.loading) {
        return <LoadingPlaceholder />;
    }

    if (tabs.length === 0) {
        return (
            <EmptyViewAbsoluteCentered
                message={t('library.error.label.empty')}
                messageExtra={emptyLibraryMessageExtra}
            />
        );
    }

    if (!activeTab) {
        return <LoadingPlaceholder />;
    }

    if (tabs.length === 1) {
        return (
            <>
                {overflowMenu}
                {triggerGlobalSearchButton}
                <LibraryMangaGrid
                    // the key needs to include filters and query to force a re-render of the virtuoso grid to prevent https://github.com/petyosi/react-virtuoso/issues/1242
                    key={filterKey}
                    persistKey={activeTabGridPersistKey}
                    mangas={mangas}
                    message={sourceMangaError ? t('manga.error.label.request_failure') : t('library.error.label.empty')}
                    messageExtra={sourceMangaError?.message ?? emptyLibraryMessageExtra}
                    isLoading={categoryMangasLoading || shouldDelayEmptyState}
                    selectedMangaIds={selectedItemIds}
                    isSelectModeActive={isSelectModeActive}
                    handleSelection={handleSelect}
                    showFilteredOutMessage={!sourceMangaError && showFilteredOutMessage}
                    retry={sourceMangaError ? retryFetchCategoryMangas : undefined}
                />
                {selectionFab}
            </>
        );
    }

    return (
        <TabsWrapper>
            {overflowMenu}
            <TabsMenu value={activeTab.id} onChange={(e, newTab) => handleTabChange(newTab)}>
                {tabs.map((tab) => (
                    <Tab
                        sx={{ flexGrow: 1, maxWidth: 'unset' }}
                        key={tab.id}
                        label={
                            <TitleWithSizeTag>
                                {shouldShowDefaultCategory &&
                                customCategories.length > 0 &&
                                tab.id === uncategorizedCategory?.id
                                    ? t('global.label.default')
                                    : tab.name}
                                {showTabSize ? (
                                    <TitleSizeTag
                                        label={
                                            shouldShowDefaultCategory && tab.id === uncategorizedCategory?.id
                                                ? inferredDefaultTabCount
                                                : tab.mangas.totalCount
                                        }
                                    />
                                ) : null}
                            </TitleWithSizeTag>
                        }
                        value={tab.id}
                    />
                ))}
            </TabsMenu>
            {triggerGlobalSearchButton}
            {tabs.map((tab) => (
                <TabPanel key={tab.id} index={tab.id} currentIndex={activeTab.id}>
                    {tab === activeTab && (
                        <LibraryMangaGrid
                            // the key needs to include filters and query to force a re-render of the virtuoso grid to prevent https://github.com/petyosi/react-virtuoso/issues/1242
                            key={`${activeTab.id}-${filterKey}`}
                            persistKey={activeTabGridPersistKey}
                            mangas={mangas}
                            message={
                                sourceMangaError
                                    ? t('manga.error.label.request_failure')
                                    : t('category.error.label.empty')
                            }
                            messageExtra={sourceMangaError?.message ?? emptyLibraryMessageExtra}
                            isLoading={categoryMangasLoading || shouldDelayEmptyState}
                            selectedMangaIds={selectedItemIds}
                            isSelectModeActive={isSelectModeActive}
                            handleSelection={handleSelect}
                            showFilteredOutMessage={!sourceMangaError && showFilteredOutMessage}
                            retry={sourceMangaError ? retryFetchCategoryMangas : undefined}
                        />
                    )}
                </TabPanel>
            ))}
            {selectionFab}
        </TabsWrapper>
    );
}
