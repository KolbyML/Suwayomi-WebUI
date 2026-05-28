/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import localforage from 'localforage';
import { jsonSaveParse } from '@/lib/HelperFunctions.ts';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { HttpMethod } from '@/lib/requests/client/RestClient.ts';
import type {
    NovelCategory,
    NovelCategoryMetadata,
    NovelChapterContent,
    NovelContentManifest,
    NovelMetadata,
    NovelParsedBook,
    NovelProgress,
} from '@/features/novel/Novel.types';
import {
    mergeNovelProgressForSave,
    type SaveableNovelProgressPayload,
} from '@/features/novel/storage/NovelProgressMerge';
import {
    canonicalizeLegacyNovelProgressForMigration,
    type LegacyNovelProgressSnapshot,
} from '@/lib/storage/NovelLegacyProgressMigration';

type StorageBackend = typeof window.localStorage | null;

export class Storage {
    private readonly memory = new Map<string, string>();

    constructor(private readonly storage: StorageBackend) {}

    parseValue<T>(value: string | null, defaultValue: T): T {
        if (value === null) {
            return defaultValue;
        }

        const parsedValue = jsonSaveParse(value);

        if (value === 'null' || value === 'undefined') {
            return parsedValue;
        }

        return parsedValue ?? (value as T);
    }

    getItem(key: string): string | null {
        if (!this.storage) {
            return this.memory.get(key) ?? null;
        }

        try {
            return this.storage.getItem(key);
        } catch {
            return this.memory.get(key) ?? null;
        }
    }

    getItemParsed<T>(key: string, defaultValue: T): T {
        return this.parseValue(this.getItem(key), defaultValue);
    }

    setItem(key: string, value: unknown, emitEvent: boolean = true): void {
        const currentValue = this.getItem(key);

        const fireEvent = (valueToStore: string | undefined) => {
            if (!emitEvent) {
                return;
            }

            window.dispatchEvent(
                new StorageEvent('storage', {
                    key,
                    oldValue: currentValue,
                    newValue: valueToStore,
                }),
            );
        };

        if (value === undefined) {
            if (this.storage) {
                try {
                    this.storage.removeItem(key);
                } catch {
                    this.memory.delete(key);
                }
            } else {
                this.memory.delete(key);
            }
            fireEvent(undefined);
            return;
        }

        const stringify = typeof value !== 'string';
        const valueToStore = stringify ? JSON.stringify(value) : value;

        if (this.storage) {
            try {
                this.storage.setItem(key, valueToStore);
            } catch {
                this.memory.set(key, valueToStore);
            }
        } else {
            this.memory.set(key, valueToStore);
        }
        fireEvent(valueToStore as string);
    }

    setItemIfMissing(key: string, value: unknown, emitEvent?: boolean): void {
        if (this.getItem(key) === null) {
            this.setItem(key, value, emitEvent);
        }
    }
}

// ============================================================================
// Types
// ============================================================================

export type * from '@/features/novel/Novel.types';

export interface NovelDiscoveredEpub {
    id: string;
    fileName: string;
}

export interface DiscoveredImportSummary {
    discoveredCount: number;
    importedIds: string[];
    skippedIds: string[];
    failedIds: string[];
}

export interface ImportedEpubResponse {
    metadata: NovelMetadata;
}

// ============================================================================
// Device ID Helper
// ============================================================================

function getDeviceId(): string {
    const key = 'manatan_device_id';
    let deviceId = localStorage.getItem(key);

    if (!deviceId) {
        deviceId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem(key, deviceId);
    }

    return deviceId;
}

function normalizeNovelImagePath(path: string): string {
    return path.replace(/^\/+/, '');
}

function getProgressPercent(progress: NovelProgress | null | undefined): number {
    return (progress?.progress ?? 0) * 100;
}

async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = typeof reader.result === 'string' ? reader.result : '';
            resolve(result.split(',')[1] ?? '');
        };
        reader.readAsDataURL(blob);
    });
}

// ============================================================================
// Server-backed Storage Implementation
// ============================================================================

class ServerStorage<T> {
    private memCache = new Map<string, T>();

    constructor(
        private readonly endpoint: string,
        private readonly storeName: string,
        private readonly itemEndpoint?: (key: string) => string,
    ) {}

    setCachedItem(key: string, value: T): void {
        this.memCache.set(key, value);
    }

    deleteCachedItem(key: string): void {
        this.memCache.delete(key);
    }

    clearCache(): void {
        this.memCache.clear();
    }

