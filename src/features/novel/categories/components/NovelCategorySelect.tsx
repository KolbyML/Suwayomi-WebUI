/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useEffect, useMemo, useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormGroup from '@mui/material/FormGroup';
import Stack from '@mui/material/Stack';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AwaitableComponentProps } from 'awaitable-component';
import { ThreeStateCheckboxInput } from '@/base/components/inputs/ThreeStateCheckboxInput.tsx';
import { useSelectableCollection } from '@/base/collection/hooks/useSelectableCollection.ts';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import type { NovelCategory } from '@/features/novel/Novel.types.ts';
import { NovelStorage } from '@/features/novel/storage/NovelStorage.ts';
import { NovelCategoriesService } from '@/features/novel/categories/services/NovelCategories.ts';

type BaseProps = AwaitableComponentProps<{ addToCategories: string[]; removeFromCategories: string[] }>;

type SingleNovelModeProps = {
    novelId: string;
};

type MultiNovelModeProps = {
    novelIds: string[];
};

export type NovelCategorySelectProps =
    | (BaseProps & SingleNovelModeProps & PropertiesNever<MultiNovelModeProps>)
    | (BaseProps & PropertiesNever<SingleNovelModeProps> & MultiNovelModeProps);

const getCategoryCheckedState = (
    categoryId: string,
    categoriesToAdd: string[],
    categoriesToRemove: string[],
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

const applyCategoryChanges = async (
    novelIds: string[],
    addToCategories: string[],
    removeFromCategories: string[],
): Promise<void> => {
    await Promise.all(
        novelIds.map(async (novelId) => {
            const metadata = await NovelStorage.getMetadata(novelId);
            if (!metadata) {
                return;
            }

            const nextCategoryIds = new Set(metadata.categoryIds ?? []);
            addToCategories.forEach((categoryId) => nextCategoryIds.add(categoryId));
            removeFromCategories.forEach((categoryId) => nextCategoryIds.delete(categoryId));

            await NovelStorage.updateMetadata(novelId, {
                categoryIds: [...nextCategoryIds],
            });
        }),
    );
};

export function NovelCategorySelect(props: NovelCategorySelectProps) {
    const { t } = useTranslation();
    const { onDismiss, onSubmit, isVisible, onExitComplete, novelId, novelIds: passedNovelIds } = props;

    const isSingleSelectionMode = novelId !== undefined;
    const novelIds = (passedNovelIds ?? (novelId !== undefined ? [novelId] : [])).filter(
        (id): id is string => id !== undefined,
    );

    const [allCategories, setAllCategories] = useState<NovelCategory[]>([]);
    const [novelCategoryIds, setNovelCategoryIds] = useState<string[]>([]);

    useEffect(() => {
        NovelCategoriesService.getCategories().then((categories) => {
            setAllCategories([...categories].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)));
        });
    }, []);

    useEffect(() => {
        if (!isSingleSelectionMode) {
            setNovelCategoryIds([]);
            return;
        }

        NovelStorage.getMetadata(novelId).then((metadata) => {
            setNovelCategoryIds(metadata?.categoryIds ?? []);
        });
    }, [isSingleSelectionMode, novelId]);

    const { handleSelection, setSelectionForKey, getSelectionForKey } = useSelectableCollection<
        string,
        'categoriesToAdd' | 'categoriesToRemove'
    >(allCategories.length, {
        currentKey: 'categoriesToAdd',
        initialState: {
            categoriesToAdd: novelCategoryIds,
            categoriesToRemove: [],
        },
    });

    useEffect(() => {
        setSelectionForKey('categoriesToAdd', novelCategoryIds);
        setSelectionForKey('categoriesToRemove', []);
    }, [novelCategoryIds, setSelectionForKey]);

    const categoriesToAdd = useMemo(() => getSelectionForKey('categoriesToAdd') ?? [], [getSelectionForKey]);
    const categoriesToRemove = useMemo(() => getSelectionForKey('categoriesToRemove') ?? [], [getSelectionForKey]);

    const handleCancel = () => {
        setSelectionForKey('categoriesToAdd', novelCategoryIds);
        setSelectionForKey('categoriesToRemove', []);
        onDismiss();
    };

    const handleOk = async () => {
        const addToCategories = isSingleSelectionMode
            ? categoriesToAdd.filter((categoryId) => !novelCategoryIds.includes(categoryId))
            : categoriesToAdd;
        const removeFromCategories = isSingleSelectionMode
            ? novelCategoryIds.filter((categoryId) => !categoriesToAdd.includes(categoryId))
            : categoriesToRemove;

        const isUpdateRequired = !!addToCategories.length || !!removeFromCategories.length;
        if (isUpdateRequired) {
            await applyCategoryChanges(novelIds, addToCategories, removeFromCategories);
        }

        onSubmit({ addToCategories, removeFromCategories });
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
                        to={AppRoutes.settings.childRoutes.novelCategories.path}
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
            </DialogActions>
        </Dialog>
    );
}
