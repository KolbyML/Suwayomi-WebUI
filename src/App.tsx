/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import CssBaseline from '@mui/material/CssBaseline';
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { loadable } from 'react-lazily/loadable';
import Box from '@mui/material/Box';
import { AwaitableComponent } from 'awaitable-component';
import { AppContext } from '@/base/contexts/AppContext.tsx';
import { DefaultNavBar } from '@/features/navigation-bar/components/DefaultNavBar.tsx';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { lazyLoadFallback } from '@/base/utils/LazyLoad.tsx';
import { ErrorBoundary } from '@/base/components/feedback/ErrorBoundary.tsx';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { useNavBarContext } from '@/features/navigation-bar/NavbarContext.tsx';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { useMetadataServerSettings } from '@/features/settings/services/ServerSettingsMetadata.ts';
import { BrowseTab } from '@/features/browse/Browse.types.ts';
import { useNavigationSettings } from '@/features/navigation-bar/NavigationBar.hooks.ts';
import { LoginPage } from '@/features/authentication/screens/LoginPage.tsx';
import { AuthGuard } from '@/features/authentication/components/AuthGuard.tsx';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { ReactRouter } from '@/lib/react-router/ReactRouter.ts';
import { AuthManager } from '@/features/authentication/AuthManager.ts';
import { ImageProcessingType } from '@/features/settings/Settings.types.ts';
import { Browse } from '@/features/browse/screens/Browse.tsx';
import { Library } from '@/features/library/screens/Library.tsx';
import { AnimeLibrary } from '@/features/anime/screens/AnimeLibrary.tsx';
import { More } from '@/features/settings/screens/More.tsx';
import { NovelLibrary } from '@/features/novel/library/screens/NovelLibrary.tsx';
import { Dictionary } from '@/features/dictionary/Dictionary.tsx';
import { READER_VIEWPORT_HEIGHT } from '@/features/reader/ReaderViewport.constants.ts';
import { useReaderViewportCssVariables } from '@/features/reader/hooks/useReaderViewportCssVariables.ts';

// Manatan OCR Desktop Script Initialization
import { OCRProvider, useOCR } from '@/Manatan/context/OCRContext';
import { OCRManager } from '@/Manatan/OCRManager.tsx';
import { FpsCounterOverlay } from '@/Manatan/components/FpsCounterOverlay.tsx';
import { ImageLoadingStatsOverlay } from '@/Manatan/components/ImageLoadingStats';

// Manatan Sync Provider
import { SyncProvider } from '@/features/sync/services/SyncContext';
import { MembershipPerksPopup } from '@/features/membership/components/MembershipPerksPopup.tsx';
import { DesktopUpdateChecker } from '@/features/app-updates/components/DesktopUpdateChecker.tsx';
import {
    logStartupMetric,
    logStartupMetricAfterPaint,
    notifyNativeStartupReady,
} from '@/Manatan/utils/startupMetrics.ts';

