/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/* eslint-disable import/order, no-restricted-imports, no-nested-ternary, @typescript-eslint/no-unused-vars, arrow-body-style, no-await-in-loop, no-continue, @typescript-eslint/no-loop-func, no-console, no-param-reassign, @typescript-eslint/no-use-before-define */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box,
    Button,
    Card,
    CardActionArea,
    Typography,
    IconButton,
    LinearProgress,
    Skeleton,
    Stack,
    MenuItem,
    ListItemIcon,
    ListItemText,
    Checkbox,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    FormControl,
    Select,
    Tab,
    TextField,
    InputLabel,
} from '@mui/material';
import Chip, { ChipProps } from '@mui/material/Chip';
import MuiMenu from '@mui/material/Menu';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteIcon from '@mui/icons-material/Delete';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import LibraryAddCheckIcon from '@mui/icons-material/LibraryAddCheck';
import SortIcon from '@mui/icons-material/Sort';
import RefreshIcon from '@mui/icons-material/Refresh';
import EditIcon from '@mui/icons-material/Edit';
import LabelIcon from '@mui/icons-material/Label';
import { styled, useTheme } from '@mui/material/styles';
import { AwaitableComponent } from 'awaitable-component';

import type { NovelCategory, NovelCategoryMetadata, NovelMetadata } from '@/features/novel/Novel.types';
import { NovelStorage } from '@/features/novel/storage/NovelStorage';
import { AppRoutes } from '@/base/AppRoute.constants';
import {
    importDiscoveredNovelEpubs,
    importNovelEpub,
    uploadNovelEpub,
} from '@/features/novel/import/services/novelImportService.ts';
import { isNovelProgressComplete } from '@/features/novel/library/utils/progressStatus.ts';
import { NovelCategorySelect } from '@/features/novel/categories/components/NovelCategorySelect.tsx';
import { clearBookCache } from '@/features/novel/reader/hooks/useNovelBookContent.ts';
import {
    NovelCategoriesService,
    NovelSortMode,
    NovelSortModeType,
} from '@/features/novel/categories/services/NovelCategories.ts';

import PopupState, { bindMenu, bindTrigger } from 'material-ui-popup-state';
import { useLongPress } from 'use-long-press';
import { Menu } from '@/base/components/menu/Menu';
import { MUIUtil } from '@/lib/mui/MUI.util';
import { MediaQuery } from '@/base/utils/MediaQuery';
import { CustomTooltip } from '@/base/components/CustomTooltip';
import { TypographyMaxLines } from '@/base/components/texts/TypographyMaxLines';
import { MANGA_COVER_ASPECT_RATIO } from '@/features/manga/Manga.constants';
import { useAppAction } from '@/features/navigation-bar/hooks/useAppAction';
import { useAppTitle } from '@/features/navigation-bar/hooks/useAppTitle';
import { useMetadataServerSettings } from '@/features/settings/services/ServerSettingsMetadata';
import { useResizeObserver } from '@/base/hooks/useResizeObserver';
import { useNavBarContext } from '@/features/navigation-bar/NavbarContext';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered';
import { AppbarSearch } from '@/base/components/AppbarSearch';
import { SearchParam } from '@/base/Base.types';
import { useQueryParam, StringParam } from 'use-query-params';
import useMediaQuery from '@mui/material/useMediaQuery';
import { TabsMenu } from '@/base/components/tabs/TabsMenu';
import { TabsWrapper } from '@/base/components/tabs/TabsWrapper';
import { TabPanel } from '@/base/components/tabs/TabPanel';

// --- Types ---

interface LibraryItem extends NovelMetadata {
    importProgress?: number;
    importMessage?: string;
    lastRead?: number;
    progressPercent?: number;
    isCompleted?: boolean;
}

type NovelLibraryTab = {
    id: string;
    name: string;
    totalCount: number;
    type: 'all' | 'default' | 'custom';
};

// --- Styled Components ---

const BottomGradient = styled('div')({
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: '30%',
    background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 100%)',
});

const BottomGradientDoubledDown = styled('div')({
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: '20%',
    background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 100%)',
});

const TitleWithSizeTag = styled('span')({
    display: 'flex',
    alignItems: 'center',
});

const TitleSizeTag = ({ sx, ...props }: ChipProps) => (
    <Chip {...props} size="small" sx={{ ...sx, marginLeft: '5px' }} />
);

// --- Helper Components ---

type NovelLibraryCardProps = {
    item: LibraryItem;
    onOpen: (id: string) => void;
    onDelete: (id: string, event: React.MouseEvent) => void;
    onEdit: (item: LibraryItem) => void;
    onEditCategories: (item: LibraryItem) => void;
    isSelectionMode: boolean;
    isSelected: boolean;
    onToggleSelect: (id: string) => void;
};

const EMPTY_STATE_GRACE_MS = 220;
const DEFAULT_CATEGORY_ID = '__default__';