    async getItem<R = T>(key: string): Promise<R | null> {
        if (this.memCache.has(key)) {
            return this.memCache.get(key) as unknown as R;
        }

        // Check localStorage mirror for instant UI
        if (this.storeName === 'novel_metadata_list') {
            const cached = localStorage.getItem('manatan_novel_metadata_list');
            if (cached) {
                return JSON.parse(cached) as unknown as R;
            }
        }

        return await this.fetchFromServer<R>(key);
    }

    async getFreshItem<R = T>(key: string): Promise<R | null> {
        return await this.fetchFromServer<R>(key);
    }

    private async fetchFromServer<R = T>(key: string): Promise<R | null> {
        try {
            const response = await requestManager.getClient().fetcher(this.getItemEndpoint(key));
            if (response.status === 404) return null;
            const data = await response.json();

            this.memCache.set(key, data);
            return data as R;
        } catch (e) {
            console.error(`[AppStorage] Failed to get item ${key} from ${this.storeName}:`, e);
            return null;
        }
    }

    async setItem(key: string, value: T): Promise<T> {
        try {
            await requestManager.getClient().fetcher(this.getItemEndpoint(key), {
                httpMethod: HttpMethod.POST,
                data: this.wrapPayload(value),
            });
            this.memCache.set(key, value);
            return value;
        } catch (e) {
            console.error(`[AppStorage] Failed to set item ${key} in ${this.storeName}:`, e);
            throw e;
        }
    }

    async removeItem(key: string): Promise<void> {
        try {
            await requestManager.getClient().fetcher(this.getItemEndpoint(key), {
                httpMethod: HttpMethod.DELETE,
            });
            this.memCache.delete(key);
        } catch (e) {
            console.error(`[AppStorage] Failed to remove item ${key} from ${this.storeName}:`, e);
            throw e;
        }
    }

    async keys(): Promise<string[]> {
        if (this.storeName === 'novel_metadata') {
            const response = await requestManager.getClient().fetcher(this.endpoint);
            const data = (await response.json()) as NovelMetadata[];
            return data.map((m) => m.id);
        }
        return Array.from(this.memCache.keys());
    }

    private getItemEndpoint(key: string): string {
        return this.itemEndpoint?.(key) ?? `${this.endpoint}/${encodeURIComponent(key)}`;
    }

    private wrapPayload(value: any) {
        if (this.storeName === 'novel_metadata') return { metadata: value };
        if (this.storeName === 'novel_progress') return { progress: value };
        if (this.storeName === 'novel_categories') return value;
        if (this.storeName === 'novel_category_metadata') return value;
        return value;
    }
}

// ============================================================================
// AppStorage Class
// ============================================================================

export class AppStorage {
    private static novelProgressSaveQueues = new Map<string, Promise<void>>();

    static readonly local = new Storage(AppStorage.getSafeStorage(() => window.localStorage));
    static readonly session = new Storage(AppStorage.getSafeStorage(() => window.sessionStorage));

    // Raw EPUB files
    static readonly files = {
        async setItem(key: string, file: File | Blob): Promise<void> {
            const formData = new FormData();
            formData.append('file', file);
            await requestManager.getClient().fetcher(`/api/novels/${encodeURIComponent(key)}/upload`, {
                httpMethod: HttpMethod.POST,
                data: formData,
            });
        },
        async getItem(key: string): Promise<Blob | null> {
            try {
                const response = await requestManager
                    .getClient()
                    .fetcher(`/api/novels/${encodeURIComponent(key)}/file`, {
                        checkResponseIsJson: false,
                    });
                if (response.status === 404) return null;
                return await response.blob();
            } catch (e) {
                return null;
            }
        },
        async discoverPendingEpubs(): Promise<NovelDiscoveredEpub[]> {
            try {
                const response = await requestManager.getClient().fetcher('/api/novels/imports/discover');
                if (response.status === 404) return [];
                return (await response.json()) as NovelDiscoveredEpub[];
            } catch (e) {
                console.error('[AppStorage] Failed to discover pending EPUB files:', e);
                return [];
            }
        },
        async importDiscoveredEpubs(): Promise<DiscoveredImportSummary> {
            throw new Error('EPUB import is handled by the browser TTSU importer, not the Rust backend.');
        },
        async importEpub(key: string): Promise<ImportedEpubResponse> {
            void key;
            throw new Error('EPUB import is handled by the browser TTSU importer, not the Rust backend.');
        },
        async keys(): Promise<string[]> {
            return await AppStorage.getNovelIdsForSyncStores();
        },
        async removeItem(key: string): Promise<void> {},
    };

