/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { GridLayouts } from '@/base/components/GridLayouts.tsx';
import { GridLayout } from '@/base/Base.types.ts';
import {
    MANATAN_SOURCE_GRID_LAYOUT_META_KEY,
    useServerMetaState,
} from '@/Manatan/services/ServerMetaStorage.ts';

export function SourceGridLayout() {
    const [sourceGridLayout, setSourceGridLayout] = useServerMetaState(
        MANATAN_SOURCE_GRID_LAYOUT_META_KEY,
        GridLayout.Compact,
        { legacyLocalStorageKey: 'source-grid-layout' },
    );

    return <GridLayouts gridLayout={sourceGridLayout} onChange={setSourceGridLayout} />;
}