const NovelLibraryCard = ({
    item,
    onOpen,
    onDelete,
    onEdit,
    onEditCategories,
    isSelectionMode,
    isSelected,
    onToggleSelect,
}: NovelLibraryCardProps) => {
    const preventMobileContextMenu = MediaQuery.usePreventMobileContextMenu();
    const optionButtonRef = useRef<HTMLButtonElement>(null);
    const longPressTriggeredRef = useRef(false);
    const longPressResetTimeoutRef = useRef<number | null>(null);

    const isProcessing = item.isProcessing || false;
    const cardProgress = Math.min(100, Math.max(0, item.progressPercent ?? 0));

    useEffect(
        () => () => {
            if (longPressResetTimeoutRef.current !== null) {
                window.clearTimeout(longPressResetTimeoutRef.current);
            }
        },
        [],
    );

    const longPressBind = useLongPress(
        useCallback(() => {
            if (isSelectionMode || isProcessing) return;
            if (longPressResetTimeoutRef.current !== null) {
                window.clearTimeout(longPressResetTimeoutRef.current);
            }
            longPressTriggeredRef.current = true;
            longPressResetTimeoutRef.current = window.setTimeout(() => {
                longPressTriggeredRef.current = false;
                longPressResetTimeoutRef.current = null;
            }, 750);
            optionButtonRef.current?.click();
        }, [isProcessing, isSelectionMode]),
        {
            threshold: 500,
            cancelOnMovement: true,
        },
    );

    const handleCardClick = () => {
        if (longPressTriggeredRef.current) {
            longPressTriggeredRef.current = false;
            if (longPressResetTimeoutRef.current !== null) {
                window.clearTimeout(longPressResetTimeoutRef.current);
                longPressResetTimeoutRef.current = null;
            }
            return;
        }

        if (isProcessing) return;
        if (isSelectionMode) {
            onToggleSelect(item.id);
        } else {
            onOpen(item.id);
        }
    };

    return (
        <PopupState variant="popover" popupId={`novel-card-action-menu-${item.id}`}>
            {(popupState) => (
                <>
                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            m: 0.25,
                            '@media (hover: hover) and (pointer: fine)': {
                                '&:hover .novel-option-button': {
                                    visibility: 'visible',
                                    pointerEvents: 'auto',
                                },
                            },
                        }}
                    >
                        <Card sx={{ aspectRatio: MANGA_COVER_ASPECT_RATIO, display: 'flex' }}>
                            <CardActionArea
                                {...longPressBind()}
                                onClick={handleCardClick}
                                onContextMenu={(e) => {
                                    if (isSelectionMode) {
                                        e.preventDefault();
                                        return;
                                    }
                                    preventMobileContextMenu(e);
                                }}
                                sx={{
                                    position: 'relative',
                                    height: '100%',
                                    cursor: isProcessing ? 'wait' : 'pointer',
                                    opacity: isProcessing ? 0.7 : 1,
                                }}
                            >
                                {isProcessing ? (
                                    <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
                                        <Skeleton variant="rectangular" width="100%" height="100%" />
                                        <Box
                                            sx={{
                                                position: 'absolute',
                                                bottom: 0,
                                                left: 0,
                                                right: 0,
                                                p: 1,
                                                bgcolor: 'rgba(0,0,0,0.7)',
                                            }}
                                        >
                                            <LinearProgress
                                                variant="determinate"
                                                value={item.importProgress || 0}
                                                sx={{ mb: 0.5 }}
                                            />
                                            <Typography variant="caption" sx={{ color: 'white', fontSize: '0.65rem' }}>
                                                {item.importMessage || 'Processing...'}
                                            </Typography>
                                        </Box>
                                    </Box>
                                ) : item.cover ? (
                                    <Box
                                        component="img"
                                        src={item.cover}
                                        alt={item.title}
                                        loading="lazy"
                                        sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                ) : (
                                    <Stack
                                        sx={{
                                            height: '100%',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            bgcolor: (theme) => theme.palette.background.default,
                                        }}
                                    >
                                        <Typography variant="h3" color="text.disabled">
                                            Aa
                                        </Typography>
                                    </Stack>
                                )}

                                {!isProcessing && (
                                    <>
                                        <Stack
                                            direction="row"
                                            sx={{
                                                alignItems: 'start',
                                                justifyContent: 'space-between',
                                                position: 'absolute',
                                                top: (theme) => theme.spacing(1),
                                                left: (theme) => theme.spacing(1),
                                                right: (theme) => theme.spacing(1),
                                            }}
                                        >
                                            {isSelectionMode ? (
                                                <Checkbox
                                                    checked={isSelected}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onToggleSelect(item.id);
                                                    }}
                                                    sx={{
                                                        color: 'white',
                                                        bgcolor: 'rgba(0,0,0,0.5)',
                                                        borderRadius: 1,
                                                        p: 0.5,
                                                        '&.Mui-checked': {
                                                            color: 'primary.main',
                                                        },
                                                    }}
                                                />
                                            ) : item.isCompleted ? (
                                                <Box
                                                    sx={{
                                                        bgcolor: 'success.main',
                                                        color: 'success.contrastText',
                                                        px: 1,
                                                        py: 0.5,
                                                        borderRadius: 1,
                                                        fontSize: '0.75rem',
                                                        fontWeight: 'bold',
                                                        boxShadow: 2,
                                                    }}
                                                >
                                                    COMPLETED
                                                </Box>
                                            ) : item.hasProgress ? (
                                                <Box
                                                    sx={{
                                                        bgcolor: 'primary.main',
                                                        color: 'primary.contrastText',
                                                        px: 1,
                                                        py: 0.5,
                                                        borderRadius: 1,
                                                        fontSize: '0.75rem',
                                                        fontWeight: 'bold',
                                                        boxShadow: 2,
                                                    }}
                                                >
                                                    READING
                                                </Box>
                                            ) : (
                                                <Box />
                                            )}
                                            {!isSelectionMode && (
                                                <CustomTooltip title="Options">
                                                    <IconButton
                                                        ref={optionButtonRef}
                                                        component="span"
                                                        {...MUIUtil.preventRippleProp(bindTrigger(popupState), {
                                                            onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
                                                                event.stopPropagation();
                                                                event.preventDefault();
                                                                popupState.open();
                                                            },
                                                        })}
                                                        aria-label="Options"
                                                        className="novel-option-button"
                                                        size="small"
                                                        sx={{
                                                            minWidth: 'unset',
                                                            paddingX: 0,
                                                            paddingY: '2.5px',
                                                            backgroundColor: 'primary.main',
                                                            color: 'common.white',
                                                            '&:hover': { backgroundColor: 'primary.main' },
                                                            visibility: popupState.isOpen ? 'visible' : 'hidden',
                                                            pointerEvents: popupState.isOpen ? 'auto' : 'none',
                                                        }}
                                                    >
                                                        <MoreVertIcon />
                                                    </IconButton>
                                                </CustomTooltip>
                                            )}
                                        </Stack>

                                        <BottomGradient />
                                        <BottomGradientDoubledDown />

                                        <Stack
                                            sx={{
                                                alignItems: 'stretch',
                                                position: 'absolute',
                                                bottom: 0,
                                                width: '100%',
                                                p: 1,
                                                gap: 0.75,
                                            }}
                                        >
                                            <CustomTooltip title={item.title} placement="top">
                                                <TypographyMaxLines
                                                    component="h3"
                                                    sx={{
                                                        color: 'white',
                                                        textShadow: '0px 0px 3px #000000',
                                                    }}
                                                >
                                                    {item.title}
                                                </TypographyMaxLines>
                                            </CustomTooltip>

                                            {item.hasProgress && !item.isCompleted && (
                                                <Box sx={{ width: '100%' }}>
                                                    <LinearProgress
                                                        variant="determinate"
                                                        value={cardProgress}
                                                        sx={{
                                                            height: 4,
                                                            borderRadius: 999,
                                                            bgcolor: 'rgba(255,255,255,0.28)',
                                                            '& .MuiLinearProgress-bar': {
                                                                borderRadius: 999,
                                                            },
                                                        }}
                                                    />
                                                </Box>
                                            )}
                                        </Stack>
                                    </>
                                )}
                            </CardActionArea>
                        </Card>
                    </Box>

                    {popupState.isOpen && !isSelectionMode && (
                        <Menu {...bindMenu(popupState)}>
                            {(onClose) => (
                                <Box>
                                    <MenuItem
                                        key="edit"
                                        onClick={(event: React.MouseEvent<HTMLElement>) => {
                                            onClose();
                                            onEdit(item);
                                        }}
                                    >
                                        <ListItemIcon>
                                            <EditIcon fontSize="small" />
                                        </ListItemIcon>
                                        Edit
                                    </MenuItem>
                                    <MenuItem
                                        key="categories"
                                        onClick={() => {
                                            onClose();
                                            onEditCategories(item);
                                        }}
                                    >
                                        <ListItemIcon>
                                            <LabelIcon fontSize="small" />
                                        </ListItemIcon>
                                        Edit novel categories
                                    </MenuItem>
                                    <MenuItem
                                        key="delete"
                                        onClick={(event: React.MouseEvent<HTMLElement>) => {
                                            onClose();
                                            onDelete(item.id, event);
                                        }}
                                    >
                                        <ListItemIcon>
                                            <DeleteIcon fontSize="small" />
                                        </ListItemIcon>
                                        Delete
                                    </MenuItem>
                                </Box>
                            )}
                        </Menu>
                    )}
                </>
            )}
        </PopupState>
    );
};

