/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fromEvent } from 'file-selector';
import IconButton from '@mui/material/IconButton';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useWindowEvent } from '@mantine/hooks';
import { StringParam, useQueryParam } from 'use-query-params';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { AppbarSearch } from '@/base/components/AppbarSearch.tsx';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { makeToast } from '@/base/utils/Toast.ts';
import { LanguageSelect } from '@/base/components/inputs/LanguageSelect.tsx';
import { StyledGroupedVirtuoso } from '@/base/components/virtuoso/StyledGroupedVirtuoso.tsx';
import { StyledGroupHeader } from '@/base/components/virtuoso/StyledGroupHeader.tsx';
import { StyledGroupItemWrapper } from '@/base/components/virtuoso/StyledGroupItemWrapper.tsx';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { VirtuosoUtil } from '@/lib/virtuoso/Virtuoso.util.tsx';
import {
    groupExtensionsByLanguage,
    getLanguagesFromExtensions,
    translateExtensionLanguage,
    filterExtensions,
} from '@/features/extension/Extensions.utils.ts';
import {
    ExtensionAction,
    ExtensionGroupState,
    ExtensionState,
    TExtension,
} from '@/features/extension/Extensions.types.ts';
import { EXTENSION_ACTION_TO_FAILURE_TRANSLATION_KEY_MAP } from '@/features/extension/Extensions.constants.ts';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import {
    createUpdateMetadataServerSettings,
    useMetadataServerSettings,
} from '@/features/settings/services/ServerSettingsMetadata.ts';
import { MetadataBrowseSettings } from '@/features/browse/Browse.types.ts';
import { useAppAction } from '@/features/navigation-bar/hooks/useAppAction.ts';
import { SearchParam } from '@/base/Base.types.ts';
import { AnimeExtensionCard, AnimeExtensionInfo } from '@/features/browse/extensions/components/AnimeExtensionCard.tsx';
import { filterBrowsableAnimeExtensions } from '@/features/browse/extensions/animeExtensionFilter.ts';
import { useTransientResumeRetry } from '@/base/hooks/useTransientResumeRetry.ts';
import { useOCR } from '@/Manatan/context/OCRContext.tsx';
import { resolveBrowseLanguages } from '@/features/source/services/SourceLanguageDefaults.ts';
import { doesMetadataKeyExistIn } from '@/features/metadata/Metadata.utils.ts';

const LANGUAGE = 0;
const EXTENSIONS = 1;

