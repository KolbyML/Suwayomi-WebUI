/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import BuildIcon from '@mui/icons-material/Build';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import { closestCenter, DndContext, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useWindowEvent } from '@mantine/hooks';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { makeToast } from '@/base/utils/Toast.ts';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { DownloadState, DownloaderState, GetDownloadStatusQuery } from '@/lib/requests/types.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { DndSortableItem } from '@/lib/dnd-kit/DndSortableItem.tsx';
import { DndKitUtil } from '@/lib/dnd-kit/DndKitUtil.ts';
import { DndOverlayItem } from '@/lib/dnd-kit/DndOverlayItem.tsx';
import { DownloadQueueChapterCard } from '@/features/downloads/components/DownloadQueueChapterCard.tsx';
import {
    DownloadQueueAnimeCard,
    type AnimeQueueItem,
} from '@/features/downloads/components/DownloadQueueAnimeCard.tsx';
import { EpisodeDownloadDialog } from '@/features/anime/components/actions/EpisodeDownloadDialog.tsx';
import { useAppTitle } from '@/features/navigation-bar/hooks/useAppTitle.ts';
import { useAppAction } from '@/features/navigation-bar/hooks/useAppAction.ts';
import { VirtuosoPersisted } from '@/lib/virtuoso/Component/VirtuosoPersisted.tsx';
import { useDownloadStatusSnapshot } from '@/features/downloads/services/DownloadStatusStore.ts';

type DownloadQueueItem = GetDownloadStatusQuery['downloadStatus']['queue'][number] & {
    position: number;
    id?: number;
    type?: string;
    kind?: string;
    anime?: {
        id: number;
        title: string;
    } | null;
    episode?: {
        id: number;
        name: string;
        episodeIndex?: number;
        sourceOrder?: number;
        videoLabel?: string | null;
        subtitleLabel?: string | null;
    } | null;
};

type EpisodeRepairTarget = {
    animeId: number;
    episodes: Array<{
        id: number;
        index: number;
        episodeNumber: number;
        name: string;
    }>;
};

const queueItemId = (item: DownloadQueueItem): number => {
    const explicit = Number((item as any).id);
    if (Number.isFinite(explicit)) {
        return explicit;
    }
    return item.chapter.id;
};

const isAnimeQueueItem = (item: DownloadQueueItem): boolean => {
    const maybeType = (item as any).type ?? (item as any).kind;
    return maybeType === 'ANIME_EPISODE' || Boolean((item as any).anime);
};

const isFailedAssumedAnimeItem = (item: DownloadQueueItem): boolean => {
    if (!isAnimeQueueItem(item)) {
        return false;
    }
    const state = String((item as any).state ?? '').toUpperCase();
    if (state !== DownloadState.Error) {
        return false;
    }
    const videoLabel = (item as any).episode?.videoLabel;
    return typeof videoLabel === 'string' && videoLabel.includes('[assumed]');
};

const getAnimeId = (item: AnimeQueueItem): number => Number(item.anime?.id ?? item.manga?.id ?? 0);

const getEpisodeIndex = (item: AnimeQueueItem): number =>
    Number(item.episode?.episodeIndex ?? item.episode?.sourceOrder ?? 0);