    // Book metadata with stats
    static readonly novelMetadata = new ServerStorage<NovelMetadata>('/api/novels', 'novel_metadata');

    // Pre-parsed book content
    static readonly novelContent = {
        async getItem(key: string): Promise<NovelParsedBook | null> {
            try {
                const response = await requestManager
                    .getClient()
                    .fetcher(`/api/novels/${encodeURIComponent(key)}/content`);
                if (response.status === 404) return null;
                const data = await response.json();

                // Static serving means we don't need to rebuild blobs for images
                return { ...data, imageBlobs: {} };
            } catch (e) {
                return null;
            }
        },
        async getManifest(key: string): Promise<NovelContentManifest | null> {
            try {
                const response = await requestManager
                    .getClient()
                    .fetcher(`/api/novels/${encodeURIComponent(key)}/content/manifest`);
                if (response.status === 404) return null;
                return (await response.json()) as NovelContentManifest;
            } catch (e) {
                return null;
            }
        },
        async getChapter(key: string, chapterIndex: number): Promise<NovelChapterContent | null> {
            try {
                const response = await requestManager
                    .getClient()
                    .fetcher(
                        `/api/novels/${encodeURIComponent(key)}/chapters/${encodeURIComponent(chapterIndex)}`,
                    );
                if (response.status === 404) return null;
                return (await response.json()) as NovelChapterContent;
            } catch (e) {
                return null;
            }
        },
        async setItem(key: string, content: NovelParsedBook): Promise<void> {
            const dedupedImageEntries = new Map<string, Blob | string>();
            for (const [path, blob] of Object.entries(content.imageBlobs)) {
                const normalizedPath = normalizeNovelImagePath(path);
                if (!dedupedImageEntries.has(normalizedPath)) {
                    dedupedImageEntries.set(normalizedPath, blob);
                }
            }

            const convertedEntries = await Promise.all(
                Array.from(dedupedImageEntries.entries()).map(async ([path, blob]) => {
                    if (typeof blob === 'string') {
                        return [path, blob] as const;
                    }
                    return [path, await blobToBase64(blob)] as const;
                }),
            );

            const imageBlobs = Object.fromEntries(convertedEntries);

            await requestManager.getClient().fetcher(`/api/novels/${encodeURIComponent(key)}/content`, {
                httpMethod: HttpMethod.POST,
                data: { ...content, imageBlobs },
            });
        },
        async keys(): Promise<string[]> {
            return await AppStorage.getNovelIdsForSyncStores();
        },
        async removeItem(key: string): Promise<void> {},
    };

    // Reading progress (the bookmark)
    static readonly novelProgress = new ServerStorage<NovelProgress>(
        '/api/novels',
        'novel_progress',
        (key) => `/api/novels/${encodeURIComponent(key)}/progress`,
    );

    // Novel Categories
    static readonly novelCategories = new ServerStorage<NovelCategory>('/api/novels/categories', 'novel_categories');

    // Novel Category metadata (sort settings per category)
    static readonly novelCategoryMetadata = new ServerStorage<NovelCategoryMetadata>(
        '/api/novels/categories/metadata',
        'novel_category_metadata',
    );

    // Custom imported fonts
    static readonly customFonts = localforage.createInstance({
        name: 'Manatan',
        storeName: 'custom_fonts',
        description: 'User-imported font files',
    });

    // ========================================================================
    // Private Helpers
    // ========================================================================

    private static getSafeStorage(getter: () => StorageBackend): StorageBackend {
        try {
            return getter();
        } catch {
            return null;
        }
    }

    private static invalidateNovelMetadataList(): void {
        try {
            localStorage.removeItem('manatan_novel_metadata_list');
        } catch {}
    }

    private static async getNovelIdsForSyncStores(): Promise<string[]> {
        const metadata = await this.getAllNovelMetadata();
        return metadata.map(({ id }) => id);
    }

    // ========================================================================
    // Progress Methods
    // ========================================================================

