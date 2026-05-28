/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import { useTranslation } from 'react-i18next';
import Button from '@mui/material/Button';
import { Link } from 'react-router-dom';
import { ComponentProps, memo, useCallback, useMemo, useRef } from 'react';
import { alpha, useTheme } from '@mui/material/styles';
import {
    IReaderSettings,
    ReaderTransitionPageMode,
    ReadingDirection,
    ReadingMode,
} from '@/features/reader/Reader.types.ts';
import { isTransitionPageVisible } from '@/features/reader/viewer/pager/ReaderPager.utils.tsx';
import { useBackButton } from '@/base/hooks/useBackButton.ts';
import { applyStyles } from '@/base/utils/ApplyStyles.ts';
import {
    isContinuousReadingMode,
    isContinuousVerticalReadingMode,
} from '@/features/reader/settings/ReaderSettings.utils.tsx';
import { useNavBarContext } from '@/features/navigation-bar/NavbarContext.tsx';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { NavbarContextType } from '@/features/navigation-bar/NavigationBar.types.ts';
import { withPropsFrom } from '@/base/hoc/withPropsFrom.tsx';
import { getValueFromObject, noOp } from '@/lib/HelperFunctions.ts';
import { READER_BACKGROUND_TO_COLOR } from '@/features/reader/settings/ReaderSettings.constants.tsx';
import { ChapterType } from '@/lib/requests/types.ts';
import { ChapterIdInfo } from '@/features/chapter/Chapter.types.ts';
import {
    getReaderPagesStore,
    useReaderChaptersStore,
    useReaderPagesStore,
    useReaderScrollbarStore,
    useReaderSettingsStore,
    useReaderStore,
} from '@/features/reader/stores/ReaderStore.ts';
import { ReaderControls } from '@/features/reader/services/ReaderControls.ts';
import { READER_VIEWPORT_HEIGHT, READER_VIEWPORT_WIDTH } from '@/features/reader/ReaderViewport.constants.ts';

const TRANSITION_SWIPE_THRESHOLD_PX = 48;
const TRANSITION_HORIZONTAL_DOMINANCE_RATIO = 1.1;

const ChapterInfo = ({
    title,
    name,
    scanlator,
    backgroundColor,
}: {
    title: string;
    name?: ChapterType['name'];
    scanlator?: ChapterType['scanlator'];
    backgroundColor: IReaderSettings['backgroundColor'];
}) => {
    const theme = useTheme();

    const contrastText = theme.palette.getContrastText(
        getValueFromObject(theme.palette, READER_BACKGROUND_TO_COLOR[backgroundColor]),
    );
    const disabledText = alpha(contrastText, 0.5);

    if (!name) {
        return null;
    }

    return (
        <Stack>
            {/* Fix: Ghost Text for Title (Current/Next/Finished) */}
            <Typography color={contrastText} className="yomitan-ghost-text" data-text={title} />
            {/* Fix: Ghost Text for Chapter Name */}
            <Typography
                color={contrastText}
                variant="h6"
                component="h1"
                className="yomitan-ghost-text"
                data-text={name}
            />
            {scanlator && (
                /* Fix: Ghost Text for Scanlator */
                <Typography variant="body2" color={disabledText} className="yomitan-ghost-text" data-text={scanlator} />
            )}
        </Stack>
    );
};

