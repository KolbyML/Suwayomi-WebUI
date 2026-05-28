/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Checkbox from '@mui/material/Checkbox';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import DoneIcon from '@mui/icons-material/Done';
import RemoveDoneIcon from '@mui/icons-material/RemoveDone';
import DeleteIcon from '@mui/icons-material/Delete';
import FilterListIcon from '@mui/icons-material/FilterList';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DownloadIcon from '@mui/icons-material/Download';
import SubtitlesIcon from '@mui/icons-material/Subtitles';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import { styled } from '@mui/material/styles';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Divider from '@mui/material/Divider';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { Link } from 'react-router-dom';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { VirtuosoPersisted } from '@/lib/virtuoso/Component/VirtuosoPersisted.tsx';
import { useNavBarContext } from '@/features/navigation-bar/NavbarContext.tsx';
import { useResizeObserver } from '@/base/hooks/useResizeObserver.tsx';
import { MediaQuery } from '@/base/utils/MediaQuery.tsx';
import { shouldForwardProp } from '@/base/utils/ShouldForwardProp.ts';
import { DEFAULT_FULL_FAB_HEIGHT, StyledFab } from '@/base/components/buttons/StyledFab.tsx';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { HttpMethod } from '@/lib/requests/client/RestClient.ts';
import { useLocalStorage } from '@/base/hooks/useStorage.tsx';
import { EpisodeCard } from '@/features/anime/components/cards/EpisodeCard.tsx';
import { EpisodeDownloadDialog } from '@/features/anime/components/actions/EpisodeDownloadDialog.tsx';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { useDownloadStatusSnapshot } from '@/features/downloads/services/DownloadStatusStore.ts';
import { DownloadState } from '@/lib/requests/types.ts';
import { MenuItem as ActionMenuItem } from '@/base/components/menu/MenuItem.tsx';
import { buildAnimeEpisodeBatchPayload } from '@/features/anime/services/trackerProgress.ts';
import { useManatanSyncOnEpisodeRead } from '@/Manatan/anime/AnimePrivateAdapters.ts';
import {
    buildAnimePlaybackRouteState,
    getAnimeEpisodePlaybackOrder,
    readStoredAnimePlaybackProgress,
} from '@/features/anime/reader/services/playbackProgress.ts';

type EpisodeResponse = {
    id: number;
    name: string;
    episodeNumber: number;
    uploadDate: number;
    scanlator?: string | null;
    summary?: string | null;
    fillermark?: boolean | null;
    index: number;
    sourceOrder?: number | null;
    isRead: boolean;
    isDownloaded: boolean;
    realUrl?: string | null;
};

type EpisodeListHeaderProps = {
    scrollbarWidth: number;
};

const EpisodeListHeader = styled(Stack, {
    shouldForwardProp: shouldForwardProp<EpisodeListHeaderProps>(['scrollbarWidth']),
})<EpisodeListHeaderProps>(({ theme, scrollbarWidth }) => ({
    padding: theme.spacing(1),
    paddingRight: `calc(${scrollbarWidth}px + ${theme.spacing(1)})`,
    paddingBottom: 0,
    [theme.breakpoints.down('md')]: {
        paddingRight: theme.spacing(1),
    },
}));

type StyledVirtuosoProps = { topOffset: number };
const StyledVirtuoso = styled(VirtuosoPersisted, {
    shouldForwardProp: shouldForwardProp<StyledVirtuosoProps>(['topOffset']),
})<StyledVirtuosoProps>(({ theme, topOffset }) => ({
    listStyle: 'none',
    padding: 0,
    [theme.breakpoints.up('md')]: {
        height: `calc(100vh - ${topOffset}px)`,
        margin: 0,
    },
}));

type EpisodeFilter = 'all' | 'watched' | 'unwatched' | 'downloaded';
type EpisodeSort = 'episodeAsc' | 'episodeDesc' | 'dateAsc' | 'dateDesc';

