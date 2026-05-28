/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import ArrowBack from '@mui/icons-material/ArrowBack';
import { useLocation } from 'react-router-dom';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import MenuIcon from '@mui/icons-material/Menu';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import { useBackButton } from '@/base/hooks/useBackButton.ts';
import { useGetOptionForDirection } from '@/features/theme/services/ThemeCreator.ts';
import { MediaQuery } from '@/base/utils/MediaQuery.tsx';
import { DesktopSideBar } from '@/features/navigation-bar/components/DesktopSideBar.tsx';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { useResizeObserver } from '@/base/hooks/useResizeObserver.tsx';
import { MobileBottomBar } from '@/features/navigation-bar/components/MobileBottomBar.tsx';
import { useNavBarContext } from '@/features/navigation-bar/NavbarContext.tsx';
import { useMetadataServerSettings } from '@/features/settings/services/ServerSettingsMetadata.ts';
import { NAVIGATION_BAR_ITEMS } from '@/features/navigation-bar/NavigationBar.constants.ts';
import { NavbarItem } from '@/features/navigation-bar/NavigationBar.types.ts';
import { useOCR } from '@/Manatan/context/OCRContext.tsx';
import { useNavigationSettings } from '@/features/navigation-bar/NavigationBar.hooks.ts';
import { getVisibleNavBarItems } from '@/features/navigation-bar/DefaultNavBar.util.ts';
import { SyncInfoButton } from '@/features/sync/components/SyncInfoButton.tsx';

