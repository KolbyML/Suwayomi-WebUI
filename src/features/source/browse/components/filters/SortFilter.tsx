/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import Collapse from '@mui/material/Collapse';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import React from 'react';
import { SortRadioInput } from '@/base/components/inputs/SortRadioInput.tsx';
import { SortSelectionInput } from '@/lib/requests/types.ts';
import { IPos } from '@/features/source/Source.types.ts';

interface Props {
    values: any;
    name: string;
    state: SortSelectionInput;
    position: number;
    group: number | undefined;
    updateFilterValue: (update: IPos[]) => void;
    update: IPos[];
}

export const SortFilter: React.FC<Props> = (props: Props) => {
    const { values, name, state, position, group, updateFilterValue, update } = props;
    const [open, setOpen] = React.useState(false);

    const handleClick = () => {
        setOpen(!open);
    };

    if (values) {
        const handleChange = (index: number) => {
            const nextState = {
                ascending: state.index === index ? !state.ascending : true,
                index,
            };
            const upd = update.filter((e) => !(position === e.position && group === e.group));
            updateFilterValue([...upd, { type: 'sortState', position, state: nextState, group }]);
        };

        return (
            <Box sx={{ mx: -2 }}>
                <ListItemButton onClick={handleClick}>
                    <ListItemText primary={name} />
                    {open ? <ExpandLess /> : <ExpandMore />}
                </ListItemButton>
                <Collapse in={open}>
                    <Stack sx={{ mx: 4 }}>
                        {values.map((value: string, index: number) => (
                            <SortRadioInput
                                key={`${name} ${value}`}
                                label={value}
                                checked={state.index === index}
                                sortDescending={!state.ascending}
                                onClick={() => handleChange(index)}
                            />
                        ))}
                    </Stack>
                </Collapse>
            </Box>
        );
    }
    return null;
};
