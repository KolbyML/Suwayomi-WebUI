/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import FilterListIcon from '@mui/icons-material/FilterList';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import IconButton from '@mui/material/IconButton';
import SaveIcon from '@mui/icons-material/Save';
import Chip from '@mui/material/Chip';
import DeleteIcon from '@mui/icons-material/Delete';
import Typography from '@mui/material/Typography';
import PopupState, { bindDialog, bindTrigger } from 'material-ui-popup-state';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import TextField from '@mui/material/TextField';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';
import { OptionsPanel } from '@/base/components/modals/OptionsPanel.tsx';
import { StyledFab } from '@/base/components/buttons/StyledFab.tsx';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { IPos, ISourceMetadata, SourceFilters } from '@/features/source/Source.types.ts';
import { Confirmation } from '@/base/AppAwaitableComponent.ts';
import { SourceFilterOptions } from '@/features/source/browse/components/SourceFilterOptions.tsx';

interface IFilters1 {
    savedSearches?: ISourceMetadata['savedSearches'];
    selectSavedSearch?: (savedSearch: string) => void;
    updateSavedSearches?: (savedSearch: string, updateType: 'create' | 'delete') => void;
    sourceFilter: SourceFilters[];
    updateFilterValue: (update: IPos[]) => void;
    resetFilterValue: () => void | Promise<void>;
    setTriggerUpdate: Function;
    update: IPos[];
}

export function SourceOptions({
    savedSearches = {},
    selectSavedSearch,
    updateSavedSearches,
    sourceFilter,
    updateFilterValue,
    resetFilterValue,
    setTriggerUpdate,
    update,
}: IFilters1) {
    const { t } = useTranslation();
    const [FilterOptions, setFilterOptions] = useState(false);
    const [newSavedSearch, setNewSavedSearch] = useState('');
    const [isResetting, setIsResetting] = useState(false);

    const savedSearchesEnabled = !!selectSavedSearch && !!updateSavedSearches;
    const savedSearchNames = savedSearchesEnabled ? Object.keys(savedSearches) : [];
    const savedSearchesExist = !!savedSearchNames.length;

    async function handleReset() {
        if (isResetting) {
            return;
        }

        setIsResetting(true);
        try {
            await resetFilterValue();
        } finally {
            setIsResetting(false);
        }
    }

    function handleSubmit() {
        setTriggerUpdate(0);
        setFilterOptions(false);
    }

    return (
        <>
            <StyledFab onClick={() => setFilterOptions(!FilterOptions)} variant="extended" color="primary">
                <FilterListIcon />
                {t('global.button.filter')}
            </StyledFab>

            <OptionsPanel open={FilterOptions} onClose={() => setFilterOptions(false)}>
                <Box
                    sx={{
                        borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
                        flexShrink: 0,
                        p: 2,
                        pb: 1,
                    }}
                >
                    <Box sx={{ display: 'flex', pb: 1 }}>
                        <Button onClick={handleReset} disabled={isResetting}>
                            {t('global.button.reset')}
                        </Button>
                        <Box sx={{ flexGrow: 1 }} />
                        {savedSearchesEnabled && (
                            <PopupState variant="dialog" popupId="source-browse-save-search">
                                {(popupState) => (
                                    <>
                                        <CustomTooltip title={t('source.filter.save_search.label.save')}>
                                            <IconButton {...bindTrigger(popupState)}>
                                                <SaveIcon />
                                            </IconButton>
                                        </CustomTooltip>
                                        <Dialog {...bindDialog(popupState)} maxWidth="xs" fullWidth>
                                            <DialogTitle>
                                                {t('source.filter.save_search.dialog.label.title')}
                                            </DialogTitle>
                                            <DialogContent>
                                                <TextField
                                                    sx={{ width: '100%' }}
                                                    value={newSavedSearch}
                                                    onChange={(e) => setNewSavedSearch(e.target.value as string)}
                                                    slotProps={{
                                                        htmlInput: { maxLength: 50 },
                                                    }}
                                                />
                                            </DialogContent>
                                            <DialogActions>
                                                <Button
                                                    onClick={() => {
                                                        setNewSavedSearch('');
                                                        popupState.close();
                                                    }}
                                                >
                                                    {t('global.button.cancel')}
                                                </Button>
                                                <Button
                                                    onClick={() => {
                                                        updateSavedSearches?.(newSavedSearch, 'create');
                                                        setNewSavedSearch('');
                                                        popupState.close();
                                                    }}
                                                >
                                                    {t('global.button.ok')}
                                                </Button>
                                            </DialogActions>
                                        </Dialog>
                                    </>
                                )}
                            </PopupState>
                        )}

                        <Button variant="contained" onClick={handleSubmit}>
                            {t('global.button.submit')}
                        </Button>
                    </Box>
                </Box>
                <Box
                    sx={{
                        flex: 1,
                        minHeight: 0,
                        mx: 2,
                        overflowY: 'auto',
                        overscrollBehavior: 'contain',
                        pb: 2,
                        pt: savedSearchesExist ? 1 : 0,
                        WebkitOverflowScrolling: 'touch',
                    }}
                >
                    {savedSearchesExist && (
                        <>
                            <Typography sx={{ pb: 1 }}>Saved searches</Typography>
                            <Stack sx={{ flexDirection: 'row' }}>
                                {savedSearchNames.map((savedSearch) => (
                                    <Chip
                                        label={savedSearch}
                                        onClick={() => {
                                            setFilterOptions(false);
                                            selectSavedSearch?.(savedSearch);
                                        }}
                                        onDelete={() => {
                                            Confirmation.show({
                                                title: t('global.label.are_you_sure'),
                                                message: t('source.filter.save_search.dialog.label.delete', {
                                                    name: savedSearch,
                                                }),
                                                actions: {
                                                    confirm: { title: t('global.button.delete') },
                                                },
                                            })
                                                .then(() => updateSavedSearches?.(savedSearch, 'delete'))
                                                .catch(defaultPromiseErrorHandler('SourceOptions::deleteSavedSearch'));
                                        }}
                                        deleteIcon={
                                            <CustomTooltip title={t('source.filter.save_search.label.delete')}>
                                                <DeleteIcon />
                                            </CustomTooltip>
                                        }
                                        variant="outlined"
                                    />
                                ))}
                            </Stack>
                        </>
                    )}
                    <SourceFilterOptions
                        sourceFilter={sourceFilter}
                        updateFilterValue={updateFilterValue}
                        group={undefined}
                        update={update}
                    />
                </Box>
            </OptionsPanel>
        </>
    );
}
