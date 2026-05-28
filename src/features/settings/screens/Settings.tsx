/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import BackupIcon from '@mui/icons-material/Backup';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CollectionsOutlinedBookmarkIcon from '@mui/icons-material/CollectionsBookmarkOutlined';
import GetAppOutlinedIcon from '@mui/icons-material/GetAppOutlined';
import DnsIcon from '@mui/icons-material/Dns';
import ExploreOutlinedIcon from '@mui/icons-material/ExploreOutlined';
import DevicesIcon from '@mui/icons-material/Devices';
import SyncIcon from '@mui/icons-material/Sync';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import PaletteIcon from '@mui/icons-material/Palette';
import HistoryIcon from '@mui/icons-material/History';
import ImageIcon from '@mui/icons-material/Image';
import TuneIcon from '@mui/icons-material/Tune';
import { ListItemLink } from '@/base/components/lists/ListItemLink.tsx';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { useAppTitle } from '@/features/navigation-bar/hooks/useAppTitle.ts';
import {
    getManatanRuntimeVariant,
    ManatanRuntimeVariant,
    supportsNativeAdvancedSettings,
} from '@/Manatan/utils/iosAdvancedSettings.ts';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { shareDebugInfo } from '@/features/settings/utils/shareDebugInfo.ts';
import {
    getManatanAccountSettingsSecondary,
    MANATAN_ACCOUNT_SETTINGS_TITLE,
    MANATAN_ACCOUNT_SIGNED_IN_LABEL,
} from '@/Manatan/account/ManatanAccountCopy.ts';

