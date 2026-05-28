/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import BuildIcon from '@mui/icons-material/Build';
import DragHandle from '@mui/icons-material/DragHandle';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { memo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';
import { DownloadStateIndicator } from '@/base/components/downloads/DownloadStateIndicator.tsx';
import { ChapterCardMetadata } from '@/features/chapter/components/cards/ChapterCardMetadata.tsx';
import { MUIUtil } from '@/lib/mui/MUI.util.ts';
import { ListCardContent } from '@/base/components/lists/cards/ListCardContent.tsx';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { makeToast } from '@/base/utils/Toast.ts';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { DownloadState } from '@/lib/requests/types.ts';
import { MediaQuery } from '@/base/utils/MediaQuery.tsx';
import { HttpMethod } from '@/lib/requests/client/RestClient.ts';

export type AnimeQueueItem = {
    chapter: {
        id: number;
    };
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
    manga?: {
        id: number;
        title: string;
    };
    state?: string;
    error?: string | null;
};

type Props = {
    item: AnimeQueueItem;
    onRepair?: (item: AnimeQueueItem) => void;
};

const episodeRouteIndex = (item: AnimeQueueItem): number => {
    const raw = item.episode?.episodeIndex ?? item.episode?.sourceOrder;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 1;
};

export const DownloadQueueAnimeCard = memo(({ item, onRepair }: Props) => {
    const { t } = useTranslation();
    const preventMobileContextMenu = MediaQuery.usePreventMobileContextMenu();
    const animeId = item.anime?.id ?? item.manga?.id ?? 0;
    const animeTitle = item.anime?.title || item.manga?.title || 'Anime';
    const episodeTitle = item.episode?.name || 'Episode';
    const ternaryText = [item.episode?.videoLabel, item.episode?.subtitleLabel]
        .filter((value) => value && value.trim().length)
        .join(' • ');
    const errorMessage = typeof item.error === 'string' ? item.error.trim() : '';
    const isFailed = String(item.state ?? '').toUpperCase() === DownloadState.Error;
    const isFinished = String(item.state ?? '').toUpperCase() === DownloadState.Finished;
    const actionTooltip = isFinished ? 'Dismiss' : t('chapter.action.download.delete.label.action');

    const handleDelete = useCallback(async () => {
        try {
            const episodeIndex = episodeRouteIndex(item);
            if (animeId > 0 && episodeIndex > 0) {
                await requestManager
                    .getClient()
                    .fetcher(
                        requestManager.getValidJobsUrlFor(`/api/v1/anime/${animeId}/episode/${episodeIndex}/download`),
                        {
                            httpMethod: HttpMethod.DELETE,
                            checkResponseIsJson: false,
                        },
                    );
                await requestManager.getDownloadStatus().response.catch(() => undefined);
            }
        } catch (e) {
            makeToast(t('download.queue.error.label.failed_to_remove'), 'error', getErrorMessage(e));
        }
    }, [animeId, item]);

    return (
        <Box sx={{ p: 1, pb: 0 }}>
            <Card>
                <CardActionArea
                    component={Link}
                    to={
                        animeId > 0
                            ? AppRoutes.anime.childRoutes.episode.path(animeId, episodeRouteIndex(item))
                            : AppRoutes.downloads.path
                    }
                    onContextMenu={preventMobileContextMenu}
                    sx={MediaQuery.preventMobileContextMenuSx()}
                >
                    <ListCardContent>
                        <IconButton {...MUIUtil.preventRippleProp()} sx={{ pointerEvents: 'none' }}>
                            <DragHandle />
                        </IconButton>
                        <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: 0 }}>
                            <ChapterCardMetadata
                                title={animeTitle}
                                secondaryText={episodeTitle}
                                ternaryText={ternaryText || null}
                            />
                            {errorMessage && (
                                <Typography
                                    variant="caption"
                                    color="error"
                                    sx={{
                                        mt: 0.25,
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                    }}
                                >
                                    {errorMessage}
                                </Typography>
                            )}
                        </Box>
                        <DownloadStateIndicator chapterId={item.chapter.id} />
                        {isFailed && animeId > 0 && episodeRouteIndex(item) > 0 && (
                            <CustomTooltip title="Fix source and resume">
                                <IconButton
                                    {...MUIUtil.preventRippleProp()}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onRepair?.(item);
                                    }}
                                >
                                    <BuildIcon />
                                </IconButton>
                            </CustomTooltip>
                        )}
                        <CustomTooltip title={actionTooltip}>
                            <IconButton
                                {...MUIUtil.preventRippleProp()}
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleDelete();
                                }}
                            >
                                {isFinished ? <CloseIcon /> : <DeleteIcon />}
                            </IconButton>
                        </CustomTooltip>
                    </ListCardContent>
                </CardActionArea>
            </Card>
        </Box>
    );
});
