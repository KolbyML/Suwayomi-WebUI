/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import { useTranslation } from 'react-i18next';
import Paper from '@mui/material/Paper';
import { CSSProperties, useCallback, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import Badge from '@mui/material/Badge';
import { useResizeObserver } from '@/base/hooks/useResizeObserver.tsx';
import { useNavBarContext } from '@/features/navigation-bar/NavbarContext.tsx';
import { NavbarItem } from '@/features/navigation-bar/NavigationBar.types.ts';
import {
    getNavigationBarDestination,
    isNavigationBarItemActive,
} from '@/features/navigation-bar/NavigationBarResume.util.ts';

export const MobileBottomBar = ({ navBarItems }: { navBarItems: NavbarItem[] }) => {
    const { t } = useTranslation();
    const theme = useTheme();
    const { setBottomBarHeight } = useNavBarContext();
    const location = useLocation();
    const navigate = useNavigate();

    const ref = useRef<HTMLDivElement | null>(null);
    useResizeObserver(
        ref,
        useCallback(() => setBottomBarHeight(ref.current?.clientHeight ?? 0), [ref.current]),
    );
    useLayoutEffect(() => () => setBottomBarHeight(0), []);

    const selectedNavBarItem = navBarItems.find((navBarItem) => isNavigationBarItemActive(location.pathname, navBarItem.path))
        ?.path;

    return (
        <Paper
            ref={ref}
            sx={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                pb: 'env(safe-area-inset-bottom)',
                pl: 'env(safe-area-inset-left)',
                pr: 'env(safe-area-inset-right)',
                zIndex: theme.zIndex.drawer - 1,
            }}
            style={{
                ...(theme.applyStyles('dark', {
                    '--Paper-overlay': 'unset',
                }) as CSSProperties),
            }}
            elevation={3}
        >
            <BottomNavigation
                showLabels
                value={selectedNavBarItem}
                sx={{
                    px: 0.5,
                    '.MuiBottomNavigationAction-root': {
                        minWidth: 0,
                        flex: 1,
                        px: 0.5,
                    },
                    '.MuiBottomNavigationAction-label': {
                        fontSize: '0.7rem',
                        lineHeight: 1.1,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '100%',
                    },
                    '.MuiBottomNavigationAction-label.Mui-selected': {
                        fontSize: '0.7rem',
                    },
                }}
            >
                {navBarItems.map(({ path, title, IconComponent, SelectedIconComponent, useBadge }) => {
                    const isSelected = selectedNavBarItem === path;
                    const destination = getNavigationBarDestination(location.pathname, path);

                    return (
                        <BottomNavigationAction
                            key={path}
                            value={path}
                            label={t(title)}
                            icon={
                                <Badge key={path} badgeContent={useBadge?.().count} color="primary">
                                    {isSelected ? <SelectedIconComponent /> : <IconComponent />}
                                </Badge>
                            }
                            sx={{ minWidth: 0 }}
                            onClick={() => navigate(destination.pathname, destination.state ? { state: destination.state } : undefined)}
                        />
                    );
                })}
            </BottomNavigation>
        </Paper>
    );
};
