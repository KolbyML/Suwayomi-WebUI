/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useTranslation } from 'react-i18next';
import ListItemButton from '@mui/material/ListItemButton';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemSecondaryAction from '@mui/material/ListItemSecondaryAction';
import ListItemText from '@mui/material/ListItemText';
import { makeToast } from '@/base/utils/Toast.ts';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { Trackers } from '@/features/tracker/services/Trackers.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { TTrackerSearch } from '@/features/tracker/Tracker.types.ts';
import { AvatarSpinner } from '@/base/components/AvatarSpinner.tsx';
import { getTrackerIconUrl } from '@/features/tracker/Tracker.utils.ts';
import { getAccountManagedTrackerDescription } from '@/Manatan/account/ManatanAccountCopy.ts';

export const SettingsTrackerCard = ({
    tracker,
    onAuthChange,
    directToggle = false,
    readOnly = false,
    accountManaged = false,
    canManageAccount = true,
    onManageAccount,
}: {
    tracker: TTrackerSearch;
    onAuthChange?: () => void;
    directToggle?: boolean;
    readOnly?: boolean;
    accountManaged?: boolean;
    canManageAccount?: boolean;
    onManageAccount?: () => void;
}) => {
    const { t } = useTranslation();

    const handleLogout = async () => {
        try {
            await requestManager.logoutFromTracker(tracker.id).response;
            onAuthChange?.();
        } catch (e) {
            makeToast(t('tracking.action.logout.label.failure', { name: tracker.name }), 'error', getErrorMessage(e));
        }
    };

    const handleLogin = async (username: string, password: string) => {
        try {
            await requestManager.loginTrackerCredentials(tracker.id, username, password).response;
            onAuthChange?.();
        } catch (e) {
            makeToast(t('tracking.action.login.label.failure', { name: tracker.name }), 'error', getErrorMessage(e));
        }
    };

    const login = async () => {
        if (readOnly) {
            return;
        }

        if (directToggle) {
            if (Trackers.isLoggedIn(tracker)) {
                await handleLogout();
                return;
            }

            await handleLogin('', '');
            return;
        }

        onManageAccount?.();
    };

    return (
        <ListItemButton
            onClick={readOnly ? undefined : () => login()}
            disabled={accountManaged && !canManageAccount}
            disableRipple={readOnly}
            sx={readOnly ? { cursor: 'default' } : undefined}
        >
            <ListItemAvatar sx={{ paddingRight: '20px' }}>
                <AvatarSpinner
                    alt={`${tracker.name}`}
                    iconUrl={getTrackerIconUrl(tracker)}
                    slots={{
                        avatarProps: {
                            variant: 'rounded',
                            sx: { width: 64, height: 64 },
                        },
                        spinnerImageProps: {
                            ignoreQueue: true,
                        },
                    }}
                />
            </ListItemAvatar>
            <ListItemText
                primary={tracker.name}
                secondary={
                    accountManaged
                        ? t(
                              Trackers.isLoggedIn(tracker)
                                  ? 'tracking.settings.account_managed.connected'
                                  : 'tracking.settings.account_managed.connect',
                              {
                                  defaultValue: getAccountManagedTrackerDescription(Trackers.isLoggedIn(tracker)),
                              },
                          )
                        : undefined
                }
            />
            {Trackers.isLoggedIn(tracker) && (
                <ListItemSecondaryAction>
                    {accountManaged ? (
                        <Button
                            variant="outlined"
                            size="small"
                            disabled={!canManageAccount}
                            onClick={(event) => {
                                event.stopPropagation();
                                onManageAccount?.();
                            }}
                        >
                            {t('global.label.manage', { defaultValue: 'Manage' })}
                        </Button>
                    ) : (
                        <Chip label={t('global.label.logged_in')} color="success" />
                    )}
                </ListItemSecondaryAction>
            )}
            {!Trackers.isLoggedIn(tracker) && accountManaged && (
                <ListItemSecondaryAction>
                    <Button
                        variant="contained"
                        size="small"
                        disabled={!canManageAccount}
                        onClick={(event) => {
                            event.stopPropagation();
                            onManageAccount?.();
                        }}
                    >
                        {t('global.label.connect', { defaultValue: 'Connect' })}
                    </Button>
                </ListItemSecondaryAction>
            )}
        </ListItemButton>
    );
};
