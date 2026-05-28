/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import {
    TrackerType,
    TrackRecordSearchFieldsFragment,
    TrackRecordType,
    TrackSearchType,
} from '@/lib/requests/types.ts';

export type MetadataTrackingSettings = {
    updateProgressAfterReading: boolean;
    updateProgressManualMarkRead: boolean;
};

export type TrackedMediaType = 'manga' | 'anime';
export type TrackedMedia = {
    id: number;
    title: string;
    mediaType: TrackedMediaType;
    sourceId?: string;
    trackRecords?: { nodes: { id: number; trackerId: number }[] };
};

export enum PublishingType {
    UNKNOWN = 'unknown',
    MANGA = 'manga',
    NOVEL = 'novel',
    ONE_SHOT = 'one_shot',
    DOUJINSHI = 'doujinshi',
    MANHWA = 'manhwa',
    MANHUA = 'manhua',
    OEL = 'oel',
}

export enum PublishingStatus {
    FINISHED = 'finished',
    RELEASING = 'releasing',
    NOT_YET_RELEASED = 'not_yet_released',
    CANCELLED = 'cancelled',
    HIATUS = 'hiatus',
    CURRENTLY_PUBLISHING = 'currently_publishing',
    NOT_YET_PUBLISHED = 'not_yet_published',
}

export enum Tracker {
    MYANIMELIST = 1,
    ANILIST = 2,
    KITSU = 3,
    SHIKIMORI = 4,
    BANGUMI = 5,
    KOMGA = 6,
    MANGAUPDATES = 7,
    KAVITA = 8,
    SUWAYOMI = 9,
    HIKKA = 10,
    MANGABAKA = 11,
    SIMKL = 101,
    JELLYFIN = 102,
}

export type TTrackRecordBase = Pick<TrackRecordType, 'id' | 'remoteId' | 'title'>;
export type TTrackRecordBind = TTrackRecordBase &
    Pick<
        TrackRecordType,
        | 'trackerId'
        | 'remoteUrl'
        | 'status'
        | 'lastChapterRead'
        | 'totalChapters'
        | 'score'
        | 'displayScore'
        | 'startDate'
        | 'finishDate'
        | 'private'
    > & {
        lastEpisodeSeen?: number;
        totalEpisodes?: number;
        manga?: { id: number; trackRecords?: { nodes: { id: number; trackerId: number }[] } };
        anime?: { id: number; trackRecords?: { nodes: { id: number; trackerId: number }[] } };
    };
export type TTrackerManga = TrackRecordSearchFieldsFragment;

export type TTrackerBase = Pick<TrackerType, 'id' | 'name' | 'icon' | 'isLoggedIn' | 'isTokenExpired'>;
export type TTrackerSearch = TTrackerBase & Pick<TrackerType, 'authUrl'>;
export type TTrackerBind = TTrackerBase &
    Pick<
        TrackerType,
        'icon' | 'supportsTrackDeletion' | 'supportsPrivateTracking' | 'scores' | 'statuses'
    > & {
        supportsReadingDates?: boolean;
        supportsMangaTracking?: boolean;
        supportsAnimeTracking?: boolean;
        trackRecords?: { totalCount: number; nodes: TTrackRecordBind[] };
    };
export type TrackerIdInfo = Pick<TrackerType, 'id'>;
export type LoggedInInfo = Pick<TrackerType, 'isLoggedIn' | 'isTokenExpired'>;
export type TrackRecordTrackerInfo = Pick<TrackRecordType, 'trackerId'>;
export type TrackSearchPublishingTypeInfo = Pick<TrackSearchType, 'publishingType'>;
export type TrackSearchPublishingStatusInfo = Pick<TrackSearchType, 'publishingStatus'>;
