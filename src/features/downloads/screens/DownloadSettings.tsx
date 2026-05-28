/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useTranslation } from 'react-i18next';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Switch from '@mui/material/Switch';
import ListSubheader from '@mui/material/ListSubheader';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { useEffect, useState } from 'react';
import { TextSetting } from '@/base/components/settings/text/TextSetting.tsx';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { DownloadAheadSetting } from '@/features/downloads/components/DownloadAheadSetting.tsx';
import {
    createUpdateMetadataServerSettings,
    useMetadataServerSettings,
} from '@/features/settings/services/ServerSettingsMetadata.ts';
import { makeToast } from '@/base/utils/Toast.ts';
import { DeleteChaptersWhileReadingSetting } from '@/features/downloads/components/DeleteChaptersWhileReadingSetting.tsx';
import { CategoriesInclusionSetting } from '@/features/category/components/CategoriesInclusionSetting.tsx';
import { NumberSetting } from '@/base/components/settings/NumberSetting.tsx';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { MetadataDownloadSettings } from '@/features/downloads/Downloads.types.ts';
import { ServerSettings } from '@/features/settings/Settings.types.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { useAppTitle } from '@/features/navigation-bar/hooks/useAppTitle.ts';
import { ListItemLink } from '@/base/components/lists/ListItemLink.tsx';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { useAndroidStorageStatus } from '@/Manatan/hooks/useAndroidStorageStatus.ts';
import {
    canUseNativeDownloadFolderPicker,
    NativeDownloadFolderPickerWindow,
    pickNativeDownloadFolder,
} from '@/features/downloads/services/DownloadFolderPicker.ts';

type DownloadSettingsType = Pick<
    ServerSettings,
    | 'downloadAsCbz'
    | 'downloadsPath'
    | 'autoDownloadNewChapters'
    | 'autoDownloadNewChaptersLimit'
    | 'excludeEntryWithUnreadChapters'
    | 'autoDownloadIgnoreReUploads'
    | 'downloadConversions'
>;

type SystemVersionResponse = {
    variant?: string;
};

type SelectFolderResponse = {
    path?: string | null;
};