    static async saveNovelProgress(
        bookId: string,
        progress: SaveableNovelProgressPayload,
    ): Promise<void> {
        const previousSave = this.novelProgressSaveQueues.get(bookId) ?? Promise.resolve();
        const queuedSave = previousSave
            .catch(() => undefined)
            .then(async () => {
                const existing = await this.getNovelProgress(bookId);
                const now = Date.now();
                const nextProgress = mergeNovelProgressForSave({
                    existing,
                    progress,
                    now,
                    deviceId: getDeviceId(),
                });

                this.novelProgress.setCachedItem(bookId, nextProgress);
                try {
                    await this.novelProgress.setItem(bookId, nextProgress);
                } catch (error) {
                    console.warn('[AppStorage] Novel progress saved locally; server persistence failed:', error);
                }
            });

        this.novelProgressSaveQueues.set(bookId, queuedSave);
        try {
            await queuedSave;
        } finally {
            if (this.novelProgressSaveQueues.get(bookId) === queuedSave) {
                this.novelProgressSaveQueues.delete(bookId);
            }
        }
    }

    static async getNovelProgress(bookId: string): Promise<NovelProgress | null> {
        return await this.novelProgress.getItem(bookId);
    }

    static async getFreshNovelProgress(bookId: string): Promise<NovelProgress | null> {
        return await this.novelProgress.getFreshItem(bookId);
    }

    static async hasProgress(bookId: string): Promise<boolean> {
        const progress = await this.getNovelProgress(bookId);
        return progress !== null && getProgressPercent(progress) > 0;
    }

    // ========================================================================
    // Metadata Methods
    // ========================================================================

    static async getNovelMetadata(bookId: string): Promise<NovelMetadata | null> {
        return await this.novelMetadata.getItem(bookId);
    }

    static async saveNovelMetadata(metadata: NovelMetadata): Promise<void> {
        await this.novelMetadata.setItem(metadata.id, metadata);
        this.invalidateNovelMetadataList();
    }

    static async updateNovelMetadata(bookId: string, updates: Partial<NovelMetadata>): Promise<void> {
        const existing = await this.getNovelMetadata(bookId);
        if (!existing) return;

        await this.novelMetadata.setItem(bookId, {
            ...existing,
            ...updates,
        });
        this.invalidateNovelMetadataList();
    }

    static async getAllNovelMetadata(): Promise<NovelMetadata[]> {
        try {
            const response = await requestManager.getClient().fetcher('/api/novels');
            const data = (await response.json()) as NovelMetadata[];
            // Instant library mirror update
            localStorage.setItem('manatan_novel_metadata_list', JSON.stringify(data));
            this.novelMetadata.clearCache();
            for (const metadata of data) {
                this.novelMetadata.setCachedItem(metadata.id, metadata);
            }
            return data;
        } catch (e) {
            // Fallback to local mirror if server offline
            const cached = localStorage.getItem('manatan_novel_metadata_list');
            return cached ? JSON.parse(cached) : [];
        }
    }

    // ========================================================================
    // Content Methods
    // ========================================================================

    static async getNovelContent(bookId: string): Promise<NovelParsedBook | null> {
        return await this.novelContent.getItem(bookId);
    }

    static async getNovelContentManifest(bookId: string): Promise<NovelContentManifest | null> {
        return await this.novelContent.getManifest(bookId);
    }

    static async getNovelChapterContent(bookId: string, chapterIndex: number): Promise<NovelChapterContent | null> {
        return await this.novelContent.getChapter(bookId, chapterIndex);
    }

    static async saveNovelContent(bookId: string, content: NovelParsedBook): Promise<void> {
        await this.novelContent.setItem(bookId, content);
    }

    // ========================================================================
    // Delete Methods
    // ========================================================================

    static async deleteNovelData(bookId: string): Promise<void> {
        await requestManager.getClient().fetcher(`/api/novels/${encodeURIComponent(bookId)}`, {
            httpMethod: HttpMethod.DELETE,
        });
        this.novelMetadata.deleteCachedItem(bookId);
        this.novelProgress.deleteCachedItem(bookId);
        this.invalidateNovelMetadataList();
        console.log('[AppStorage] All data deleted for:', bookId);
    }

    static async deleteNovelProgress(bookId: string): Promise<void> {
        await this.novelProgress.removeItem(bookId);
    }

    // ========================================================================
    // Sync Methods
    // ========================================================================

    static async getAllProgressForSync(): Promise<Array<{ bookId: string; progress: NovelProgress }>> {
        const metadata = await this.getAllNovelMetadata();
        const allProgress: Array<{ bookId: string; progress: NovelProgress }> = [];

        for (const m of metadata) {
            const progress = await this.getNovelProgress(m.id);
            if (progress) {
                allProgress.push({ bookId: m.id, progress });
            }
        }

        return allProgress;
    }

