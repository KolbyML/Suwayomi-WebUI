/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useState } from 'react';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Switch from '@mui/material/Switch';
import ListSubheader from '@mui/material/ListSubheader';
import { t as translate } from 'i18next';
import { GlobalUpdateSettings } from '@/features/settings/components/globalUpdate/GlobalUpdateSettings.tsx';
import { makeToast } from '@/base/utils/Toast.ts';
import {
    createUpdateMetadataServerSettings,
    useMetadataServerSettings,
} from '@/features/settings/services/ServerSettingsMetadata.ts';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { Mangas } from '@/features/manga/services/Mangas.ts';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { ListItemLink } from '@/base/components/lists/ListItemLink.tsx';
import { MetadataLibrarySettings } from '@/features/library/Library.types.ts';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { useAppTitle } from '@/features/navigation-bar/hooks/useAppTitle.ts';
import { Categories } from '@/features/category/services/Categories.ts';
import { NovelCategoriesService } from '@/features/novel/categories/services/NovelCategories.ts';

const removeNonLibraryMangasFromCategories = async (): Promise<void> => {
    try {
        const nonLibraryMangas = await requestManager.getMangasBase(
            {
                filter: { inLibrary: { equalTo: false }, categoryId: { isNull: false } },
            },
            { fetchPolicy: 'no-cache' },
        ).response;

        const mangaIdsToRemove = Mangas.getIds(nonLibraryMangas.data?.mangas.nodes ?? []);

        if (mangaIdsToRemove.length) {
            await requestManager.updateMangasCategories(mangaIdsToRemove, {
                clearCategories: true,
            }).response;
        }
        makeToast(translate('library.settings.advanced.database.cleanup.label.success'), 'success');
    } catch (e) {
        makeToast(translate('library.settings.advanced.database.cleanup.label.error'), 'error', getErrorMessage(e));
    }
};

const removeNonLibraryAnimesFromCategories = async (): Promise<void> => {
    try {
        await requestManager.cleanupAnimeCategories().response;
        makeToast('Anime category cleanup completed.', 'success');
    } catch (e) {
        makeToast('Failed to cleanup anime categories.', 'error', getErrorMessage(e));
    }
};