export const DownloadSettings = () => {
    const { t } = useTranslation();
    const [canUseServerFolderPicker, setCanUseServerFolderPicker] = useState(false);
    const [canUseNativeFolderPicker, setCanUseNativeFolderPicker] = useState(false);

    useAppTitle(t('download.title.download'));

    useEffect(() => {
        const controller = new AbortController();
        const nativeWindow = window as NativeDownloadFolderPickerWindow;
        setCanUseNativeFolderPicker(canUseNativeDownloadFolderPicker(nativeWindow));

        fetch('/api/system/version', { signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) {
                    return null;
                }

                return (await response.json()) as SystemVersionResponse;
            })
            .then((version) => {
                setCanUseServerFolderPicker(version?.variant === 'desktop');
            })
            .catch(() => {
                if (!controller.signal.aborted) {
                    setCanUseServerFolderPicker(false);
                }
            });

        return () => controller.abort();
    }, []);

    const categories = requestManager.useGetCategoriesSettings();
    const animeCategories = requestManager.useGetAnimeCategoriesSettings();
    const serverSettings = requestManager.useGetServerSettings({ notifyOnNetworkStatusChange: true });
    const [mutateSettings] = requestManager.useUpdateServerSettings();
    const {
        settings: metadataSettings,
        loading: areMetadataServerSettingsLoading,
        request: { error: metadataServerSettingsError, refetch: refetchMetadataServerSettings },
    } = useMetadataServerSettings();
    const { status: androidStorageStatus, requestStorageAccess } = useAndroidStorageStatus();

    const loading =
        serverSettings.loading || areMetadataServerSettingsLoading || categories.loading || animeCategories.loading;
    if (loading) {
        return <LoadingPlaceholder />;
    }

    const error = serverSettings.error ?? metadataServerSettingsError ?? categories.error ?? animeCategories.error;
    if (error) {
        return (
            <EmptyViewAbsoluteCentered
                message={t('global.error.label.failed_to_load_data')}
                messageExtra={getErrorMessage(error)}
                retry={() => {
                    if (serverSettings.error) {
                        serverSettings
                            .refetch()
                            .catch(defaultPromiseErrorHandler('DownloadSettings::refetchServerSettings'));
                    }

                    if (metadataServerSettingsError) {
                        refetchMetadataServerSettings().catch(
                            defaultPromiseErrorHandler('refetchMetadataServerSettings::'),
                        );
                    }

                    if (categories.error) {
                        categories.refetch().catch(defaultPromiseErrorHandler('LibrarySettings::refetchCategories'));
                    }

                    if (animeCategories.error) {
                        animeCategories
                            .refetch()
                            .catch(defaultPromiseErrorHandler('DownloadSettings::refetchAnimeCategories'));
                    }
                }}
            />
        );
    }

    const downloadSettings = serverSettings.data!.settings;

    const updateSetting = <Setting extends keyof DownloadSettingsType>(
        setting: Setting,
        value: DownloadSettingsType[Setting],
    ): Promise<any> => {
        const mutation = mutateSettings({ variables: { input: { settings: { [setting]: value } } } });
        mutation.catch((e) => makeToast(t('global.error.label.failed_to_save_changes'), 'error', getErrorMessage(e)));

        return mutation;
    };

    const updateMetadataSetting = createUpdateMetadataServerSettings<keyof MetadataDownloadSettings>((e) =>
        makeToast(t('global.error.label.failed_to_save_changes'), 'error', getErrorMessage(e)),
    );

    const pickDownloadFolder = async () => {
        const response = await fetch('/api/system/select-folder', { method: 'POST' });
        if (!response.ok) {
            throw new Error(t('global.error.label.failed_to_load_data'));
        }

        const payload = (await response.json()) as SelectFolderResponse;
        return payload.path ?? null;
    };

    const pickDownloadFolderForPlatform = () => {
        if (canUseNativeFolderPicker) {
            return pickNativeDownloadFolder({
                nativeWindow: window as NativeDownloadFolderPickerWindow,
                errorMessage: t('global.error.label.failed_to_load_data'),
            });
        }

        if (canUseServerFolderPicker) {
            return pickDownloadFolder();
        }

        return null;
    };

    const canUseFolderPicker = canUseNativeFolderPicker || canUseServerFolderPicker;

    return (
        <List sx={{ pt: 0 }}>
            {androidStorageStatus?.requiresStorageAccessForPublicFolders && (
                <Alert
                    severity="info"
                    sx={{ m: 2, mb: 1 }}
                    action={
                        <Button color="inherit" size="small" onClick={requestStorageAccess}>
                            Grant
                        </Button>
                    }
                >
                    Downloads are saved in app storage until Android storage access is granted. Grant access to use{' '}
                    {androidStorageStatus.publicDownloadsPath ?? '/storage/emulated/0/Manatan/downloads'}.
                </Alert>
            )}
            <TextSetting
                settingName={t('download.settings.download_path.label.title')}
                dialogDescription={t('download.settings.download_path.label.description')}
                value={downloadSettings?.downloadsPath}
                settingDescription={
                    downloadSettings?.downloadsPath.length ? downloadSettings.downloadsPath : t('global.label.default')
                }
                handleChange={(path) => updateSetting('downloadsPath', path)}
                onUseDefaultValue={() => ''}
                defaultValueButtonTitle={t('global.label.default')}
                onPickValue={canUseFolderPicker ? pickDownloadFolderForPlatform : undefined}
                pickValueButtonTitle={t('global.button.browse', { defaultValue: 'Browse' })}
            />
            <ListItem>
                <ListItemText primary={t('download.settings.file_type.label.cbz')} />
                <Switch
                    edge="end"
                    checked={!!downloadSettings?.downloadAsCbz}
                    onChange={(e) => updateSetting('downloadAsCbz', e.target.checked)}
                />
            </ListItem>
            <ListItemLink to={AppRoutes.settings.childRoutes.images.childRoutes.processingDownloads.path}>
                <ListItemText primary={t('download.settings.conversion.title')} />
            </ListItemLink>
            <List
                subheader={
                    <ListSubheader component="div" id="download-settings-auto-delete-downloads">
                        {t('download.settings.delete_chapters.title')}
                    </ListSubheader>
                }
            >
                <ListItem>
                    <ListItemText primary={t('download.settings.delete_chapters.label.manually_marked_as_read')} />
                    <Switch
                        edge="end"
                        checked={metadataSettings.deleteChaptersManuallyMarkedRead}
                        onChange={(e) => updateMetadataSetting('deleteChaptersManuallyMarkedRead', e.target.checked)}
                    />
                </ListItem>
                <DeleteChaptersWhileReadingSetting
                    chapterToDelete={metadataSettings.deleteChaptersWhileReading}
                    handleChange={(chapterToDelete) =>
                        updateMetadataSetting('deleteChaptersWhileReading', chapterToDelete)
                    }
                />
                <ListItem>
                    <ListItemText primary={t('download.settings.delete_chapters.label.allow_deletion_of_bookmarked')} />
                    <Switch
                        edge="end"
                        checked={metadataSettings.deleteChaptersWithBookmark}
                        onChange={(e) => updateMetadataSetting('deleteChaptersWithBookmark', e.target.checked)}
                    />
                </ListItem>
            </List>
            <List
                subheader={
                    <ListSubheader component="div" id="download-settings-auto-download">
                        {t('download.settings.auto_download.title')}
                    </ListSubheader>
                }
            >
                <ListItem>
                    <ListItemText primary={t('download.settings.auto_download.label.new_chapters')} />
                    <Switch
                        edge="end"
                        checked={!!downloadSettings?.autoDownloadNewChapters}
                        onChange={(e) => updateSetting('autoDownloadNewChapters', e.target.checked)}
                    />
                </ListItem>
                <NumberSetting
                    disabled={!downloadSettings?.autoDownloadNewChapters}
                    settingTitle={t('download.settings.auto_download.download_limit.label.title')}
                    dialogDescription={t('download.settings.auto_download.download_limit.label.description')}
                    value={downloadSettings?.autoDownloadNewChaptersLimit ?? 0}
                    settingValue={
                        !downloadSettings.autoDownloadNewChaptersLimit
                            ? t('global.label.none')
                            : t('download.settings.download_ahead.label.value', {
                                  chapters: downloadSettings.autoDownloadNewChaptersLimit,
                                  count: downloadSettings.autoDownloadNewChaptersLimit,
                              })
                    }
                    defaultValue={0}
                    minValue={0}
                    maxValue={20}
                    showSlider
                    valueUnit={t('chapter.title_one')}
                    handleUpdate={(autoDownloadNewChaptersLimit) =>
                        updateSetting('autoDownloadNewChaptersLimit', autoDownloadNewChaptersLimit)
                    }
                />
                <ListItem>
                    <ListItemText primary={t('download.settings.auto_download.label.ignore_with_unread_chapters')} />
                    <Switch
                        edge="end"
                        checked={!!downloadSettings?.excludeEntryWithUnreadChapters}
                        onChange={(e) => updateSetting('excludeEntryWithUnreadChapters', e.target.checked)}
                        disabled={!downloadSettings?.autoDownloadNewChapters}
                    />
                </ListItem>
                <ListItem>
                    <ListItemText primary={t('download.settings.auto_download.label.ignore_re_uploads')} />
                    <Switch
                        edge="end"
                        checked={!!downloadSettings?.autoDownloadIgnoreReUploads}
                        onChange={(e) => updateSetting('autoDownloadIgnoreReUploads', e.target.checked)}
                        disabled={!downloadSettings?.autoDownloadNewChapters}
                    />
                </ListItem>
                <CategoriesInclusionSetting
                    title="Manga categories"
                    categories={categories.data!.categories.nodes}
                    includeField="includeInDownload"
                    dialogText={t('download.settings.auto_download.categories.label.include_in_download')}
                />
                <CategoriesInclusionSetting
                    title="Anime categories"
                    categories={animeCategories.data!.categories.nodes}
                    includeField="includeInDownload"
                    dialogText={t('download.settings.auto_download.categories.label.include_in_download')}
                    updateCategory={(category) =>
                        requestManager.updateAnimeCategory(category.id, {
                            includeInDownload: category.includeInDownload,
                        }).response
                    }
                />
            </List>
            <List
                subheader={
                    <ListSubheader component="div" id="download-settings-download-ahead">
                        {t('download.settings.download_ahead.title')}
                    </ListSubheader>
                }
            >
                <DownloadAheadSetting downloadAheadLimit={metadataSettings.downloadAheadLimit} />
            </List>
        </List>
    );
};
