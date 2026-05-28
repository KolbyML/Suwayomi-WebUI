/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useTranslation } from 'react-i18next';
import { IReaderSettingsWithDefaultFlag, ReadingDirection } from '@/features/reader/Reader.types.ts';
import {
    READING_MODE_PRESET_VALUES,
    READING_MODE_PRESET_VALUE_TO_DISPLAY_DATA,
    ReadingModePreset,
    getReadingModeAndDirectionForPreset,
    getReadingModePreset,
} from '@/features/reader/settings/ReadingModePreset.tsx';
import { ButtonSelectInput } from '@/base/components/inputs/ButtonSelectInput.tsx';
import { MultiValueButtonDefaultableProps } from '@/base/Base.types.ts';

export const ReaderSettingReadingMode = ({
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
    const effectiveReadingDirection = readingDirection ?? {
        value: ReadingDirection.LTR,
        isDefault: true,
    };
    const presetValue = getReadingModePreset(readingMode.value, effectiveReadingDirection.value);

    return (
        <ButtonSelectInput
            {...buttonSelectInputProps}
            label={t('reader.settings.label.reading_mode')}
            value={readingMode.isDefault && effectiveReadingDirection.isDefault ? undefined : presetValue}
            defaultValue={readingMode.isDefault && effectiveReadingDirection.isDefault ? presetValue : undefined}
            values={READING_MODE_PRESET_VALUES}
            setValue={(preset) => setReadingModePreset(getReadingModeAndDirectionForPreset(preset))}
            valueToDisplayData={READING_MODE_PRESET_VALUE_TO_DISPLAY_DATA}
        />
    );
};
