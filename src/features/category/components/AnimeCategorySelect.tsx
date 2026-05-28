/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useEffect, useMemo, useState } from 'react';
import Button from '@mui/material/Button';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Dialog from '@mui/material/Dialog';
import FormGroup from '@mui/material/FormGroup';
import Stack from '@mui/material/Stack';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AwaitableComponentProps } from 'awaitable-component';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { Categories } from '@/features/category/services/Categories.ts';
import { ThreeStateCheckboxInput } from '@/base/components/inputs/ThreeStateCheckboxInput.tsx';
import { useSelectableCollection } from '@/base/collection/hooks/useSelectableCollection.ts';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { CheckboxInput } from '@/base/components/inputs/CheckboxInput.tsx';
import { makeToast } from '@/base/utils/Toast.ts';
import { updateMetadataServerSettings } from '@/features/settings/services/ServerSettingsMetadata.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';

type BaseProps = AwaitableComponentProps<{ addToCategories: number[]; removeFromCategories: number[] }>;

type SingleAnimeModeProps = {
    animeId: number;
    addToLibrary?: boolean;
};

type MultiAnimeModeProps = {
    animeIds: number[];
};

export type AnimeCategorySelectProps =
    | (BaseProps & SingleAnimeModeProps & PropertiesNever<MultiAnimeModeProps>)
    | (BaseProps & PropertiesNever<SingleAnimeModeProps> & MultiAnimeModeProps);

const useGetAnimeCategoryIds = (animeId: number | undefined): number[] => {
    const { data: animeResult } = requestManager.useGetAnimeCategories(animeId ?? -1, {
        skip: animeId === undefined,
    });

    return useMemo(() => {
        if (animeId === undefined || !animeResult) {
            return [];
        }
        return Categories.getIds(animeResult.anime?.categories?.nodes ?? []);
    }, [animeResult, animeId]);
};

const getCategoryCheckedState = (
    categoryId: number,
    categoriesToAdd: number[],
    categoriesToRemove: number[],
    isSingleSelectionMode: boolean,
): boolean | undefined => {
    if (categoriesToAdd.includes(categoryId)) {
        return true;
    }

    if (isSingleSelectionMode) {
        return undefined;
    }

    if (categoriesToRemove.includes(categoryId)) {
        return false;
    }

    return undefined;
};