export const EpisodeList = ({
    episodes,
    animeId,
    isLocalAnimeSource = false,
    isRefreshing,
    isLoading,
    onEpisodesUpdate,
}: {
    episodes: EpisodeResponse[];
    animeId: string;
    isLocalAnimeSource?: boolean;
    isRefreshing: boolean;
    isLoading: boolean;
    onEpisodesUpdate: (updater: EpisodeResponse[] | ((episodes: EpisodeResponse[]) => EpisodeResponse[])) => void;
}) => {
    const { t } = useTranslation();
    const { appBarHeight } = useNavBarContext();
    const isMobileWidth = MediaQuery.useIsBelowWidth('md');
    const [listHeaderHeight, setListHeaderHeight] = useState(50);
    const [listHeaderRef, setListHeaderRef] = useState<HTMLDivElement | null>(null);
    const [selectedEpisodeIds, setSelectedEpisodeIds] = useState<number[]>([]);
    const [filter, setFilter] = useLocalStorage<EpisodeFilter | 'read' | 'unread'>(
        `anime-${animeId}-episode-filter`,
        'all',
    );
    const [sort, setSort] = useLocalStorage<EpisodeSort>(`anime-${animeId}-episode-sort`, 'episodeAsc');
    const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
    const [selectionMenuAnchor, setSelectionMenuAnchor] = useState<null | HTMLElement>(null);
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [downloadTargets, setDownloadTargets] = useState<EpisodeResponse[] | null>(null);
    const [subtitleDownloadTargets, setSubtitleDownloadTargets] = useState<EpisodeResponse[] | null>(null);
    const { triggerSync } = useManatanSyncOnEpisodeRead();
    const downloadStatusSnapshot = useDownloadStatusSnapshot();
    useResizeObserver(
        listHeaderRef,
        useCallback(() => setListHeaderHeight(listHeaderRef?.offsetHeight ?? 0), [listHeaderRef]),
    );

    const scrollbarWidth = MediaQuery.useGetScrollbarSize('width');
    const getEpisodeOrder = useCallback((episode: EpisodeResponse) => getAnimeEpisodePlaybackOrder(episode), []);
    const isSelecting = selectedEpisodeIds.length > 0;
    let resolvedFilter: EpisodeFilter;
    if (filter === 'read') {
        resolvedFilter = 'watched';
    } else if (filter === 'unread') {
        resolvedFilter = 'unwatched';
    } else {
        resolvedFilter = filter;
    }

    const filteredEpisodes = useMemo(() => {
        switch (resolvedFilter) {
            case 'watched':
                return episodes.filter((episode) => episode.isRead);
            case 'unwatched':
                return episodes.filter((episode) => !episode.isRead);
            case 'downloaded':
                return episodes.filter((episode) => episode.isDownloaded);
            default:
                return episodes;
        }
    }, [episodes, resolvedFilter]);
    const visibleEpisodes = useMemo(() => {
        const sorted = [...filteredEpisodes];
        sorted.sort((a, b) => {
            const episodeNumberA = a.episodeNumber || getEpisodeOrder(a);
            const episodeNumberB = b.episodeNumber || getEpisodeOrder(b);
            switch (sort) {
                case 'episodeAsc':
                    return episodeNumberA - episodeNumberB;
                case 'episodeDesc':
                    return episodeNumberB - episodeNumberA;
                case 'dateAsc':
                    return a.uploadDate - b.uploadDate;
                case 'dateDesc':
                    return b.uploadDate - a.uploadDate;
                default:
                    return episodeNumberB - episodeNumberA;
            }
        });
        return sorted;
    }, [filteredEpisodes, getEpisodeOrder, sort]);

    const resumeEpisode = useMemo(() => {
        const unreadEpisodes = episodes.filter((episode) => !episode.isRead);
        if (!unreadEpisodes.length) {
            return null;
        }
        return unreadEpisodes.reduce((current, episode) =>
            getEpisodeOrder(episode) < getEpisodeOrder(current) ? episode : current,
        );
    }, [episodes, getEpisodeOrder]);

    const firstEpisodeOrder = useMemo(() => {
        if (!episodes.length) {
            return null;
        }
        return episodes.reduce(
            (minOrder, episode) => Math.min(minOrder, getEpisodeOrder(episode)),
            Number.POSITIVE_INFINITY,
        );
    }, [episodes, getEpisodeOrder]);

    const shouldShowStartResumeFab = !isSelecting && !!resumeEpisode;
    const isStartAction =
        resumeEpisode !== null && firstEpisodeOrder !== null && getEpisodeOrder(resumeEpisode) === firstEpisodeOrder;
    const episodeCount = visibleEpisodes.length;
    const totalCount = episodes.length;
    const episodeIds = useMemo(() => visibleEpisodes.map((episode) => episode.id), [visibleEpisodes]);
    const playbackByEpisodeId = useMemo(() => {
        const progressMap = new Map<number, { position: number | null; duration: number | null }>();
        for (const episode of episodes) {
            const playbackIndex = getEpisodeOrder(episode);
            progressMap.set(episode.id, readStoredAnimePlaybackProgress(animeId, playbackIndex));
        }
        return progressMap;
    }, [animeId, episodes, getEpisodeOrder]);
    const resumePlayback = resumeEpisode ? playbackByEpisodeId.get(resumeEpisode.id) : null;
    const areAllSelected = episodeIds.length > 0 && episodeIds.every((id) => selectedEpisodeIds.includes(id));
    const areSomeSelected = selectedEpisodeIds.length > 0 && !areAllSelected;
    const selectionTargetIds = selectedEpisodeIds.length ? selectedEpisodeIds : episodeIds;
    const selectedEpisodes = useMemo(
        () =>
            selectedEpisodeIds
                .map((id) => episodes.find((episode) => episode.id === id))
                .filter((episode): episode is EpisodeResponse => Boolean(episode)),
        [episodes, selectedEpisodeIds],
    );
    const selectedUnreadEpisodes = useMemo(
        () => selectedEpisodes.filter((episode) => !episode.isRead),
        [selectedEpisodes],
    );
    const selectedReadEpisodes = useMemo(
        () => selectedEpisodes.filter((episode) => episode.isRead),
        [selectedEpisodes],
    );
    const selectedDownloadedEpisodes = useMemo(
        () => selectedEpisodes.filter((episode) => episode.isDownloaded),
        [selectedEpisodes],
    );
    const selectedUndownloadedEpisodes = useMemo(
        () => selectedEpisodes.filter((episode) => !episode.isDownloaded),
        [selectedEpisodes],
    );
    const selectedSubtitleDownloadEpisodes = useMemo(
        () => (isLocalAnimeSource ? selectedEpisodes : selectedDownloadedEpisodes),
        [isLocalAnimeSource, selectedDownloadedEpisodes, selectedEpisodes],
    );
    const previousUnwatchedEpisodes = useMemo(() => {
        if (!selectedEpisodes.length) {
            return [];
        }
        const firstSelectedOrder = Math.min(...selectedEpisodes.map(getEpisodeOrder));
        return episodes.filter((episode) => getEpisodeOrder(episode) < firstSelectedOrder && !episode.isRead);
    }, [episodes, getEpisodeOrder, selectedEpisodes]);

    useEffect(() => {
        const queue = downloadStatusSnapshot?.queue ?? [];
        if (!queue.length) {
            return;
        }
        const completedEpisodeIds = new Set<number>();
        queue.forEach((entry) => {
            const maybeType = (entry as any).type ?? (entry as any).kind;
            const episodeId = Number((entry as any).episode?.id);
            if (
                (maybeType === 'ANIME_EPISODE' || (entry as any).anime || Number.isFinite(episodeId)) &&
                entry.state === DownloadState.Finished &&
                Number.isFinite(episodeId)
            ) {
                completedEpisodeIds.add(episodeId);
            }
        });
        if (!completedEpisodeIds.size) {
            return;
        }
        onEpisodesUpdate((currentEpisodes) => {
            let changed = false;
            const updated = currentEpisodes.map((episode) => {
                if (!completedEpisodeIds.has(episode.id) || episode.isDownloaded) {
                    return episode;
                }
                changed = true;
                return { ...episode, isDownloaded: true };
            });
            return changed ? updated : currentEpisodes;
        });
    }, [downloadStatusSnapshot?.queue, onEpisodesUpdate]);

    useEffect(() => {
        if (!selectedEpisodes.length) {
            setSelectionMenuAnchor(null);
        }
    }, [selectedEpisodes.length]);

    const isEmpty = episodeCount === 0;
    const shouldShowLoading = (isLoading || isRefreshing) && isEmpty;

    if (shouldShowLoading) {
        return (
            <Stack sx={{ justifyContent: 'center', alignItems: 'center', position: 'relative', flexGrow: 1 }}>
                <LoadingPlaceholder />
            </Stack>
        );
    }

    const updateEpisodes = async (change: { isRead?: boolean; isDownloaded?: boolean }, ids?: number[]) => {
        const targetIds = ids ?? selectionTargetIds;
        if (!targetIds.length || isActionLoading) {
            return;
        }

        setIsActionLoading(true);
        try {
            await requestManager.getClient().fetcher('/api/v1/anime/episode/batch', {
                httpMethod: HttpMethod.POST,
                data: buildAnimeEpisodeBatchPayload(targetIds, change, Number(animeId)),
                checkResponseIsJson: false,
            });
            onEpisodesUpdate((currentEpisodes) =>
                currentEpisodes.map((episode) => {
                    if (!targetIds.includes(episode.id)) {
                        return episode;
                    }
                    return {
                        ...episode,
                        isRead: change.isRead ?? episode.isRead,
                        isDownloaded: change.isDownloaded ?? episode.isDownloaded,
                    };
                }),
            );
            if (!ids) {
                setSelectedEpisodeIds([]);
            }
            if (change.isRead !== undefined) {
                triggerSync();
            }
        } catch {
            // handled by global error boundary
        } finally {
            setIsActionLoading(false);
        }
    };

    const deleteEpisodeDownloads = async (episodeIndex: number, episodeId: number) => {
        if (isActionLoading) {
            return;
        }
        setIsActionLoading(true);
        try {
            await requestManager
                .getClient()
                .fetcher(
                    requestManager.getValidJobsUrlFor(`/api/v1/anime/${animeId}/episode/${episodeIndex}/download`),
                    {
                        httpMethod: HttpMethod.DELETE,
                        checkResponseIsJson: false,
                    },
                );
            onEpisodesUpdate((currentEpisodes) =>
                currentEpisodes.map((episode) =>
                    episode.id === episodeId ? { ...episode, isDownloaded: false } : episode,
                ),
            );
        } catch {
            // handled by global error boundary
        } finally {
            setIsActionLoading(false);
        }
    };

    const deleteSelectedDownloads = async () => {
        if (isActionLoading || !selectedDownloadedEpisodes.length) {
            return;
        }
        setIsActionLoading(true);
        try {
            await Promise.all(
                selectedDownloadedEpisodes.map((episode) =>
                    requestManager
                        .getClient()
                        .fetcher(
                            requestManager.getValidJobsUrlFor(
                                `/api/v1/anime/${animeId}/episode/${getEpisodeOrder(episode)}/download`,
                            ),
                            {
                                httpMethod: HttpMethod.DELETE,
                                checkResponseIsJson: false,
                            },
                        ),
                ),
            );
            const deletedIds = new Set(selectedDownloadedEpisodes.map((episode) => episode.id));
            onEpisodesUpdate((currentEpisodes) =>
                currentEpisodes.map((episode) =>
                    deletedIds.has(episode.id) ? { ...episode, isDownloaded: false } : episode,
                ),
            );
        } catch {
            // handled by global error boundary
        } finally {
            setIsActionLoading(false);
        }
    };

    const markPreviousWatched = (episode: EpisodeResponse) => {
        const sortedEpisodes = [...episodes].sort((a, b) => getEpisodeOrder(b) - getEpisodeOrder(a));
        const currentIndex = sortedEpisodes.findIndex((entry) => entry.id === episode.id);
        if (currentIndex < 0) {
            return;
        }
        const previousIds = sortedEpisodes
            .slice(currentIndex + 1)
            .filter((entry) => !entry.isRead)
            .map((entry) => entry.id);
        if (!previousIds.length) {
            return;
        }
        updateEpisodes({ isRead: true }, previousIds);
    };

    const markPreviousWatchedFromSelection = () => {
        if (!previousUnwatchedEpisodes.length) {
            return;
        }
        updateEpisodes(
            { isRead: true },
            previousUnwatchedEpisodes.map((episode) => episode.id),
        );
    };

    const handleSelect = (episodeId: number, selected: boolean) => {
        setSelectedEpisodeIds((current) => {
            if (selected) {
                return current.includes(episodeId) ? current : [...current, episodeId];
            }
            return current.filter((id) => id !== episodeId);
        });
    };

    const handleSelectAll = (checked: boolean) => {
        setSelectedEpisodeIds(checked ? episodeIds : []);
    };

    const openDownloadDialogForSelected = () => {
        if (isLocalAnimeSource || !selectedUndownloadedEpisodes.length) {
            return;
        }
        setDownloadTargets(selectedUndownloadedEpisodes);
    };

    const openSubtitleDownloadDialogForSelected = () => {
        if (!selectedSubtitleDownloadEpisodes.length) {
            return;
        }
        setSubtitleDownloadTargets(selectedSubtitleDownloadEpisodes);
    };

    return (
        <Stack direction="column" sx={{ position: 'relative', flexBasis: '60%' }}>
            <EpisodeListHeader
                ref={setListHeaderRef}
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                scrollbarWidth={scrollbarWidth}
            >
                <Stack>
                    <Typography variant="h5" component="h3">
                        Episodes ({episodeCount}
                        {totalCount !== episodeCount ? `/${totalCount}` : ''})
                    </Typography>
                </Stack>
                <Stack direction="row" alignItems="center">
                    <CustomTooltip title="Mark all watched">
                        <span>
                            <IconButton
                                onClick={() => updateEpisodes({ isRead: true })}
                                disabled={isActionLoading || !selectionTargetIds.length}
                                color="inherit"
                            >
                                <DoneAllIcon />
                            </IconButton>
                        </span>
                    </CustomTooltip>
                    <CustomTooltip title={t('chapter.action.filter_and_sort.label')}>
                        <span>
                            <IconButton onClick={(event) => setMenuAnchor(event.currentTarget)} color="inherit">
                                <FilterListIcon />
                            </IconButton>
                        </span>
                    </CustomTooltip>
                    <CustomTooltip title={t('global.button.select_all')}>
                        <span>
                            <Checkbox
                                sx={{
                                    padding: '8px',
                                    color: 'inherit',
                                    '&.Mui-checked, &.MuiCheckbox-indeterminate': {
                                        color: 'inherit',
                                    },
                                }}
                                checked={areAllSelected}
                                indeterminate={areSomeSelected}
                                onChange={(_, checked) => handleSelectAll(checked)}
                            />
                        </span>
                    </CustomTooltip>
                </Stack>
            </EpisodeListHeader>
            <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
                <MenuItem
                    selected={resolvedFilter === 'all'}
                    onClick={() => {
                        setFilter('all');
                        setMenuAnchor(null);
                    }}
                >
                    All episodes
                </MenuItem>
                <MenuItem
                    selected={resolvedFilter === 'unwatched'}
                    onClick={() => {
                        setFilter('unwatched');
                        setMenuAnchor(null);
                    }}
                >
                    Unwatched episodes
                </MenuItem>
                <MenuItem
                    selected={resolvedFilter === 'watched'}
                    onClick={() => {
                        setFilter('watched');
                        setMenuAnchor(null);
                    }}
                >
                    Watched episodes
                </MenuItem>
                <MenuItem
                    selected={resolvedFilter === 'downloaded'}
                    onClick={() => {
                        setFilter('downloaded');
                        setMenuAnchor(null);
                    }}
                >
                    Downloaded episodes
                </MenuItem>
                <Divider />
                <MenuItem
                    selected={sort === 'episodeDesc'}
                    onClick={() => {
                        setSort('episodeDesc');
                        setMenuAnchor(null);
                    }}
                >
                    Episode number (desc)
                </MenuItem>
                <MenuItem
                    selected={sort === 'episodeAsc'}
                    onClick={() => {
                        setSort('episodeAsc');
                        setMenuAnchor(null);
                    }}
                >
                    Episode number (asc)
                </MenuItem>
                <MenuItem
                    selected={sort === 'dateDesc'}
                    onClick={() => {
                        setSort('dateDesc');
                        setMenuAnchor(null);
                    }}
                >
                    Upload date (desc)
                </MenuItem>
                <MenuItem
                    selected={sort === 'dateAsc'}
                    onClick={() => {
                        setSort('dateAsc');
                        setMenuAnchor(null);
                    }}
                >
                    Upload date (asc)
                </MenuItem>
            </Menu>
            {isEmpty ? (
                <Stack sx={{ justifyContent: 'center', position: 'relative', flexGrow: 1 }}>
                    <EmptyViewAbsoluteCentered message="No episodes found." />
                </Stack>
            ) : (
                <StyledVirtuoso
                    persistKey={`anime-${animeId}-episode-list`}
                    topOffset={appBarHeight + listHeaderHeight}
                    style={{ height: 'undefined' }}
                    components={{ Footer: () => <Box sx={{ paddingBottom: DEFAULT_FULL_FAB_HEIGHT }} /> }}
                    totalCount={episodeCount}
                    computeItemKey={(index) => visibleEpisodes[index].id}
                    itemContent={(index: number) => {
                        const episode = visibleEpisodes[index];
                        const playback = playbackByEpisodeId.get(episode.id);
                        return (
                            <EpisodeCard
                                episode={episode}
                                animeId={animeId}
                                canDownloadVideo={!isLocalAnimeSource}
                                canDownloadSubtitles={isLocalAnimeSource || episode.isDownloaded}
                                selected={isSelecting ? selectedEpisodeIds.includes(episode.id) : null}
                                onSelect={handleSelect}
                                onDownload={() => setDownloadTargets([episode])}
                                onDownloadSubtitles={() => setSubtitleDownloadTargets([episode])}
                                onDeleteDownload={() => deleteEpisodeDownloads(getEpisodeOrder(episode), episode.id)}
                                onMarkWatched={() => updateEpisodes({ isRead: true }, [episode.id])}
                                onMarkUnwatched={() => updateEpisodes({ isRead: false }, [episode.id])}
                                onMarkPreviousWatched={() => markPreviousWatched(episode)}
                                playbackPositionSeconds={playback?.position ?? null}
                                playbackDurationSeconds={playback?.duration ?? null}
                            />
                        );
                    }}
                    useWindowScroll={isMobileWidth}
                    overscan={window.innerHeight * 0.5}
                />
            )}
            {downloadTargets && (
                <EpisodeDownloadDialog
                    open={!!downloadTargets}
                    animeId={Number(animeId)}
                    episodes={downloadTargets.map((episode) => ({
                        id: episode.id,
                        index: getEpisodeOrder(episode),
                        episodeNumber: episode.episodeNumber,
                        name: episode.name,
                    }))}
                    onClose={() => setDownloadTargets(null)}
                    onQueued={() => {
                        setDownloadTargets(null);
                        setSelectedEpisodeIds([]);
                    }}
                />
            )}
            {subtitleDownloadTargets && (
                <EpisodeDownloadDialog
                    open={!!subtitleDownloadTargets}
                    animeId={Number(animeId)}
                    mode="subtitle"
                    episodes={subtitleDownloadTargets.map((episode) => ({
                        id: episode.id,
                        index: getEpisodeOrder(episode),
                        episodeNumber: episode.episodeNumber,
                        name: episode.name,
                    }))}
                    onClose={() => setSubtitleDownloadTargets(null)}
                    onQueued={() => {
                        setSubtitleDownloadTargets(null);
                        setSelectedEpisodeIds([]);
                    }}
                />
            )}
            {!!selectedEpisodes.length && (
                <>
                    <StyledFab
                        variant="extended"
                        color="primary"
                        onClick={(event) => setSelectionMenuAnchor(event.currentTarget)}
                        disabled={isActionLoading}
                    >
                        {`${selectedEpisodes.length} ${selectedEpisodes.length === 1 ? 'EPISODE' : 'EPISODES'}`}
                        <MoreHorizIcon sx={{ ml: 1 }} />
                    </StyledFab>
                    <Menu
                        anchorEl={selectionMenuAnchor}
                        open={Boolean(selectionMenuAnchor)}
                        onClose={() => setSelectionMenuAnchor(null)}
                    >
                        <ActionMenuItem
                            Icon={DoneIcon}
                            title={`Mark watched (${selectedUnreadEpisodes.length})`}
                            disabled={isActionLoading || !selectedUnreadEpisodes.length}
                            onClick={() => {
                                setSelectionMenuAnchor(null);
                                updateEpisodes(
                                    { isRead: true },
                                    selectedUnreadEpisodes.map((episode) => episode.id),
                                );
                            }}
                        />
                        <ActionMenuItem
                            Icon={RemoveDoneIcon}
                            title={`Mark unwatched (${selectedReadEpisodes.length})`}
                            disabled={isActionLoading || !selectedReadEpisodes.length}
                            onClick={() => {
                                setSelectionMenuAnchor(null);
                                updateEpisodes(
                                    { isRead: false },
                                    selectedReadEpisodes.map((episode) => episode.id),
                                );
                            }}
                        />
                        <ActionMenuItem
                            Icon={DoneAllIcon}
                            title={`Mark previous watched (${previousUnwatchedEpisodes.length})`}
                            disabled={isActionLoading || !previousUnwatchedEpisodes.length}
                            onClick={() => {
                                setSelectionMenuAnchor(null);
                                markPreviousWatchedFromSelection();
                            }}
                        />
                        {!isLocalAnimeSource && (
                            <ActionMenuItem
                                Icon={DownloadIcon}
                                title={`${
                                    selectedDownloadedEpisodes.length ? 'Download not downloaded' : 'Download selected'
                                } (${selectedUndownloadedEpisodes.length})`}
                                disabled={isActionLoading || !selectedUndownloadedEpisodes.length}
                                onClick={() => {
                                    setSelectionMenuAnchor(null);
                                    openDownloadDialogForSelected();
                                }}
                            />
                        )}
                        <ActionMenuItem
                            Icon={SubtitlesIcon}
                            title={`Download subtitles (${selectedSubtitleDownloadEpisodes.length})`}
                            disabled={isActionLoading || !selectedSubtitleDownloadEpisodes.length}
                            onClick={() => {
                                setSelectionMenuAnchor(null);
                                openSubtitleDownloadDialogForSelected();
                            }}
                        />
                        {!isLocalAnimeSource && (
                            <ActionMenuItem
                                Icon={DeleteIcon}
                                title={`Delete downloaded (${selectedDownloadedEpisodes.length})`}
                                disabled={isActionLoading || !selectedDownloadedEpisodes.length}
                                onClick={() => {
                                    setSelectionMenuAnchor(null);
                                    deleteSelectedDownloads();
                                }}
                            />
                        )}
                    </Menu>
                </>
            )}
            {shouldShowStartResumeFab && resumeEpisode && (
                <StyledFab
                    component={Link}
                    variant="extended"
                    color="primary"
                    to={AppRoutes.anime.childRoutes.episode.path(
                        animeId,
                        resumeEpisode.sourceOrder ?? resumeEpisode.index,
                    )}
                    state={buildAnimePlaybackRouteState(resumePlayback)}
                >
                    <PlayArrowIcon />
                    {isStartAction ? t('global.button.start') : t('global.button.resume')}
                </StyledFab>
            )}
        </Stack>
    );
};
