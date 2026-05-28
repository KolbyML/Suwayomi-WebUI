/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import MoreVertIcon from '@mui/icons-material/MoreVert';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import CardActionArea from '@mui/material/CardActionArea';
import Checkbox from '@mui/material/Checkbox';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import IconButton from '@mui/material/IconButton';
import { alpha, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { MouseEvent, TouchEvent, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import PopupState, { bindMenu, bindTrigger } from 'material-ui-popup-state';
import { useLongPress } from 'use-long-press';
import { useTranslation } from 'react-i18next';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';
import { EpisodeActionMenuItems } from '@/features/anime/components/actions/EpisodeActionMenuItems.tsx';
import { Menu } from '@/base/components/menu/Menu.tsx';
import { ChapterCardMetadata } from '@/features/chapter/components/cards/ChapterCardMetadata.tsx';
import { ListCardContent } from '@/base/components/lists/cards/ListCardContent.tsx';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { MediaQuery } from '@/base/utils/MediaQuery.tsx';
import { MUIUtil } from '@/lib/mui/MUI.util.ts';
import { useDownloadStatusSnapshot } from '@/features/downloads/services/DownloadStatusStore.ts';
import { DownloadState } from '@/lib/requests/types.ts';
import { formatEpisodeCardMetadata, isEpisodeFiller } from '@/features/anime/components/cards/EpisodeCard.utils.ts';

type Episode = {
    id: number;
    name: string;
    episodeNumber: number;
    uploadDate: number;
    index: number;
    sourceOrder?: number | null;
    fillermark?: boolean | null;
    scanlator?: string | null;
    summary?: string | null;
    isRead: boolean;
    isDownloaded: boolean;
    realUrl?: string | null;
};

type Props = {
    animeId: string;
    episode: Episode;
    canDownloadVideo?: boolean;
    canDownloadSubtitles?: boolean;
    selected: boolean | null;
    onSelect: (episodeId: number, selected: boolean, isShiftKey?: boolean) => void;
    onDownload: () => void;
    onDownloadSubtitles: () => void;
    onDeleteDownload: () => void;
    onMarkWatched: () => void;
    onMarkUnwatched: () => void;
    onMarkPreviousWatched: () => void;
    playbackPositionSeconds?: number | null;
    playbackDurationSeconds?: number | null;
};

const formatClock = (seconds: number): string => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const secs = safeSeconds % 60;
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
};

const DOWNLOAD_STATE_TO_LABEL = {
    [DownloadState.Downloading]: 'download.state.label.downloading',
    [DownloadState.Error]: 'download.state.label.error',
    [DownloadState.Finished]: 'download.state.label.finished',
    [DownloadState.Queued]: 'download.state.label.queued',
} as const;

export const EpisodeCard = ({
    animeId,
    episode,
    canDownloadVideo = true,
    canDownloadSubtitles = episode.isDownloaded,
    selected,
    onSelect,
    onDownload,
    onDownloadSubtitles,
    onDeleteDownload,
    onMarkWatched,
    onMarkUnwatched,
    onMarkPreviousWatched,
    playbackPositionSeconds = null,
    playbackDurationSeconds = null,
}: Props) => {
    const { t } = useTranslation();
    const theme = useTheme();
    const preventMobileContextMenu = MediaQuery.usePreventMobileContextMenu();
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const isSelecting = selected !== null;
    const downloadStatusSnapshot = useDownloadStatusSnapshot();

    const episodeNumber = episode.episodeNumber || episode.index;
    const title = episode.name || `Episode ${episodeNumber}`;
    const secondaryText = episode.name ? `Episode ${episodeNumber}` : null;
    const playbackText =
        Number.isFinite(playbackPositionSeconds) &&
        Number.isFinite(playbackDurationSeconds) &&
        (playbackPositionSeconds ?? 0) > 0 &&
        (playbackDurationSeconds ?? 0) > 0
            ? `${formatClock(playbackPositionSeconds ?? 0)} / ${formatClock(playbackDurationSeconds ?? 0)}`
            : null;
    const ternaryText = formatEpisodeCardMetadata({
        fillermark: episode.fillermark,
        isDownloaded: episode.isDownloaded,
        name: episode.name,
        playbackText,
        scanlator: episode.scanlator,
        summary: episode.summary,
        uploadDate: episode.uploadDate,
    });
    const isFiller = isEpisodeFiller({
        fillermark: episode.fillermark,
        name: episode.name,
        scanlator: episode.scanlator,
        summary: episode.summary,
    });

    const animeDownload = useMemo(() => {
        const queue = downloadStatusSnapshot?.queue ?? [];
        if (!queue.length) {
            return null;
        }

        const animeIdKey = String(animeId);
        const episodeKeyCandidates = new Set<string>([
            String(episode.sourceOrder ?? episode.index),
            String(episode.index),
            String(episode.id),
        ]);

        return (
            queue.find((entry) => {
                const anyEntry = entry as any;
                const type = String(anyEntry.kind ?? anyEntry.type ?? '').toUpperCase();
                if (type !== 'ANIME_EPISODE' && !anyEntry.anime && !anyEntry.episode) {
                    return false;
                }

                const entryAnimeId = String(anyEntry.anime?.id ?? anyEntry.manga?.id ?? '');
                if (entryAnimeId !== animeIdKey) {
                    return false;
                }

                const entryEpisode = anyEntry.episode ?? {};
                const entryChapter = anyEntry.chapter ?? {};
                const entryEpisodeKeys = [
                    entryEpisode.sourceOrder,
                    entryEpisode.episodeIndex,
                    entryEpisode.id,
                    entryChapter.sourceOrder,
                    entryChapter.id,
                ]
                    .filter((value) => value !== undefined && value !== null)
                    .map((value) => String(value));

                return entryEpisodeKeys.some((value) => episodeKeyCandidates.has(value));
            }) ?? null
        );
    }, [animeId, downloadStatusSnapshot?.queue, episode.id, episode.index, episode.sourceOrder]);

    const animeDownloadState = useMemo(() => {
        if (!animeDownload) {
            return null;
        }
        const state = String((animeDownload as any).state ?? DownloadState.Queued).toUpperCase();
        if (state === DownloadState.Downloading) {
            return DownloadState.Downloading;
        }
        if (state === DownloadState.Error) {
            return DownloadState.Error;
        }
        if (state === DownloadState.Finished) {
            return DownloadState.Finished;
        }
        return DownloadState.Queued;
    }, [animeDownload]);

    const animeDownloadProgress =
        animeDownloadState === DownloadState.Downloading
            ? Math.max(0, Math.min(1, Number((animeDownload as any)?.progress ?? 0)))
            : 0;

    const handleClick = (event: MouseEvent | TouchEvent) => {
        if (!isSelecting) return;
        event.preventDefault();
        event.stopPropagation();
        onSelect(episode.id, !selected, event.shiftKey);
    };

    const handleClickOpenMenu = (event: MouseEvent | TouchEvent, openMenu?: (e: React.SyntheticEvent) => void) => {
        event.stopPropagation();
        event.preventDefault();
        openMenu?.(event);
    };

    const longPressBind = useLongPress((event, { context: openMenu }) => {
        if (!isSelecting && !!menuButtonRef.current) {
            handleClickOpenMenu(event, () => (openMenu as (event: Element) => void)?.(menuButtonRef.current!));
            return;
        }
        // eslint-disable-next-line no-param-reassign
        event.shiftKey = true;
        handleClick(event);
    });

    return (
        <PopupState variant="popover" popupId="episode-card-action-menu">
            {(popupState) => (
                <Stack sx={{ pt: 1, px: 1 }}>
                    <Card
                        sx={
                            isFiller
                                ? {
                                      bgcolor: alpha(
                                          theme.palette.warning.main,
                                          theme.palette.mode === 'dark' ? 0.18 : 0.12,
                                      ),
                                      border: `1px solid ${alpha(
                                          theme.palette.warning.main,
                                          theme.palette.mode === 'dark' ? 0.38 : 0.3,
                                      )}`,
                                  }
                                : undefined
                        }
                    >
                        <CardActionArea
                            component={Link}
                            to={AppRoutes.anime.childRoutes.episode.path(animeId, episode.sourceOrder ?? episode.index)}
                            onContextMenu={preventMobileContextMenu}
                            sx={MediaQuery.preventMobileContextMenuSx()}
                            style={{
                                color: theme.palette.text[episode.isRead ? 'disabled' : 'primary'],
                            }}
                            onClick={(e) => handleClick(e)}
                            {...longPressBind(popupState.open)}
                        >
                            <ListCardContent>
                                <ChapterCardMetadata
                                    title={title}
                                    secondaryText={secondaryText}
                                    ternaryText={ternaryText}
                                    slotProps={{
                                        title: {
                                            variant: 'h6',
                                            component: 'h3',
                                        },
                                    }}
                                />

                                {animeDownloadState && (
                                    <Box
                                        sx={{
                                            position: 'relative',
                                            display: 'inline-flex',
                                            width: '50px',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        {animeDownloadState === DownloadState.Downloading && (
                                            <CircularProgress
                                                variant="determinate"
                                                value={animeDownloadProgress * 100}
                                            />
                                        )}
                                        <Box
                                            sx={{
                                                top: 0,
                                                left: 0,
                                                bottom: 0,
                                                right: 0,
                                                position: 'absolute',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}
                                        >
                                            <Typography variant="caption" component="div">
                                                {animeDownloadState === DownloadState.Downloading
                                                    ? `${Math.round(animeDownloadProgress * 100)}%`
                                                    : t(DOWNLOAD_STATE_TO_LABEL[animeDownloadState])}
                                            </Typography>
                                        </Box>
                                    </Box>
                                )}

                                <Stack sx={{ minHeight: '48px' }}>
                                    {selected === null ? (
                                        <CustomTooltip title={t('global.button.options')}>
                                            <IconButton
                                                component="div"
                                                ref={menuButtonRef}
                                                {...MUIUtil.preventRippleProp(bindTrigger(popupState), {
                                                    onClick: (e: MouseEvent) => handleClickOpenMenu(e),
                                                })}
                                                aria-label="more"
                                                sx={{ color: 'inherit' }}
                                            >
                                                <MoreVertIcon />
                                            </IconButton>
                                        </CustomTooltip>
                                    ) : (
                                        <CustomTooltip
                                            title={t(selected ? 'global.button.deselect' : 'global.button.select')}
                                        >
                                            <Checkbox checked={!!selected} />
                                        </CustomTooltip>
                                    )}
                                </Stack>
                            </ListCardContent>
                        </CardActionArea>
                    </Card>
                    {!isSelecting && popupState.isOpen && (
                        <Menu {...bindMenu(popupState)}>
                            {(onClose) => (
                                <EpisodeActionMenuItems
                                    onClose={onClose}
                                    episode={episode}
                                    canDownloadVideo={canDownloadVideo}
                                    canDownloadSubtitles={canDownloadSubtitles}
                                    onSelect={() => onSelect(episode.id, true)}
                                    onDownload={onDownload}
                                    onDownloadSubtitles={onDownloadSubtitles}
                                    onDeleteDownload={onDeleteDownload}
                                    onMarkWatched={onMarkWatched}
                                    onMarkUnwatched={onMarkUnwatched}
                                    onMarkPreviousWatched={onMarkPreviousWatched}
                                />
                            )}
                        </Menu>
                    )}
                </Stack>
            )}
        </PopupState>
    );
};
