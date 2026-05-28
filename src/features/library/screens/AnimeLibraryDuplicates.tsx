/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import IconButton from '@mui/material/IconButton';
import SettingsIcon from '@mui/icons-material/Settings';
import PopupState, { bindMenu, bindTrigger } from 'material-ui-popup-state';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { GridLayouts } from '@/base/components/GridLayouts.tsx';
import { CheckboxInput } from '@/base/components/inputs/CheckboxInput.tsx';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { AnimeGridCard } from '@/features/anime/components/AnimeGridCard.tsx';
import { AnimeListCard } from '@/features/anime/components/AnimeListCard.tsx';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { StyledGroupedVirtuoso } from '@/base/components/virtuoso/StyledGroupedVirtuoso.tsx';
import { StyledGroupHeader } from '@/base/components/virtuoso/StyledGroupHeader.tsx';
import { StyledGroupItemWrapper } from '@/base/components/virtuoso/StyledGroupItemWrapper.tsx';
import { VirtuosoUtil } from '@/lib/virtuoso/Virtuoso.util.tsx';
import { LibraryDuplicatesWorkerInput, TMangaDuplicates } from '@/features/library/Library.types.ts';
import { GridLayout } from '@/base/Base.types.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { useAppTitleAndAction } from '@/features/navigation-bar/hooks/useAppTitleAndAction.ts';
import { toggleAnimeLibraryState } from '@/features/anime/services/AnimeLibrary.ts';
import { useManatanAnimeLibraryDuplicatesPreferences } from '@/Manatan/anime/AnimePrivateAdapters.ts';

type AnimeDuplicate = {
    id: number;
    title: string;
    description: string;
    thumbnailUrl?: string | null;
    url?: string | null;
    inLibrary?: boolean;
};

