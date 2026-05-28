/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { UpdateState } from '@/lib/requests/types.ts';
import { WEBUI_BUNDLED_VERSION_LABEL } from '@/Manatan/branding/ManatanBranding.tsx';

export type BaseVersionInfoProps = {
    version: string;
    isCheckingForUpdate: boolean;
    isUpdateAvailable: boolean;
    updateCheckError: any;
    checkForUpdate: () => void;
};
export type LinkVersionInfoProps = {
    downloadAsLink: true;
    url: string;
};
export type TriggerVersionInfoProps = {
    triggerUpdate: () => void;
    updateState: UpdateState;
    progress: number;
};
export type VersionInfoProps =
    | (BaseVersionInfoProps & PropertiesNever<TriggerVersionInfoProps> & LinkVersionInfoProps)
    | (BaseVersionInfoProps & TriggerVersionInfoProps & PropertiesNever<LinkVersionInfoProps>);

export const VersionInfo = ({ version }: VersionInfoProps) => (
    <Stack
        sx={{
            alignItems: 'start',
        }}
    >
        <Typography component="span" variant="body2">
            {version}
        </Typography>
    </Stack>
);

export const WebUIVersionInfo = () => (
    <Stack
        sx={{
            alignItems: 'start',
        }}
    >
        <Typography component="span" variant="body2">
            {WEBUI_BUNDLED_VERSION_LABEL}
        </Typography>
    </Stack>
);