const { DownloadQueue } = loadable(() => import('@/features/downloads/screens/DownloadQueue.tsx'), lazyLoadFallback);
const { AnimeDetails } = loadable(() => import('@/features/anime/screens/AnimeDetails.tsx'), lazyLoadFallback);
const { AnimeEpisode } = loadable(() => import('@/features/anime/reader/screens/AnimeEpisode.tsx'), lazyLoadFallback);
const { AnimeLocalPlayer } = loadable(
    () => import('@/features/anime/reader/screens/AnimeLocalPlayer.tsx'),
    lazyLoadFallback,
);
const nativeOverlayLazyLoadFallback = {
    fallback: <Box sx={{ minHeight: '100vh', backgroundColor: 'transparent' }} />,
};
const { NativeAnimePlayerOverlay } = loadable(
    () => import('@/features/anime/reader/screens/NativeAnimePlayerOverlay.tsx'),
    nativeOverlayLazyLoadFallback,
);
const { AnimeSourceBrowse } = loadable(
    () => import('@/features/anime/browse/screens/AnimeSourceBrowse.tsx'),
    lazyLoadFallback,
);
const { AnimeSearchAll } = loadable(
    () => import('@/features/global-search/screens/AnimeSearchAll.tsx'),
    lazyLoadFallback,
);
const { AnimeSourceConfigure } = loadable(
    () => import('@/features/source/configuration/screens/AnimeSourceConfigure.tsx'),
    lazyLoadFallback,
);
const { Manga } = loadable(() => import('@/features/manga/screens/Manga.tsx'), lazyLoadFallback);
const { SearchAll } = loadable(() => import('@/features/global-search/screens/SearchAll.tsx'), lazyLoadFallback);
const { Settings } = loadable(() => import('@/features/settings/screens/Settings.tsx'), lazyLoadFallback);
const { About } = loadable(() => import('@/features/settings/screens/About.tsx'), lazyLoadFallback);
const { Backup } = loadable(() => import('@/features/backup/screens/Backup.tsx'), lazyLoadFallback);
const { CategorySettings } = loadable(
    () => import('@/features/category/screens/CategorySettings.tsx'),
    lazyLoadFallback,
);
const { AnimeCategorySettings } = loadable(
    () => import('@/features/category/screens/AnimeCategorySettings.tsx'),
    lazyLoadFallback,
);
const { NovelCategorySettings } = loadable(
    () => import('@/features/novel/categories/screens/NovelCategorySettings.tsx'),
    lazyLoadFallback,
);
const { SourceConfigure } = loadable(
    () => import('@/features/source/configuration/screens/SourceConfigure.tsx'),
    lazyLoadFallback,
);
const { SourceMangas } = loadable(() => import('@/features/source/browse/screens/SourceMangas.tsx'), lazyLoadFallback);
const { ExtensionInfo } = loadable(
    () => import('@/features/extension/info/screens/ExtensionInfo.tsx'),
    lazyLoadFallback,
);
const { AnimeExtensionInfo } = loadable(
    () => import('@/features/extension/info/screens/AnimeExtensionInfo.tsx'),
    lazyLoadFallback,
);
const { Updates } = loadable(() => import('@/features/updates/screens/Updates.tsx'), lazyLoadFallback);
const { History } = loadable(() => import('@/features/history/screens/History.tsx'), lazyLoadFallback);
const { LibrarySettings } = loadable(() => import('@/features/library/screens/LibrarySettings.tsx'), lazyLoadFallback);
const { DownloadSettings } = loadable(
    () => import('@/features/downloads/screens/DownloadSettings.tsx'),
    lazyLoadFallback,
);
const { ImagesSettings } = loadable(() => import('@/features/settings/screens/ImagesSettings.tsx'), lazyLoadFallback);
const { ImageProcessingSetting } = loadable(
    () => import('@/features/settings/screens/ImageProcessingSetting.tsx'),
    lazyLoadFallback,
);
const { IOSAdvancedSettings } = loadable(
    () => import('@/features/settings/screens/IOSAdvancedSettings.tsx'),
    lazyLoadFallback,
);
const { ServerSettings } = loadable(() => import('@/features/settings/screens/ServerSettings.tsx'), lazyLoadFallback);
const { BrowseSettings } = loadable(() => import('@/features/browse/screens/BrowseSettings.tsx'), lazyLoadFallback);
const { Migrate } = loadable(() => import('@/features/migration/screens/Migrate.tsx'), lazyLoadFallback);
const { DeviceSetting } = loadable(() => import('@/features/device/screens/DeviceSetting.tsx'), lazyLoadFallback);
const { TrackingSettings } = loadable(
    () => import('@/features/tracker/screens/TrackingSettings.tsx'),
    lazyLoadFallback,
);
const { TrackerOAuthLogin } = loadable(
    () => import('@/features/tracker/screens/TrackerOAuthLogin.tsx'),
    lazyLoadFallback,
);
const { LibraryDuplicates } = loadable(
    () => import('@/features/library/screens/LibraryDuplicates.tsx'),
    lazyLoadFallback,
);
const { AnimeLibraryDuplicates } = loadable(
    () => import('@/features/library/screens/AnimeLibraryDuplicates.tsx'),
    lazyLoadFallback,
);
const { Appearance } = loadable(() => import('@/features/settings/screens/Appearance.tsx'), lazyLoadFallback);
const { GlobalReaderSettings } = loadable(
    () => import('@/features/reader/settings/screens/GlobalReaderSettings.tsx'),
    lazyLoadFallback,
);
const { Reader } = loadable(() => import('@/features/reader/screens/Reader.tsx'), lazyLoadFallback);
const { HistorySettings } = loadable(() => import('@/features/history/screens/HistorySettings.tsx'), lazyLoadFallback);
const { NovelReaderScreen } = loadable(
    () => import('@/features/novel/reader/screens/NovelReaderScreen.tsx'),
    lazyLoadFallback,
);
const { SRSLibrary } = loadable(() => import('@/features/srs/screens/SRSLibrary.tsx'), lazyLoadFallback);
const { SyncSettings } = loadable(() => import('@/features/sync/screens/SyncSettings.tsx'), lazyLoadFallback);
const { TextBoxMobileRouteHarness } = loadable(
    () => import('@/Manatan/testing/TextBoxMobileRouteHarness.tsx'),
    lazyLoadFallback,
);

