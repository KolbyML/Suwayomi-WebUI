/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import SearchIcon from '@mui/icons-material/Search';
import FormControl from '@mui/material/FormControl';
import Input from '@mui/material/Input';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import React from 'react';
import { IPos } from '@/features/source/Source.types.ts';

interface Props {
    state: string;
    name: string;
    position: number;
    group: number | undefined;
    updateFilterValue: (update: IPos[]) => void;
    update: IPos[];
}

export const TextFilter: React.FC<Props> = (props) => {
    const { state, name, position, group, updateFilterValue, update } = props;

    const handleChange = (value: string) => {
        const upd = update.filter((el) => !(position === el.position && group === el.group));
        updateFilterValue([...upd, { type: 'textState', position, state: value, group }]);
    };

    if (state !== undefined) {
        return (
            <FormControl sx={{ my: 1 }} variant="standard">
                <InputLabel>{name}</InputLabel>
                <Input
                    name={name}
                    value={state || ''}
                    onChange={({ target: { value } }) => handleChange(value)}
                    endAdornment={
                        <InputAdornment position="end">
                            <SearchIcon />
                        </InputAdornment>
                    }
                />
            </FormControl>
        );
    }
    return null;
};
