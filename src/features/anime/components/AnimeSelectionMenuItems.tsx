/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Done from '@mui/icons-material/Done';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import FavoriteIcon from '@mui/icons-material/Favorite';
import Label from '@mui/icons-material/Label';
import RemoveDone from '@mui/icons-material/RemoveDone';
import SyncIcon from '@mui/icons-material/Sync';
import { AwaitableComponent } from 'awaitable-component';
import { useTranslation } from 'react-i18next';
import { MenuItem } from '@/base/components/menu/MenuItem.tsx';
import { AnimeCategorySelect } from '@/features/category/components/AnimeCategorySelect.tsx';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { HttpMethod } from '@/lib/requests/client/RestClient.ts';

type AnimeSelectionEntry = {
    id: number;
    inLibrary?: boolean;
};

type Props = {
    animes: AnimeSelectionEntry[];
    onClose: () => void;
    onLibraryChange?: () => void;
};

export const AnimeSelectionMenuItems = ({ animes, onClose, onLibraryChange }: Props) => {
    const { t } = useTranslation();
    const animeIds = animes.map((anime) => anime.id);
    const anyInLibrary = animes.some((anime) => !!anime.inLibrary);
    const anyNotInLibrary = animes.some((anime) => !anime.inLibrary);

    const handleUpdate = async () => {
        await Promise.all(
            animeIds.flatMap((animeId) => [
                requestManager.getClient().fetcher(`/api/v1/anime/${animeId}?onlineFetch=true`),
                requestManager.getClient().fetcher(`/api/v1/anime/${animeId}/episodes?onlineFetch=true`),
            ]),
        );
    };

    const handleMarkAll = async (isRead: boolean) => {
        const episodeBatches = await Promise.all(
            animeIds.map(async (animeId) => {
                const response = await requestManager.getClient().fetcher(`/api/v1/anime/${animeId}/episodes`);
                const episodes = (await response.json()) as Array<{ id: number }>;
                return { animeId, episodeIds: episodes.map((episode) => episode.id) };
            }),
        );

        await Promise.all(
            episodeBatches
                .filter((batch) => batch.episodeIds.length > 0)
                .map((batch) =>
                    requestManager.getClient().fetcher('/api/v1/anime/episode/batch', {
                        httpMethod: HttpMethod.POST,
                        data: {
                            ids: batch.episodeIds,
                            patch: { isRead },
                            animeId: batch.animeId,
                        },
                        checkResponseIsJson: false,
                    }),
                ),
        );
    };

    const handleToggleLibrary = async (nextInLibrary: boolean) => {
        await requestManager.updateAnimes(animeIds, { inLibrary: nextInLibrary }).response;
        onLibraryChange?.();
    };

    return (
        <>
            <MenuItem
                Icon={SyncIcon}
                onClick={async () => {
                    await handleUpdate();
                    onClose();
                }}
                title={t('global.button.refresh')}
            />
            <MenuItem
                Icon={Done}
                onClick={async () => {
                    await handleMarkAll(true);
                    onClose();
                }}
                title="Mark all as watched"
            />
            <MenuItem
                Icon={RemoveDone}
                onClick={async () => {
                    await handleMarkAll(false);
                    onClose();
                }}
                title="Mark all as unwatched"
            />
            <MenuItem
                Icon={Label}
                onClick={() => {
                    AwaitableComponent.show(AnimeCategorySelect, { animeIds });
                    onClose();
                }}
                title="Edit anime categories"
            />
            {anyNotInLibrary && (
                <MenuItem
                    Icon={FavoriteBorderIcon}
                    onClick={async () => {
                        await handleToggleLibrary(true);
                        onClose();
                    }}
                    title={t('manga.button.add_to_library')}
                />
            )}
            {anyInLibrary && (
                <MenuItem
                    Icon={FavoriteIcon}
                    onClick={async () => {
                        await handleToggleLibrary(false);
                        onClose();
                    }}
                    title={t('manga.action.library.remove.label.action')}
                />
            )}
        </>
    );
};