if (import.meta.env.DEV) {
    // Adds messages only in a dev environment
}

const ScrollToTop = () => {
    const { pathname } = useLocation();
    const navigationType = useNavigationType();

    useLayoutEffect(() => {
        if (navigationType === 'POP') {
            return;
        }
        window.scrollTo(0, 0);
    }, [pathname, navigationType]);

    return null;
};

const StartupRouteMetrics = () => {
    const { pathname } = useLocation();
    const navigationType = useNavigationType();

    useLayoutEffect(() => {
        logStartupMetric(
            'app_root_layout_effect',
            {
                path: pathname,
                navigationType,
            },
            'app_root_layout_effect',
        );
    }, [pathname, navigationType]);

    useEffect(
        () =>
            logStartupMetricAfterPaint(
                'app_root_first_paint_after_render',
                {
                    path: pathname,
                    navigationType,
                },
                'app_root_first_paint_after_render',
            ),
        [pathname, navigationType],
    );

    return null;
};

const InitialBackgroundRequests = () => {
    // Load the full download status once on startup to fill the cache
    requestManager.useGetDownloadStatus({ nextFetchPolicy: 'standby' });

    const [fetchExtensionList] = requestManager.useExtensionListFetch();

    useEffect(() => {
        // Fetch extension list on startup to show up-to-date number of available extension updates in the navigation bar
        // without having to open the extensions page.
        fetchExtensionList().catch(defaultPromiseErrorHandler('App::InitialBackgroundRequests: extension list'));

        // Reimport old IndexedDB EPUBs into canonical novel storage.
        import('@/lib/storage/AppStorage').then(({ AppStorage }) => {
            AppStorage.migrateLegacyNovelStorage().catch(
                defaultPromiseErrorHandler('App::InitialBackgroundRequests: novel migration'),
            );
        });
    }, []);

    return null;
};

const TextToSpeechVoiceWarmup = () => {
    const { settings } = useOCR();

    useEffect(() => {
        let cancelled = false;
        let cancelWarmup: (() => void) | undefined;
        const timerId = window.setTimeout(() => {
            import('@/Manatan/utils/wordAudio.ts')
                .then(({ preloadTextToSpeechVoiceOptions }) => {
                    if (cancelled) {
                        return;
                    }
                    cancelWarmup = preloadTextToSpeechVoiceOptions(settings.yomitanLanguage);
                })
                .catch(defaultPromiseErrorHandler('App::TextToSpeechVoiceWarmup'));
        }, 4500);

        return () => {
            cancelled = true;
            window.clearTimeout(timerId);
            cancelWarmup?.();
        };
    }, [settings.yomitanLanguage]);

    return null;
};

