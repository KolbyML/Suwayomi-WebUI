/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Typography from '@mui/material/Typography';
import Tab from '@mui/material/Tab';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import CardMedia from '@mui/material/CardMedia';
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { StringParam, useQueryParam } from 'use-query-params';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { UpdateChecker } from '@/features/updates/components/UpdateChecker.tsx';
import { StyledGroupedVirtuoso } from '@/base/components/virtuoso/StyledGroupedVirtuoso.tsx';
import { StyledGroupHeader } from '@/base/components/virtuoso/StyledGroupHeader.tsx';
import { StyledGroupItemWrapper } from '@/base/components/virtuoso/StyledGroupItemWrapper.tsx';
import { dateTimeFormatter } from '@/base/utils/DateHelper.ts';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { VirtuosoUtil } from '@/lib/virtuoso/Virtuoso.util.tsx';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { ChapterUpdateCard } from '@/features/updates/components/ChapterUpdateCard.tsx';
import { useNavBarContext } from '@/features/navigation-bar/NavbarContext.tsx';
import { Chapters } from '@/features/chapter/services/Chapters.ts';
import { useAppTitleAndAction } from '@/features/navigation-bar/hooks/useAppTitleAndAction.ts';
import { GROUPED_VIRTUOSO_Z_INDEX } from '@/lib/virtuoso/Virtuoso.constants.ts';
import { TabsMenu } from '@/base/components/tabs/TabsMenu.tsx';
import { TabsWrapper } from '@/base/components/tabs/TabsWrapper.tsx';
import { TabPanel } from '@/base/components/tabs/TabPanel.tsx';
import { SearchParam } from '@/base/Base.types.ts';
import { AppRoutes } from '@/base/AppRoute.constants.ts';

type AnimeUpdateNode = {
    id: number;
    name?: string | null;
    animeId: number;
    sourceOrder?: number | null;
    episodeNumber?: number | null;
    isRead: boolean;
    isDownloaded: boolean;
    fetchedAt: string;
    uploadDate?: string | null;
    anime: {
        id: number;
        title: string;
        thumbnailUrl?: string | null;
        inLibrary: boolean;
        initialized: boolean;
        sourceId: string;
    };
};

enum UpdatesTab {
    ANIME = 'anime',
    MANGA = 'manga',
}

const formatLastUpdateTimestamp = (timestamp?: string | null) => {
    const parsed = Number(timestamp);
    return Number.isFinite(parsed) && parsed > 0 ? dateTimeFormatter.format(parsed) : '-';
};

