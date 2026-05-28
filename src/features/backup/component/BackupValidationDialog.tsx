/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import List from '@mui/material/List';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import ListItem from '@mui/material/ListItem';
import { Link } from 'react-router-dom';
import Stack from '@mui/material/Stack';
import { AwaitableComponentProps } from 'awaitable-component';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { ValidateBackupResult } from '@/lib/requests/types.ts';

export const BackupValidationDialog = ({
    validationResult,
    onInstallMissingSources,
    onDismiss,
    onSubmit,
    isVisible,
    onExitComplete,
}: AwaitableComponentProps & {
    validationResult: ValidateBackupResult;
    onInstallMissingSources?: (validationResult: ValidateBackupResult) => Promise<void>;
}) => {
    const { t } = useTranslation();
    const [isInstallingSources, setIsInstallingSources] = useState(false);

    const handleInstallSources = async () => {
        if (!onInstallMissingSources || isInstallingSources) {
            return;
        }
        setIsInstallingSources(true);
        try {
            await onInstallMissingSources(validationResult);
        } finally {
            setIsInstallingSources(false);
        }
    };

    return (
        <Dialog open={isVisible} onTransitionExited={onExitComplete} onClose={onDismiss}>
            <DialogTitle>{t('settings.backup.action.validate.dialog.title')}</DialogTitle>
            <DialogContent dividers>
                {!!validationResult?.missingSources.length && (
                    <List
                        sx={{ listStyleType: 'initial', listStylePosition: 'inside' }}
                        subheader={t('settings.backup.action.validate.dialog.content.label.missing_sources')}
                    >
                        {validationResult?.missingSources.map(({ id, name }) => (
                            <ListItem sx={{ display: 'list-item' }} key={id}>
                                {`${name} (${id})`}
                            </ListItem>
                        ))}
                    </List>
                )}
                {!!validationResult?.missingTrackers.length && (
                    <List
                        sx={{ listStyleType: 'initial', listStylePosition: 'inside' }}
                        subheader={t('settings.backup.action.validate.dialog.content.label.missing_trackers')}
                    >
                        {validationResult?.missingTrackers.map(({ name }) => (
                            <ListItem sx={{ display: 'list-item' }} key={name}>
                                {`${name}`}
                            </ListItem>
                        ))}
                    </List>
                )}
            </DialogContent>
            <DialogActions>
                <Stack
                    direction="row"
                    sx={{
                        justifyContent: 'space-between',
                        width: '100%',
                    }}
                >
                    {!!validationResult?.missingSources.length && (
                        <Button
                            onClick={handleInstallSources}
                            autoFocus={!!validationResult?.missingSources.length}
                            variant={validationResult?.missingSources.length ? 'contained' : 'text'}
                            disabled={isInstallingSources}
                        >
                            {t('extension.action.label.install')}
                        </Button>
                    )}
                    {!!validationResult?.missingTrackers.length && (
                        <Button
                            onClick={onDismiss}
                            component={Link}
                            to={AppRoutes.settings.childRoutes.tracking.path}
                            autoFocus={!!validationResult?.missingTrackers.length}
                            variant={validationResult?.missingTrackers.length ? 'contained' : 'text'}
                        >
                            {t('global.button.log_in')}
                        </Button>
                    )}
                    <Stack direction="row">
                        <Button onClick={onDismiss}>{t('global.button.cancel')}</Button>
                        <Button
                            onClick={onSubmit}
                            autoFocus={
                                !validationResult?.missingSources.length && !validationResult?.missingTrackers.length
                            }
                            variant={
                                !validationResult?.missingSources.length && !validationResult?.missingTrackers.length
                                    ? 'contained'
                                    : 'text'
                            }
                        >
                            {t('global.button.restore')}
                        </Button>
                    </Stack>
                </Stack>
            </DialogActions>
        </Dialog>
    );
};