const BaseReaderTransitionPage = ({
    type,
    forceVisible = false,
    currentChapterName,
    currentChapterScanlator,
    previousChapterName,
    previousChapterScanlator,
    nextChapterName,
    nextChapterScanlator,
    readerNavBarWidth,
    handleBack,
}: Pick<NavbarContextType, 'readerNavBarWidth'> & {
    // gets used in the "source props creators" of the "withPropsFrom" call
    // eslint-disable-next-line react/no-unused-prop-types
    chapterId: ChapterIdInfo['id'];
    currentChapterName?: ChapterType['name'];
    currentChapterScanlator?: ChapterType['scanlator'];
    previousChapterName?: ChapterType['name'];
    previousChapterScanlator?: ChapterType['scanlator'];
    nextChapterName?: ChapterType['name'];
    nextChapterScanlator?: ChapterType['scanlator'];
    type: Exclude<ReaderTransitionPageMode, ReaderTransitionPageMode.NONE | ReaderTransitionPageMode.BOTH>;
    forceVisible?: boolean;
    handleBack: () => void;
}) => {
    const { t } = useTranslation();
    const manga = useReaderStore((state) => state.manga);
    const scrollbar = useReaderScrollbarStore((state) => state.scrollbar);
    const transitionPageMode = useReaderPagesStore((state) => state.pages.transitionPageMode);
    const { readingMode, readingDirection, backgroundColor, shouldShowTransitionPage } = useReaderSettingsStore(
        (state) => ({
            readingMode: state.settings.readingMode.value,
            readingDirection: state.settings.readingDirection.value,
            backgroundColor: state.settings.backgroundColor,
            shouldShowTransitionPage: state.settings.shouldShowTransitionPage,
        }),
    );
    const dragRef = useRef<{
        startX: number;
        startY: number;
        pointerId: number;
    } | null>(null);

    const isPreviousType = type === ReaderTransitionPageMode.PREVIOUS;
    const isNextType = type === ReaderTransitionPageMode.NEXT;

    const isFirstChapter = !!currentChapterName && !previousChapterName;
    const isLastChapter = !!currentChapterName && !nextChapterName;

    const forceShowFirstChapterPreviousTransitionPage = isFirstChapter && type === ReaderTransitionPageMode.PREVIOUS;
    const forceShowLastChapterNextTransitionPage = isLastChapter && type === ReaderTransitionPageMode.NEXT;
    const forceShowTransitionPage =
        forceShowFirstChapterPreviousTransitionPage || forceShowLastChapterNextTransitionPage;

    if (!shouldShowTransitionPage && !forceShowTransitionPage && !forceVisible) {
        return null;
    }

    if (!forceVisible && !isTransitionPageVisible(type, transitionPageMode, readingMode)) {
        return null;
    }

    const clearTransitionPage = useCallback(() => {
        getReaderPagesStore().setTransitionPageMode(ReaderTransitionPageMode.NONE);
    }, []);

    const handleTransitionSwipeAction = useCallback(
        (deltaX: number, deltaY: number) => {
            const absDeltaX = Math.abs(deltaX);
            const absDeltaY = Math.abs(deltaY);

            if (
                absDeltaX < TRANSITION_SWIPE_THRESHOLD_PX ||
                absDeltaX < absDeltaY * TRANSITION_HORIZONTAL_DOMINANCE_RATIO
            ) {
                return;
            }

            const isForwardSwipe = readingDirection === ReadingDirection.LTR ? deltaX < 0 : deltaX > 0;

            if (type === ReaderTransitionPageMode.NEXT) {
                if (isForwardSwipe) {
                    ReaderControls.openChapter('next');
                    return;
                }

                clearTransitionPage();
                return;
            }

            if (isForwardSwipe) {
                clearTransitionPage();
                return;
            }

            ReaderControls.openChapter('previous');
        },
        [clearTransitionPage, readingDirection, type],
    );

    return (
        <Stack
            onDragStart={(event) => {
                event.preventDefault();
            }}
            onMouseDownCapture={(event) => {
                const target = event.target as HTMLElement | null;
                if (target?.closest('button, a')) {
                    return;
                }

                event.preventDefault();
            }}
            sx={{
                justifyContent: 'center',
                alignItems: 'center',
                pointerEvents: 'auto',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none',
                ...applyStyles(!isContinuousReadingMode(readingMode), {
                    width: '100%',
                    height: '100%',
                }),
                ...applyStyles(isContinuousReadingMode(readingMode), {
                    position: 'sticky',
                    ...applyStyles(isContinuousVerticalReadingMode(readingMode), {
                        left: 0,
                        maxWidth: `calc(${READER_VIEWPORT_WIDTH} - ${scrollbar.ySize}px - ${readerNavBarWidth}px)`,
                        minHeight: `calc(${READER_VIEWPORT_HEIGHT} - ${scrollbar.xSize}px)`,
                    }),
                    ...applyStyles(readingMode === ReadingMode.CONTINUOUS_HORIZONTAL, {
                        top: 0,
                        minWidth: `calc(${READER_VIEWPORT_WIDTH} - ${scrollbar.ySize}px - ${readerNavBarWidth}px)`,
                        maxHeight: `calc(${READER_VIEWPORT_HEIGHT} - ${scrollbar.xSize}px)`,
                    }),
                }),
            }}
        >
            <Box
                sx={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 2,
                    pointerEvents: 'auto',
                }}
                onPointerDown={(event) => {
                    if (!event.isPrimary || event.button !== 0) {
                        return;
                    }

                    event.preventDefault();
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    dragRef.current = {
                        startX: event.clientX,
                        startY: event.clientY,
                        pointerId: event.pointerId,
                    };
                }}
                onPointerMove={(event) => {
                    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) {
                        return;
                    }

                    event.preventDefault();
                    event.stopPropagation();
                }}
                onPointerUp={(event) => {
                    const dragState = dragRef.current;
                    if (!dragState || dragState.pointerId !== event.pointerId) {
                        return;
                    }

                    event.preventDefault();
                    event.stopPropagation();
                    dragRef.current = null;
                    handleTransitionSwipeAction(event.clientX - dragState.startX, event.clientY - dragState.startY);
                }}
                onPointerCancel={() => {
                    dragRef.current = null;
                }}
                onLostPointerCapture={() => {
                    dragRef.current = null;
                }}
            />
            <Stack
                sx={{
                    gap: 2,
                    maxWidth: (theme) =>
                        // spacing = added padding left + right
                        `calc(${READER_VIEWPORT_WIDTH} - ${scrollbar.ySize}px - ${readerNavBarWidth}px - ${theme.spacing(2)})`,
                    maxHeight: `calc(${READER_VIEWPORT_HEIGHT} - ${scrollbar.xSize}px)`,
                    width: 'max-content',
                    p: 1,
                    pointerEvents: 'none',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    zIndex: 1,
                }}
            >
                {isPreviousType && isFirstChapter && (
                    /* Fix: Ghost Text for "There is no previous chapter" */
                    <Typography
                        variant="h6"
                        className="yomitan-ghost-text"
                        data-text={t('reader.transition_page.first_chapter')}
                    />
                )}
                <Stack sx={{ gap: 5 }}>
                    {isPreviousType && !isFirstChapter && (
                        <ChapterInfo
                            title={t('reader.transition_page.previous')}
                            name={previousChapterName}
                            scanlator={previousChapterScanlator}
                            backgroundColor={backgroundColor}
                        />
                    )}
                    {!!currentChapterName && (
                        <ChapterInfo
                            title={t(
                                isPreviousType ? 'reader.transition_page.current' : 'reader.transition_page.finished',
                            )}
                            name={currentChapterName}
                            scanlator={currentChapterScanlator}
                            backgroundColor={backgroundColor}
                        />
                    )}
                    {isNextType && !isLastChapter && (
                        <ChapterInfo
                            title={t('reader.transition_page.next')}
                            name={nextChapterName}
                            scanlator={nextChapterScanlator}
                            backgroundColor={backgroundColor}
                        />
                    )}
                </Stack>
                {isNextType && isLastChapter && (
                    /* Fix: Ghost Text for "Last chapter" message */
                    <Typography
                        variant="h6"
                        className="yomitan-ghost-text"
                        data-text={t('reader.transition_page.last_chapter')}
                    />
                )}
                {((isPreviousType && isFirstChapter) || (isNextType && isLastChapter)) && (
                    <Stack sx={{ flexDirection: 'row', flexWrap: 'wrap', gap: 1, pointerEvents: 'auto' }}>
                        <Button
                            sx={{ flexGrow: 1 }}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleBack();
                            }}
                            variant="contained"
                        >
                            {/* Fix: Ghost Text inside Button (use span) */}
                            <span
                                className="yomitan-ghost-text"
                                data-text={t('reader.transition_page.exit.previous_page')}
                            />
                        </Button>
                        <Button
                            sx={{ flexGrow: 1 }}
                            component={Link}
                            onClick={(e) => {
                                e.stopPropagation();
                            }}
                            variant="contained"
                            to={AppRoutes.manga.path(manga?.id ?? -1)}
                        >
                            {/* Fix: Ghost Text inside Button (use span) */}
                            <span
                                className="yomitan-ghost-text"
                                data-text={t('reader.transition_page.exit.manga_page')}
                            />
                        </Button>
                    </Stack>
                )}
            </Stack>
        </Stack>
    );
};

