/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useTranslation } from 'react-i18next';
import { useMemo, useState } from 'react';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Switch from '@mui/material/Switch';
import ListSubheader from '@mui/material/ListSubheader';
import { d } from 'koration';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { TextSetting } from '@/base/components/settings/text/TextSetting.tsx';
import { NumberSetting } from '@/base/components/settings/NumberSetting.tsx';
import { SelectSetting } from '@/base/components/settings/SelectSetting.tsx';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import {
    createUpdateMetadataServerSettings,
    useMetadataServerSettings,
} from '@/features/settings/services/ServerSettingsMetadata.ts';
import { makeToast } from '@/base/utils/Toast.ts';
import { MetadataUpdateSettings } from '@/features/app-updates/AppUpdateChecker.types.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { useAppTitle } from '@/features/navigation-bar/hooks/useAppTitle.ts';
import { AuthMode } from '@/lib/requests/types.ts';
import {
    AUTH_MODES_SELECT_VALUES,
    JWT_ACCESS_TOKEN_EXPIRY,
    JWT_REFRESH_TOKEN_EXPIRY,
} from '@/features/settings/Settings.constants.ts';
import { ServerAddressSetting } from '@/features/settings/components/ServerAddressSetting.tsx';
import { AuthManager } from '@/features/authentication/AuthManager.ts';
import { ServerSettings as ServerSettingsType } from '@/features/settings/Settings.types.ts';
import { shareDebugInfo } from '@/features/settings/utils/shareDebugInfo.ts';

