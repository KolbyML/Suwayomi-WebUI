/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListSubheader from '@mui/material/ListSubheader';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { SettingsTrackerCard } from '@/features/tracker/components/cards/SettingsTrackerCard.tsx';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { useAppTitle } from '@/features/navigation-bar/hooks/useAppTitle.ts';
import { partitionTrackingSettingsTrackers } from '@/features/tracker/TrackingSettings.utils.ts';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { SearchParam } from '@/base/Base.types.ts';
import { openExternalUrl } from '@/Manatan/utils/openExternalUrl.ts';
import { isNativeEnhancedTrackerId } from '@/features/tracker/Tracker.utils.ts';
import {
    getManatanAccountTrackerSettingsUrl,
    MANATAN_TRACKER_ACCOUNT_NOT_CONFIGURED_BODY,
    MANATAN_TRACKER_ACCOUNT_NOT_CONFIGURED_TITLE,
    MANATAN_TRACKER_OPEN_SETTINGS_ACTION,
    MANATAN_TRACKER_SIGN_IN_ACTION,
    MANATAN_TRACKER_SIGN_IN_BODY,
    MANATAN_TRACKER_SIGN_IN_TITLE,
    MANATAN_TRACKING_INFO,
} from '@/Manatan/account/ManatanAccountCopy.ts';

const openAccountTrackerSettings = (url: string) => {
    if (openExternalUrl(url)) {
        return;
    }

    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
        window.location.href = url;
    }
};