export const ReaderTransitionPage = withPropsFrom(
    memo(BaseReaderTransitionPage) as typeof BaseReaderTransitionPage,
    [
        ({ chapterId }: Pick<ComponentProps<typeof BaseReaderTransitionPage>, 'chapterId'>) => {
            const chapters = useReaderChaptersStore((state) => state.chapters.chapters);

            const currentChapterIndex = useMemo(
                () => chapters.findIndex((chapter) => chapter.id === chapterId),
                [chapterId, chapters],
            );
            const currentChapter = chapters[currentChapterIndex];
            // chapters are sorted from latest to oldest
            const previousChapter = useMemo(() => chapters[currentChapterIndex + 1], [currentChapterIndex, chapters]);
            const nextChapter = useMemo(() => chapters[currentChapterIndex - 1], [currentChapterIndex, chapters]);

            return {
                currentChapterName: currentChapter?.name,
                currentChapterScanlator: currentChapter?.scanlator,
                previousChapterName: previousChapter?.name,
                previousChapterScanlator: previousChapter?.name,
                nextChapterName: nextChapter?.name,
                nextChapterScanlator: nextChapter?.scanlator,
            };
        },
        useNavBarContext,
        ({ chapterId, type }: Pick<ComponentProps<typeof BaseReaderTransitionPage>, 'chapterId' | 'type'>) => {
            const handleBack = useBackButton();
            const chapters = useReaderChaptersStore((state) => state.chapters.chapters);

            const currentChapterIndex = useMemo(
                () => chapters.findIndex((chapter) => chapter.id === chapterId),
                [chapterId, chapters],
            );

            // chapters are sorted from latest to oldest
            const isLastChapter = currentChapterIndex === 0;
            const isFirstChapter = currentChapterIndex === chapters.length - 1;

            const handleBackFirstChapter = type === ReaderTransitionPageMode.PREVIOUS && isFirstChapter;
            const handleBackLastChapter = type === ReaderTransitionPageMode.NEXT && isLastChapter;

            const needsToHandleBack = handleBackFirstChapter || handleBackLastChapter;

            return {
                handleBack: needsToHandleBack ? handleBack : noOp,
            };
        },
    ],
    [
        'currentChapterName',
        'currentChapterScanlator',
        'previousChapterName',
        'previousChapterScanlator',
        'nextChapterName',
        'nextChapterScanlator',
        'readerNavBarWidth',
        'handleBack',
    ],
);
