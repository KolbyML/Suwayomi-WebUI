/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppStorage } from '@/lib/storage/AppStorage.ts';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { NAVIGATION_BAR_ITEMS } from '@/features/navigation-bar/NavigationBar.constants.ts';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import {
    createUpdateMetadataServerSettings,
    useMetadataServerSettings,
} from '@/features/settings/services/ServerSettingsMetadata.ts';
import { hydrateNavigationResumeTargets } from '@/features/navigation-bar/NavigationBarResume.util.ts';

const STORAGE_KEY_STARTUP_PAGE = 'navigation_startup_page';
const STORAGE_KEY_VISIBLE_TABS = 'navigation_visible_tabs';
const STORAGE_KEY_REQUIRED_VISIBLE_TABS_MIGRATION = 'navigation_required_visible_tabs_migration_v2';

const DEFAULT_STARTUP_PAGE = AppRoutes.library.path();
const DEFAULT_VISIBLE_TABS: string[] = NAVIGATION_BAR_ITEMS.map((item) => item.path);
const VALID_NAVIGATION_PATHS: ReadonlySet<string> = new Set(NAVIGATION_BAR_ITEMS.map((item) => item.path));
const REQUIRED_VISIBLE_TABS_AFTER_ROUTE_MIGRATION = [AppRoutes.novel.path] as const;

const areArraysEqual = (left: string[], right: string[]) =>
    left.length === right.length && left.every((value, index) => value === right[index]);

const sanitizeStartupPage = (value: string | null | undefined): string =>
    value && VALID_NAVIGATION_PATHS.has(value) ? value : DEFAULT_STARTUP_PAGE;

const insertMissingVisibleTabsInDefaultOrder = (
    visibleTabs: string[],
    requiredVisibleTabs: readonly string[],
): string[] => {
    let nextVisibleTabs = visibleTabs.filter((path, index, paths) => paths.indexOf(path) === index);

    requiredVisibleTabs.forEach((path) => {
        if (!VALID_NAVIGATION_PATHS.has(path) || nextVisibleTabs.includes(path)) {
            return;
        }

        const defaultIndex = DEFAULT_VISIBLE_TABS.indexOf(path);
        const insertionIndex = nextVisibleTabs.findIndex(
            (visiblePath) => DEFAULT_VISIBLE_TABS.indexOf(visiblePath) > defaultIndex,
        );

        if (insertionIndex === -1) {
            nextVisibleTabs = [...nextVisibleTabs, path];
        } else {
            nextVisibleTabs = [
                ...nextVisibleTabs.slice(0, insertionIndex),
                path,
                ...nextVisibleTabs.slice(insertionIndex),
            ];
        }
    });

    return nextVisibleTabs;
};

const parseVisibleTabs = (rawValue: string | null): string[] => {
    if (!rawValue) {
        return DEFAULT_VISIBLE_TABS;
    }

    try {
        const parsed = JSON.parse(rawValue);
        if (!Array.isArray(parsed)) {
            return DEFAULT_VISIBLE_TABS;
        }

        const sanitized = parsed.filter(
            (value): value is string => typeof value === 'string' && VALID_NAVIGATION_PATHS.has(value),
        );
        return sanitized.length ? sanitized : DEFAULT_VISIBLE_TABS;
    } catch {
        return DEFAULT_VISIBLE_TABS;
    }
};