export const Updates: React.FC = () => {
    const { t } = useTranslation();
    const { appBarHeight } = useNavBarContext();

    const [tabSearchParam, setTabSearchParam] = useQueryParam(SearchParam.TAB, StringParam, {});
    const tabName = (tabSearchParam as UpdatesTab) ?? UpdatesTab.MANGA;
    const isMangaTab = tabName === UpdatesTab.MANGA;

    if (!tabSearchParam) {
        setTabSearchParam(tabName, 'replaceIn');
    }

    const {
        data: chapterUpdateData,
        loading: isLoading,
        error,
        fetchMore,
        refetch,
    } = requestManager.useGetRecentlyUpdatedChapters(undefined, {
        fetchPolicy: 'cache-and-network',
        notifyOnNetworkStatusChange: true,
        skip: !isMangaTab,
    });
    const {
        data: episodeUpdateData,
        loading: isAnimeLoading,
        error: animeError,
        refetch: refetchAnime,
    } = requestManager.useGetRecentlyUpdatedEpisodes(undefined, {
        fetchPolicy: 'cache-and-network',
        notifyOnNetworkStatusChange: true,
        skip: isMangaTab,
    });
    const hasNextPage = !!chapterUpdateData?.chapters.pageInfo.hasNextPage;
    const endCursor = chapterUpdateData?.chapters.pageInfo.endCursor;
    const updateEntries = chapterUpdateData?.chapters.nodes ?? [];
    const groupedUpdates = useMemo(
        () => Object.entries(Chapters.groupByDate(updateEntries, 'fetchedAt')),
        [updateEntries],
    );
    const animeUpdateEntries = useMemo(
        () =>
            ((episodeUpdateData?.episodes?.nodes ?? []) as any[]).map((episode) => ({
                ...episode,
                fetchedAt: String(episode?.fetchedAt ?? ''),
                uploadDate:
                    episode?.uploadDate === null || episode?.uploadDate === undefined
                        ? null
                        : String(episode.uploadDate),
            })) as AnimeUpdateNode[],
        [episodeUpdateData?.episodes?.nodes],
    );
    const groupedAnimeUpdates = useMemo(
        () => Object.entries(Chapters.groupByDate(animeUpdateEntries, 'fetchedAt')),
        [animeUpdateEntries],
    );
    const groupCounts: number[] = useMemo(
        () => groupedUpdates.map((group) => group[VirtuosoUtil.ITEMS].length),
        [groupedUpdates],
    );
    const animeGroupCounts: number[] = useMemo(
        () => groupedAnimeUpdates.map((group) => group[VirtuosoUtil.ITEMS].length),
        [groupedAnimeUpdates],
    );

    const computeItemKey = VirtuosoUtil.useCreateGroupedComputeItemKey(
        groupCounts,
        useCallback((index) => groupedUpdates[index][VirtuosoUtil.GROUP], [groupedUpdates]),
        useCallback((index) => updateEntries[index].id, [updateEntries]),
    );
    const computeAnimeItemKey = VirtuosoUtil.useCreateGroupedComputeItemKey(
        animeGroupCounts,
        useCallback((index) => groupedAnimeUpdates[index][VirtuosoUtil.GROUP], [groupedAnimeUpdates]),
        useCallback((index) => animeUpdateEntries[index].id, [animeUpdateEntries]),
    );

    const lastUpdateTimestampCompRef = useRef<HTMLElement>(null);
    const [lastUpdateTimestampCompHeight, setLastUpdateTimestampCompHeight] = useState(0);
    useLayoutEffect(() => {
        setLastUpdateTimestampCompHeight(lastUpdateTimestampCompRef.current?.clientHeight ?? 0);
    }, [lastUpdateTimestampCompRef.current]);

    const { data: lastUpdateTimestampData } = requestManager.useGetLastGlobalUpdateTimestamp({
        /**
         * The {@link UpdateChecker} is responsible for updating the timestamp
         */
        fetchPolicy: 'cache-only',
    });
    const lastUpdateTimestamp = lastUpdateTimestampData?.lastUpdateTimestamp.timestamp;

    const handleFinishedUpdate = useCallback(() => {
        if (isMangaTab) {
            refetch().catch(defaultPromiseErrorHandler('Updates::refetch'));
            return;
        }
        refetchAnime().catch(defaultPromiseErrorHandler('Updates::refetchAnime'));
    }, [isMangaTab, refetch, refetchAnime]);

    useAppTitleAndAction(t('updates.title'), <UpdateChecker handleFinishedUpdate={handleFinishedUpdate} />);

    const loadMore = useCallback(() => {
        if (!hasNextPage) {
            return;
        }

        fetchMore({ variables: { offset: updateEntries.length } });
    }, [hasNextPage, endCursor]);

    if (error && isMangaTab) {
        return (
            <EmptyViewAbsoluteCentered
                message={t('global.error.label.failed_to_load_data')}
                messageExtra={getErrorMessage(error)}
                retry={() => refetch().catch(defaultPromiseErrorHandler('Updates::refetch'))}
            />
        );
    }

    if (animeError && !isMangaTab) {
        return (
            <EmptyViewAbsoluteCentered
                message={t('global.error.label.failed_to_load_data')}
                messageExtra={getErrorMessage(animeError)}
                retry={() => refetchAnime().catch(defaultPromiseErrorHandler('Updates::refetchAnime'))}
            />
        );
    }

    if (isMangaTab && !isLoading && updateEntries.length === 0) {
        return <EmptyViewAbsoluteCentered message={t('updates.error.label.no_updates_available')} />;
    }

    if (!isMangaTab && !isAnimeLoading && animeUpdateEntries.length === 0) {
        return <EmptyViewAbsoluteCentered message="No video updates available yet." />;
    }

    return (
        <TabsWrapper>
            <TabsMenu
                variant="fullWidth"
                value={tabName}
                onChange={(_, newTab) => setTabSearchParam(newTab, 'replaceIn')}
            >
                <Tab value={UpdatesTab.ANIME} sx={{ textTransform: 'none' }} label="Video" />
                <Tab value={UpdatesTab.MANGA} sx={{ textTransform: 'none' }} label="Manga" />
            </TabsMenu>
            <TabPanel index={UpdatesTab.ANIME} currentIndex={tabName}>
                <StyledGroupedVirtuoso
                    persistKey="anime-updates"
                    components={{
                        Footer: () => (isAnimeLoading ? <LoadingPlaceholder usePadding /> : null),
                    }}
                    overscan={window.innerHeight * 0.5}
                    groupCounts={animeGroupCounts}
                    groupContent={(index) => (
                        <StyledGroupHeader isFirstItem={index === 0}>
                            <Typography variant="h5" component="h2">
                                {groupedAnimeUpdates[index][VirtuosoUtil.GROUP]}
                            </Typography>
                        </StyledGroupHeader>
                    )}
                    computeItemKey={computeAnimeItemKey}
                    itemContent={(index) => {
                        const episode = animeUpdateEntries[index];
                        const episodeIndex = episode.sourceOrder ?? episode.id;
                        return (
                            <StyledGroupItemWrapper>
                                <Card elevation={0}>
                                    <CardActionArea
                                        component={RouterLink}
                                        to={AppRoutes.anime.childRoutes.episode.path(episode.animeId, episodeIndex)}
                                        sx={{ display: 'flex', alignItems: 'stretch', justifyContent: 'flex-start' }}
                                    >
                                        {!!episode.anime.thumbnailUrl && (
                                            <CardMedia
                                                component="img"
                                                image={episode.anime.thumbnailUrl}
                                                alt={episode.anime.title}
                                                sx={{ width: 84, objectFit: 'cover' }}
                                            />
                                        )}
                                        <CardContent sx={{ minWidth: 0, flex: 1 }}>
                                            <Typography variant="subtitle1" noWrap>
                                                {episode.anime.title}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary" noWrap>
                                                {episode.name || `Episode ${episode.episodeNumber ?? episodeIndex}`}
                                            </Typography>
                                        </CardContent>
                                    </CardActionArea>
                                </Card>
                            </StyledGroupItemWrapper>
                        );
                    }}
                />
            </TabPanel>
            <TabPanel index={UpdatesTab.MANGA} currentIndex={tabName}>
                <Typography
                    ref={lastUpdateTimestampCompRef}
                    sx={{
                        position: 'sticky',
                        top: appBarHeight,
                        zIndex: GROUPED_VIRTUOSO_Z_INDEX,
                        backgroundColor: 'background.default',
                        marginLeft: '10px',
                        paddingTop: (theme) => ({ [theme.breakpoints.up('sm')]: { paddingTop: '6px' } }),
                    }}
                >
                    {t('library.settings.global_update.label.last_update', {
                        date: formatLastUpdateTimestamp(lastUpdateTimestamp),
                    })}
                </Typography>
                <StyledGroupedVirtuoso
                    persistKey="updates"
                    heightToSubtract={lastUpdateTimestampCompHeight}
                    components={{
                        Footer: () => (isLoading ? <LoadingPlaceholder usePadding /> : null),
                    }}
                    overscan={window.innerHeight * 0.5}
                    endReached={loadMore}
                    groupCounts={groupCounts}
                    groupContent={(index) => (
                        <StyledGroupHeader isFirstItem={index === 0}>
                            <Typography variant="h5" component="h2">
                                {groupedUpdates[index][VirtuosoUtil.GROUP]}
                            </Typography>
                        </StyledGroupHeader>
                    )}
                    computeItemKey={computeItemKey}
                    itemContent={(index) => (
                        <StyledGroupItemWrapper>
                            <ChapterUpdateCard chapter={updateEntries[index]} />
                        </StyledGroupItemWrapper>
                    )}
                />
            </TabPanel>
        </TabsWrapper>
    );
};
