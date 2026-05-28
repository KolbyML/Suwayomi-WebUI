/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useState } from 'react';
import { TrackerUntrackedCard } from '@/features/tracker/components/cards/TrackerUntrackedCard.tsx';
import { TrackerSearch } from '@/features/tracker/components/TrackerSearch.tsx';
import { TrackerActiveCard } from '@/features/tracker/components/cards/TrackerActiveCard.tsx';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { makeToast } from '@/base/utils/Toast.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { useTranslation } from 'react-i18next';
import { TTrackerBind, TTrackRecordBind, TrackedMedia } from '@/features/tracker/Tracker.types.ts';
import { supportsDirectEnhancedBind } from '@/features/tracker/Tracker.utils.ts';

export enum TrackerMode {
    UNTRACKED,
    SEARCH,
    INFO,
}

export const TrackerCard = ({
    tracker,
    media,
    trackRecord,
    mode,
    setSearchMode,
    onTrackRecordChanged,
}: {
    tracker: TTrackerBind;
    media: TrackedMedia;
    trackRecord?: TTrackRecordBind;
    mode: TrackerMode;
    setSearchMode: (id?: number) => void;
    onTrackRecordChanged: () => Promise<void>;
}) => {
    const { t } = useTranslation();
    const [isBinding, setIsBinding] = useState(false);
    const canBindDirectly = supportsDirectEnhancedBind(tracker.id, media.mediaType);

    const handleUntrackedClick = () => {
        if (!canBindDirectly) {
            setSearchMode(tracker.id);
            return;
        }

        setIsBinding(true);
        const request =
            media.mediaType === 'anime'
                ? requestManager.bindAnimeTracker(media.id, tracker.id, undefined, false).response
                : requestManager.bindTracker(media.id, tracker.id, undefined, false).response;
        request
            .then(async () => {
                await onTrackRecordChanged();
            })
            .catch((error) =>
                makeToast(t('manga.action.track.add.label.error'), 'error', getErrorMessage(error)),
            )
            .finally(() => setIsBinding(false));
    };

    if (mode === TrackerMode.UNTRACKED) {
        return <TrackerUntrackedCard tracker={tracker} onClick={handleUntrackedClick} disabled={isBinding} />;
    }

    if (mode === TrackerMode.SEARCH) {
        return (
            <TrackerSearch
                media={media}
                tracker={tracker}
                trackedId={trackRecord?.remoteId}
                closeSearchMode={() => setSearchMode(undefined)}
                onTrackRecordChanged={onTrackRecordChanged}
            />
        );
    }

    if (mode === TrackerMode.INFO && !trackRecord) {
        throw new Error(
            `TrackerCard: unable to find track record for tracker "${tracker.id}" of ${media.mediaType} "${media.id}"`,
        );
    }

    return (
        <TrackerActiveCard
            tracker={tracker}
            trackRecord={trackRecord!}
            mediaType={media.mediaType}
            onTrackRecordChanged={onTrackRecordChanged}
            onClick={() => {
                setSearchMode(tracker.id);
            }}
        />
    );
};
