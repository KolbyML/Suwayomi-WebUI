/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Warning from '@mui/icons-material/Warning';
import { useTranslation } from 'react-i18next';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { useAppTitleAndAction } from '@/features/navigation-bar/hooks/useAppTitleAndAction.ts';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';
import { AnimeDetailsPanel } from '@/features/anime/components/details/AnimeDetailsPanel.tsx';
import { EpisodeList } from '@/features/anime/components/EpisodeList.tsx';
import { toggleAnimeLibraryState } from '@/features/anime/services/AnimeLibrary.ts';
import { AnimeToolbarMenu } from '@/features/anime/components/AnimeToolbarMenu.tsx';
import { Sources } from '@/features/source/services/Sources.ts';

type AnimeDetailsResponse = {
    id: number;
    sourceId: string;
    url: string;
    title: string;
    thumbnailUrl?: string | null;
    backgroundUrl?: string | null;
    description?: string | null;
    genre?: string[] | null;
    artist?: string | null;
    author?: string | null;
    status?: string | null;
    inLibrary: boolean;
    trackRecords?: { totalCount?: number; nodes?: { id: number; trackerId: number }[] };
};

type EpisodeResponse = {
    id: number;
    name: string;
    episodeNumber: number;
    uploadDate: number;
    scanlator?: string | null;
    summary?: string | null;
    fillermark?: boolean | null;
    index: number;
    isRead: boolean;
    isDownloaded: boolean;
    realUrl?: string | null;
};

export const AnimeDetails = () => {
    const { t } = useTranslation();
    const { id } = useParams<{ id: string }>();
    const [data, setData] = useState<AnimeDetailsResponse | null>(null);
    const [episodes, setEpisodes] = useState<EpisodeResponse[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [refreshToken, setRefreshToken] = useState(0);
    const [libraryUpdating, setLibraryUpdating] = useState(false);
    const { data: updaterSubscriptionData } = requestManager.useUpdaterSubscription();
    const lastUpdateRunningRef = useRef(false);

    useEffect(() => {
        if (!id) {
            setError('Missing anime id');
            setLoading(false);
            return undefined;
        }

        let isMounted = true;
        const isRefresh = refreshToken > 0;

        setError(null);
        if (isRefresh) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }

        const refreshQuery = isRefresh ? '?onlineFetch=true' : '';
        const fetchDetails = requestManager.getClient().fetcher(`/api/v1/anime/${id}${refreshQuery}`);
        const fetchEpisodes = requestManager.getClient().fetcher(`/api/v1/anime/${id}/episodes${refreshQuery}`);

        Promise.all([fetchDetails, fetchEpisodes])
            .then(async ([detailsResponse, episodesResponse]) => {
                const detailsData = (await detailsResponse.json()) as AnimeDetailsResponse;
                const episodesData = (await episodesResponse.json()) as EpisodeResponse[];
                if (!isMounted) {
                    return;
                }
                setData(detailsData);
                setEpisodes(episodesData);
            })
            .catch((fetchError) => {
                if (isMounted) {
                    setError(fetchError?.message ?? t('global.error.label.failed_to_load_data'));
                }
            })
            .finally(() => {
                if (isMounted) {
                    setLoading(false);
                    setRefreshing(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [id, refreshToken, t]);

    useEffect(() => {
        const isRunning = !!updaterSubscriptionData?.libraryUpdateStatusChanged?.jobsInfo?.isRunning;
        if (!lastUpdateRunningRef.current && isRunning) {
            lastUpdateRunningRef.current = true;
        }
        if (!lastUpdateRunningRef.current || isRunning || !data?.inLibrary) {
            return;
        }
        lastUpdateRunningRef.current = false;
        setRefreshToken((prev) => prev + 1);
    }, [data?.inLibrary, updaterSubscriptionData?.libraryUpdateStatusChanged?.jobsInfo?.isRunning]);

    useAppTitleAndAction(
        data?.title ?? 'Video',
        <Stack direction="row" sx={{ alignItems: 'center' }}>
            {error && (
                <CustomTooltip
                    title={
                        <>
                            {t('global.error.label.failed_to_load_data')}
                            <br />
                            {getErrorMessage(error)}
                        </>
                    }
                >
                    <IconButton onClick={() => setRefreshToken((prev) => prev + 1)}>
                        <Warning color="error" />
                    </IconButton>
                </CustomTooltip>
            )}
            {data && (
                <>
                    {(loading || refreshing) && (
                        <IconButton disabled>
                            <CircularProgress size={16} />
                        </IconButton>
                    )}
                    <AnimeToolbarMenu
                        anime={{ id: data.id, inLibrary: data.inLibrary }}
                        onRefresh={() => setRefreshToken((prev) => prev + 1)}
                        refreshing={loading || refreshing}
                    />
                </>
            )}
        </Stack>,
        [data?.title, error, loading, refreshing, t],
    );

    const handleToggleLibrary = async (nextInLibrary: boolean) => {
        if (!id) {
            return;
        }

        setLibraryUpdating(true);
        try {
            const response = await toggleAnimeLibraryState(Number(id), nextInLibrary);
            const updatedAnime = response.data?.updateAnime?.anime;
            if (updatedAnime) {
                setData((current) =>
                    current
                        ? {
                              ...current,
                              inLibrary: updatedAnime.inLibrary ?? nextInLibrary,
                          }
                        : current,
                );
            }
        } catch (libraryError: any) {
            setError(libraryError?.message ?? t('global.error.label.failed_to_load_data'));
        } finally {
            setLibraryUpdating(false);
        }
    };

    const handleTrackingChanged = async () => {
        setRefreshToken((prev) => prev + 1);
    };

    if (error && !data) {
        return (
            <EmptyViewAbsoluteCentered
                message={t('global.error.label.failed_to_load_data')}
                messageExtra={getErrorMessage(error)}
            />
        );
    }

    return (
        <Box sx={{ display: { md: 'flex' }, overflow: 'hidden' }}>
            {loading && <LoadingPlaceholder />}
            {data && (
                <AnimeDetailsPanel
                    anime={data}
                    onToggleLibrary={handleToggleLibrary}
                    isLibraryUpdating={libraryUpdating}
                    onTrackingChanged={handleTrackingChanged}
                />
            )}
            {data && (
                <EpisodeList
                    episodes={episodes}
                    animeId={id ?? ''}
                    isLocalAnimeSource={`${data.sourceId}` === Sources.LOCAL_SOURCE_ID}
                    isRefreshing={refreshing}
                    isLoading={loading}
                    onEpisodesUpdate={setEpisodes}
                />
            )}
        </Box>
    );
};