    static async getProgressModifiedSince(
        timestamp: number,
    ): Promise<Array<{ bookId: string; progress: NovelProgress }>> {
        const all = await this.getAllProgressForSync();
        return all.filter(({ progress }) => (progress.lastModified || 0) > timestamp);
    }

    static async mergeRemoteProgress(
        bookId: string,
        remoteProgress: NovelProgress,
    ): Promise<{ result: 'local' | 'remote' | 'conflict'; merged?: NovelProgress }> {
        const localProgress = await this.getNovelProgress(bookId);

        if (!localProgress) {
            await this.novelProgress.setItem(bookId, remoteProgress);
            return { result: 'remote' };
        }

        if (!localProgress.lastModified || !remoteProgress.lastModified) {
            if (getProgressPercent(remoteProgress) > getProgressPercent(localProgress)) {
                await this.novelProgress.setItem(bookId, remoteProgress);
                return { result: 'remote' };
            }
            return { result: 'local' };
        }

        if (localProgress.deviceId === remoteProgress.deviceId) {
            if (remoteProgress.lastModified > localProgress.lastModified) {
                await this.novelProgress.setItem(bookId, remoteProgress);
                return { result: 'remote' };
            }
            return { result: 'local' };
        }

        if (getProgressPercent(remoteProgress) > getProgressPercent(localProgress)) {
            await this.novelProgress.setItem(bookId, remoteProgress);
            return { result: 'remote' };
        } else if (getProgressPercent(localProgress) > getProgressPercent(remoteProgress)) {
            return { result: 'local' };
        } else {
            if (remoteProgress.lastModified > localProgress.lastModified) {
                await this.novelProgress.setItem(bookId, remoteProgress);
                return { result: 'remote' };
            }
            return { result: 'local' };
        }
    }

    static async exportProgressData(): Promise<string> {
        const allProgress = await this.getAllProgressForSync();
        return JSON.stringify({
            version: 1,
            exportedAt: Date.now(),
            deviceId: getDeviceId(),
            data: allProgress,
        });
    }

    static async importProgressData(jsonData: string): Promise<{ imported: number; conflicts: number }> {
        const parsed = JSON.parse(jsonData);
        if (parsed.version !== 1) {
            throw new Error('Unsupported export version');
        }

        let imported = 0;
        let conflicts = 0;

        for (const { bookId, progress } of parsed.data) {
            const result = await this.mergeRemoteProgress(bookId, progress);
            if (result.result === 'remote') {
                imported++;
            } else if (result.result === 'conflict') {
                conflicts++;
            }
        }

        return { imported, conflicts };
    }

    // ========================================================================
    // Migration Methods
    // ========================================================================

    static async migrateLegacyNovelStorage(): Promise<void> {
        const legacyMetadata = localforage.createInstance({
            name: 'Manatan',
            storeName: 'novel_metadata',
        });

        const keys = await legacyMetadata.keys();
        if (keys.length === 0) return;

        console.log(`[Migration] Found ${keys.length} books in legacy storage. Migrating...`);

        const legacyFiles = localforage.createInstance({
            name: 'Manatan',
            storeName: 'novel_files',
        });
        const legacyContent = localforage.createInstance({
            name: 'Manatan',
            storeName: 'novel_content',
        });
        const legacyProgress = localforage.createInstance({
            name: 'Manatan',
            storeName: 'novel_progress',
        });
        const legacyCategories = localforage.createInstance({
            name: 'Manatan',
            storeName: 'novel_categories',
        });
        const legacyCatMeta = localforage.createInstance({
            name: 'Manatan',
            storeName: 'novel_category_metadata',
        });

        const catKeys = await legacyCategories.keys();
        for (const key of catKeys) {
            const cat = await legacyCategories.getItem<NovelCategory>(key);
            if (cat) await this.saveNovelCategory(cat);
        }

        const catMetaKeys = await legacyCatMeta.keys();
        for (const key of catMetaKeys) {
            const meta = await legacyCatMeta.getItem<NovelCategoryMetadata>(key);
            if (meta) await this.setNovelCategoryMetadata(key, meta);
        }

        const migratedKeys: string[] = [];
        for (const key of keys) {
            try {
                const metadata = await legacyMetadata.getItem<NovelMetadata>(key);
                if (!metadata) continue;

                const file = await legacyFiles.getItem<Blob>(key);
                const progress = await legacyProgress.getItem<LegacyNovelProgressSnapshot>(key);
                if (!file) {
                    console.warn(`[Migration] Skipping ${metadata.title}: original EPUB file is missing.`);
                    continue;
                }

                await this.files.setItem(key, file);
                const { importNovelEpub } = await import('@/features/novel/import/services/novelImportService');
                const imported = await importNovelEpub(key, file);
                const importedMetadata = imported.metadata;
                const mergedMetadata: NovelMetadata = {
                    ...importedMetadata,
                    addedAt: metadata.addedAt,
                    categoryIds: metadata.categoryIds ?? [],
                    hasProgress: Boolean(progress),
                    lastModified: metadata.lastModified,
                    syncVersion: metadata.syncVersion,
                };
                await this.saveNovelMetadata(mergedMetadata);
                if (progress) {
                    await this.novelProgress.setItem(
                        key,
                        canonicalizeLegacyNovelProgressForMigration(progress, mergedMetadata),
                    );
                }

                console.log(`[Migration] Successfully migrated: ${metadata.title}`);
                migratedKeys.push(key);
            } catch (e) {
                console.error(`[Migration] Failed to migrate book ${key}:`, e);
            }
        }

        await Promise.all(
            migratedKeys.flatMap((key) => [
                legacyMetadata.removeItem(key),
                legacyFiles.removeItem(key),
                legacyContent.removeItem(key),
                legacyProgress.removeItem(key),
            ]),
        );
        await Promise.all([legacyCategories.clear(), legacyCatMeta.clear()]);

        console.log(`[Migration] Migration complete. Reimported ${migratedKeys.length} EPUBs into canonical storage.`);
    }

