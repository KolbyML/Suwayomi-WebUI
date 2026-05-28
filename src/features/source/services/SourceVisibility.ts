/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import {
    DefaultLanguage,
    getLanguage,
    toComparableLanguage,
    toComparableLanguages,
    toUniqueLanguageCodes,
} from '@/base/utils/Languages.ts';
import {
    ISourceMetadata,
    SourceIdInfo,
    SourceLanguageInfo,
    SourceMetaInfo,
    SourceNsfwInfo,
} from '@/features/source/Source.types.ts';

export const LOCAL_SOURCE_ID = '0';
const NATIVE_SELF_HOSTED_ENGINE = 'manatan-native-self-hosted';

export type SourceFilterOptions = {
    showNsfw?: boolean;
    languages?: string[];
    keepLocalSource?: boolean;
    pinned?: boolean;
    enabled?: boolean;
};

type SourceFilterMetadata = Pick<ISourceMetadata, 'isPinned' | 'isEnabled'>;

const DEFAULT_SOURCE_FILTER_METADATA: SourceFilterMetadata = {
    isPinned: false,
    isEnabled: true,
};

export const getSourceMetaValue = (source: Partial<SourceMetaInfo>, key: string): string | undefined => {
    if (!source.meta?.length) {
        return undefined;
    }

    return source.meta.find((entry) => entry.key === key)?.value;
};

export const isLocalSource = (source: SourceIdInfo): boolean => `${source.id ?? ''}` === LOCAL_SOURCE_ID;

export const isNativeSource = (source: Partial<SourceMetaInfo>): boolean =>
    getSourceMetaValue(source, 'engine') === NATIVE_SELF_HOSTED_ENGINE;

export const isBuiltInSource = (source: SourceIdInfo & Partial<SourceMetaInfo>): boolean =>
    isLocalSource(source) || isNativeSource(source);

export const getSourceMetaLanguages = (source: Partial<SourceMetaInfo>): string[] => {
    const raw = getSourceMetaValue(source, 'languages');
    if (!raw) {
        return [];
    }

    const trimmed = raw.trim();
    if (!trimmed) {
        return [];
    }

    const normalizeValue = (value: string) => {
        const normalized = value.trim();
        if (!normalized) {
            return '';
        }
        const lower = normalized.toLowerCase();
        const canonical = lower === 'all' || lower === 'multi' ? lower : normalized;
        return getLanguage(canonical).isoCode;
    };

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                return parsed
                    .filter((value) => typeof value === 'string')
                    .map((value) => normalizeValue(value as string))
                    .filter(Boolean);
            }
        } catch {
            // fall through to string parsing
        }
    }

    return trimmed
        .split(',')
        .map((value) => normalizeValue(value))
        .filter(Boolean);
};

export const getSourceDisplayLanguage = (
    source: SourceIdInfo & SourceLanguageInfo & Partial<SourceMetaInfo>,
): string => {
    if (isBuiltInSource(source)) {
        return DefaultLanguage.OTHER;
    }

    if (source.lang === 'multi') {
        return DefaultLanguage.ALL;
    }

    return source.lang;
};

export const filterSources = <
    Source extends SourceIdInfo & SourceLanguageInfo & SourceNsfwInfo & Partial<SourceMetaInfo>,
>(
    sources: Source[],
    { showNsfw, languages, keepLocalSource, pinned, enabled }: SourceFilterOptions = {},
    getMetadata: (source: Source) => SourceFilterMetadata = () => DEFAULT_SOURCE_FILTER_METADATA,
): Source[] => {
    const normalizedLanguages = toComparableLanguages(toUniqueLanguageCodes(languages ?? []));
    const allLanguage = toComparableLanguage(DefaultLanguage.ALL);
    const hasAllLanguage = normalizedLanguages.includes(allLanguage);
    const otherLanguages = normalizedLanguages.filter((language) => language !== allLanguage);
    const hasOtherLanguages = otherLanguages.length > 0;
    const keepBuiltInSource = (source: Source): boolean => keepLocalSource === true && isBuiltInSource(source);

    const isLanguageAllowed = (source: Source): boolean => {
        if (!languages || languages.length === 0) {
            return true;
        }

        if (keepBuiltInSource(source)) {
            return true;
        }

        const sourceLanguage = toComparableLanguage(getSourceDisplayLanguage(source));
        const isMultiLanguage = sourceLanguage === allLanguage;

        if (isMultiLanguage) {
            if (!hasAllLanguage) {
                return false;
            }

            if (toComparableLanguage(source.lang) === allLanguage) {
                return true;
            }

            if (!hasOtherLanguages) {
                return true;
            }

            const metaLanguages = getSourceMetaLanguages(source).map((language) => toComparableLanguage(language));
            if (!metaLanguages.length) {
                return false;
            }

            return metaLanguages.some((language) => language === allLanguage || otherLanguages.includes(language));
        }

        if (hasAllLanguage && !hasOtherLanguages) {
            return true;
        }

        return otherLanguages.includes(sourceLanguage);
    };

    return sources
        .filter((source) => showNsfw === undefined || showNsfw || !source.isNsfw || keepBuiltInSource(source))
        .filter((source) => isLanguageAllowed(source))
        .filter(
            (source) => pinned === undefined || !pinned || getMetadata(source).isPinned || keepBuiltInSource(source),
        )
        .filter(
            (source) => enabled === undefined || !enabled || getMetadata(source).isEnabled || keepBuiltInSource(source),
        );
};