export function AnimeExtensions({ tabsMenuHeight }: { tabsMenuHeight: number }) {
    const { t } = useTranslation();

    const {
        metadata,
        settings: { animeSourceLanguages, showNsfw },
    } = useMetadataServerSettings();
    const {
        settings: { yomitanLanguage },
    } = useOCR();
    const updateMetadataServerSettings = useMemo(
        () =>
            createUpdateMetadataServerSettings<
                keyof Pick<MetadataBrowseSettings, 'animeSourceLanguages' | 'animeExtensionLanguages'>
            >((e) => makeToast(t('global.error.label.failed_to_save_changes'), 'error', getErrorMessage(e))),
        [t],
    );
    const hasSavedAnimeSourceLanguages = useMemo(
        () => doesMetadataKeyExistIn(metadata, 'animeSourceLanguages'),
        [metadata],
    );
    const shownLangs = useMemo(
        () =>
            resolveBrowseLanguages({
                configuredLanguages: animeSourceLanguages,
                hasExplicitLanguageSetting: hasSavedAnimeSourceLanguages,
                yomitanLanguage,
            }),
        [animeSourceLanguages, hasSavedAnimeSourceLanguages, yomitanLanguage],
    );
    const setShownLangs = useCallback(
        (languages: string[]) => {
            updateMetadataServerSettings('animeSourceLanguages', languages);
            updateMetadataServerSettings('animeExtensionLanguages', languages);
        },
        [updateMetadataServerSettings],
    );

    const [query] = useQueryParam(SearchParam.QUERY, StringParam);

    const [refetchExtensions, setRefetchExtensions] = useState({});
    const [updatingExtensionIds, setUpdatingExtensionIds] = useState<string[]>([]);

    const {
        data: serverSettingsData,
        loading: areServerSettingsLoading,
        error: serverSettingsError,
        refetch: refetchServerSettings,
    } = requestManager.useGetServerSettings({ notifyOnNetworkStatusChange: true });
    const [fetchExtensions, { data, loading: areExtensionsLoading, error: extensionsError }] =
        requestManager.useAnimeExtensionListFetch();

    const animeExtensionRepos = (serverSettingsData?.settings as { animeExtensionRepos?: string[] })
        ?.animeExtensionRepos;
    const areMultipleReposInUse = (animeExtensionRepos?.length ?? 0) > 1;

    const isLoading = areServerSettingsLoading || areExtensionsLoading;
    const error = serverSettingsError ?? extensionsError;
    const refreshPageData = useCallback(() => {
        refetchServerSettings().catch(defaultPromiseErrorHandler('AnimeExtensions::refetchServerSettings'));
        fetchExtensions().catch(defaultPromiseErrorHandler('AnimeExtensions::refetchExtensions'));
        setRefetchExtensions({});
    }, [fetchExtensions, refetchServerSettings]);
    const { shouldSuppressError } = useTransientResumeRetry({
        hasError: Boolean(error),
        hasData: Boolean(data?.fetchAnimeExtensions?.extensions.length),
        retry: refreshPageData,
    });

    useEffect(() => {
        fetchExtensions();
    }, [refetchExtensions]);

    const allExtensions = data?.fetchAnimeExtensions?.extensions;
    const repoExtensions = useMemo(
        () => filterBrowsableAnimeExtensions(allExtensions ?? []),
        [allExtensions],
    ) as AnimeExtensionInfo[];
    const allLangs = useMemo(() => getLanguagesFromExtensions(repoExtensions), [repoExtensions]);
    const hasAnyLoadedExtensions = repoExtensions.length > 0;
    const showPartialLoadError = Boolean(error && hasAnyLoadedExtensions);
    const hasBlockingError = Boolean(error && !hasAnyLoadedExtensions);
    const filteredExtensions = useMemo(
        () => filterExtensions(repoExtensions, { selectedLanguages: shownLangs, showNsfw, query }),
        [repoExtensions, shownLangs, showNsfw, query],
    ) as AnimeExtensionInfo[];

    const groupedExtensions = useMemo(
        () => groupExtensionsByLanguage(filteredExtensions as TExtension[]),
        [filteredExtensions],
    );
    const groupCounts = useMemo(
        () => groupedExtensions.map((extensionGroup) => extensionGroup[EXTENSIONS].length),
        [groupedExtensions],
    );
    const visibleExtensions = useMemo(
        () => groupedExtensions.map(([, extensionsOfLanguage]) => extensionsOfLanguage).flat(1) as AnimeExtensionInfo[],
        [groupedExtensions],
    );

    const computeItemKey = VirtuosoUtil.useCreateGroupedComputeItemKey(
        groupCounts,
        useCallback((index) => groupedExtensions[index][LANGUAGE], [groupedExtensions]),
        useCallback(
            (index) => `${visibleExtensions[index].pkgName}::${visibleExtensions[index].repo ?? ''}`,
            [visibleExtensions],
        ),
    );

    const handleExtensionUpdate = useCallback(() => setRefetchExtensions({}), []);

    const submitExternalExtension = (file: File) => {
        if (!file.name.toLowerCase().endsWith('apk')) {
            makeToast(t('global.error.label.invalid_file_type'), 'error');
            return;
        }

        makeToast(t('extension.label.installing_file'), 'info');

        requestManager
            .installExternalAnimeExtension(file)
            .response.then(() => {
                handleExtensionUpdate();
                makeToast(t('extension.label.installed_successfully'), 'success');
            })
            .catch((e) => makeToast(t('extension.label.installation_failed'), 'error', getErrorMessage(e)));
    };

    useAppAction(
        <>
            <AppbarSearch />
            <CustomTooltip title={t('extension.action.label.install_external')}>
                <IconButton
                    onClick={() => {
                        const input = document.createElement('input');
                        input.style.display = 'none';
                        input.type = 'file';
                        input.onchange = () => {
                            const file = input.files?.[0];
                            if (file) {
                                submitExternalExtension(file);
                            }
                        };

                        document.documentElement.appendChild(input);
                        input.click();
                        document.documentElement.removeChild(input);
                    }}
                    color="inherit"
                >
                    <AddIcon />
                </IconButton>
            </CustomTooltip>

            <LanguageSelect
                selectedLanguages={shownLangs}
                setSelectedLanguages={setShownLangs}
                languages={allLangs}
                iconButtonEdge={false}
            />

            <CustomTooltip title={t('global.button.refresh')}>
                <IconButton color="inherit" onClick={handleExtensionUpdate}>
                    <RefreshIcon />
                </IconButton>
            </CustomTooltip>
        </>,
        [allLangs, handleExtensionUpdate, setShownLangs, shownLangs, t],
    );

    useWindowEvent('drop', async (e) => {
        e.preventDefault();
        const files = await fromEvent(e);
        submitExternalExtension(files[0] as File);
    });
    useWindowEvent('dragover', (e) => {
        e.preventDefault();
    });

    if (isLoading) {
        return <LoadingPlaceholder />;
    }

    if (hasBlockingError && !shouldSuppressError) {
        return (
            <EmptyViewAbsoluteCentered
                message={t('global.error.label.failed_to_load_data')}
                messageExtra={getErrorMessage(error)}
                retry={refreshPageData}
            />
        );
    }

    if (hasBlockingError && shouldSuppressError) {
        return <LoadingPlaceholder />;
    }

    if (!repoExtensions.length) {
        return (
            <Stack
                sx={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    rowGap: '10px',
                    paddingTop: '20px',
                }}
            >
                <Typography>{t('extension.label.add_repository_info')}</Typography>
                <Button component={Link} variant="contained" to={AppRoutes.settings.childRoutes.browse.path}>
                    {t('settings.title')}
                </Button>
            </Stack>
        );
    }

    return (
        <Stack sx={{ height: '100%' }}>
            {showPartialLoadError && (
                <Alert
                    severity="error"
                    sx={{ m: 1, mb: 0 }}
                    action={
                        <Button color="inherit" size="small" onClick={refreshPageData}>
                            {t('global.button.retry')}
                        </Button>
                    }
                >
                    <AlertTitle>{t('global.error.label.failed_to_load_data')}</AlertTitle>
                    {getErrorMessage(error)}
                </Alert>
            )}

            <StyledGroupedVirtuoso
                persistKey="anime-extensions"
                heightToSubtract={tabsMenuHeight + (showPartialLoadError ? 68 : 0)}
                overscan={window.innerHeight * 0.5}
                groupCounts={groupCounts}
                groupContent={(index) => {
                    const [groupName, groupExtensions] = groupedExtensions[index];
                    const isUpdateGroup = groupName === ExtensionGroupState.UPDATE_PENDING;

                    return (
                        <StyledGroupHeader
                            key={groupName}
                            isFirstItem={index === 0}
                            sx={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', pr: 1 }}
                        >
                            <Typography variant="h5" component="h2">
                                {translateExtensionLanguage(groupName)}
                            </Typography>
                            {isUpdateGroup && (
                                <Button
                                    disabled={!!updatingExtensionIds.length}
                                    variant="contained"
                                    onClick={async () => {
                                        const ids = groupExtensions.map((extension) => extension.pkgName);
                                        setUpdatingExtensionIds(ids);

                                        try {
                                            await requestManager.updateAnimeExtensions(ids, { update: true }).response;
                                            handleExtensionUpdate();
                                        } catch (e) {
                                            makeToast(
                                                t(
                                                    EXTENSION_ACTION_TO_FAILURE_TRANSLATION_KEY_MAP[
                                                        ExtensionAction.UPDATE
                                                    ],
                                                    {
                                                        count: ids.length,
                                                    },
                                                ),
                                                'error',
                                                getErrorMessage(e),
                                            );
                                        } finally {
                                            setUpdatingExtensionIds([]);
                                        }
                                    }}
                                >
                                    {t('extension.action.label.update_all')}
                                </Button>
                            )}
                        </StyledGroupHeader>
                    );
                }}
                computeItemKey={computeItemKey}
                itemContent={(index) => {
                    const item = visibleExtensions[index];

                    return (
                        <StyledGroupItemWrapper>
                            <AnimeExtensionCard
                                extension={item as AnimeExtensionInfo}
                                handleUpdate={handleExtensionUpdate}
                                showSourceRepo={areMultipleReposInUse}
                                forcedState={
                                    updatingExtensionIds.includes(item.pkgName) ? ExtensionState.UPDATING : undefined
                                }
                            />
                        </StyledGroupItemWrapper>
                    );
                }}
            />
        </Stack>
    );
}
