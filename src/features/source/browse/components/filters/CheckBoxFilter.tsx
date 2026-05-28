/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import React from 'react';
import { CheckboxInput } from '@/base/components/inputs/CheckboxInput.tsx';
import { IPos } from '@/features/source/Source.types.ts';

interface Props {
    state: boolean;
    name: string;
    position: number;
    group: number | undefined;
    updateFilterValue: (update: IPos[]) => void;
    update: IPos[];
}

export const CheckBoxFilter: React.FC<Props> = (props: Props) => {
    const { state, name, position, group, updateFilterValue, update } = props;

    const handleChange = (event: { target: { name: any; checked: any } }) => {
        const upd = update.filter((e) => !(position === e.position && group === e.group));
        updateFilterValue([...upd, { type: 'checkBoxState', position, state: event.target.checked, group }]);
    };

    if (state !== undefined) {
        return <CheckboxInput label={name} checked={state} onChange={handleChange} />;
    }
    return null;
};
