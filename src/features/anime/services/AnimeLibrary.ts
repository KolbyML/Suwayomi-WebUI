/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { AwaitableComponent } from 'awaitable-component';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { getMetadataServerSettings } from '@/features/settings/services/ServerSettingsMetadata.ts';
import { Categories } from '@/features/category/services/Categories.ts';
import { AnimeCategorySelect } from '@/features/category/components/AnimeCategorySelect.tsx';
import { UrlUtil } from '@/lib/UrlUtil.ts';

const isUserCancellationError = (error: unknown): boolean => {
    if (error instanceof Error) {
        return error.message === 'User cancellation';
    }

    return error === 'User cancellation';
};

export const toggleAnimeLibraryState = async (animeId: number, nextInLibrary: boolean): Promise<any> => {
    const settings = await getMetadataServerSettings();

    if (nextInLibrary) {
        const response = await requestManager.updateAnime(animeId, { inLibrary: true }).response;

        if (!settings.showAddToLibraryAnimeCategorySelectDialog) {
            return response;
        }

        const categoriesResponse = await requestManager.getAnimeCategoriesBase().response;
        const userCreatedCategories = Categories.getUserCreated(categoriesResponse.data?.categories.nodes ?? []);
        if (!userCreatedCategories.length) {
            return response;
        }

        try {
            await AwaitableComponent.show(AnimeCategorySelect, { animeId, addToLibrary: true });
        } catch (error) {
            if (!isUserCancellationError(error)) {
                throw error;
            }
        }
        return response;
    }

    return requestManager.updateAnime(animeId, {
        inLibrary: false,
        updateAnimeCategories: settings.removeAnimeFromCategories ? { clearCategories: true } : undefined,
    }).response;
};

type AnimeThumbnailInfo = {
    id?: number | string;
    animeId?: number | string;
    anime_id?: number | string;
    thumbnailUrl?: string | null;
    thumbnail_url?: string | null;
    coverUrl?: string | null;
    sourceId?: number | string | null;
    source_id?: number | string | null;
    inLibrary?: boolean;
    in_library?: boolean;
};

export const getAnimeThumbnailUrl = (anime: Partial<AnimeThumbnailInfo>): string => {
    const animeId = anime.id ?? anime.animeId ?? anime.anime_id;
    const sourceId = anime.sourceId ?? anime.source_id;
    const isInLibrary = anime.inLibrary ?? anime.in_library ?? false;
    const primaryThumbnailUrl = anime.thumbnailUrl ?? '';
    const alternateThumbnailUrl = anime.thumbnail_url ?? anime.coverUrl ?? '';
    const primaryLooksRuntimeThumbnail =
        primaryThumbnailUrl.startsWith('/api/') || primaryThumbnailUrl.includes('/api/v1/anime/');
    const alternateLooksResolved =
        alternateThumbnailUrl.startsWith('data:') ||
        alternateThumbnailUrl.startsWith('http://') ||
        alternateThumbnailUrl.startsWith('https://') ||
        alternateThumbnailUrl.startsWith('file://') ||
        (alternateThumbnailUrl.startsWith('/') && !alternateThumbnailUrl.startsWith('/api/'));
    const thumbnailUrl =
        primaryLooksRuntimeThumbnail && alternateLooksResolved
            ? alternateThumbnailUrl
            : primaryThumbnailUrl || alternateThumbnailUrl;
    const fallbackPath = animeId != null ? `/api/v1/anime/${animeId}/thumbnail` : '';
    const looksRuntimeThumbnail = thumbnailUrl.startsWith('/api/') || thumbnailUrl.includes('/api/v1/anime/');
    const shouldUseAnimeThumbnailEndpoint =
        !!fallbackPath &&
        !thumbnailUrl.startsWith('data:') &&
        !thumbnailUrl.startsWith('http://') &&
        !thumbnailUrl.startsWith('https://') &&
        !thumbnailUrl.startsWith('file://') &&
        (isInLibrary || !thumbnailUrl || looksRuntimeThumbnail || sourceId != null);
    const basePath = shouldUseAnimeThumbnailEndpoint ? fallbackPath : thumbnailUrl;
    if (!basePath) {
        return '';
    }

    const params = {
        sourceId: sourceId?.toString(),
    };
    const isAbsolute =
        basePath.startsWith('http://') ||
        basePath.startsWith('https://') ||
        basePath.startsWith('file://') ||
        basePath.startsWith('data:');
    const isLocalPath = basePath.startsWith('/') && !basePath.startsWith('/api/');
    const isRuntimeMediaEndpoint =
        isAbsolute &&
        (basePath.includes('/api/v1/media/') ||
            basePath.includes('/api/v1/anime/') ||
            basePath.includes('/api/v1/extension/icon/') ||
            basePath.includes('/api/v1/track/'));

    if (isRuntimeMediaEndpoint) {
        return requestManager.getValidImgUrlFor(UrlUtil.addParams(basePath, params), '');
    }

    if (isAbsolute || isLocalPath) {
        const proxyUrl = UrlUtil.addParams('/api/v1/media/image', {
            url: basePath,
            ...params,
        });
        return requestManager.getValidImgUrlFor(proxyUrl, '');
    }

    const url = UrlUtil.addParams(basePath, params);
    if (url.startsWith('/api/')) {
        return requestManager.getValidImgUrlFor(url, '');
    }

    return requestManager.getValidImgUrlFor(url);
};