// --- Main Component ---

export const NovelLibrary: React.FC = () => {
    const navigate = useNavigate();
    const theme = useTheme();
    const isSmallActions = useMediaQuery(theme.breakpoints.down('sm'));
    const [tabSearchParam, setTabSearchParam] = useQueryParam(SearchParam.TAB, StringParam);
    const [query] = useQueryParam(SearchParam.QUERY, StringParam);
    const [library, setLibrary] = useState<LibraryItem[]>([]);
    const [allBooks, setAllBooks] = useState<LibraryItem[]>([]);
    const [hasLoadedLibrary, setHasLoadedLibrary] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const [overflowAnchor, setOverflowAnchor] = useState<HTMLElement | null>(null);

    // Category state
    const [categories, setCategories] = useState<NovelCategory[]>([]);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(tabSearchParam ?? null);
    const [, setCategoryMetadata] = useState<Record<string, NovelCategoryMetadata>>({});
    const [currentSort, setCurrentSort] = useState<NovelCategoryMetadata>({ sortBy: 'dateAdded', sortDesc: true });
    const [isCategoryTransitioning, setIsCategoryTransitioning] = useState(true);

    // Dialog states
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmOptions, setConfirmOptions] = useState<{
        title: string;
        message: string;
        confirmText?: string;
        cancelText?: string;
    }>({
        title: '',
        message: '',
    });
    const confirmResolver = useRef<((value: boolean) => void) | null>(null);

    // Edit dialog state
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<LibraryItem | null>(null);
    const [editForm, setEditForm] = useState({ title: '', author: '', language: '' });

    const { navBarWidth } = useNavBarContext();
    const {
        settings: { mangaGridItemWidth, showTabSize },
    } = useMetadataServerSettings();

    const gridWrapperRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState(
        gridWrapperRef.current?.offsetWidth ?? Math.max(0, document.documentElement.offsetWidth - navBarWidth),
    );

    // Helper to show confirm dialog as a Promise (replacing browser confirm dialogs)
    const showConfirmation = useCallback(
        (title: string, message: string, confirmText = 'Confirm', cancelText = 'Cancel'): Promise<boolean> => {
            return new Promise((resolve) => {
                setConfirmOptions({ title, message, confirmText, cancelText });
                setConfirmOpen(true);
                confirmResolver.current = resolve;
            });
        },
        [],
    );

    const handleConfirmClose = (result: boolean) => {
        setConfirmOpen(false);
        if (confirmResolver.current) {
            confirmResolver.current(result);
            confirmResolver.current = null;
        }
    };

    // Load categories and metadata
    const loadCategories = useCallback(async () => {
        const cats = await NovelCategoriesService.getCategories();
        setCategories(cats);
        const meta = await NovelCategoriesService.getAllCategoryMetadata();
        setCategoryMetadata(meta);
    }, []);

    const allCategoryId = NovelCategoriesService.getAllCategoryId();
    const orderedCategories = useMemo(
        () => [...categories].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
        [categories],
    );
    const uncategorizedBooksCount = useMemo(
        () => allBooks.filter((book) => !(book.categoryIds?.length ?? 0)).length,
        [allBooks],
    );
    const shouldShowDefaultCategory = uncategorizedBooksCount > 0;
    const tabs = useMemo<NovelLibraryTab[]>(() => {
        const nextTabs: NovelLibraryTab[] = orderedCategories.map((category) => ({
            id: category.id,
            name: category.name,
            totalCount: allBooks.filter((book) => book.categoryIds?.includes(category.id)).length,
            type: 'custom',
        }));

        if (shouldShowDefaultCategory) {
            nextTabs.unshift({
                id: DEFAULT_CATEGORY_ID,
                name: 'Default',
                totalCount: uncategorizedBooksCount,
                type: 'default',
            });
        }

        if (!nextTabs.length && allBooks.length > 0) {
            nextTabs.push({
                id: allCategoryId,
                name: 'All',
                totalCount: allBooks.length,
                type: 'all',
            });
        }

        return nextTabs;
    }, [allBooks, allCategoryId, orderedCategories, shouldShowDefaultCategory, uncategorizedBooksCount]);
    const librarySize = allBooks.length;

    useEffect(() => {
        if (!tabs.length) {
            return;
        }

        const hasUrlTab = tabSearchParam != null && tabs.some((tab) => tab.id === tabSearchParam);
        if (hasUrlTab) {
            setSelectedCategoryId((prev) => (prev === tabSearchParam ? prev : tabSearchParam));
            return;
        }

        if (!hasLoadedLibrary) {
            return;
        }

        const fallbackTabId = tabs[0].id;
        setSelectedCategoryId((prev) => (prev === fallbackTabId ? prev : fallbackTabId));
        if (tabSearchParam !== fallbackTabId) {
            setTabSearchParam(fallbackTabId);
        }
    }, [tabs, tabSearchParam, hasLoadedLibrary, setTabSearchParam]);

    const activeTab =
        tabs.find((tab) => tab.id === (selectedCategoryId ?? tabSearchParam)) ??
        tabs.find((tab) => tab.id === tabSearchParam) ??
        tabs.find((tab) => tab.id === selectedCategoryId);
    const activeCategoryId = activeTab?.id ?? allCategoryId;

    // Load sort settings for current category
    const loadSortSettings = useCallback(async () => {
        const sort = await NovelCategoriesService.getCategoryMetadata(activeCategoryId);
        setCurrentSort(sort);
    }, [activeCategoryId]);

    // Filter and sort books
    const filterAndSortBooks = useCallback(
        (books: LibraryItem[], categoryId: string, sort: NovelCategoryMetadata): LibraryItem[] => {
            let filtered = books;
            const normalizedQuery = query?.trim().toLowerCase() ?? '';

            // Filter by category
            if (categoryId === DEFAULT_CATEGORY_ID) {
                filtered = filtered.filter((book) => !(book.categoryIds?.length ?? 0));
            } else if (!NovelCategoriesService.isAllCategory(categoryId)) {
                filtered = filtered.filter((book) => book.categoryIds?.includes(categoryId));
            }

            if (normalizedQuery) {
                filtered = filtered.filter((book) =>
                    [book.title, book.author, book.language].some((value) =>
                        value?.toLowerCase().includes(normalizedQuery),
                    ),
                );
            }

            return [...filtered].sort((a, b) => {
                const multiplier = sort.sortDesc ? -1 : 1;
                switch (sort.sortBy) {
                    case NovelSortMode.DATE_ADDED:
                        return multiplier * (b.addedAt - a.addedAt);
                    case NovelSortMode.TITLE:
                        return multiplier * (a.title || '').localeCompare(b.title || '');
                    case NovelSortMode.AUTHOR:
                        return multiplier * (a.author || '').localeCompare(b.author || '');
                    case NovelSortMode.LENGTH:
                        // For length: sortDesc=true (longer first), sortDesc=false (shorter first)
                        return multiplier * ((a.stats?.totalLength || 0) - (b.stats?.totalLength || 0));
                    case NovelSortMode.LANGUAGE:
                        return multiplier * ((a.language || 'unknown') > (b.language || 'unknown') ? 1 : -1);
                    case NovelSortMode.LAST_READ:
                        return multiplier * ((b.lastRead || 0) - (a.lastRead || 0));
                    case NovelSortMode.PROGRESS:
                        return multiplier * ((b.progressPercent || 0) - (a.progressPercent || 0));
                    default:
                        return multiplier * (b.addedAt - a.addedAt);
                }
            });
        },
        [query],
    );

    useEffect(() => {
        loadSortSettings();
    }, [loadSortSettings]);

    useEffect(() => {
        const filtered = filterAndSortBooks(allBooks, activeCategoryId, currentSort);
        setLibrary(filtered);
    }, [allBooks, activeCategoryId, currentSort, filterAndSortBooks]);

    useEffect(() => {
        setIsCategoryTransitioning(true);
        const timeoutId = window.setTimeout(() => {
            setIsCategoryTransitioning(false);
        }, EMPTY_STATE_GRACE_MS);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [activeCategoryId]);

    useResizeObserver(
        gridWrapperRef,
        useCallback(() => {
            const gridWidth = gridWrapperRef.current?.offsetWidth;
            setDimensions(gridWidth ?? document.documentElement.offsetWidth - navBarWidth);
        }, [navBarWidth]),
    );

    const gridColumns = Math.max(1, Math.ceil(dimensions / mangaGridItemWidth));
    const shouldCollapseActions = isSmallActions || dimensions < 1280;

    // Load library data
    const loadLibrary = useCallback(async () => {
        try {
            const keys = await NovelStorage.getMetadataKeys();
            const items: LibraryItem[] = [];

            for (const key of keys) {
                const metadata = await NovelStorage.getMetadata(key);
                if (metadata) {
                    const progress = await NovelStorage.getProgress(key);
                    const progressPercent = progress ? progress.progress * 100 : undefined;
                    const isCompleted = isNovelProgressComplete(progressPercent);
                    items.push({
                        ...metadata,
                        hasProgress: !!progress && !isCompleted,
                        isCompleted,
                        lastRead: progress?.lastRead,
                        progressPercent,
                    } as LibraryItem & { lastRead?: number; progressPercent?: number });
                }
            }

            setAllBooks(items);
        } catch (e) {
            console.error('Failed to load library:', e);
        } finally {
            setHasLoadedLibrary(true);
        }
    }, []);

    const importDiscoveredBooks = useCallback(async () => {
        setIsImporting(true);
        try {
            await importDiscoveredNovelEpubs();

            await loadLibrary();
        } catch (e) {
            console.error('Failed to auto-import discovered EPUB files:', e);
        } finally {
            setIsImporting(false);
        }
    }, [loadLibrary]);

    // Initial load on mount
    useEffect(() => {
        const init = async () => {
            await NovelStorage.migrateLegacyStorage();
            await loadCategories();
            await importDiscoveredBooks();
            await loadLibrary();
        };
        init();
    }, [importDiscoveredBooks, loadCategories, loadLibrary]);

    // Reload library when tab becomes visible again (handles browser suspending connections after long background time)
    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (document.visibilityState === 'visible') {
                await importDiscoveredBooks();
                await loadLibrary();
                await loadCategories();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [importDiscoveredBooks, loadLibrary, loadCategories]);

    // Normalize title for comparison
    const normalizeTitle = (title: string): string => {
        return title
            .toLowerCase()
            .replace(/\.epub$/i, '')
            .replace(/[^\p{L}\p{N}\s]/gu, '') // Unicode-aware
            .replace(/\s+/g, ' ')
            .trim();
    };

    const findDuplicateInLibrary = useCallback(
        (title: string, currentLibrary: LibraryItem[]): LibraryItem | undefined => {
            const normalizedTitle = normalizeTitle(title);
            return currentLibrary.find((item) => !item.isProcessing && normalizeTitle(item.title) === normalizedTitle);
        },
        [],
    );

    const handleImport = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement> | { target: { files: File[]; value: string } }) => {
            if (!e.target.files?.length) return;

            const files = Array.from(e.target.files);
            setIsImporting(true);

            const skippedFiles: string[] = [];
            const importedFiles: string[] = [];

            // Use allBooks as source of truth, not the filtered library
            let currentLibrary = [...allBooks];

            for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
                const file = files[fileIndex];
                const fileTitle = file.name.replace(/\.epub$/i, '');

                const existingBook = findDuplicateInLibrary(fileTitle, currentLibrary);

                if (existingBook) {
                    const shouldReplace = await showConfirmation(
                        'Duplicate File',
                        `"${existingBook.title}" already exists in your library.\n\nDo you want to replace it?`,
                        'Replace',
                        'Skip',
                    );

                    if (!shouldReplace) {
                        skippedFiles.push(file.name);
                        continue;
                    }

                    clearBookCache(existingBook.id);
                    await NovelStorage.deleteBook(existingBook.id);
                    currentLibrary = currentLibrary.filter((item) => item.id !== existingBook.id);

                    // Update both state arrays immediately
                    setAllBooks([...currentLibrary]);
                    setLibrary(filterAndSortBooks(currentLibrary, activeCategoryId, currentSort));
                }

                const bookId = `novel_${Date.now()}_${fileIndex}`;

                const placeholder: LibraryItem = {
                    id: bookId,
                    title: fileTitle,
                    author: '',
                    addedAt: Date.now(),
                    isProcessing: true,
                    importProgress: 0,
                    importMessage: 'Starting...',
                    stats: { chapterLengths: [], totalLength: 0 },
                    chapterCount: 0,
                    toc: [],
                    categoryIds: [],
                };

                // Add placeholder to local array
                currentLibrary = [placeholder, ...currentLibrary];

                // Update both state arrays
                setAllBooks([...currentLibrary]);
                setLibrary(filterAndSortBooks(currentLibrary, activeCategoryId, currentSort));

                try {
                    const updateImportProgress = (percent: number, message: string) => {
                        const updateProgress = (items: LibraryItem[]) =>
                            items.map((item) =>
                                item.id === bookId
                                    ? {
                                          ...item,
                                          importProgress: percent,
                                          importMessage: message,
                                      }
                                    : item,
                            );

                        currentLibrary = updateProgress(currentLibrary);
                        setAllBooks([...currentLibrary]);
                        setLibrary(filterAndSortBooks(currentLibrary, activeCategoryId, currentSort));
                    };

                    updateImportProgress(10, 'Saving EPUB...');
                    await uploadNovelEpub(bookId, file);

                    updateImportProgress(35, 'Parsing EPUB...');
                    const result = await importNovelEpub(bookId, file);
                    const metadataTitle = result.metadata.title;
                    const duplicateByMetadata = findDuplicateInLibrary(
                        metadataTitle,
                        currentLibrary.filter((i) => i.id !== bookId),
                    );

                    if (duplicateByMetadata) {
                        const shouldReplace = await showConfirmation(
                            'Duplicate Metadata',
                            `The book "${metadataTitle}" already exists in your library (detected from EPUB metadata).\n\nDo you want to replace it?`,
                            'Replace',
                            'Skip',
                        );

                        if (!shouldReplace) {
                            clearBookCache(bookId);
                            await NovelStorage.deleteBook(bookId);
                            currentLibrary = currentLibrary.filter((item) => item.id !== bookId);
                            setAllBooks([...currentLibrary]);
                            setLibrary(filterAndSortBooks(currentLibrary, activeCategoryId, currentSort));
                            skippedFiles.push(file.name);
                            continue;
                        }

                        clearBookCache(duplicateByMetadata.id);
                        await NovelStorage.deleteBook(duplicateByMetadata.id);
                        currentLibrary = currentLibrary.filter((item) => item.id !== duplicateByMetadata.id);
                        setAllBooks([...currentLibrary]);
                        setLibrary(filterAndSortBooks(currentLibrary, activeCategoryId, currentSort));
                    }

                    const finalItem: LibraryItem = {
                        ...result.metadata,
                        isProcessing: false,
                        hasProgress: false,
                    };

                    currentLibrary = currentLibrary.map((item) => (item.id === bookId ? finalItem : item));
                    setAllBooks([...currentLibrary]);
                    setLibrary(filterAndSortBooks(currentLibrary, activeCategoryId, currentSort));

                    importedFiles.push(result.metadata.title);
                    console.log(`[Import] Complete: ${result.metadata.title}`);
                } catch (err: any) {
                    console.error(`[Import] Error for ${file.name}:`, err);

                    // Mark as error
                    const updateError = (items: LibraryItem[]) =>
                        items.map((item) =>
                            item.id === bookId
                                ? {
                                      ...item,
                                      isProcessing: false,
                                      isError: true,
                                      errorMsg: err.message || 'Unknown error',
                                  }
                                : item,
                        );

                    currentLibrary = updateError(currentLibrary);
                    setAllBooks([...currentLibrary]);
                    setLibrary(filterAndSortBooks(currentLibrary, activeCategoryId, currentSort));
                }
            }

            setIsImporting(false);
            e.target.value = '';
        },
        [allBooks, findDuplicateInLibrary, showConfirmation, filterAndSortBooks, activeCategoryId, currentSort],
    );

    const handleDelete = useCallback(
        async (id: string, e: React.MouseEvent) => {
            e.stopPropagation();

            const shouldDelete = await showConfirmation(
                'Delete Book',
                'Are you sure you want to delete this book? This cannot be undone.',
                'Delete',
            );
            if (!shouldDelete) return;

            clearBookCache(id);
            setLibrary((prev) => prev.filter((item) => item.id !== id));
            setAllBooks((prev) => prev.filter((item) => item.id !== id));
            await NovelStorage.deleteBook(id);
        },
        [showConfirmation],
    );

    const handleEdit = useCallback((item: LibraryItem) => {
        setEditingItem(item);
        setEditForm({
            title: item.title,
            author: item.author,
            language: item.language || 'unknown',
        });
        setEditDialogOpen(true);
    }, []);

    const handleEditSave = useCallback(async () => {
        if (!editingItem) return;

        const updates: Partial<NovelMetadata> = {
            title: editForm.title,
            author: editForm.author,
            language: editForm.language,
        };

        await NovelStorage.updateMetadata(editingItem.id, updates);

        setAllBooks((prev) => prev.map((item) => (item.id === editingItem.id ? { ...item, ...updates } : item)));

        setEditDialogOpen(false);
        setEditingItem(null);
    }, [editingItem, editForm]);

    const handleEditCategories = useCallback(
        async (item: LibraryItem) => {
            try {
                await AwaitableComponent.show(
                    NovelCategorySelect,
                    { novelId: item.id },
                    { id: `novel-library-edit-categories-${item.id}` },
                );
                await loadCategories();
                await loadLibrary();
            } catch {
                // Dialog dismissal does not require a refresh.
            }
        },
        [loadCategories, loadLibrary],
    );

    const handleMultiDelete = useCallback(async () => {
        if (selectedIds.size === 0) return;

        const count = selectedIds.size;
        const shouldDelete = await showConfirmation(
            'Delete Selected',
            `Are you sure you want to delete ${count} selected book${count > 1 ? 's' : ''}?`,
            'Delete',
        );

        if (!shouldDelete) return;

        for (const id of selectedIds) {
            clearBookCache(id);
            await NovelStorage.deleteBook(id);
        }

        setAllBooks((prev) => prev.filter((item) => !selectedIds.has(item.id)));
        setLibrary((prev) => prev.filter((item) => !selectedIds.has(item.id)));
        setSelectedIds(new Set());
        setIsSelectionMode(false);
    }, [selectedIds, showConfirmation]);

    const handleToggleSelect = useCallback((id: string) => {
        setSelectedIds((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    }, []);

    const handleSelectAll = useCallback(() => {
        const allIds = library.filter((item) => !item.isProcessing).map((item) => item.id);
        setSelectedIds(new Set(allIds));
    }, [library]);

    const handleCancelSelection = useCallback(() => {
        setSelectedIds(new Set());
        setIsSelectionMode(false);
    }, []);

    const handleOpen = useCallback(
        (id: string) => {
            navigate(AppRoutes.novel.childRoutes.reader.path(id));
        },
        [navigate],
    );

    // Drag and Drop handlers
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // Only hide overlay if leaving the main container
        if (e.currentTarget === e.target) {
            setIsDragOver(false);
        }
    }, []);

    const handleDrop = useCallback(
        async (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragOver(false);

            const files = Array.from(e.dataTransfer.files);
            const epubFiles = files.filter(
                (file) => file.name.toLowerCase().endsWith('.epub') || file.type === 'application/epub+zip',
            );

            if (epubFiles.length === 0) return;

            // Simulate input change event to reuse existing import logic
            const mockEvent = {
                target: {
                    files: epubFiles,
                    value: '',
                },
            } as any;

            await handleImport(mockEvent);
        },
        [handleImport],
    );

    const handleSortChange = useCallback(
        async (newSortBy: NovelSortModeType) => {
            const newSort = { ...currentSort };
            if (currentSort.sortBy === newSortBy) {
                newSort.sortDesc = !newSort.sortDesc;
            } else {
                newSort.sortBy = newSortBy;
                newSort.sortDesc = getDefaultSortDesc(newSortBy);
            }
            setCurrentSort(newSort);
            await NovelCategoriesService.setCategoryMetadata(activeCategoryId, newSort);
        },
        [activeCategoryId, currentSort],
    );

    const handleCategoryChange = useCallback(
        (categoryId: string) => {
            setSelectedCategoryId(categoryId);
            setTabSearchParam(categoryId);
        },
        [setTabSearchParam],
    );

    // Get default sort direction for each sort type
    const getDefaultSortDesc = (sortBy: string): boolean => {
        switch (sortBy) {
            case NovelSortMode.TITLE:
            case NovelSortMode.AUTHOR:
            case NovelSortMode.LANGUAGE:
                return false; // A to Z (ascending)
            case NovelSortMode.LENGTH:
                return true; // Long to short (descending)
            case NovelSortMode.DATE_ADDED:
            case NovelSortMode.LAST_READ:
            case NovelSortMode.PROGRESS:
            default:
                return true; // Newest/most first (descending)
        }
    };

    useAppTitle(
        <TitleWithSizeTag>
            Novels
            {showTabSize && <TitleSizeTag sx={{ color: 'inherit' }} label={librarySize} />}
        </TitleWithSizeTag>,
        'Novel',
        [showTabSize, librarySize],
    );

    const appAction = useMemo(
        () => (
            <Stack direction="row" spacing={1} alignItems="center">
                {isSelectionMode ? (
                    <>
                        <Typography variant="body2" sx={{ color: 'inherit' }}>
                            {selectedIds.size} selected
                        </Typography>
                        <Button
                            color="inherit"
                            onClick={handleSelectAll}
                            size="small"
                            sx={{ textTransform: 'none', minWidth: 'auto' }}
                        >
                            All
                        </Button>
                        <IconButton
                            color="inherit"
                            onClick={handleMultiDelete}
                            disabled={selectedIds.size === 0}
                            size="small"
                        >
                            <DeleteIcon />
                        </IconButton>
                        <Button
                            color="inherit"
                            onClick={handleCancelSelection}
                            size="small"
                            sx={{ textTransform: 'none', minWidth: 'auto' }}
                        >
                            Cancel
                        </Button>
                    </>
                ) : (
                    <>
                        <AppbarSearch />
                        {library.length > 0 && !shouldCollapseActions && (
                            <IconButton
                                color="inherit"
                                aria-label="Select novels"
                                onClick={() => setIsSelectionMode(true)}
                                size="small"
                                sx={{ mr: 1 }}
                            >
                                <LibraryAddCheckIcon />
                            </IconButton>
                        )}
                        <PopupState variant="popover" popupId="sort-menu">
                            {(popupState) => (
                                <>
                                    <CustomTooltip title="Sort">
                                        <IconButton color="inherit" {...bindTrigger(popupState)} size="small">
                                            <SortIcon />
                                            <Typography sx={{ fontWeight: 'bold', fontSize: 12, ml: 0.25 }}>
                                                {currentSort.sortDesc ? '↓' : '↑'}
                                            </Typography>
                                        </IconButton>
                                    </CustomTooltip>
                                    <Menu {...bindMenu(popupState)}>
                                        {(onClose) => (
                                            <Box>
                                                <MenuItem
                                                    key="dateAdded"
                                                    selected={currentSort.sortBy === 'dateAdded'}
                                                    onClick={() => {
                                                        handleSortChange('dateAdded');
                                                        onClose();
                                                    }}
                                                >
                                                    Date Added{' '}
                                                    {currentSort.sortBy === 'dateAdded' &&
                                                        (currentSort.sortDesc ? '↓' : '↑')}
                                                </MenuItem>
                                                <MenuItem
                                                    key="title"
                                                    selected={currentSort.sortBy === 'title'}
                                                    onClick={() => {
                                                        handleSortChange('title');
                                                        onClose();
                                                    }}
                                                >
                                                    Title{' '}
                                                    {currentSort.sortBy === 'title' &&
                                                        (currentSort.sortDesc ? '↓' : '↑')}
                                                </MenuItem>
                                                <MenuItem
                                                    key="author"
                                                    selected={currentSort.sortBy === 'author'}
                                                    onClick={() => {
                                                        handleSortChange('author');
                                                        onClose();
                                                    }}
                                                >
                                                    Author{' '}
                                                    {currentSort.sortBy === 'author' &&
                                                        (currentSort.sortDesc ? '↓' : '↑')}
                                                </MenuItem>
                                                <MenuItem
                                                    key="length"
                                                    selected={currentSort.sortBy === 'length'}
                                                    onClick={() => {
                                                        handleSortChange('length');
                                                        onClose();
                                                    }}
                                                >
                                                    Length{' '}
                                                    {currentSort.sortBy === 'length' &&
                                                        (currentSort.sortDesc ? '↓' : '↑')}
                                                </MenuItem>
                                                <MenuItem
                                                    key="language"
                                                    selected={currentSort.sortBy === 'language'}
                                                    onClick={() => {
                                                        handleSortChange('language');
                                                        onClose();
                                                    }}
                                                >
                                                    Language{' '}
                                                    {currentSort.sortBy === 'language' &&
                                                        (currentSort.sortDesc ? '↓' : '↑')}
                                                </MenuItem>
                                                <MenuItem
                                                    key="lastRead"
                                                    selected={currentSort.sortBy === 'lastRead'}
                                                    onClick={() => {
                                                        handleSortChange('lastRead');
                                                        onClose();
                                                    }}
                                                >
                                                    Last Read{' '}
                                                    {currentSort.sortBy === 'lastRead' &&
                                                        (currentSort.sortDesc ? '↓' : '↑')}
                                                </MenuItem>
                                                <MenuItem
                                                    key="progress"
                                                    selected={currentSort.sortBy === 'progress'}
                                                    onClick={() => {
                                                        handleSortChange('progress');
                                                        onClose();
                                                    }}
                                                >
                                                    Progress{' '}
                                                    {currentSort.sortBy === 'progress' &&
                                                        (currentSort.sortDesc ? '↓' : '↑')}
                                                </MenuItem>
                                            </Box>
                                        )}
                                    </Menu>
                                </>
                            )}
                        </PopupState>
                        {!shouldCollapseActions && (
                            <>
                                <CustomTooltip title="Refresh">
                                    <IconButton color="inherit" onClick={loadLibrary} size="small">
                                        <RefreshIcon />
                                    </IconButton>
                                </CustomTooltip>
                                <Button
                                    color="inherit"
                                    component="label"
                                    startIcon={<UploadFileIcon />}
                                    disabled={isImporting}
                                    sx={{ textTransform: 'none' }}
                                >
                                    {isImporting ? 'Importing...' : 'Import EPUB'}
                                    <input type="file" accept=".epub" multiple hidden onChange={handleImport} />
                                </Button>
                            </>
                        )}
                        {shouldCollapseActions && (
                            <>
                                <CustomTooltip title="More">
                                    <IconButton
                                        color="inherit"
                                        aria-label="More"
                                        onClick={(event) => setOverflowAnchor(event.currentTarget)}
                                        size="small"
                                    >
                                        <MoreVertIcon />
                                    </IconButton>
                                </CustomTooltip>
                                <MuiMenu
                                    anchorEl={overflowAnchor}
                                    open={Boolean(overflowAnchor)}
                                    onClose={() => setOverflowAnchor(null)}
                                >
                                    {library.length > 0 && (
                                        <MenuItem
                                            onClick={() => {
                                                setOverflowAnchor(null);
                                                setIsSelectionMode(true);
                                            }}
                                        >
                                            <ListItemIcon>
                                                <LibraryAddCheckIcon fontSize="small" />
                                            </ListItemIcon>
                                            <ListItemText>Select</ListItemText>
                                        </MenuItem>
                                    )}
                                    <MenuItem
                                        onClick={() => {
                                            setOverflowAnchor(null);
                                            loadLibrary();
                                        }}
                                    >
                                        <ListItemIcon>
                                            <RefreshIcon fontSize="small" />
                                        </ListItemIcon>
                                        <ListItemText>Refresh</ListItemText>
                                    </MenuItem>
                                    <MenuItem component="label" disabled={isImporting}>
                                        <ListItemIcon>
                                            <UploadFileIcon fontSize="small" />
                                        </ListItemIcon>
                                        <ListItemText>{isImporting ? 'Importing...' : 'Import EPUB'}</ListItemText>
                                        <input type="file" accept=".epub" multiple hidden onChange={handleImport} />
                                    </MenuItem>
                                </MuiMenu>
                            </>
                        )}
                    </>
                )}
            </Stack>
        ),
        [
            handleImport,
            isImporting,
            isSelectionMode,
            selectedIds.size,
            handleMultiDelete,
            handleSelectAll,
            handleCancelSelection,
            library.length,
            currentSort.sortBy,
            currentSort.sortDesc,
            handleSortChange,
            shouldCollapseActions,
            overflowAnchor,
            loadLibrary,
        ],
    );

    useAppAction(appAction, [appAction]);

    const renderNovelGrid = () => (
        <Box sx={{ p: 1 }}>
            {library.length === 0 && !isImporting && !isCategoryTransitioning && (
                <EmptyViewAbsoluteCentered
                    message={
                        allBooks.length === 0
                            ? 'No books found. Import an EPUB to start reading.'
                            : 'This category is empty.'
                    }
                />
            )}

            {library.length === 0 && !isImporting && isCategoryTransitioning && <LoadingPlaceholder />}

            <Box
                ref={gridWrapperRef}
                sx={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
                    gap: 1,
                }}
            >
                {library.map((item) => (
                    <Box key={item.id}>
                        <NovelLibraryCard
                            item={item}
                            onOpen={handleOpen}
                            onDelete={handleDelete}
                            onEdit={handleEdit}
                            onEditCategories={handleEditCategories}
                            isSelectionMode={isSelectionMode}
                            isSelected={selectedIds.has(item.id)}
                            onToggleSelect={handleToggleSelect}
                        />
                    </Box>
                ))}
            </Box>
        </Box>
    );

    return (
        <Box
            sx={{ position: 'relative', minHeight: '100vh' }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Drag overlay */}
            {isDragOver && (
                <Box
                    sx={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9999,
                        pointerEvents: 'none',
                    }}
                >
                    <Box sx={{ textAlign: 'center', color: 'white' }}>
                        <UploadFileIcon sx={{ fontSize: 64, mb: 2 }} />
                        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                            Drop EPUB files to import
                        </Typography>
                    </Box>
                </Box>
            )}

            {tabs.length <= 1 ? (
                renderNovelGrid()
            ) : (
                <TabsWrapper>
                    <TabsMenu
                        value={activeTab?.id ?? tabs[0].id}
                        onChange={(_, newValue) => handleCategoryChange(newValue)}
                    >
                        {tabs.map((tab) => (
                            <Tab
                                sx={{ flexGrow: 1, maxWidth: 'unset' }}
                                key={tab.id}
                                label={
                                    <TitleWithSizeTag>
                                        {tab.name}
                                        {showTabSize ? <TitleSizeTag label={tab.totalCount} /> : null}
                                    </TitleWithSizeTag>
                                }
                                value={tab.id}
                            />
                        ))}
                    </TabsMenu>
                    {tabs.map((tab) => (
                        <TabPanel key={tab.id} index={tab.id} currentIndex={activeTab?.id ?? tabs[0].id}>
                            {tab.id === (activeTab?.id ?? tabs[0].id) && renderNovelGrid()}
                        </TabPanel>
                    ))}
                </TabsWrapper>
            )}

            {/* Edit Dialog */}
            <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Edit Book</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        <TextField
                            label="Title"
                            value={editForm.title}
                            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                            fullWidth
                        />
                        <TextField
                            label="Author"
                            value={editForm.author}
                            onChange={(e) => setEditForm({ ...editForm, author: e.target.value })}
                            fullWidth
                        />
                        <FormControl fullWidth>
                            <InputLabel>Language</InputLabel>
                            <Select
                                value={editForm.language}
                                label="Language"
                                onChange={(e) => setEditForm({ ...editForm, language: e.target.value })}
                            >
                                <MenuItem value="unknown">Unknown</MenuItem>
                                <MenuItem value="ja">Japanese</MenuItem>
                                <MenuItem value="en">English</MenuItem>
                                <MenuItem value="zh">Chinese</MenuItem>
                                <MenuItem value="ko">Korean</MenuItem>
                                <MenuItem value="es">Spanish</MenuItem>
                                <MenuItem value="fr">French</MenuItem>
                                <MenuItem value="de">German</MenuItem>
                                <MenuItem value="ru">Russian</MenuItem>
                                <MenuItem value="pt">Portuguese</MenuItem>
                                <MenuItem value="it">Italian</MenuItem>
                                <MenuItem value="ar">Arabic</MenuItem>
                                <MenuItem value="other">Other</MenuItem>
                            </Select>
                        </FormControl>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleEditSave} variant="contained">
                        Save
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Confirmation Dialog */}
            <Dialog
                open={confirmOpen}
                onClose={() => handleConfirmClose(false)}
                aria-labelledby="alert-dialog-title"
                aria-describedby="alert-dialog-description"
            >
                <DialogTitle id="alert-dialog-title">{confirmOptions.title}</DialogTitle>
                <DialogContent>
                    <DialogContentText id="alert-dialog-description" sx={{ whiteSpace: 'pre-line' }}>
                        {confirmOptions.message}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => handleConfirmClose(false)} color="inherit">
                        {confirmOptions.cancelText || 'Cancel'}
                    </Button>
                    <Button onClick={() => handleConfirmClose(true)} autoFocus color="primary">
                        {confirmOptions.confirmText || 'Confirm'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