export function Settings() {
    const { t } = useTranslation();
    const [isSharingDebugInfo, setIsSharingDebugInfo] = useState(false);
    const [runtimeVariant, setRuntimeVariant] = useState<ManatanRuntimeVariant | null>(null);
    const { data: authStatusData, loading: isAuthStatusLoading } = requestManager.useGetManatanAuthStatus({
        notifyOnNetworkStatusChange: true,
    });
    const isManatanAccountConfigured = authStatusData
        ? (authStatusData.accountConfigured ?? !!authStatusData.accountBaseUrl)
        : true;
    const isManatanAuthenticated = !!isManatanAccountConfigured && !!authStatusData?.authenticated;
    const manatanAccountSecondary = getManatanAccountSettingsSecondary(authStatusData, isAuthStatusLoading);

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

    useAppTitle(t('settings.title'));

    useEffect(() => {
        let isMounted = true;
        getManatanRuntimeVariant().then((variant) => {
            if (isMounted) {
                setRuntimeVariant(variant);
            }
        });

        return () => {
            isMounted = false;
        };
    }, []);

    const settingLinks = useMemo(
        () =>
            [
                {
                    id: 'appearance',
                    path: AppRoutes.settings.childRoutes.appearance.path,
                    title: t('settings.appearance.title'),
                    icon: <PaletteIcon />,
                },
                {
                    id: 'reader',
                    path: AppRoutes.settings.childRoutes.reader.path,
                    title: t('reader.settings.title.reader'),
                    icon: <AutoStoriesIcon />,
                },
                {
                    id: 'library',
                    path: AppRoutes.settings.childRoutes.library.path,
                    title: t('library.title'),
                    icon: <CollectionsOutlinedBookmarkIcon />,
                },
                {
                    id: 'download',
                    path: AppRoutes.settings.childRoutes.download.path,
                    title: t('download.title.download'),
                    icon: <GetAppOutlinedIcon />,
                },
                {
                    id: 'images',
                    path: AppRoutes.settings.childRoutes.images.path,
                    title: t('settings.images.title'),
                    icon: <ImageIcon />,
                },
                {
                    id: 'tracking',
                    path: AppRoutes.settings.childRoutes.tracking.path,
                    title: t('tracking.title'),
                    icon: <SyncIcon />,
                },
                {
                    id: 'sync',
                    path: AppRoutes.settings.childRoutes.sync.path,
                    title: 'Sync',
                    icon: <CloudSyncIcon />,
                },
                {
                    id: 'backup',
                    path: AppRoutes.settings.childRoutes.backup.path,
                    title: t('settings.backup.title'),
                    icon: <BackupIcon />,
                },
                ...(supportsNativeAdvancedSettings(runtimeVariant)
                    ? [
                          {
                              id: 'advanced',
                              path: AppRoutes.settings.childRoutes.advanced.path,
                              title: t('settings.server.advanced.title'),
                              icon: <TuneIcon />,
                          },
                      ]
                    : []),
                {
                    id: 'browse',
                    path: AppRoutes.settings.childRoutes.browse.path,
                    title: t('global.label.browse'),
                    icon: <ExploreOutlinedIcon />,
                },
                {
                    id: 'history',
                    path: AppRoutes.settings.childRoutes.history.path,
                    title: t('history.title'),
                    icon: <HistoryIcon />,
                },
                {
                    id: 'device',
                    path: AppRoutes.settings.childRoutes.device.path,
                    title: t('settings.device.title.device'),
                    icon: <DevicesIcon />,
                },
                {
                    id: 'server',
                    path: AppRoutes.settings.childRoutes.server.path,
                    title: t('settings.server.title.server'),
                    icon: <DnsIcon />,
                },
            ].toSorted((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })),
        [t, runtimeVariant],
    );

    return (
        <List sx={{ padding: 0 }}>
            <ListItemLink
                to={AppRoutes.settings.childRoutes.account.path}
                sx={(theme) => ({
                    m: 1,
                    mb: 1.5,
                    border: `1px solid ${theme.palette.primary.main}`,
                    borderRadius: 2,
                    color: theme.palette.primary.contrastText,
                    background:
                        theme.palette.mode === 'dark'
                            ? `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.background.paper} 68%)`
                            : `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.light} 100%)`,
                    boxShadow: `0 8px 28px ${theme.palette.primary.main}33`,
                    '&:hover': {
                        background:
                            theme.palette.mode === 'dark'
                                ? `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.background.paper} 72%)`
                                : `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`,
                    },
                    '& .MuiListItemIcon-root': {
                        color: 'inherit',
                        minWidth: 44,
                    },
                    '& .MuiListItemText-secondary': {
                        color:
                            theme.palette.mode === 'dark'
                                ? theme.palette.text.secondary
                                : theme.palette.primary.contrastText,
                        opacity: 0.86,
                    },
                })}
            >
                <ListItemIcon>
                    <AccountCircleIcon />
                </ListItemIcon>
                <ListItemText primary={MANATAN_ACCOUNT_SETTINGS_TITLE} secondary={manatanAccountSecondary} />
                {isManatanAuthenticated && (
                    <Chip
                        label={MANATAN_ACCOUNT_SIGNED_IN_LABEL}
                        color="success"
                        size="small"
                        sx={{ ml: 2, flexShrink: 0 }}
                    />
                )}
            </ListItemLink>
            <Divider />
            {settingLinks.map((setting) => (
                <ListItemLink key={setting.id} to={setting.path}>
                    <ListItemIcon>{setting.icon}</ListItemIcon>
                    <ListItemText primary={setting.title} />
                </ListItemLink>
            ))}
            <ListItem>
                <ListItemText
                    primary={t('settings.server.misc.share_debug_info.title')}
                    secondary={t('settings.server.misc.share_debug_info.description')}
                />
                <Button
                    variant="outlined"
                    disabled={isSharingDebugInfo}
                    onClick={() => {
                        handleShareDebugInfo().catch(() => null);
                    }}
                >
                    {isSharingDebugInfo
                        ? t('settings.server.misc.share_debug_info.in_progress')
                        : t('settings.server.misc.share_debug_info.action')}
                </Button>
            </ListItem>
        </List>
    );
}
