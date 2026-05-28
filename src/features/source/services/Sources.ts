/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useTranslation } from 'react-i18next';
import { useCallback } from 'react';
import {
    SourceDisplayNameInfo,
    SourceIdInfo,
    SourceLanguageInfo,
    SourceNsfwInfo,
    SourceMetaInfo,
    SourceRepoInfo,
} from '@/features/source/Source.types.ts';
import { DefaultLanguage, languageSpecialSortComparator } from '@/base/utils/Languages.ts';
import { getSourceMetadata } from '@/features/source/services/SourceMetadata.ts';
import {
    createUpdateMetadataServerSettings,
    useMetadataServerSettings,
} from '@/features/settings/services/ServerSettingsMetadata.ts';
import { makeToast } from '@/base/utils/Toast.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import {
    filterSources,
    getSourceDisplayLanguage,
    getSourceMetaLanguages,
    getSourceMetaValue,
    isLocalSource,
    isNativeSource,
    LOCAL_SOURCE_ID,
    SourceFilterOptions,
} from '@/features/source/services/SourceVisibility.ts';

export class Sources {
    static readonly LOCAL_SOURCE_ID = LOCAL_SOURCE_ID;

    static isLocalSource(source: SourceIdInfo): boolean {
        return isLocalSource(source);
    }

    static isNativeSource(source: Partial<SourceMetaInfo>): boolean {
        return isNativeSource(source);
    }

    static getLanguage(source: SourceIdInfo & SourceLanguageInfo & Partial<SourceMetaInfo>): string {
        return getSourceDisplayLanguage(source);
    }

    static getMetaValue(source: Partial<SourceMetaInfo>, key: string): string | undefined {
        return getSourceMetaValue(source, key);
    }

    static getMetaLanguages(source: Partial<SourceMetaInfo>): string[] {
        return getSourceMetaLanguages(source);
    }

    static getLanguages(sources: (SourceIdInfo & SourceLanguageInfo & Partial<SourceMetaInfo>)[]): string[] {
        const languages = new Set<string>();
        sources.forEach((source) => {
            const sourceLanguage = Sources.getLanguage(source);
            languages.add(sourceLanguage);

            if (sourceLanguage === DefaultLanguage.ALL) {
                Sources.getMetaLanguages(source).forEach((language) => languages.add(language));
            }
        });
        return [...languages];
    }

    static groupByLanguage<Source extends SourceIdInfo & SourceLanguageInfo & SourceDisplayNameInfo & SourceMetaInfo>(
        sources: Source[],
    ): Record<string, Source[]> {
        const sourcesByLanguage = Object.groupBy(sources, (source) => {
            if (getSourceMetadata(source).isPinned) {
                return DefaultLanguage.PINNED;
            }

            return Sources.getLanguage(source);
        });
        const sourcesBySortedLanguage = Object.entries(sourcesByLanguage).toSorted(([a], [b]) => {
            const isAPinned = a === DefaultLanguage.PINNED;
            const isBPinned = b === DefaultLanguage.PINNED;

            if (isAPinned) {
                return -1;
            }

            if (isBPinned) {
                return 1;
            }

            return languageSpecialSortComparator(a, b);
        });
        const sortedSourcesBySortedLanguage = sourcesBySortedLanguage.map(([language, sourcesOfLanguage]) => [
            language,
            (sourcesOfLanguage ?? []).toSorted((a, b) => {
                const aName = `${a.displayName ?? a.id}`;
                const bName = `${b.displayName ?? b.id}`;
                return aName.localeCompare(bName);
            }),
        ]);

        return Object.fromEntries(sortedSourcesBySortedLanguage);
    }

    static filter<Source extends SourceIdInfo & SourceLanguageInfo & SourceNsfwInfo & Partial<SourceMetaInfo>>(
        sources: Source[],
        options: SourceFilterOptions = {},
    ): Source[] {
        return filterSources(sources, options, getSourceMetadata);
    }

    static areFromMultipleRepos<Source extends SourceIdInfo & SourceRepoInfo>(sources: Source[]): boolean {
        const repo = sources.find((source) => !!source.extension.repo)?.extension.repo;

        if (!repo || !sources.length) {
            return false;
        }

        return sources.some((source) => source.extension.repo !== repo && !Sources.isLocalSource(source));
    }

    static getLastUsedSource<Source extends SourceIdInfo & SourceMetaInfo>(
        lastUsedSourceId: SourceIdInfo['id'] | null,
        sources: Source[],
    ): Source | undefined {
        return sources.find((source) => `${source.id ?? ''}` === `${lastUsedSourceId ?? ''}`);
    }

    static useLanguages(): {
        languages: string[];
        setLanguages: (languages: string[]) => void;
    } {
        const { t } = useTranslation();
        const {
            settings: { sourceLanguages },
        } = useMetadataServerSettings();

        const updateSetting = createUpdateMetadataServerSettings<'sourceLanguages'>((e) =>
            makeToast(t('global.error.label.failed_to_save_changes', getErrorMessage(e)), 'error'),
        );
        const setLanguages = useCallback((languages: string[]) => updateSetting('sourceLanguages', languages), []);

        return {
            languages: sourceLanguages,
            setLanguages,
        };
    }
}
