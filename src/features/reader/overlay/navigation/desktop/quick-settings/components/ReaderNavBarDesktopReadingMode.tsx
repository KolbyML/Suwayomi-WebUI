/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useTranslation } from 'react-i18next';
import { ValueRotationButton } from '@/base/components/buttons/ValueRotationButton.tsx';
import { IReaderSettingsWithDefaultFlag, ReadingDirection } from '@/features/reader/Reader.types.ts';
import {
    READING_MODE_PRESET_VALUES,
    READING_MODE_PRESET_VALUE_TO_DISPLAY_DATA,
    ReadingModePreset,
    getReadingModeAndDirectionForPreset,
    getReadingModePreset,
} from '@/features/reader/settings/ReadingModePreset.tsx';
import { MultiValueButtonDefaultableProps } from '@/base/Base.types.ts';

export const ReaderNavBarDesktopReadingMode = ({
    readingMode,
    readingDirection,
    setReadingModePreset,
    ...buttonSelectInputProps
}: Pick<IReaderSettingsWithDefaultFlag, 'readingMode' | 'readingDirection'> &
    Pick<MultiValueButtonDefaultableProps<ReadingModePreset>, 'isDefaultable' | 'onDefault'> & {
        setReadingModePreset: (preset: {
            readingMode: IReaderSettingsWithDefaultFlag['readingMode']['value'];
            readingDirection: ReadingDirection;
        }) => void;
    }) => {
    const { t } = useTranslation();
    const presetValue = getReadingModePreset(readingMode.value, readingDirection.value);

    return (
        <ValueRotationButton
            {...buttonSelectInputProps}
            tooltip={t('reader.settings.label.reading_mode')}
            value={readingMode.isDefault && readingDirection.isDefault ? undefined : presetValue}
            defaultValue={readingMode.isDefault && readingDirection.isDefault ? presetValue : undefined}
            values={READING_MODE_PRESET_VALUES}
            setValue={(preset) => setReadingModePreset(getReadingModeAndDirectionForPreset(preset))}
            valueToDisplayData={READING_MODE_PRESET_VALUE_TO_DISPLAY_DATA}
            defaultIcon={READING_MODE_PRESET_VALUE_TO_DISPLAY_DATA[presetValue].icon}
        />
    );
};