    // ========================================================================
    // Category Methods
    // ========================================================================

    static async getNovelCategories(): Promise<NovelCategory[]> {
        try {
            const response = await requestManager.getClient().fetcher('/api/novels/categories');
            const categories = (await response.json()) as NovelCategory[];
            return categories.filter((category) => !this.isReservedNovelCategoryId(category.id));
        } catch (e) {
            return [];
        }
    }

    static async getNovelCategory(categoryId: string): Promise<NovelCategory | null> {
        return await this.novelCategories.getItem(categoryId);
    }

    static async saveNovelCategory(category: NovelCategory): Promise<void> {
        if (this.isReservedNovelCategoryId(category.id)) {
            throw new Error(`Cannot save reserved novel category ${category.id}`);
        }
        await this.novelCategories.setItem(category.id, category);
    }

    static async createNovelCategory(name: string): Promise<NovelCategory> {
        const categories = await this.getNovelCategories();
        const maxOrder = categories.reduce((max, c) => Math.max(max, c.order), -1);

        const newCategory: NovelCategory = {
            id: `novelcat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name,
            order: maxOrder + 1,
            createdAt: Date.now(),
            lastModified: Date.now(),
        };

        await requestManager.getClient().fetcher('/api/novels/categories', {
            httpMethod: HttpMethod.POST,
            data: newCategory,
        });
        return newCategory;
    }

    static async updateNovelCategory(categoryId: string, updates: Partial<NovelCategory>): Promise<void> {
        if (this.isReservedNovelCategoryId(categoryId)) {
            throw new Error(`Cannot update reserved novel category ${categoryId}`);
        }
        const existing = await this.getNovelCategory(categoryId);
        if (!existing) return;

        const updated = {
            ...existing,
            ...updates,
            lastModified: Date.now(),
        };

        await this.novelCategories.setItem(categoryId, updated);
    }

    static async deleteNovelCategory(categoryId: string): Promise<void> {
        if (this.isReservedNovelCategoryId(categoryId)) {
            throw new Error(`Cannot delete reserved novel category ${categoryId}`);
        }
        await this.novelCategories.removeItem(categoryId);
    }

    static isReservedNovelCategoryId(categoryId: string): boolean {
        return categoryId === '__all__' || categoryId === '__default__';
    }

    static async getNovelCategoryMetadata(categoryId: string): Promise<NovelCategoryMetadata | null> {
        return await this.novelCategoryMetadata.getItem(categoryId);
    }

    static async setNovelCategoryMetadata(categoryId: string, metadata: NovelCategoryMetadata): Promise<void> {
        await this.novelCategoryMetadata.setItem(categoryId, metadata);
    }

    static async getAllNovelCategoryMetadata(): Promise<Record<string, NovelCategoryMetadata>> {
        try {
            const response = await requestManager.getClient().fetcher('/api/novels/categories/metadata');
            return await response.json();
        } catch (e) {
            return {};
        }
    }
}