export const DownloadQueue: React.FC = () => {
    const { t } = useTranslation();

    useAppTitle(t('download.title.queue'));

    const [reorderDownload, { reset: revertReorder }] = requestManager.useReorderChapterInDownloadQueue();

    const {
        data: downloadStatusData,
        loading: isLoading,
        error,
        refetch,
    } = requestManager.useGetDownloadStatus({ notifyOnNetworkStatusChange: true });
    const downloadStatusSnapshot = useDownloadStatusSnapshot();
    const fallbackQueue = (downloadStatusData?.downloadStatus.queue ?? []).map((entry, index) => ({
        ...entry,
        position: index,
    }));
    const downloaderData =
        downloadStatusSnapshot ??
        (downloadStatusData?.downloadStatus
            ? { ...downloadStatusData.downloadStatus, queue: fallbackQueue }
            : undefined);

    const queue = downloaderData?.queue ?? [];
    const downloaderState = downloaderData?.state ?? DownloaderState.Started;
    const isQueueEmpty = !queue.length;

    const dndItems = useMemo(() => queue.map((download) => queueItemId(download as DownloadQueueItem)), [queue]);
    const dndSensors = DndKitUtil.useSensorsForDevice();
    const [dndActiveDownload, setDndActiveDownload] = useState<DownloadQueueItem | null>(null);
    const [episodeRepairTarget, setEpisodeRepairTarget] = useState<EpisodeRepairTarget | null>(null);

    const failedAssumedAnimeQueueItems = useMemo(
        () => (queue as DownloadQueueItem[]).filter(isFailedAssumedAnimeItem),
        [queue],
    );

    const clearQueue = async () => {
        try {
            await requestManager.clearDownloads().response;
        } catch (e) {
            makeToast(t('download.queue.error.label.failed_delete_all'), 'error', getErrorMessage(e));
        }
    };

    const toggleQueueStatus = () => {
        if (downloaderState === DownloaderState.Stopped) {
            requestManager.startDownloads();
        } else {
            requestManager.stopDownloads();
        }
    };

    const promptRepairForItem = (item: AnimeQueueItem) => {
        const animeId = getAnimeId(item);
        const episodeIndex = getEpisodeIndex(item);
        if (!Number.isFinite(animeId) || animeId <= 0 || !Number.isFinite(episodeIndex) || episodeIndex <= 0) {
            makeToast('Unable to open fix dialog for this download item.', 'warning');
            return;
        }

        const candidateItems = isFailedAssumedAnimeItem(item as DownloadQueueItem)
            ? (queue as DownloadQueueItem[])
                  .filter(isFailedAssumedAnimeItem)
                  .map((queueItem) => queueItem as AnimeQueueItem)
                  .filter((queueItem) => getAnimeId(queueItem) === animeId)
            : [item];

        const repairSourceItems = candidateItems.length ? candidateItems : [item];
        const episodeMap = new Map<number, EpisodeRepairTarget['episodes'][number]>();
        repairSourceItems.forEach((sourceItem) => {
            const sourceIndex = getEpisodeIndex(sourceItem);
            if (!Number.isFinite(sourceIndex) || sourceIndex <= 0 || episodeMap.has(sourceIndex)) {
                return;
            }

            const sourceEpisodeId = Number(sourceItem.episode?.id ?? sourceIndex);
            const sourceEpisodeNumber = Number(sourceItem.episode?.sourceOrder ?? sourceIndex);
            episodeMap.set(sourceIndex, {
                id: Number.isFinite(sourceEpisodeId) && sourceEpisodeId > 0 ? sourceEpisodeId : sourceIndex,
                index: sourceIndex,
                episodeNumber: Number.isFinite(sourceEpisodeNumber) ? sourceEpisodeNumber : sourceIndex,
                name: sourceItem.episode?.name ?? 'Episode',
            });
        });

        const episodes = Array.from(episodeMap.values()).sort((a, b) => a.index - b.index);
        if (!episodes.length) {
            makeToast('Unable to prepare fix targets for this anime queue.', 'warning');
            return;
        }

        if (episodes.length > 1) {
            makeToast(`Applying this fix to ${episodes.length} queued episode(s).`, 'info');
        }

        setEpisodeRepairTarget({
            animeId,
            episodes,
        });
    };

    const categoryReorder = (list: DownloadQueueItem[], from: number, to: number) => {
        if (from === to) {
            return;
        }

        reorderDownload({ variables: { input: { chapterId: queueItemId(list[from]), to } } }).catch(() => {
            revertReorder?.();
        });
    };

    const onDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        setDndActiveDownload(null);

        if (!over || active.id === over.id) {
            return;
        }

        const oldIndex = queue.findIndex((download) => queueItemId(download as DownloadQueueItem) === active.id);
        const newIndex = queue.findIndex((download) => queueItemId(download as DownloadQueueItem) === over.id);

        categoryReorder(queue as DownloadQueueItem[], oldIndex, newIndex);
    };

    useAppAction(
        <>
            <CustomTooltip title={t('download.queue.label.delete_all')}>
                <IconButton onClick={clearQueue} color="inherit">
                    <DeleteSweepIcon />
                </IconButton>
            </CustomTooltip>

            <CustomTooltip
                title={t(downloaderState === DownloaderState.Started ? 'global.button.stop' : 'global.button.start')}
                disabled={isQueueEmpty}
            >
                <IconButton onClick={toggleQueueStatus} disabled={isQueueEmpty} color="inherit">
                    {downloaderState === DownloaderState.Stopped ? <PlayArrowIcon /> : <PauseIcon />}
                </IconButton>
            </CustomTooltip>
        </>,
        [downloaderState, isQueueEmpty],
    );

    // Virtuoso's resize observer can throw this error,
    // which is caught by DnD and aborts dragging.
    useWindowEvent('error', (e) => {
        if (
            e.message === 'ResizeObserver loop completed with undelivered notifications.' ||
            e.message === 'ResizeObserver loop limit exceeded'
        ) {
            e.stopImmediatePropagation();
        }
    });

    if (isLoading) {
        return <LoadingPlaceholder />;
    }

    if (error) {
        return (
            <EmptyViewAbsoluteCentered
                message={t('global.error.label.failed_to_load_data')}
                messageExtra={getErrorMessage(error)}
                retry={() => refetch().catch(defaultPromiseErrorHandler('DownloadQueue::refetch'))}
            />
        );
    }

    if (isQueueEmpty) {
        return <EmptyViewAbsoluteCentered message={t('download.queue.label.no_downloads')} />;
    }

    let overlayCard: React.ReactNode = null;
    if (dndActiveDownload) {
        overlayCard = isAnimeQueueItem(dndActiveDownload) ? (
            <DownloadQueueAnimeCard item={dndActiveDownload} />
        ) : (
            <DownloadQueueChapterCard item={dndActiveDownload as any} />
        );
    }

    return (
        <Box sx={{ pb: 1 }}>
            {!!failedAssumedAnimeQueueItems.length && (
                <Box sx={{ px: 1, pt: 1 }}>
                    <Alert
                        severity="warning"
                        icon={<BuildIcon fontSize="inherit" />}
                        action={
                            <Button
                                color="inherit"
                                size="small"
                                onClick={() => promptRepairForItem(failedAssumedAnimeQueueItems[0] as AnimeQueueItem)}
                            >
                                Fix Assumptions
                            </Button>
                        }
                    >
                        {failedAssumedAnimeQueueItems.length} anime download(s) failed after assumed source matching.
                        Choose a source to fix and resume.
                    </Alert>
                </Box>
            )}
            <DndContext
                sensors={dndSensors}
                collisionDetection={closestCenter}
                onDragStart={(event) =>
                    setDndActiveDownload(
                        (queue.find((download) => queueItemId(download as DownloadQueueItem) === event.active.id) as
                            | DownloadQueueItem
                            | undefined) ?? null,
                    )
                }
                onDragEnd={onDragEnd}
                onDragCancel={() => setDndActiveDownload(null)}
                onDragAbort={() => setDndActiveDownload(null)}
            >
                <SortableContext items={dndItems} strategy={verticalListSortingStrategy}>
                    <VirtuosoPersisted
                        persistKey="download-queue"
                        useWindowScroll
                        overscan={window.innerHeight * 0.5}
                        totalCount={queue.length}
                        computeItemKey={(index) => queueItemId(queue[index] as DownloadQueueItem)}
                        itemContent={(index) => {
                            const item = queue[index] as DownloadQueueItem;
                            const id = queueItemId(item);
                            const card = isAnimeQueueItem(item) ? (
                                <DownloadQueueAnimeCard item={item as AnimeQueueItem} onRepair={promptRepairForItem} />
                            ) : (
                                <DownloadQueueChapterCard item={item as any} />
                            );
                            return (
                                <DndSortableItem
                                    id={id}
                                    isDragging={id === (dndActiveDownload ? queueItemId(dndActiveDownload) : null)}
                                >
                                    {card}
                                </DndSortableItem>
                            );
                        }}
                    />
                </SortableContext>
                <DndOverlayItem isActive={!!dndActiveDownload}>{overlayCard}</DndOverlayItem>
            </DndContext>
            {episodeRepairTarget && (
                <EpisodeDownloadDialog
                    open={!!episodeRepairTarget}
                    animeId={episodeRepairTarget.animeId}
                    episodes={episodeRepairTarget.episodes}
                    onClose={() => setEpisodeRepairTarget(null)}
                    onQueued={() => {
                        setEpisodeRepairTarget(null);
                        if (downloaderState === DownloaderState.Stopped) {
                            requestManager.startDownloads();
                        }
                    }}
                />
            )}
        </Box>
    );
};
