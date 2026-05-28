/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useNavigate } from 'react-router-dom';
import SyncIcon from '@mui/icons-material/Sync';
import { useTranslation } from 'react-i18next';
import PopupState, { bindDialog, bindTrigger } from 'material-ui-popup-state';
import Dialog from '@mui/material/Dialog';
import CheckIcon from '@mui/icons-material/Check';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { makeToast } from '@/base/utils/Toast.ts';
import { TrackAnime } from '@/features/tracker/components/TrackAnime.tsx';
import { Trackers } from '@/features/tracker/services/Trackers.ts';
import { CustomButton } from '@/base/components/buttons/CustomButton.tsx';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { TTrackerBind } from '@/features/tracker/Tracker.types.ts';
import { canTrackerHandleMedia, isManualTrackingTrackerId } from '@/features/tracker/Tracker.utils.ts';

export const TrackAnimeButton = ({
    anime,
    onTrackingChanged,
}: {
    anime: {
        id: number;
        title: string;
        sourceId?: string;
        trackRecords?: { nodes?: { id: number; trackerId: number }[] };
    };
    onTrackingChanged?: () => Promise<void>;
}) => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const trackerList = requestManager.useGetTrackersSettings();
    const animeSourceList = requestManager.useGetAnimeSourceList({
        notifyOnNetworkStatusChange: true,
        skip: !anime.sourceId,
    });
    const trackers = (trackerList.data?.trackers.nodes ?? []) as TTrackerBind[];
    const animeTrackers = anime.trackRecords?.nodes ?? [];
    const animeSource = (animeSourceList.data?.animeSources?.nodes ?? []).find(
        (source: { id?: string | number }) => `${source?.id ?? ''}` === `${anime.sourceId ?? ''}`,
    );

    const loggedInTrackers = Trackers.getLoggedIn(trackers).filter((tracker) =>
        canTrackerHandleMedia(tracker, 'anime', animeSource),
    );
    const manualLoggedInTrackers = loggedInTrackers.filter((tracker) => isManualTrackingTrackerId(tracker.id));
    const trackersInUse = Trackers.getLoggedIn(Trackers.getTrackers(animeTrackers, trackers)).filter(
        (tracker) => canTrackerHandleMedia(tracker, 'anime', animeSource) && isManualTrackingTrackerId(tracker.id),
    );

    const handleClick = (openPopup: () => void) => {
        if (trackerList.error) {
            makeToast(t('tracking.error.label.could_not_load_track_info'), 'error', trackerList.error?.toString());
            return;
        }

        if (!manualLoggedInTrackers.length) {
            navigate(AppRoutes.settings.childRoutes.tracking.path);
            return;
        }

        openPopup();
    };

    return (
        <PopupState variant="dialog" popupId="anime-track-modal">
            {(popupState) => (
                <>
                    <CustomButton
                        {...bindTrigger(popupState)}
                        size="medium"
                        disabled={
                            trackerList.loading ||
                            animeSourceList.loading ||
                            !!trackerList.error ||
                            !!animeSourceList.error
                        }
                        onClick={() => handleClick(popupState.open)}
                        variant={trackersInUse.length ? 'contained' : 'outlined'}
                    >
                        {trackersInUse.length ? <CheckIcon /> : <SyncIcon />}
                        {trackersInUse.length
                            ? t('manga.button.track.active', { count: trackersInUse.length })
                            : t('manga.button.track.start')}
                    </CustomButton>
                    {popupState.isOpen && (
                        <Dialog {...bindDialog(popupState)} maxWidth="md" fullWidth scroll="paper">
                            <TrackAnime anime={anime} onTrackingChanged={onTrackingChanged} />
                        </Dialog>
                    )}
                </>
            )}
        </PopupState>
    );
};
