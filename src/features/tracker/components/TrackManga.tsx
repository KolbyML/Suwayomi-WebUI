/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DialogContent from '@mui/material/DialogContent';
import { useTranslation } from 'react-i18next';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { Trackers } from '@/features/tracker/services/Trackers.ts';
import { TrackerCard, TrackerMode } from '@/features/tracker/components/cards/TrackerCard.tsx';
import { makeToast } from '@/base/utils/Toast.ts';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { MangaType } from '@/lib/requests/types.ts';
import { MangaIdInfo } from '@/features/manga/Manga.types.ts';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { EmptyView } from '@/base/components/feedback/EmptyView.tsx';
import { TTrackRecordBind, TTrackerBind, TrackedMedia } from '@/features/tracker/Tracker.types.ts';
import { canTrackerHandleMedia, isManualTrackingTrackerId } from '@/features/tracker/Tracker.utils.ts';

const getTrackerMode = (id: number, trackersInUse: number[], searchModeForTracker?: number): TrackerMode => {
    if (id === searchModeForTracker) {
        return TrackerMode.SEARCH;
    }

    if (trackersInUse.includes(id)) {
        return TrackerMode.INFO;
    }

    return TrackerMode.UNTRACKED;
};

export const TrackMedia = ({
    media,
    onTrackingChanged,
}: {
    media: TrackedMedia;
    onTrackingChanged?: () => Promise<void>;
}) => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const [searchModeForTracker, setSearchModeForTracker] = useState<number>();

    const trackerList = requestManager.useGetTrackersBind({ notifyOnNetworkStatusChange: true });
    const trackers = (trackerList.data?.trackers.nodes ?? []) as TTrackerBind[];
    const mangaSourceList = requestManager.useGetSourceList({
        notifyOnNetworkStatusChange: true,
        skip: media.mediaType !== 'manga' || !media.sourceId,
    });
    const animeSourceList = requestManager.useGetAnimeSourceList({
        notifyOnNetworkStatusChange: true,
        skip: media.mediaType !== 'anime' || !media.sourceId,
    });
    const mediaSource = useMemo(() => {
        const nodes =
            media.mediaType === 'anime'
                ? (animeSourceList.data?.animeSources?.nodes ?? [])
                : (mangaSourceList.data?.sources?.nodes ?? []);
        return nodes.find((source: { id?: string | number }) => `${source?.id ?? ''}` === `${media.sourceId ?? ''}`);
    }, [
        animeSourceList.data?.animeSources?.nodes,
        mangaSourceList.data?.sources?.nodes,
        media.mediaType,
        media.sourceId,
    ]);

    const mangaTrackRecordsList = requestManager.useGetMangaTrackRecords(media.id, {
        skip: media.mediaType !== 'manga',
    });
    const mediaTrackRecords =
        media.mediaType === 'manga'
            ? (mangaTrackRecordsList.data?.manga.trackRecords.nodes ?? [])
            : trackers
                  .flatMap((tracker) => tracker.trackRecords?.nodes ?? [])
                  .filter((trackRecord: TTrackRecordBind) => trackRecord.anime?.id === media.id);

    const loggedInTrackers = Trackers.getLoggedIn(trackers);
    const sourceSupportedLoggedInTrackers = loggedInTrackers.filter((tracker) =>
        canTrackerHandleMedia(tracker, media.mediaType, mediaSource),
    );
    const supportedLoggedInTrackers = sourceSupportedLoggedInTrackers.filter((tracker) =>
        isManualTrackingTrackerId(tracker.id),
    );
    const trackersInUse = Trackers.getLoggedIn(Trackers.getTrackers(mediaTrackRecords, trackers)).filter((tracker) =>
        isManualTrackingTrackerId(tracker.id),
    );
    const trackersInUseIds = Trackers.getIds(trackersInUse);

    const isSearchActive = searchModeForTracker !== undefined;
    const OptionalDialogContent = useMemo(() => (isSearchActive ? Box : DialogContent), [isSearchActive]);

    const loading =
        trackerList.loading ||
        (media.mediaType === 'manga' && mangaTrackRecordsList.loading) ||
        (!!media.sourceId && (media.mediaType === 'anime' ? animeSourceList.loading : mangaSourceList.loading));
    const error =
        trackerList.error ??
        (media.mediaType === 'manga' ? mangaTrackRecordsList.error : undefined) ??
        (media.mediaType === 'anime' ? animeSourceList.error : mangaSourceList.error);

    const refreshTracking = useCallback(async () => {
        if (media.mediaType === 'manga') {
            await mangaTrackRecordsList.refetch();
        }
        await trackerList.refetch();
        await onTrackingChanged?.();
    }, [media.mediaType, mangaTrackRecordsList, onTrackingChanged, trackerList]);

    useEffect(() => {
        if (!loading && !error && !trackersInUse.length && !sourceSupportedLoggedInTrackers.length) {
            navigate(AppRoutes.settings.childRoutes.tracking.path);
        }
    }, [error, loading, navigate, sourceSupportedLoggedInTrackers.length, trackersInUse.length]);

    const fetchedLatestTrackDataRef = useRef(false);
    useEffect(() => {
        fetchedLatestTrackDataRef.current = false;
    }, [media.id, media.mediaType]);

    useEffect(() => {
        if (!mediaTrackRecords.length || fetchedLatestTrackDataRef.current) {
            return;
        }

        fetchedLatestTrackDataRef.current = true;
        Promise.all(
            mediaTrackRecords
                .filter((trackRecord) => trackersInUseIds.includes(trackRecord.trackerId))
                .map((trackRecord) => {
                    const typedTrackRecord = trackRecord as TTrackRecordBind;
                    return requestManager.fetchTrackBind(typedTrackRecord.id, {
                        trackerId: typedTrackRecord.trackerId,
                        mangaId: typedTrackRecord.manga?.id,
                        animeId: typedTrackRecord.anime?.id,
                    }).response;
                }),
        )
            .then(() => refreshTracking())
            .catch((e) => makeToast(t('tracking.error.label.could_not_fetch_track_info'), 'error', getErrorMessage(e)));
    }, [mediaTrackRecords, refreshTracking, t, trackersInUseIds]);

    const trackerComponents = useMemo(
        () =>
            supportedLoggedInTrackers.map((tracker) => {
                const mode = getTrackerMode(tracker.id, trackersInUseIds, searchModeForTracker);
                const trackRecord = Trackers.getTrackRecordFor(tracker, mediaTrackRecords);

                const isSearchForTracker = mode === TrackerMode.SEARCH;
                if (isSearchActive && !isSearchForTracker) {
                    return null;
                }

                return (
                    <TrackerCard
                        key={tracker.id}
                        tracker={tracker}
                        media={media}
                        trackRecord={trackRecord}
                        mode={mode}
                        setSearchMode={(id) => setSearchModeForTracker(id)}
                        onTrackRecordChanged={refreshTracking}
                    />
                );
            }),
        [supportedLoggedInTrackers, trackersInUseIds, searchModeForTracker, mediaTrackRecords, refreshTracking, media],
    );

    if (error) {
        return (
            <EmptyView
                message={t('global.error.label.failed_to_load_data')}
                messageExtra={getErrorMessage(error)}
                retry={() => {
                    if (trackerList.error) {
                        trackerList.refetch().catch(defaultPromiseErrorHandler('TrackManga::refetch: trackerList'));
                    }

                    if (media.mediaType === 'manga' && mangaTrackRecordsList.error) {
                        mangaTrackRecordsList
                            .refetch()
                            .catch(defaultPromiseErrorHandler('TrackManga::refetch: mangaTrackRecordsList'));
                    }
                }}
            />
        );
    }

    if (loading) {
        return <LoadingPlaceholder />;
    }

    if (!isSearchActive) {
        return (
            <OptionalDialogContent
                sx={{
                    padding: 0,
                    // MUI adds a bottom padding to the last child of type CardContent which can only be removed via actual css styling
                    // do it here, so it is done in one place for all track related CardContent components
                    '.MuiPaper-root .MuiCardContent-root': { paddingBottom: '0' },
                }}
            >
                {trackerComponents}
            </OptionalDialogContent>
        );
    }

    return trackerComponents;
};

export const TrackManga = ({
    manga,
    onTrackingChanged,
}: {
    manga: MangaIdInfo & Pick<MangaType, 'title' | 'sourceId'>;
    onTrackingChanged?: () => Promise<void>;
}) => <TrackMedia media={{ ...manga, mediaType: 'manga' }} onTrackingChanged={onTrackingChanged} />;