export function DefaultNavBar() {
    const { title, action, override, isCollapsed, setIsCollapsed, setAppBarHeight, navBarWidth, setNavBarWidth } =
        useNavBarContext();

    const theme = useTheme();
    const getOptionForDirection = useGetOptionForDirection();
    const { pathname } = useLocation();
    const handleBack = useBackButton();
    const isMobileWidth = MediaQuery.useIsMobileWidth();

    const {
        settings: { hideHistory },
    } = useMetadataServerSettings();
    const {
        settings: { debugMode },
    } = useOCR();
    const { visibleTabs, isReady: areNavigationSettingsReady } = useNavigationSettings();

    const navBarItems = useMemo<NavbarItem[]>(
        () =>
            NAVIGATION_BAR_ITEMS.filter((item) => {
                if (item.path !== AppRoutes.srs.path) {
                    return true;
                }
                return debugMode;
            }) as NavbarItem[],
        [debugMode],
    );

    const appBarRef = useRef<HTMLDivElement | null>(null);

    const updateAppBarHeight = useCallback(() => {
        const appBarElement = appBarRef.current;
        if (!appBarElement) {
            setAppBarHeight(0);
            return;
        }

        const appBarRectHeight = appBarElement.getBoundingClientRect().height;
        const appBarPaddingTop = Number.parseFloat(window.getComputedStyle(appBarElement).paddingTop || '0');
        const toolbarElement = appBarElement.querySelector('.MuiToolbar-root');
        const toolbarHeight =
            toolbarElement instanceof HTMLElement
                ? toolbarElement.getBoundingClientRect().height
                : appBarElement.clientHeight;

        setAppBarHeight(Math.ceil(Math.max(appBarRectHeight, toolbarHeight + appBarPaddingTop)));
    }, [setAppBarHeight]);

    const actualNavBarWidth = isMobileWidth || isCollapsed ? 0 : navBarWidth;

    const visibleNavBarItems = useMemo(
        () =>
            getVisibleNavBarItems(navBarItems, {
                hideHistory,
                hideBoth: false,
                hideDesktop: isMobileWidth,
                hideMobile: !isMobileWidth,
                visibleTabs,
            }),
        [hideHistory, isMobileWidth, navBarItems, visibleTabs],
    );

    const isMainRoute = useMemo(
        () => visibleNavBarItems.some(({ path }) => path === pathname),
        [visibleNavBarItems, pathname],
    );

    const NavBarComponent = useMemo(() => (isMobileWidth ? MobileBottomBar : DesktopSideBar), [isMobileWidth]);

    const navBar = useMemo(
        () => (areNavigationSettingsReady ? <NavBarComponent navBarItems={visibleNavBarItems} /> : null),
        [NavBarComponent, areNavigationSettingsReady, visibleNavBarItems],
    );

    useResizeObserver(appBarRef, updateAppBarHeight);

    useLayoutEffect(() => {
        updateAppBarHeight();

        const viewport = window.visualViewport;
        if (!viewport) {
            return () => {};
        }

        viewport.addEventListener('resize', updateAppBarHeight);
        return () => viewport.removeEventListener('resize', updateAppBarHeight);
    }, [updateAppBarHeight]);

    useLayoutEffect(() => {
        if (override.status) {
            setAppBarHeight(0);
            setNavBarWidth(0);
            return () => {};
        }

        const rafId = window.requestAnimationFrame(() => {
            updateAppBarHeight();
        });

        return () => {
            window.cancelAnimationFrame(rafId);
        };
    }, [override.status, setAppBarHeight, setNavBarWidth, updateAppBarHeight]);

    useLayoutEffect(() => {
        if (!isMobileWidth) {
            // do not reset navbar width to prevent grid from jumping due to the changing grid item width
            return;
        }

        setNavBarWidth(0);
    }, [isMobileWidth]);

    // Allow default navbar to be overrided
    if (override.status) return override.value;

    return (
        <>
            <AppBar
                ref={appBarRef}
                sx={{
                    position: 'fixed',
                    marginLeft: actualNavBarWidth,
                    pt: 'env(safe-area-inset-top)',
                    width: `calc(100% - ${actualNavBarWidth}px)`,
                    zIndex: theme.zIndex.drawer,
                }}
            >
                <Toolbar sx={{ position: 'relative' }}>
                    {!isMobileWidth && (
                        <Stack
                            sx={{
                                position: 'absolute',
                                left: 0,
                                width: `calc(${navBarWidth}px + env(safe-area-inset-left))`,
                                ...(!isCollapsed && { display: 'none' }),
                                alignItems: 'center',
                            }}
                        >
                            <IconButton aria-label="open drawer" onClick={() => setIsCollapsed(false)} color="inherit">
                                <MenuIcon />
                            </IconButton>
                        </Stack>
                    )}
                    <Stack
                        sx={{
                            ml: `${isCollapsed ? navBarWidth : 0}px`,
                            width: `calc(100% - (${isCollapsed ? navBarWidth : 0}px + env(safe-area-inset-left)))`,
                            flexDirection: 'row',
                            alignItems: 'center',
                            position: 'relative',
                            minWidth: 0,
                        }}
                    >
                        {!isMainRoute && (
                            <IconButton
                                edge="start"
                                component="button"
                                sx={{ marginRight: 2, flexShrink: 0 }}
                                aria-label="menu"
                                onClick={handleBack}
                                color="inherit"
                            >
                                {getOptionForDirection(<ArrowBack />, <ArrowForwardIcon />)}
                            </IconButton>
                        )}
                        {isMainRoute && (
                            <Stack sx={{ flexShrink: 0, minWidth: 48, alignItems: 'flex-start' }}>
                                <SyncInfoButton />
                            </Stack>
                        )}
                        <Typography
                            variant="h5"
                            component="h1"
                            noWrap
                            sx={{
                                textOverflow: 'ellipsis',
                                textAlign: 'center',
                                position: isMainRoute ? 'absolute' : 'static',
                                left: isMainRoute ? '50%' : undefined,
                                transform: isMainRoute ? 'translateX(-50%)' : undefined,
                                maxWidth: isMainRoute ? { xs: '42%', sm: '56%' } : undefined,
                                flexGrow: 1,
                                pointerEvents: 'none',
                            }}
                        >
                            {title}
                        </Typography>
                        <Stack direction="row" sx={{ ml: 'auto', alignItems: 'center', minWidth: 0 }}>
                            {action}
                        </Stack>
                    </Stack>
                </Toolbar>
            </AppBar>
            {!isMobileWidth || isMainRoute ? navBar : null}
        </>
    );
}
