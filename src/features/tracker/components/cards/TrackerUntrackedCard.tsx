/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import { useTranslation } from 'react-i18next';
import Stack from '@mui/material/Stack';
import { CARD_STYLING } from '@/features/tracker/Tracker.constants.ts';

import { TTrackerBase } from '@/features/tracker/Tracker.types.ts';
import { AvatarSpinner } from '@/base/components/AvatarSpinner.tsx';
import { getTrackerIconUrl } from '@/features/tracker/Tracker.utils.ts';

export const TrackerUntrackedCard = ({
    tracker,
    onClick,
    disabled = false,
}: {
    tracker: Pick<TTrackerBase, 'id' | 'name' | 'icon'>;
    onClick: () => void;
    disabled?: boolean;
}) => {
    const { t } = useTranslation();

    return (
        <Card sx={CARD_STYLING}>
            <CardContent sx={{ padding: '0' }}>
                <Stack
                    direction="row"
                    sx={{
                        gap: 3,
                    }}
                >
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
                    <Button sx={{ flexGrow: '1' }} onClick={onClick} disabled={disabled}>
                        {t('tracking.action.button.add_tracking')}
                    </Button>
                </Stack>
            </CardContent>
        </Card>
    );
};
