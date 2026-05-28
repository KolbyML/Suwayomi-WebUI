/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Drawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import React from 'react';

interface IProps {
    open: boolean;
    onClose: () => void;
    children: React.ReactNode;
    minHeight?: number;
}

export const OptionsPanel: React.FC<IProps> = ({ open, onClose, children, minHeight }) => (
    <Drawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        PaperProps={{
            sx: {
                borderTopLeftRadius: { xs: 3, sm: 2 },
                borderTopRightRadius: { xs: 3, sm: 2 },
                display: 'flex',
                flexDirection: 'column',
                height: { xs: '52dvh', sm: 'min(80vh, 720px)' },
                maxHeight: { xs: '56dvh', sm: 'min(80vh, 720px)' },
                maxWidth: 600,
                marginLeft: 'auto',
                marginRight: 'auto',
                minHeight,
                overflow: 'hidden',
                width: '100%',
            },
        }}
    >
        <Box
            data-testid="options-panel"
            sx={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                minHeight: 0,
            }}
        >
            {children}
        </Box>
    </Drawer>
);