export function LibrarySettings() {
    const { t } = useTranslation();
    const [novelCategoryCount, setNovelCategoryCount] = useState(0);
    const [areNovelCategoriesLoading, setAreNovelCategoriesLoading] = useState(true);
    const [novelCategoriesError, setNovelCategoriesError] = useState<Error | null>(null);

    useAppTitle(t('library.title'));

    const categories = requestManager.useGetCategoriesSettings();
    const animeCategories = requestManager.useGetAnimeCategoriesSettings();
    const serverSettings = requestManager.useGetServerSettings({ notifyOnNetworkStatusChange: true });
    const {
        settings,
        loading: areMetadataServerSettingsLoading,
        request: { error: metadataServerSettingsError, refetch: refetchMetadataServerSettings },
    } = useMetadataServerSettings();

    const setSettingValue = createUpdateMetadataServerSettings<keyof MetadataLibrarySettings>((e) =>
        makeToast(t('search.error.label.failed_to_save_settings'), 'error', getErrorMessage(e)),
    );

    const categoryCount = Categories.getUserCreated(categories.data?.categories.nodes ?? []).length;
    const animeCategoryCount = Categories.getUserCreated(animeCategories.data?.categories.nodes ?? []).length;

    const refetchNovelCategories = useCallback(() => {
        setAreNovelCategoriesLoading(true);
        setNovelCategoriesError(null);

        NovelCategoriesService.getCategories()
            .then((nextCategories) => setNovelCategoryCount(nextCategories.length))
            .catch((e) => setNovelCategoriesError(e instanceof Error ? e : new Error(getErrorMessage(e))))
            .finally(() => setAreNovelCategoriesLoading(false));
    }, []);

    useEffect(() => {
        refetchNovelCategories();
    }, [refetchNovelCategories]);

    const loading =
        serverSettings.loading ||
        areMetadataServerSettingsLoading ||
        categories.loading ||
        animeCategories.loading ||
        areNovelCategoriesLoading;
    if (loading) {
        return <LoadingPlaceholder />;
    }

    const error =
        serverSettings.error ??
        metadataServerSettingsError ??
        categories.error ??
        animeCategories.error ??
        novelCategoriesError;
    if (error) {
        return (
            <EmptyViewAbsoluteCentered
                message={t('global.error.label.failed_to_load_data')}
                messageExtra={getErrorMessage(error)}
                retry={() => {
                    if (serverSettings.error) {
                        serverSettings
                            ?.refetch()
                            .catch(defaultPromiseErrorHandler('LibrarySettings::refetchServerSettings'));
                    }

                    if (metadataServerSettingsError) {
                        refetchMetadataServerSettings().catch(
                            defaultPromiseErrorHandler('LibrarySettings::refetchMetadataServerSettings'),
                        );
                    }

                    if (categories.error) {
                        categories.refetch().catch(defaultPromiseErrorHandler('LibrarySettings::refetchCategories'));
                    }

                    if (animeCategories.error) {
                        animeCategories
                            .refetch()
                            .catch(defaultPromiseErrorHandler('LibrarySettings::refetchAnimeCategories'));
                    }

                    if (novelCategoriesError) {
                        refetchNovelCategories();
                    }
                }}
            />
        );
    }

    return (
        <List sx={{ pt: 0 }}>
            <List
                subheader={
                    <ListSubheader component="div" id="library-manga-category-settings">
                        Manga categories
                    </ListSubheader>
                }
            >
                <ListItemLink to={AppRoutes.settings.childRoutes.categories.path}>
                    <ListItemText
                        primary="Edit manga categories"
                        secondary={t('category.value', { count: categoryCount })}
                    />
                </ListItemLink>
                <ListItem>
                    <ListItemText
                        primary="Category selection dialog"
                        secondary="Show the category selection dialog when adding a manga to the library"
                    />
                    <Switch
                        edge="end"
                        checked={settings.showAddToLibraryCategorySelectDialog}
                        onChange={(e) => setSettingValue('showAddToLibraryCategorySelectDialog', e.target.checked)}
                    />
                </ListItem>
                <ListItem>
                    <ListItemText
                        primary="Forget manga categories"
                        secondary="Remove manga from categories when removing them from the library"
                    />
                    <Switch
                        edge="end"
                        checked={settings.removeMangaFromCategories}
                        onChange={(e) => setSettingValue('removeMangaFromCategories', e.target.checked)}
                    />
                </ListItem>
            </List>
            <List
                subheader={
                    <ListSubheader component="div" id="library-anime-category-settings">
                        Anime categories
                    </ListSubheader>
                }
            >
                <ListItemLink to={AppRoutes.settings.childRoutes.animeCategories.path}>
                    <ListItemText
                        primary="Edit anime categories"
                        secondary={t('category.value', { count: animeCategoryCount })}
                    />
                </ListItemLink>
                <ListItem>
                    <ListItemText
                        primary="Category selection dialog"
                        secondary="Show the category selection dialog when adding an anime to the library"
                    />
                    <Switch
                        edge="end"
                        checked={settings.showAddToLibraryAnimeCategorySelectDialog}
                        onChange={(e) => setSettingValue('showAddToLibraryAnimeCategorySelectDialog', e.target.checked)}
                    />
                </ListItem>
                <ListItem>
                    <ListItemText
                        primary="Forget anime categories"
                        secondary="Remove anime from categories when removing them from the library"
                    />
                    <Switch
                        edge="end"
                        checked={settings.removeAnimeFromCategories}
                        onChange={(e) => setSettingValue('removeAnimeFromCategories', e.target.checked)}
                    />
                </ListItem>
            </List>
            <List
                subheader={
                    <ListSubheader component="div" id="library-novel-category-settings">
                        Novel categories
                    </ListSubheader>
                }
            >
                <ListItemLink to={AppRoutes.settings.childRoutes.novelCategories.path}>
                    <ListItemText
                        primary="Edit novel categories"
                        secondary={t('category.value', { count: novelCategoryCount })}
                    />
                </ListItemLink>
            </List>
            <List
                subheader={
                    <ListSubheader component="div" id="library-general-settings">
                        {t('global.label.general')}
                    </ListSubheader>
                }
            >
                <ListItem>
                    <ListItemText
                        primary={t('library.settings.general.search.ignore_filters.label.title')}
                        secondary={t('library.settings.general.search.ignore_filters.label.description')}
                    />
                    <Switch
                        edge="end"
                        checked={settings.ignoreFilters}
                        onChange={(e) => setSettingValue('ignoreFilters', e.target.checked)}
                    />
                </ListItem>
            </List>
            <GlobalUpdateSettings
                serverSettings={serverSettings.data!.settings}
                mangaCategories={categories.data!.categories.nodes}
                animeCategories={animeCategories.data!.categories.nodes}
            />
            <List
                subheader={
                    <ListSubheader component="div" id="library-advanced">
                        {t('global.label.advanced')}
                    </ListSubheader>
                }
            >
                <ListSubheader component="div" id="library-advanced-manga" disableSticky>
                    Manga advanced
                </ListSubheader>
                <ListItemButton onClick={() => removeNonLibraryMangasFromCategories()}>
                    <ListItemText
                        primary="Cleanup manga categories"
                        secondary="Remove non library manga from categories"
                    />
                </ListItemButton>
                <ListItemLink to={AppRoutes.settings.childRoutes.library.childRoutes.duplicates.path}>
                    <ListItemText
                        primary="Manga duplicated entries"
                        secondary="Show all duplicated manga entries in your library"
                    />
                </ListItemLink>
                <ListSubheader component="div" id="library-advanced-anime" disableSticky>
                    Video advanced
                </ListSubheader>
                <ListItemButton onClick={() => removeNonLibraryAnimesFromCategories()}>
                    <ListItemText
                        primary="Cleanup video categories"
                        secondary="Remove non-library videos from categories"
                    />
                </ListItemButton>
                <ListItemLink to={AppRoutes.settings.childRoutes.library.childRoutes.animeDuplicates.path}>
                    <ListItemText
                        primary="Video duplicated entries"
                        secondary="Show all duplicated video entries in your library"
                    />
                </ListItemLink>
            </List>
        </List>
    );
}