export const AnimeLibraryDuplicates = () => {
    const { t } = useTranslation();

    const { gridLayout, setGridLayout, checkAlternativeTitles, setCheckAlternativeTitles } =
        useManatanAnimeLibraryDuplicatesPreferences();

    useAppTitleAndAction(
        'Video duplicated entries',
        <>
            <GridLayouts gridLayout={gridLayout} onChange={setGridLayout} />
            <PopupState variant="popover" popupId="anime-library-duplicates-settings">
                {(popupState) => (
                    <>
                        <IconButton {...bindTrigger(popupState)} color="inherit">
                            <SettingsIcon />
                        </IconButton>
                        <Menu {...bindMenu(popupState)}>
                            <MenuItem>
                                <CheckboxInput
                                    label={t('library.settings.advanced.duplicates.settings.label.check_description')}
                                    checked={checkAlternativeTitles}
                                    onChange={(_, checked) => setCheckAlternativeTitles(checked)}
                                />
                            </MenuItem>
                        </Menu>
                    </>
                )}
            </PopupState>
        </>,
        [t, gridLayout, checkAlternativeTitles],
    );

    const { data, loading, error, refetch } = requestManager.useGetAnimeLibrary();
    const libraryAnimes = useMemo<AnimeDuplicate[]>(
        () =>
            (data?.animes.nodes ?? []).map((anime: any) => ({
                ...anime,
                description: `${anime?.description ?? anime?.desc ?? ''}`,
            })),
        [data?.animes.nodes],
    );

    const [animesByTitle, setAnimesByTitle] = useState<Record<string, AnimeDuplicate[]>>({});
    const [isCheckingForDuplicates, setIsCheckingForDuplicates] = useState(true);

    useEffect(() => {
        setIsCheckingForDuplicates(true);
        if (!libraryAnimes.length) {
            setAnimesByTitle({});
            setIsCheckingForDuplicates(false);
            return () => {};
        }

        const worker = new Worker(new URL('../workers/LibraryDuplicatesWorker.ts', import.meta.url), {
            type: 'module',
        });

        worker.onmessage = (event: MessageEvent<TMangaDuplicates<AnimeDuplicate>>) => {
            setAnimesByTitle(event.data);
            setIsCheckingForDuplicates(false);
        };
        worker.postMessage({
            mangas: libraryAnimes,
            checkAlternativeTitles,
        } satisfies LibraryDuplicatesWorkerInput<AnimeDuplicate>);

        return () => worker.terminate();
    }, [libraryAnimes, checkAlternativeTitles]);

    const duplicatedTitles = useMemo(
        () => Object.keys(animesByTitle).toSorted((titleA, titleB) => titleA.localeCompare(titleB)),
        [animesByTitle],
    );
    const duplicatedAnimes = useMemo(
        () => duplicatedTitles.map((title) => animesByTitle[title]).flat(),
        [animesByTitle, duplicatedTitles],
    );
    const animeCountByTitle = useMemo(
        () => duplicatedTitles.map((title) => animesByTitle[title]).map((animes) => animes.length),
        [animesByTitle, duplicatedTitles],
    );

    const computeItemKey = VirtuosoUtil.useCreateGroupedComputeItemKey(
        animeCountByTitle,
        useCallback((index) => duplicatedTitles[index], [duplicatedTitles]),
        useCallback(
            (index, groupIndex) => `${duplicatedTitles[groupIndex]}-${duplicatedAnimes[index].id}}`,
            [duplicatedTitles, duplicatedAnimes],
        ),
    );

    const toggleLibrary = useCallback(
        async (anime: AnimeDuplicate) => {
            await toggleAnimeLibraryState(anime.id, !(anime.inLibrary ?? false));
            await refetch();
        },
        [refetch],
    );

    if (loading || isCheckingForDuplicates) {
        return <LoadingPlaceholder />;
    }

    if (error) {
        return (
            <EmptyViewAbsoluteCentered
                message={t('global.error.label.failed_to_load_data')}
                messageExtra={getErrorMessage(error)}
                retry={() => refetch().catch(defaultPromiseErrorHandler('AnimeLibraryDuplicates::refetch'))}
            />
        );
    }

    if (!duplicatedTitles.length) {
        return <EmptyViewAbsoluteCentered message="No duplicated anime entries found." />;
    }

    if (gridLayout === GridLayout.List) {
        return (
            <StyledGroupedVirtuoso
                persistKey="anime-library-duplicates"
                groupCounts={animeCountByTitle}
                groupContent={(index) => (
                    <StyledGroupHeader isFirstItem={index === 0}>
                        <Typography variant="h5" component="h2">
                            {duplicatedTitles[index]}
                        </Typography>
                    </StyledGroupHeader>
                )}
                computeItemKey={computeItemKey}
                itemContent={(index) => {
                    const anime = duplicatedAnimes[index];
                    return (
                        <StyledGroupItemWrapper>
                            <AnimeListCard
                                anime={anime}
                                linkTo={AppRoutes.anime.childRoutes.details.path(anime.id)}
                                selected={null}
                                onToggleLibrary={() => toggleLibrary(anime)}
                                onLibraryChange={() => refetch()}
                            />
                        </StyledGroupItemWrapper>
                    );
                }}
            />
        );
    }

    return duplicatedTitles.map((title, index) => (
        <Box key={title} sx={{ pb: 1 }}>
            <StyledGroupHeader sx={{ pt: index === 0 ? undefined : 0, pb: 0 }} isFirstItem={false}>
                <Typography variant="h5" component="h2">
                    {title}
                </Typography>
            </StyledGroupHeader>
            <Grid container spacing={1}>
                {animesByTitle[title].map((anime) => (
                    <Grid key={anime.id} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
                        <AnimeGridCard
                            anime={anime}
                            linkTo={AppRoutes.anime.childRoutes.details.path(anime.id)}
                            gridLayout={gridLayout}
                            selected={null}
                            onLibraryChange={() => refetch()}
                        />
                    </Grid>
                ))}
            </Grid>
        </Box>
    ));
};
