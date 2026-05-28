/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Label from '@mui/icons-material/Label';
import MoreHoriz from '@mui/icons-material/MoreHoriz';
import Refresh from '@mui/icons-material/Refresh';
import SyncAltIcon from '@mui/icons-material/SyncAlt';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { AwaitableComponent } from 'awaitable-component';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { AnimeCategorySelect } from '@/features/category/components/AnimeCategorySelect.tsx';
import { BrowseTab } from '@/features/browse/Browse.types.ts';

interface IProps {
    anime: { id: number; inLibrary: boolean };
    onRefresh: () => Promise<void> | void;
    refreshing: boolean;
}

export const AnimeToolbarMenu = ({ anime, onRefresh, refreshing }: IProps) => {
    const { t } = useTranslation();

    const theme = useTheme();
    const isLargeScreen = useMediaQuery(theme.breakpoints.up('sm'));

    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);
    const handleClose = () => {
        setAnchorEl(null);
    };

    const openCategorySelection = () => {
        AwaitableComponent.show(AnimeCategorySelect, { animeId: anime.id });
    };

    return (
        <>
            {isLargeScreen && (
                <>
                    <CustomTooltip title={t('manga.label.reload_from_source')} disabled={refreshing}>
                        <IconButton
                            onClick={() => {
                                onRefresh();
                            }}
                            disabled={refreshing}
                            color="inherit"
                        >
                            <Refresh />
                        </IconButton>
                    </CustomTooltip>
                    {anime.inLibrary && (
                        <>
                            <CustomTooltip title={t('global.button.migrate')}>
                                <Link
                                    to={AppRoutes.browse.path(BrowseTab.ANIME_MIGRATE)}
                                    style={{ textDecoration: 'none', color: 'inherit' }}
                                >
                                    <IconButton color="inherit">
                                        <SyncAltIcon />
                                    </IconButton>
                                </Link>
                            </CustomTooltip>
                            <CustomTooltip title="Edit anime categories">
                                <IconButton
                                    onClick={() => {
                                        openCategorySelection();
                                    }}
                                    color="inherit"
                                >
                                    <Label />
                                </IconButton>
                            </CustomTooltip>
                        </>
                    )}
                </>
            )}
            {!isLargeScreen && (
                <>
                    <IconButton
                        id="animeDetailsMenuButton"
                        aria-controls={open ? 'animeDetailsMenu' : undefined}
                        aria-haspopup="true"
                        aria-expanded={open ? 'true' : undefined}
                        onClick={(e) => setAnchorEl(e.currentTarget)}
                        color="inherit"
                    >
                        <MoreHoriz />
                    </IconButton>
                    <Menu
                        id="animeDetailsMenu"
                        anchorEl={anchorEl}
                        open={open}
                        onClose={handleClose}
                        MenuListProps={{
                            'aria-labelledby': 'animeDetailsMenuButton',
                        }}
                    >
                        <MenuItem
                            onClick={() => {
                                onRefresh();
                                handleClose();
                            }}
                            disabled={refreshing}
                        >
                            <ListItemIcon>
                                <Refresh fontSize="small" />
                            </ListItemIcon>
                            <ListItemText>{t('manga.label.reload_from_source')}</ListItemText>
                        </MenuItem>
                        {anime.inLibrary && [
                            <MenuItem
                                key="migrate"
                                component={Link}
                                to={AppRoutes.browse.path(BrowseTab.ANIME_MIGRATE)}
                                style={{ textDecoration: 'none', color: 'inherit' }}
                                onClick={() => handleClose()}
                            >
                                <ListItemIcon>
                                    <SyncAltIcon fontSize="small" />
                                </ListItemIcon>
                                <ListItemText>{t('migrate.title')}</ListItemText>
                            </MenuItem>,
                            <MenuItem
                                key="categories"
                                onClick={() => {
                                    openCategorySelection();
                                    handleClose();
                                }}
                            >
                                <ListItemIcon>
                                    <Label fontSize="small" />
                                </ListItemIcon>
                                <ListItemText>Edit anime categories</ListItemText>
                            </MenuItem>,
                        ]}
                    </Menu>
                </>
            )}
        </>
    );
};
