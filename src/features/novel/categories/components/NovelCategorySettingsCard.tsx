/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import DeleteIcon from '@mui/icons-material/Delete';
import DragHandleIcon from '@mui/icons-material/DragHandle';
import EditIcon from '@mui/icons-material/Edit';
import { useTranslation } from 'react-i18next';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';
import { ListCardContent } from '@/base/components/lists/cards/ListCardContent.tsx';
import type { NovelCategory } from '@/features/novel/Novel.types.ts';

export const NovelCategorySettingsCard = ({
    category,
    onEdit,
    onDelete,
}: {
    category: Pick<NovelCategory, 'id' | 'name'>;
    onEdit: () => void;
    onDelete?: () => void;
}) => {
    const { t } = useTranslation();

    return (
        <Box sx={{ p: 1, pb: 0 }}>
            <Card>
                <ListCardContent sx={{ gap: 2 }}>
                    <DragHandleIcon />
                    <Typography sx={{ flexGrow: 1 }} variant="h6" component="h2">
                        {category.name}
                    </Typography>
                    <Stack sx={{ flexDirection: 'row' }}>
                        <CustomTooltip title={t('global.button.edit')}>
                            <IconButton component={Box} onClick={onEdit}>
                                <EditIcon />
                            </IconButton>
                        </CustomTooltip>
                        {onDelete ? (
                            <CustomTooltip title={t('chapter.action.download.delete.label.action')}>
                                <IconButton component={Box} onClick={onDelete}>
                                    <DeleteIcon />
                                </IconButton>
                            </CustomTooltip>
                        ) : null}
                    </Stack>
                </ListCardContent>
            </Card>
        </Box>
    );
};