export const TrackingSettings = () => {
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const handledRefreshStateRef = useRef(false);
    const [nativeTrackerAuthUpdates, setNativeTrackerAuthUpdates] = useState<
        Record<number, { isLoggedIn: boolean; isTokenExpired: boolean }>
    >({});

    useAppTitle(t('tracking.title'));

    const {
        data,
        loading: areTrackersLoading,
        error: trackersError,
        refetch: refetchTrackersList,
    } = requestManager.useGetTrackersSettings({ notifyOnNetworkStatusChange: true });
    const {
        data: authStatusData,
        loading: isAuthStatusLoading,
        error: authStatusError,
        refetch: refetchAuthStatus,
    } = requestManager.useGetManatanAuthStatus({ notifyOnNetworkStatusChange: true });
    const trackers = (data?.trackers.nodes ?? []).map((tracker) => ({
        ...tracker,
        ...(nativeTrackerAuthUpdates[tracker.id] ?? {}),
    }));
    const {
        data: sourceListData,
        loading: areSourcesLoading,
        error: sourcesError,
        refetch: refetchSourceList,
    } = requestManager.useGetSourceList({ notifyOnNetworkStatusChange: true });
    const {
        data: animeSourceListData,
        loading: areAnimeSourcesLoading,
        error: animeSourcesError,
        refetch: refetchAnimeSourceList,
    } = requestManager.useGetAnimeSourceList({ notifyOnNetworkStatusChange: true });
    const installedSources = sourceListData?.sources.nodes ?? [];
    const installedAnimeSources = animeSourceListData?.animeSources.nodes ?? [];
    const { standardTrackers, enhancedTrackers, availableEnhancedTrackers, unavailableEnhancedTrackers } =
        partitionTrackingSettingsTrackers(trackers, [...installedSources, ...installedAnimeSources]);
    const isManatanAccountConfigured = authStatusData
        ? (authStatusData.accountConfigured ?? !!authStatusData.accountBaseUrl)
        : true;
    const isManatanAuthenticated = !!authStatusData?.authenticated;
    const accountTrackerSettingsUrl = getManatanAccountTrackerSettingsUrl(authStatusData?.accountBaseUrl);
    const loginRedirect = `${AppRoutes.settings.childRoutes.account.path}?${SearchParam.REDIRECT}=${encodeURIComponent(
        AppRoutes.settings.childRoutes.tracking.path,
    )}`;
    const enhancedTrackerInfoParts: string[] = [
        t('tracking.enhanced.info', {
            defaultValue:
                'Provides enhanced features for specific sources. Entries are automatically tracked when added to your library.',
        }),
    ];
    if (unavailableEnhancedTrackers.length > 0) {
        enhancedTrackerInfoParts.push(
            `Available but source not installed: ${unavailableEnhancedTrackers.map((tracker) => tracker.name).join(', ')}`,
        );
    }

    const refetchTrackingState = () => {
        setNativeTrackerAuthUpdates({});
        refetchAuthStatus().catch(defaultPromiseErrorHandler('TrackingSettings::refetchAuthStatus'));
        refetchTrackersList().catch(defaultPromiseErrorHandler('TrackingSettings::refetchTrackersList'));
    };

    useEffect(() => {
        const shouldRefresh = Boolean((location.state as { refreshTrackers?: boolean } | undefined)?.refreshTrackers);
        if (!shouldRefresh || handledRefreshStateRef.current) {
            return;
        }
        handledRefreshStateRef.current = true;
        navigate(
            {
                pathname: location.pathname,
                search: location.search,
                hash: location.hash,
            },
            { replace: true, state: null },
        );
        setNativeTrackerAuthUpdates({});
        refetchTrackersList().catch(defaultPromiseErrorHandler('TrackingSettings::refetchTrackersList'));
    }, [location.hash, location.pathname, location.search, location.state, navigate, refetchTrackersList]);

    useEffect(() => {
        const handleNativeTrackerAuthUpdate = (event: Event) => {
            const { detail } = event as CustomEvent<{
                trackerId?: number;
                isLoggedIn?: boolean;
                isTokenExpired?: boolean;
            }>;
            const trackerId = detail?.trackerId;
            if (typeof trackerId !== 'number') {
                return;
            }

            setNativeTrackerAuthUpdates((prev) => ({
                ...prev,
                [trackerId]: {
                    isLoggedIn: detail?.isLoggedIn ?? true,
                    isTokenExpired: detail?.isTokenExpired ?? false,
                },
            }));
        };

        window.addEventListener('manatan-tracker-auth-updated', handleNativeTrackerAuthUpdate);
        return () => {
            window.removeEventListener('manatan-tracker-auth-updated', handleNativeTrackerAuthUpdate);
        };
    }, []);

    const loading = areTrackersLoading || areSourcesLoading || areAnimeSourcesLoading || isAuthStatusLoading;
    const error = trackersError ?? sourcesError ?? animeSourcesError ?? authStatusError;

    if (error) {
        return (
            <EmptyViewAbsoluteCentered
                message={t('global.error.label.failed_to_load_data')}
                messageExtra={getErrorMessage(error)}
                retry={() => {
                    if (trackersError) {
                        refetchTrackersList().catch(
                            defaultPromiseErrorHandler('TrackingSettings::refetchTrackersList'),
                        );
                    }

                    if (sourcesError) {
                        refetchSourceList().catch(defaultPromiseErrorHandler('TrackingSettings::refetchSourceList'));
                    }

                    if (animeSourcesError) {
                        refetchAnimeSourceList().catch(
                            defaultPromiseErrorHandler('TrackingSettings::refetchAnimeSourceList'),
                        );
                    }

                    if (authStatusError) {
                        refetchAuthStatus().catch(defaultPromiseErrorHandler('TrackingSettings::refetchAuthStatus'));
                    }
                }}
            />
        );
    }

    if (loading) {
        return <LoadingPlaceholder />;
    }

    return (
        <>
            <List
                subheader={
                    <ListSubheader component="div" id="tracking-trackers">
                        {t('tracking.settings.title.trackers')}
                    </ListSubheader>
                }
            >
                <ListItem>
                    <ListItemText
                        secondary={t('tracking.info', {
                            defaultValue: MANATAN_TRACKING_INFO,
                        })}
                    />
                </ListItem>
                {!isManatanAccountConfigured && (
                    <ListItem>
                        <ListItemText
                            primary={t('tracking.settings.account.required.not_configured.title', {
                                defaultValue: MANATAN_TRACKER_ACCOUNT_NOT_CONFIGURED_TITLE,
                            })}
                            secondary={t('tracking.settings.account.required.not_configured.body', {
                                defaultValue: MANATAN_TRACKER_ACCOUNT_NOT_CONFIGURED_BODY,
                            })}
                        />
                    </ListItem>
                )}
                {isManatanAccountConfigured && !isManatanAuthenticated && (
                    <ListItem>
                        <Stack sx={{ gap: 1 }}>
                            <ListItemText
                                primary={t('tracking.settings.account.required.title', {
                                    defaultValue: MANATAN_TRACKER_SIGN_IN_TITLE,
                                })}
                                secondary={t('tracking.settings.account.required.body', {
                                    defaultValue: MANATAN_TRACKER_SIGN_IN_BODY,
                                })}
                            />
                            <Button variant="contained" onClick={() => navigate(loginRedirect)}>
                                {t('tracking.settings.account.required.action', {
                                    defaultValue: MANATAN_TRACKER_SIGN_IN_ACTION,
                                })}
                            </Button>
                        </Stack>
                    </ListItem>
                )}
                {isManatanAuthenticated && (
                    <ListItem>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                            <Button
                                variant="contained"
                                onClick={() => openAccountTrackerSettings(accountTrackerSettingsUrl)}
                            >
                                {t('tracking.settings.account.open', {
                                    defaultValue: MANATAN_TRACKER_OPEN_SETTINGS_ACTION,
                                })}
                            </Button>
                            <Button variant="outlined" onClick={refetchTrackingState}>
                                {t('global.button.refresh', { defaultValue: 'Refresh' })}
                            </Button>
                        </Stack>
                    </ListItem>
                )}
                {standardTrackers.map((tracker) => (
                    <SettingsTrackerCard
                        key={tracker.id}
                        tracker={tracker}
                        accountManaged
                        canManageAccount={isManatanAuthenticated}
                        onManageAccount={() => openAccountTrackerSettings(accountTrackerSettingsUrl)}
                        onAuthChange={() =>
                            refetchTrackersList().catch(
                                defaultPromiseErrorHandler('TrackingSettings::refetchTrackersList'),
                            )
                        }
                    />
                ))}
            </List>
            {enhancedTrackers.length > 0 && (
                <List
                    subheader={
                        <ListSubheader component="div" id="tracking-enhanced-trackers">
                            {t('tracking.enhanced.title', { defaultValue: 'Enhanced trackers' })}
                        </ListSubheader>
                    }
                >
                    <ListItem>
                        <ListItemText secondary={enhancedTrackerInfoParts.join('\n\n')} />
                    </ListItem>
                    {availableEnhancedTrackers.map((tracker) => (
                        <SettingsTrackerCard
                            key={tracker.id}
                            tracker={tracker}
                            directToggle={!isNativeEnhancedTrackerId(tracker.id)}
                            readOnly={isNativeEnhancedTrackerId(tracker.id)}
                            onAuthChange={() =>
                                refetchTrackersList().catch(
                                    defaultPromiseErrorHandler('TrackingSettings::refetchTrackersList'),
                                )
                            }
                        />
                    ))}
                </List>
            )}
        </>
    );
};