export function useNavigationSettings() {
    const cachedStartupPageRef = useRef<string | null>(AppStorage.local.getItem(STORAGE_KEY_STARTUP_PAGE));
    const cachedVisibleTabsRawRef = useRef<string | null>(AppStorage.local.getItem(STORAGE_KEY_VISIBLE_TABS));
    const migratedLocalSettingsRef = useRef(false);
    const migratedRequiredVisibleTabsRef = useRef(
        AppStorage.local.getItem(STORAGE_KEY_REQUIRED_VISIBLE_TABS_MIGRATION) === 'true',
    );
    const {
        settings: { defaultStartupPage: serverDefaultStartupPage, visibleTabs: serverVisibleTabs },
        request,
    } = useMetadataServerSettings();
    const updateMetadataSetting = useMemo(
        () => createUpdateMetadataServerSettings<'defaultStartupPage' | 'visibleTabs'>(),
        [],
    );

    const [defaultStartupPage, setDefaultStartupPage] = useState<string>(() =>
        sanitizeStartupPage(cachedStartupPageRef.current),
    );
    const [visibleTabs, setVisibleTabs] = useState<string[]>(() => {
        const parsedVisibleTabs = parseVisibleTabs(cachedVisibleTabsRawRef.current);
        return migratedRequiredVisibleTabsRef.current
            ? parsedVisibleTabs
            : insertMissingVisibleTabsInDefaultOrder(parsedVisibleTabs, REQUIRED_VISIBLE_TABS_AFTER_ROUTE_MIGRATION);
    });
    const [resumeTargetsReady, setResumeTargetsReady] = useState(false);

    useEffect(() => {
        const handleStorageChange = (event: StorageEvent) => {
            if (event.key === STORAGE_KEY_STARTUP_PAGE) {
                setDefaultStartupPage(sanitizeStartupPage(event.newValue));
            } else if (event.key === STORAGE_KEY_VISIBLE_TABS) {
                setVisibleTabs(parseVisibleTabs(event.newValue));
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    useEffect(() => {
        if (request.loading || request.error) {
            return;
        }

        const sanitizedServerStartupPage = sanitizeStartupPage(serverDefaultStartupPage);
        const sanitizedServerVisibleTabs = serverVisibleTabs.filter((path) => VALID_NAVIGATION_PATHS.has(path));
        const normalizedServerVisibleTabs = sanitizedServerVisibleTabs.length
            ? sanitizedServerVisibleTabs
            : DEFAULT_VISIBLE_TABS;

        let nextStartupPage = sanitizedServerStartupPage;
        let nextVisibleTabs = normalizedServerVisibleTabs;

        if (!migratedLocalSettingsRef.current) {
            const cachedStartupPage = sanitizeStartupPage(cachedStartupPageRef.current);
            const cachedVisibleTabs = parseVisibleTabs(cachedVisibleTabsRawRef.current);
            const hasCachedStartupPage = cachedStartupPageRef.current !== null;
            const hasCachedVisibleTabs = cachedVisibleTabsRawRef.current !== null;

            if (
                hasCachedStartupPage &&
                sanitizedServerStartupPage === DEFAULT_STARTUP_PAGE &&
                cachedStartupPage !== DEFAULT_STARTUP_PAGE
            ) {
                nextStartupPage = cachedStartupPage;
                updateMetadataSetting('defaultStartupPage', cachedStartupPage).catch(
                    defaultPromiseErrorHandler('useNavigationSettings::migrateDefaultStartupPage'),
                );
            }

            if (
                hasCachedVisibleTabs &&
                areArraysEqual(normalizedServerVisibleTabs, DEFAULT_VISIBLE_TABS) &&
                !areArraysEqual(cachedVisibleTabs, DEFAULT_VISIBLE_TABS)
            ) {
                nextVisibleTabs = cachedVisibleTabs;
                updateMetadataSetting('visibleTabs', cachedVisibleTabs).catch(
                    defaultPromiseErrorHandler('useNavigationSettings::migrateVisibleTabs'),
                );
            }

            migratedLocalSettingsRef.current = true;
        }

        if (!migratedRequiredVisibleTabsRef.current) {
            const visibleTabsWithRequiredTabs = insertMissingVisibleTabsInDefaultOrder(
                nextVisibleTabs,
                REQUIRED_VISIBLE_TABS_AFTER_ROUTE_MIGRATION,
            );

            if (!areArraysEqual(visibleTabsWithRequiredTabs, nextVisibleTabs)) {
                nextVisibleTabs = visibleTabsWithRequiredTabs;
                updateMetadataSetting('visibleTabs', nextVisibleTabs).catch(
                    defaultPromiseErrorHandler('useNavigationSettings::migrateRequiredVisibleTabs'),
                );
            }

            migratedRequiredVisibleTabsRef.current = true;
            AppStorage.local.setItem(STORAGE_KEY_REQUIRED_VISIBLE_TABS_MIGRATION, 'true');
        }

        setDefaultStartupPage(nextStartupPage);
        setVisibleTabs(nextVisibleTabs);
        AppStorage.local.setItem(STORAGE_KEY_STARTUP_PAGE, nextStartupPage);
        AppStorage.local.setItem(STORAGE_KEY_VISIBLE_TABS, nextVisibleTabs);
    }, [request.error, request.loading, serverDefaultStartupPage, serverVisibleTabs, updateMetadataSetting]);

    useEffect(() => {
        if (request.loading) {
            return;
        }

        let cancelled = false;
        hydrateNavigationResumeTargets()
            .catch(defaultPromiseErrorHandler('useNavigationSettings::hydrateNavigationResumeTargets'))
            .finally(() => {
                if (!cancelled) {
                    setResumeTargetsReady(true);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [request.loading]);

    const updateDefaultStartupPage = useCallback(
        (path: string) => {
            const nextStartupPage = sanitizeStartupPage(path);
            setDefaultStartupPage(nextStartupPage);
            AppStorage.local.setItem(STORAGE_KEY_STARTUP_PAGE, nextStartupPage);
            updateMetadataSetting('defaultStartupPage', nextStartupPage).catch(
                defaultPromiseErrorHandler('useNavigationSettings::updateDefaultStartupPage'),
            );
        },
        [updateMetadataSetting],
    );

    const updateVisibleTabs = useCallback(
        (paths: string[]) => {
            const nextVisibleTabs = paths.filter((path) => VALID_NAVIGATION_PATHS.has(path));
            const normalizedVisibleTabs = nextVisibleTabs.length ? nextVisibleTabs : DEFAULT_VISIBLE_TABS;
            setVisibleTabs(normalizedVisibleTabs);
            AppStorage.local.setItem(STORAGE_KEY_VISIBLE_TABS, normalizedVisibleTabs);
            updateMetadataSetting('visibleTabs', normalizedVisibleTabs).catch(
                defaultPromiseErrorHandler('useNavigationSettings::updateVisibleTabs'),
            );
        },
        [updateMetadataSetting],
    );

    const toggleTabVisibility = useCallback(
        (path: string) => {
            const nextVisibleTabs = visibleTabs.includes(path)
                ? visibleTabs.filter((visiblePath) => visiblePath !== path)
                : [...visibleTabs, path];
            updateVisibleTabs(nextVisibleTabs);
        },
        [updateVisibleTabs, visibleTabs],
    );

    return {
        defaultStartupPage,
        setDefaultStartupPage: updateDefaultStartupPage,
        visibleTabs,
        setVisibleTabs: updateVisibleTabs,
        toggleTabVisibility,
        isReady: (!request.loading || !!request.error) && resumeTargetsReady,
    };
}
