/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/* eslint-disable import/no-extraneous-dependencies */

import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import viteTsconfigPaths from 'vite-tsconfig-paths';
import legacy from '@vitejs/plugin-legacy';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { VitePWA } from 'vite-plugin-pwa';
import 'dotenv/config';

const enableFrontendReactErrors = process.env.VITE_ENABLE_FRONTEND_REACT_ERRORS === 'true';
const disableLegacyBuild = process.env.VITE_DISABLE_LEGACY === 'true';

// eslint-disable-next-line import/no-default-export
export default defineConfig(({ command }) => ({
    base: process.env.VITE_SUBPATH || (command === 'serve' ? './' : '/'),
    build: {
        outDir: 'build',
        minify: enableFrontendReactErrors ? false : undefined,
        sourcemap: enableFrontendReactErrors,
    },
    define: {
        'process.env.NODE_ENV': JSON.stringify(
            command === 'serve' || enableFrontendReactErrors ? 'development' : 'production',
        ),
    },
    server: {
        port: Number(process.env.PORT),
        allowedHosts: process.env.ALLOWED_HOSTS.split(',').map((s) => s.trim()),
    },
    resolve: {
        alias: {
            '@': path.resolve(import.meta.dirname, './src'),
        },
    },
    optimizeDeps: {
        include: ['@mui/material/Tooltip'],
    },
    plugins: [
        react(),
        viteTsconfigPaths(),
        !disableLegacyBuild &&
            legacy({
                modernPolyfills: [
                    'es/array/to-spliced',
                    'es/array/to-sorted',
                    'es/array/find-last',
                    'es/array/find-last-index',
                    'es/object/group-by',
                ],
            }),
        nodePolyfills({
            include: ['assert'],
        }),
        // Only setup image runtime caching
        VitePWA({
            registerType: 'autoUpdate',
            manifest: false, // Use existing manifest
            devOptions: {
                enabled: true,
            },
            workbox: {
                globPatterns: [],
                runtimeCaching: [
                    {
                        urlPattern: ({ request, url }) => {
                            const { pathname } = url;
                            if (pathname.includes('/extension/icon/')) {
                                return false;
                            }

                            if (request.destination === 'image') {
                                return (
                                    pathname.match(/\/chapter\/[0-9]+\/page\/[0-9]+/g) ||
                                    pathname.match(/\/manga\/[0-9]+\/thumbnail/g) ||
                                    pathname.match(/\/anime\/[0-9]+\/thumbnail/g)
                                );
                            }

                            return (
                                pathname.match(/\/chapter\/[0-9]+\/page\/[0-9]+/g) ||
                                pathname.match(/\/manga\/[0-9]+\/thumbnail/g) ||
                                pathname.match(/\/anime\/[0-9]+\/thumbnail/g)
                            );
                        },
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'image-cache',
                            expiration: {
                                maxEntries: 10000,
                                purgeOnQuotaError: true,
                            },
                            cacheableResponse: {
                                statuses: [0, 200],
                            },
                        },
                    },
                ],
            },
        }),
    ],
}));
