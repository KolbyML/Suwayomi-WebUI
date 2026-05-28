/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { ComponentProps, useCallback, useEffect, useMemo, useState } from 'react';
import { closestCenter, DndContext, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import AddIcon from '@mui/icons-material/Add';
import Fab from '@mui/material/Fab';
import Box from '@mui/material/Box';
import { useTranslation } from 'react-i18next';
import { Confirmation } from '@/base/AppAwaitableComponent.ts';
import { DEFAULT_FULL_FAB_HEIGHT } from '@/base/components/buttons/StyledFab.tsx';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { DndKitUtil } from '@/lib/dnd-kit/DndKitUtil.ts';
import { DndOverlayItem } from '@/lib/dnd-kit/DndOverlayItem.tsx';
import { DndSortableItem } from '@/lib/dnd-kit/DndSortableItem.tsx';
import { getErrorMessage, noOp } from '@/lib/HelperFunctions.ts';
import { makeToast } from '@/base/utils/Toast.ts';
import type { NovelCategory } from '@/features/novel/Novel.types.ts';
import { NovelStorage } from '@/features/novel/storage/NovelStorage.ts';
import { CreateOrEditNovelCategoryDialog } from '@/features/novel/categories/components/CreateOrEditNovelCategoryDialog.tsx';
import { NovelCategorySettingsCard } from '@/features/novel/categories/components/NovelCategorySettingsCard.tsx';
import { NovelCategoriesService } from '@/features/novel/categories/services/NovelCategories.ts';
import { useAppTitle } from '@/features/navigation-bar/hooks/useAppTitle.ts';

export function NovelCategorySettings() {
    const { t } = useTranslation();
    const dndSensors = DndKitUtil.useSensorsForDevice();

    useAppTitle(t('category.dialog.title.edit_category_other'));

    const [categories, setCategories] = useState<NovelCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [categoryToEdit, setCategoryToEdit] = useState<NovelCategory | undefined>();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dndActiveCategory, setDndActiveCategory] = useState<
        ComponentProps<typeof NovelCategorySettingsCard>['category'] | null
    >(null);

    const sortedCategories = useMemo(
        () => [...categories].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
        [categories],
    );

    const loadCategories = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            setCategories(await NovelCategoriesService.getCategories());
        } catch (e) {
            setError(e instanceof Error ? e : new Error(getErrorMessage(e)));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadCategories().catch(defaultPromiseErrorHandler('NovelCategorySettings::loadCategories'));
    }, [loadCategories]);

    const persistCategoryOrder = async (nextCategories: NovelCategory[]) => {
        await Promise.all(
            nextCategories.map((category, order) =>
                NovelCategoriesService.updateCategory(category.id, {
                    order,
                }),
            ),
        );
    };

    const onDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        setDndActiveCategory(null);

        if (!over || active.id === over.id) {
            return;
        }

        const oldIndex = sortedCategories.findIndex((category) => category.id === active.id);
        const newIndex = sortedCategories.findIndex((category) => category.id === over.id);

        if (oldIndex < 0 || newIndex < 0) {
            return;
        }

        const previous = sortedCategories;
        const reordered = arrayMove(sortedCategories, oldIndex, newIndex).map((category, order) => ({
            ...category,
            order,
        }));
        setCategories(reordered);
        persistCategoryOrder(reordered).catch((e) => {
            setCategories(previous);
            makeToast(t('global.error.label.failed_to_save_changes'), 'error', getErrorMessage(e));
        });
    };

    const handleDialogOpen = (category?: NovelCategory) => {
        setCategoryToEdit(category);
        setDialogOpen(true);
    };

    const handleDialogCancel = () => {
        setCategoryToEdit(undefined);
        setDialogOpen(false);
    };

    const handleDeleteCategory = async (category: NovelCategory) => {
        try {
            await Confirmation.show({
                title: t('chapter.action.download.delete.label.action'),
                message: `Delete "${category.name}"? Novels in this category will stay in your library.`,
                actions: {
                    confirm: {
                        title: t('chapter.action.download.delete.label.action'),
                    },
                },
            });
        } catch {
            return;
        }

        try {
            const metadata = await NovelStorage.getAllMetadata();
            await Promise.all(
                metadata
                    .filter((item) => item.categoryIds?.includes(category.id))
                    .map((item) =>
                        NovelStorage.updateMetadata(item.id, {
                            categoryIds: item.categoryIds.filter((categoryId) => categoryId !== category.id),
                        }),
                    ),
            );
            await NovelCategoriesService.deleteCategory(category.id);
            setCategories((prev) => prev.filter((item) => item.id !== category.id));
        } catch (e) {
            makeToast(t('global.error.label.failed_to_save_changes'), 'error', getErrorMessage(e));
        }
    };

    if (loading) {
        return <LoadingPlaceholder />;
    }

    if (error) {
        return (
            <EmptyViewAbsoluteCentered
                message={t('category.error.label.request_failure')}
                messageExtra={getErrorMessage(error)}
                retry={() => loadCategories().catch(defaultPromiseErrorHandler('NovelCategorySettings::refetch'))}
            />
        );
    }

    return (
        <>
            {sortedCategories.length ? (
                <DndContext
                    sensors={dndSensors}
                    collisionDetection={closestCenter}
                    onDragStart={(event) =>
                        setDndActiveCategory(
                            sortedCategories.find((category) => category.id === event.active.id) ?? null,
                        )
                    }
                    onDragEnd={onDragEnd}
                    onDragCancel={() => setDndActiveCategory(null)}
                    onDragAbort={() => setDndActiveCategory(null)}
                >
                    <Box sx={{ paddingBottom: DEFAULT_FULL_FAB_HEIGHT }}>
                        <SortableContext items={sortedCategories} strategy={verticalListSortingStrategy}>
                            {sortedCategories.map((category) => (
                                <DndSortableItem
                                    key={category.id}
                                    id={category.id}
                                    isDragging={category.id === dndActiveCategory?.id}
                                >
                                    <NovelCategorySettingsCard
                                        category={category}
                                        onEdit={() => handleDialogOpen(category)}
                                        onDelete={() => handleDeleteCategory(category)}
                                    />
                                </DndSortableItem>
                            ))}
                        </SortableContext>
                        <DndOverlayItem isActive={!!dndActiveCategory}>
                            <NovelCategorySettingsCard category={dndActiveCategory!} onEdit={noOp} />
                        </DndOverlayItem>
                    </Box>
                </DndContext>
            ) : (
                <EmptyViewAbsoluteCentered message={t('category.error.label.empty')} />
            )}
            <Fab
                color="primary"
                aria-label="add"
                sx={{
                    position: 'fixed',
                    bottom: (theme) => theme.spacing(2),
                    right: (theme) => theme.spacing(2),
                }}
                onClick={() => handleDialogOpen()}
            >
                <AddIcon />
            </Fab>

            {dialogOpen && (
                <CreateOrEditNovelCategoryDialog
                    category={categoryToEdit}
                    onClose={handleDialogCancel}
                    onSaved={() => loadCategories().catch(defaultPromiseErrorHandler('NovelCategorySettings::refetch'))}
                />
            )}
        </>
    );
}
