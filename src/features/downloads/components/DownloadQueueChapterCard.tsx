/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import DragHandle from '@mui/icons-material/DragHandle';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { memo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';
import { ChapterDownloadRetryButton } from '@/features/chapter/components/buttons/ChapterDownloadRetryButton.tsx';
import { DownloadStateIndicator } from '@/base/components/downloads/DownloadStateIndicator.tsx';
import { ChapterCardMetadata } from '@/features/chapter/components/cards/ChapterCardMetadata.tsx';
import { MUIUtil } from '@/lib/mui/MUI.util.ts';
import { ListCardContent } from '@/base/components/lists/cards/ListCardContent.tsx';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { makeToast } from '@/base/utils/Toast.ts';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { DownloadState } from '@/lib/requests/types.ts';
import { ChapterDownloadStatus, ChapterIdInfo } from '@/features/chapter/Chapter.types.ts';
import { MediaQuery } from '@/base/utils/MediaQuery.tsx';

export const DownloadQueueChapterCard = memo(({ item }: { item: ChapterDownloadStatus }) => {
    const { t } = useTranslation();
    const preventMobileContextMenu = MediaQuery.usePreventMobileContextMenu();
    const errorMessage = typeof (item as any).error === 'string' ? (item as any).error.trim() : '';
    const isFinished = String(item.state ?? '').toUpperCase() === DownloadState.Finished;
    const actionTooltip = isFinished ? 'Dismiss' : t('chapter.action.download.delete.label.action');

    const handleDelete = useCallback(async (chapter: ChapterIdInfo) => {
        try {
            await requestManager.deleteDownloadedChapter(chapter.id).response;
            await requestManager.getDownloadStatus().response.catch(() => undefined);
        } catch (e) {
            makeToast(t('download.queue.error.label.failed_to_remove'), 'error', getErrorMessage(e));
        }
    }, []);

    return (
        <Box sx={{ p: 1, pb: 0 }}>
            <Card>
                <CardActionArea
                    component={Link}
                    to={AppRoutes.manga.path(item.manga.id)}
                    onContextMenu={preventMobileContextMenu}
                    sx={MediaQuery.preventMobileContextMenuSx()}
                >
                    <ListCardContent>
                        <IconButton {...MUIUtil.preventRippleProp()} sx={{ pointerEvents: 'none' }}>
                            <DragHandle />
                        </IconButton>
                        <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: 0 }}>
                            <ChapterCardMetadata title={item.manga.title} secondaryText={item.chapter.name} />
                            {errorMessage && (
                                <Typography
                                    variant="caption"
                                    color="error"
                                    sx={{
                                        mt: 0.25,
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                    }}
                                >
                                    {errorMessage}
                                </Typography>
                            )}
                        </Box>
                        <DownloadStateIndicator chapterId={item.chapter.id} />
                        <ChapterDownloadRetryButton chapterId={item.chapter.id} />
                        <CustomTooltip title={actionTooltip}>
                            <IconButton
                                {...MUIUtil.preventRippleProp()}
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleDelete(item.chapter);
                                }}
                            >
                                {isFinished ? <CloseIcon /> : <DeleteIcon />}
                            </IconButton>
                        </CustomTooltip>
                    </ListCardContent>
                </CardActionArea>
            </Card>
        </Box>
    );
});