export function AnimeCategorySelect(props: AnimeCategorySelectProps) {
    const { t } = useTranslation();
    const {
        onDismiss,
        onSubmit,
        isVisible,
        onExitComplete,
        animeId,
        animeIds: passedAnimeIds,
        addToLibrary = false,
    } = props;

    const isSingleSelectionMode = animeId !== undefined;
    const animeIds = (passedAnimeIds ?? (animeId !== undefined ? [animeId] : [])).filter(
        (id): id is number => id !== undefined,
    );
    const animeCategoryIds = useGetAnimeCategoryIds(animeId);

    const { data } = requestManager.useGetAnimeCategoriesBase();
    const categoriesData = data?.categories.nodes;
    const allCategories = useMemo(() => Categories.getUserCreated(categoriesData ?? []), [categoriesData]);
    const defaultCategoryIds = useMemo(
        () => (addToLibrary ? Categories.getIds(Categories.getDefaults(allCategories)) : []),
        [allCategories, addToLibrary],
    );
    const [doNotShowAddToLibraryDialogAgain, setDoNotShowAddToLibraryDialogAgain] = useState(false);

    const { handleSelection, setSelectionForKey, getSelectionForKey } = useSelectableCollection<
        number,
        'categoriesToAdd' | 'categoriesToRemove'
    >(allCategories.length, {
        currentKey: 'categoriesToAdd',
        initialState: {
            categoriesToAdd: [...animeCategoryIds, ...defaultCategoryIds],
            categoriesToRemove: [],
        },
    });

    useEffect(() => {
        setSelectionForKey('categoriesToAdd', [...animeCategoryIds, ...defaultCategoryIds]);
        setSelectionForKey('categoriesToRemove', []);
    }, [animeCategoryIds, defaultCategoryIds, setSelectionForKey]);

    const categoriesToAdd = getSelectionForKey('categoriesToAdd');
    const categoriesToRemove = getSelectionForKey('categoriesToRemove');

    const handleCancel = () => {
        setSelectionForKey('categoriesToAdd', animeCategoryIds);
        setSelectionForKey('categoriesToRemove', []);
        onDismiss();
    };

    const handleOk = () => {
        const deselectedDefaultCategoryIds = addToLibrary
            ? defaultCategoryIds.filter((categoryId) => !categoriesToAdd.includes(categoryId))
            : [];
        const addToCategories = isSingleSelectionMode
            ? categoriesToAdd.filter((categoryId) => !animeCategoryIds.includes(categoryId))
            : categoriesToAdd;
        const removeFromCategories = isSingleSelectionMode
            ? [...new Set([...animeCategoryIds, ...deselectedDefaultCategoryIds])].filter(
                  (categoryId) => !categoriesToAdd.includes(categoryId),
              )
            : categoriesToRemove;

        onSubmit({ addToCategories, removeFromCategories });

        if (doNotShowAddToLibraryDialogAgain) {
            updateMetadataServerSettings('showAddToLibraryAnimeCategorySelectDialog', false).catch((e) =>
                makeToast(t('search.error.label.failed_to_save_settings'), 'error', getErrorMessage(e)),
            );
        }

        const isUpdateRequired = !!addToCategories.length || !!removeFromCategories.length;
        if (!isUpdateRequired) {
            return;
        }

        requestManager
            .updateAnimes(animeIds, {
                updateAnimesCategories: {
                    addToCategories,
                    removeFromCategories,
                },
            })
            .response.catch(defaultPromiseErrorHandler('AnimeCategorySelect::handleOk'));
    };

    return (
        <Dialog
            sx={{
                '.MuiDialog-paper': {
                    maxHeight: 435,
                    width: '80%',
                },
            }}
            maxWidth="xs"
            open={isVisible}
            onTransitionExited={onExitComplete}
            onClose={handleCancel}
        >
            <DialogTitle>{t('category.title.set_categories')}</DialogTitle>
            <DialogContent dividers>
                <FormGroup>
                    {allCategories.length === 0 && <span>{t('category.error.no_categories_found.label.info')}</span>}
                    {allCategories.map((category) => (
                        <ThreeStateCheckboxInput
                            checked={getCategoryCheckedState(
                                category.id,
                                categoriesToAdd,
                                categoriesToRemove,
                                isSingleSelectionMode,
                            )}
                            onChange={(checked) => {
                                handleSelection(category.id, false, { key: 'categoriesToAdd' });
                                handleSelection(category.id, false, { key: 'categoriesToRemove' });

                                if (checked) {
                                    handleSelection(category.id, true, { key: 'categoriesToAdd' });
                                }

                                if (checked === false) {
                                    handleSelection(category.id, true, { key: 'categoriesToRemove' });
                                }
                            }}
                            label={category.name}
                            key={category.id}
                        />
                    ))}
                </FormGroup>
            </DialogContent>
            <DialogActions>
                <Stack sx={{ width: '100%' }}>
                    {addToLibrary && (
                        <CheckboxInput
                            sx={{ margin: 0 }}
                            size="small"
                            label={t('global.button.dont_show_dialog_again')}
                            onChange={(e) => setDoNotShowAddToLibraryDialogAgain(e.target.checked)}
                        />
                    )}
                    <Stack
                        direction="row"
                        sx={{
                            justifyContent: 'space-between',
                            alignItems: 'end',
                            width: '100%',
                        }}
                    >
                        <Button
                            component={Link}
                            to={AppRoutes.settings.childRoutes.animeCategories.path}
                            onClick={onDismiss}
                        >
                            {t(allCategories.length ? 'global.button.edit' : 'global.button.create')}
                        </Button>
                        <Stack direction="row">
                            <Button autoFocus onClick={handleCancel} color="primary">
                                {t('global.button.cancel')}
                            </Button>
                            {!!allCategories.length && (
                                <Button onClick={handleOk} color="primary">
                                    {t('global.button.ok')}
                                </Button>
                            )}
                        </Stack>
                    </Stack>
                </Stack>
            </DialogActions>
        </Dialog>
    );
}