export const ServerSettings = () => {
    const { t } = useTranslation();
    const [isSharingDebugInfo, setIsSharingDebugInfo] = useState(false);

    useAppTitle(t('settings.server.title.server'));

    const {
        settings: { serverInformAvailableUpdate },
        loading: areMetadataServerSettingsLoading,
        request: { error: metadataServerSettingsError, refetch: refetchServerMetadataSettings },
    } = useMetadataServerSettings();
    const updateMetadataServerSettings = createUpdateMetadataServerSettings<
        keyof Pick<MetadataUpdateSettings, 'serverInformAvailableUpdate'>
    >((e) => makeToast(t('global.error.label.failed_to_save_changes'), 'error', getErrorMessage(e)));

    const {
        data,
        loading: areServerSettingsLoading,
        error: serverSettingsError,
        refetch: refetchServerSettings,
    } = requestManager.useGetServerSettings({
        notifyOnNetworkStatusChange: true,
    });
    const [mutateSettings] = requestManager.useUpdateServerSettings();

    const updateSetting = async <Setting extends keyof ServerSettingsType>(
        setting: Setting,
        value: ServerSettingsType[Setting],
        onCompletion?: (success: boolean) => void,
    ) => {
        try {
            await mutateSettings({ variables: { input: { settings: { [setting]: value } as any } } });
            onCompletion?.(true);
        } catch (e) {
            makeToast(t('global.error.label.failed_to_save_changes'), 'error', getErrorMessage(e));
            onCompletion?.(false);
        }
    };

    const handleShareDebugInfo = async () => {
        if (isSharingDebugInfo) {
            return;
        }

        setIsSharingDebugInfo(true);
        try {
            await shareDebugInfo(t);
        } finally {
            setIsSharingDebugInfo(false);
        }
    };

    const localSettings = useMemo(
        () => (
            <List
                subheader={
                    <ListSubheader component="div" id="server-settings-client">
                        {t('global.label.client')}
                    </ListSubheader>
                }
            >
                <ServerAddressSetting />
                <ListItem>
                    <ListItemText
                        primary={t('global.update.settings.inform.label.title')}
                        secondary={t('global.update.settings.inform.label.description')}
                    />
                    <Switch
                        edge="end"
                        checked={serverInformAvailableUpdate}
                        onChange={(e) => updateMetadataServerSettings('serverInformAvailableUpdate', e.target.checked)}
                    />
                </ListItem>
            </List>
        ),
        [serverInformAvailableUpdate],
    );

    const loading = areMetadataServerSettingsLoading || areServerSettingsLoading;
    if (loading) {
        return (
            <>
                {localSettings}
                <LoadingPlaceholder />
            </>
        );
    }

    const error = metadataServerSettingsError ?? serverSettingsError;
    if (error) {
        return (
            <>
                {localSettings}
                <EmptyViewAbsoluteCentered
                    message={t('global.error.label.failed_to_load_data')}
                    messageExtra={getErrorMessage(error)}
                    retry={() => {
                        if (metadataServerSettingsError) {
                            refetchServerMetadataSettings().catch(
                                defaultPromiseErrorHandler('ServerSettings::refetchServerMetadataSettings'),
                            );
                        }

                        if (serverSettingsError) {
                            refetchServerSettings().catch(
                                defaultPromiseErrorHandler('ServerSettings::refetchServerSettings'),
                            );
                        }
                    }}
                />
            </>
        );
    }

    const serverSettings = data?.settings as ServerSettingsType;
    const authModeDisabled = !serverSettings.authUsername?.trim() || !serverSettings.authPassword?.trim();

    return (
        <List sx={{ pt: 0 }}>
            {localSettings}
            <List
                subheader={
                    <ListSubheader component="div" id="server-settings-socks-proxy">
                        {t('settings.server.socks_proxy.title')}
                    </ListSubheader>
                }
            >
                <ListItem>
                    <ListItemText primary={t('settings.server.socks_proxy.label.enable')} />
                    <Switch
                        edge="end"
                        checked={serverSettings.socksProxyEnabled}
                        onChange={(e) => updateSetting('socksProxyEnabled', e.target.checked)}
                    />
                </ListItem>
                <SelectSetting<number>
                    settingName={t('settings.server.socks_proxy.label.version')}
                    value={serverSettings.socksProxyVersion}
                    values={[
                        [4, { text: '4' }],
                        [5, { text: '5' }],
                    ]}
                    handleChange={(socksProxyVersion) => updateSetting('socksProxyVersion', socksProxyVersion)}
                />
                <TextSetting
                    settingName={t('settings.server.socks_proxy.label.host')}
                    value={serverSettings.socksProxyHost}
                    handleChange={(proxyHost) => updateSetting('socksProxyHost', proxyHost)}
                />
                <TextSetting
                    settingName={t('settings.server.socks_proxy.label.port')}
                    value={serverSettings.socksProxyPort}
                    handleChange={(proxyPort) => updateSetting('socksProxyPort', proxyPort)}
                />
                <TextSetting
                    settingName={t('settings.server.socks_proxy.label.username')}
                    value={serverSettings.socksProxyUsername}
                    handleChange={(proxyUsername) => updateSetting('socksProxyUsername', proxyUsername)}
                />
                <TextSetting
                    settingName={t('settings.server.socks_proxy.label.password')}
                    value={serverSettings.socksProxyPassword}
                    handleChange={(proxyPassword) => updateSetting('socksProxyPassword', proxyPassword)}
                    isPassword
                />
            </List>
            <List
                subheader={
                    <ListSubheader component="div" id="server-settings-auth">
                        {t('settings.server.auth.title')}
                    </ListSubheader>
                }
            >
                <SelectSetting<AuthMode>
                    settingName={t('settings.server.auth.label.title')}
                    value={serverSettings.authMode}
                    values={AUTH_MODES_SELECT_VALUES}
                    handleChange={(mode) => {
                        updateSetting('authMode', mode, (success) => {
                            if (!success) {
                                return;
                            }

                            if (mode !== AuthMode.UiLogin) {
                                AuthManager.removeTokens();
                            }

                            AuthManager.setAuthRequired(mode === AuthMode.UiLogin);
                        });
                    }}
                    disabled={authModeDisabled}
                />
                <TextSetting
                    settingName={t('settings.server.auth.label.username')}
                    value={serverSettings.authUsername}
                    validate={(value) => serverSettings.authMode === AuthMode.None || !!value.trim()}
                    handleChange={(authUsername) => updateSetting('authUsername', authUsername)}
                />
                <TextSetting
                    settingName={t('settings.server.auth.label.password')}
                    value={serverSettings.authPassword}
                    isPassword
                    validate={(value) => serverSettings.authMode === AuthMode.None || !!value.trim()}
                    handleChange={(authPassword) => updateSetting('authPassword', authPassword)}
                />
                {serverSettings.authMode === AuthMode.UiLogin && (
                    <>
                        <TextSetting
                            settingName={t('settings.server.auth.jwt.audience')}
                            value={serverSettings.jwtAudience}
                            handleChange={(audience) => updateSetting('jwtAudience', audience)}
                        />
                        <NumberSetting
                            settingTitle={t('settings.server.auth.jwt.access_token_expiry')}
                            settingValue={d(serverSettings.jwtTokenExpiry).minutes.humanize()}
                            value={d(serverSettings.jwtTokenExpiry).minutes.inWholeMinutes}
                            valueUnit={t('global.time.minutes.minute_other')}
                            defaultValue={JWT_ACCESS_TOKEN_EXPIRY.default}
                            minValue={JWT_ACCESS_TOKEN_EXPIRY.min}
                            maxValue={JWT_ACCESS_TOKEN_EXPIRY.max}
                            handleUpdate={(expiry) => updateSetting('jwtTokenExpiry', d(expiry).minutes.toISOString())}
                            showSlider
                        />
                        <NumberSetting
                            settingTitle={t('settings.server.auth.jwt.refresh_token_expiry')}
                            settingValue={d(serverSettings.jwtRefreshExpiry).days.humanize()}
                            value={d(serverSettings.jwtRefreshExpiry).days.inWholeDays}
                            valueUnit={t('global.time.days.day_other')}
                            defaultValue={JWT_REFRESH_TOKEN_EXPIRY.default}
                            minValue={JWT_REFRESH_TOKEN_EXPIRY.min}
                            maxValue={JWT_REFRESH_TOKEN_EXPIRY.max}
                            handleUpdate={(expiry) => updateSetting('jwtRefreshExpiry', d(expiry).days.toISOString())}
                            showSlider
                        />
                    </>
                )}
            </List>
            <List
                subheader={
                    <ListSubheader component="div" id="server-settings-debug-info">
                        {t('settings.server.misc.share_debug_info.title')}
                    </ListSubheader>
                }
            >
                <ListItem>
                    <ListItemText
                        primary={t('settings.server.misc.share_debug_info.label')}
                        secondary={t('settings.server.misc.share_debug_info.description')}
                    />
                    <Button
                        variant="outlined"
                        disabled={isSharingDebugInfo}
                        onClick={() => {
                            handleShareDebugInfo().catch(defaultPromiseErrorHandler('ServerSettings::shareDebugInfo'));
                        }}
                    >
                        {isSharingDebugInfo
                            ? t('settings.server.misc.share_debug_info.in_progress')
                            : t('settings.server.misc.share_debug_info.action')}
                    </Button>
                </ListItem>
            </List>
        </List>
    );
};