/**
 * Creates permanent subscriptions to always have the latest data.
 *
 * E.g. in case a view is open, which does not subscribe to the download updates, finished downloads are never received
 * and thus, data of existing chapters/mangas in the cache get outdated
 */
const BackgroundSubscriptions = () => {
    const { isAuthRequired } = AuthManager.useSession();

    const skipConnection = isAuthRequired === null;

    requestManager.useDownloadSubscription({ skip: skipConnection });
    requestManager.useUpdaterSubscription({ skip: skipConnection });
    requestManager.useServerSettingsSubscription({ skip: skipConnection });
    requestManager.useGlobalMetaSubscription({ skip: skipConnection });

    return null;
};

const ReactRouterSetter = () => {
    const navigate = useNavigate();

    useEffect(() => {
        ReactRouter.setNavigateFn(navigate);
    }, []);

    return null;
};

const PrivateRoutes = () => <Outlet />;

const MainApp = () => {
    const { pathname } = useLocation();
    const { navBarWidth, appBarHeight, bottomBarHeight } = useNavBarContext();
    const nativeStartupReadyNotifiedRef = useRef(false);

    const {
        settings: { hideHistory },
    } = useMetadataServerSettings();
    const { defaultStartupPage, isReady: areNavigationSettingsReady } = useNavigationSettings();

    useEffect(() => {
        if (!areNavigationSettingsReady) {
            return;
        }

        logStartupMetric(
            'app_navigation_settings_ready',
            {
                defaultStartupPage,
            },
            'app_navigation_settings_ready',
        );
    }, [areNavigationSettingsReady, defaultStartupPage]);

    useEffect(() => {
        if (!areNavigationSettingsReady) {
            return undefined;
        }

        return logStartupMetricAfterPaint(
            'app_main_shell_first_paint_after_navigation_ready',
            {
                defaultStartupPage,
            },
            'app_main_shell_first_paint_after_navigation_ready',
        );
    }, [areNavigationSettingsReady, defaultStartupPage]);

    useEffect(() => {
        if (!areNavigationSettingsReady || pathname === AppRoutes.root.path || nativeStartupReadyNotifiedRef.current) {
            return undefined;
        }

        let cancelled = false;
        let frameId = 0;
        let nestedFrameId = 0;
        let retryTimerId = 0;
        const loadingSelector = '[data-manatan-loading-placeholder="true"], [data-manatan-auth-splash="true"]';

        const tryNotifyReady = (attempt: number) => {
            frameId = window.requestAnimationFrame(() => {
                nestedFrameId = window.requestAnimationFrame(() => {
                    if (cancelled) {
                        return;
                    }

                    const loadingElement = document.querySelector(loadingSelector);
                    if (loadingElement && attempt < 40) {
                        retryTimerId = window.setTimeout(() => tryNotifyReady(attempt + 1), 50);
                        return;
                    }

                    nativeStartupReadyNotifiedRef.current = true;
                    const details = {
                        path: window.location.pathname,
                        defaultStartupPage,
                        waitedAttempts: attempt,
                        forced: !!loadingElement,
                    };
                    logStartupMetric('react_app_ready_signal', details, 'react_app_ready_signal');
                    notifyNativeStartupReady('react_app_ready', details);
                });
            });
        };

        tryNotifyReady(0);

        return () => {
            cancelled = true;
            window.cancelAnimationFrame(frameId);
            window.cancelAnimationFrame(nestedFrameId);
            window.clearTimeout(retryTimerId);
        };
    }, [areNavigationSettingsReady, defaultStartupPage, pathname]);

    return (
        <Box
            id="appMainContainer"
            component="main"
            sx={{
                minHeight: `calc(100vh - ${appBarHeight + bottomBarHeight}px)`,
                width: `calc(100vw - (100vw - 100%) - ${navBarWidth}px)`,
                minWidth: `calc(100vw - (100vw - 100%) - ${navBarWidth}px)`,
                maxWidth: `calc(100vw - (100vw - 100%) - ${navBarWidth}px)`,
                position: 'relative',
                mt: `${appBarHeight}px`,
                pb: `calc(${bottomBarHeight}px + ${!bottomBarHeight ? 'env(safe-area-inset-bottom)' : '0px'})`,
                pr: 'env(safe-area-inset-right)',
            }}
        >
            <ErrorBoundary>
                <Routes>
                    <Route path={AppRoutes.authentication.match}>
                        <Route path={AppRoutes.authentication.childRoutes.login.match} element={<LoginPage />} />
                    </Route>

                    <Route element={<PrivateRoutes />}>
                        {/* General Routes */}
                        <Route
                            path={AppRoutes.root.match}
                            element={
                                areNavigationSettingsReady ? (
                                    <Navigate to={defaultStartupPage} replace />
                                ) : (
                                    <LoadingPlaceholder />
                                )
                            }
                        />
                        <Route
                            path={AppRoutes.matchAll.match}
                            element={<Navigate to={AppRoutes.root.path} replace />}
                        />
                        <Route path={AppRoutes.more.match} element={<More />} />
                        <Route path={AppRoutes.about.match} element={<About />} />
                        <Route path={AppRoutes.settings.match}>
                            <Route index element={<Settings />} />
                            <Route
                                path={AppRoutes.settings.childRoutes.categories.match}
                                element={<CategorySettings />}
                            />
                            <Route
                                path={AppRoutes.settings.childRoutes.animeCategories.match}
                                element={<AnimeCategorySettings />}
                            />
                            <Route
                                path={AppRoutes.settings.childRoutes.novelCategories.match}
                                element={<NovelCategorySettings />}
                            />
                            <Route
                                path={AppRoutes.settings.childRoutes.reader.match}
                                element={<GlobalReaderSettings />}
                            />
                            <Route path={AppRoutes.settings.childRoutes.library.match}>
                                <Route index element={<LibrarySettings />} />
                                <Route
                                    path={AppRoutes.settings.childRoutes.library.childRoutes.duplicates.match}
                                    element={<LibraryDuplicates />}
                                />
                                <Route
                                    path={AppRoutes.settings.childRoutes.library.childRoutes.animeDuplicates.match}
                                    element={<AnimeLibraryDuplicates />}
                                />
                            </Route>
                            <Route path={AppRoutes.settings.childRoutes.download.match}>
                                <Route index element={<DownloadSettings />} />
                                {/* TODO: deprecated - got moved to "settings/images/processing/downloads" */}
                                <Route
                                    path={AppRoutes.settings.childRoutes.download.childRoutes.conversions.match}
                                    element={
                                        <Navigate
                                            to={
                                                AppRoutes.settings.childRoutes.images.childRoutes.processingDownloads
                                                    .path
                                            }
                                            replace
                                        />
                                    }
                                />
                            </Route>
                            <Route path={AppRoutes.settings.childRoutes.images.match}>
                                <Route index element={<ImagesSettings />} />
                                <Route
                                    path={AppRoutes.settings.childRoutes.images.childRoutes.processingDownloads.match}
                                    element={<ImageProcessingSetting type={ImageProcessingType.DOWNLOAD} />}
                                />
                                <Route
                                    path={AppRoutes.settings.childRoutes.images.childRoutes.processingServe.match}
                                    element={<ImageProcessingSetting type={ImageProcessingType.SERVE} />}
                                />
                            </Route>
                            <Route path={AppRoutes.settings.childRoutes.backup.match} element={<Backup />} />
                            <Route
                                path={AppRoutes.settings.childRoutes.advanced.match}
                                element={<IOSAdvancedSettings />}
                            />
                            <Route path={AppRoutes.settings.childRoutes.server.match} element={<ServerSettings />} />
                            <Route path={AppRoutes.settings.childRoutes.browse.match} element={<BrowseSettings />} />
                            <Route path={AppRoutes.settings.childRoutes.history.match} element={<HistorySettings />} />
                            <Route path={AppRoutes.settings.childRoutes.device.match} element={<DeviceSetting />} />
                            <Route path={AppRoutes.settings.childRoutes.account.match} element={<LoginPage />} />
                            <Route
                                path={AppRoutes.settings.childRoutes.tracking.match}
                                element={<TrackingSettings />}
                            />
                            <Route path={AppRoutes.settings.childRoutes.sync.match} element={<SyncSettings />} />
                            <Route path={AppRoutes.settings.childRoutes.appearance.match} element={<Appearance />} />
                        </Route>

                        {/* Manga Routes */}

                        <Route path={AppRoutes.sources.match}>
                            {/* TODO: deprecated - "source" and "extension" page got merged into "browse" */}
                            <Route
                                index
                                element={<Navigate to={AppRoutes.browse.path(BrowseTab.MANGA_SOURCES)} replace />}
                            />
                            <Route path={AppRoutes.sources.childRoutes.browse.match} element={<SourceMangas />} />
                            <Route path={AppRoutes.sources.childRoutes.configure.match} element={<SourceConfigure />} />
                            <Route path={AppRoutes.sources.childRoutes.searchAll.match} element={<SearchAll />} />
                        </Route>
                        <Route path={AppRoutes.animeSources.match}>
                            <Route
                                path={AppRoutes.animeSources.childRoutes.searchAll.match}
                                element={<AnimeSearchAll />}
                            />
                            <Route
                                path={AppRoutes.animeSources.childRoutes.browse.match}
                                element={<AnimeSourceBrowse />}
                            />
                            <Route
                                path={AppRoutes.animeSources.childRoutes.configure.match}
                                element={<AnimeSourceConfigure />}
                            />
                        </Route>
                        <Route path={AppRoutes.extension.match}>
                            {/* TODO: deprecated - "source" and "extension" page got merged into "browse" */}
                            <Route
                                index
                                element={<Navigate to={AppRoutes.browse.path(BrowseTab.MANGA_EXTENSIONS)} replace />}
                            />
                            <Route path={AppRoutes.extension.childRoutes.info.match} element={<ExtensionInfo />} />
                        </Route>

                        <Route path={AppRoutes.animeExtension.match}>
                            <Route
                                index
                                element={<Navigate to={AppRoutes.browse.path(BrowseTab.ANIME_EXTENSIONS)} replace />}
                            />
                            <Route
                                path={AppRoutes.animeExtension.childRoutes.info.match}
                                element={<AnimeExtensionInfo />}
                            />
                        </Route>
                        <Route path={AppRoutes.downloads.match} element={<DownloadQueue />} />
                        <Route path={AppRoutes.manga.match}>
                            <Route path={AppRoutes.manga.childRoutes.reader.match} element={null} />
                            <Route index element={<Manga />} />
                        </Route>
                        <Route path={AppRoutes.anime.match}>
                            <Route path={AppRoutes.anime.childRoutes.episode.match} element={<AnimeEpisode />} />
                            <Route path={AppRoutes.anime.childRoutes.details.match} element={<AnimeDetails />} />
                            <Route index element={<AnimeLibrary />} />
                        </Route>
                        <Route path={AppRoutes.library.match} element={<Library />} />
                        <Route path={AppRoutes.dictionary.match} element={<Dictionary />} />
                        <Route path={AppRoutes.updates.match} element={<Updates />} />
                        {!hideHistory && <Route path={AppRoutes.history.match} element={<History />} />}
                        <Route path={AppRoutes.browse.match} element={<Browse />} />
                        <Route path={AppRoutes.migrate.match}>
                            <Route index element={<Migrate />} />
                            <Route path={AppRoutes.migrate.childRoutes.search.match} element={<SearchAll />} />
                        </Route>
                        {/* Novel Library Route */}
                        <Route path={AppRoutes.novel.match} element={<NovelLibrary />} />
                        <Route path={AppRoutes.srs.match} element={<SRSLibrary />} />
                        <Route path={AppRoutes.tracker.match} element={<TrackerOAuthLogin />} />
                        <Route path="__automation/textbox-mobile" element={<TextBoxMobileRouteHarness />} />
                    </Route>
                </Routes>
            </ErrorBoundary>
        </Box>
    );
};

const ReaderApp = () => (
    <ErrorBoundary>
        <Routes>
            <Route element={<PrivateRoutes />}>
                <Route path={AppRoutes.matchAll.match} element={<Reader />} />
            </Route>
        </Routes>
    </ErrorBoundary>
);

const ReaderLayout = () => {
    const readerViewportCssVariables = useReaderViewportCssVariables();

    return (
        <Box sx={{ ...readerViewportCssVariables, display: 'flex' }}>
            <Box sx={{ flexShrink: 0, position: 'relative', height: READER_VIEWPORT_HEIGHT }}>
                <DefaultNavBar />
            </Box>
            <ReaderApp />
        </Box>
    );
};

const NovelReaderApp = () => (
    <ErrorBoundary>
        <Routes>
            <Route element={<PrivateRoutes />}>
                <Route path="*" element={<NovelReaderScreen />} />
            </Route>
        </Routes>
    </ErrorBoundary>
);

const AppBody = () => {
    const { pathname } = useLocation();
    const isNativePlayerOverlay = pathname.includes('/native/anime-player-overlay');

    return (
        <>
            <ScrollToTop />
            <StartupRouteMetrics />
            <AwaitableComponent.Root />

            <AuthGuard>
                {!isNativePlayerOverlay && <InitialBackgroundRequests />}
                {!isNativePlayerOverlay && <BackgroundSubscriptions />}

                <ReactRouterSetter />

                {!isNativePlayerOverlay && <CssBaseline enableColorScheme />}
                {!isNativePlayerOverlay && <MembershipPerksPopup />}
                {!isNativePlayerOverlay && <DesktopUpdateChecker />}
                {!isNativePlayerOverlay && <FpsCounterOverlay />}
                <OCRProvider>
                    {!isNativePlayerOverlay && <TextToSpeechVoiceWarmup />}
                    <OCRManager />
                    {!isNativePlayerOverlay && <ImageLoadingStatsOverlay />}
                    <SyncProvider>
                        <Routes>
                            {/* Fullscreen Reader Routes */}
                            <Route
                                path={`${AppRoutes.novel.match}/${AppRoutes.novel.childRoutes.reader.match}/*`}
                                element={<NovelReaderApp />}
                            />
                            <Route path={AppRoutes.reader.match} element={<ReaderLayout />} />
                            <Route element={<PrivateRoutes />}>
                                <Route path="native/anime-player-overlay" element={<NativeAnimePlayerOverlay />} />
                                <Route path={AppRoutes.anime.childRoutes.local.path()} element={<AnimeLocalPlayer />} />
                            </Route>

                            {/* Main App Layout with Sidebar */}
                            <Route
                                path="*"
                                element={
                                    <Box sx={{ display: 'flex' }}>
                                        <Box sx={{ flexShrink: 0, position: 'relative', height: '100vh' }}>
                                            <DefaultNavBar />
                                        </Box>
                                        <MainApp />
                                    </Box>
                                }
                            />
                        </Routes>
                    </SyncProvider>
                </OCRProvider>
            </AuthGuard>
        </>
    );
};

export const App: React.FC = () => (
    <AppContext>
        <AppBody />
    </AppContext>
);
