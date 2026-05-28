/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Button from '@mui/material/Button';
import { useTranslation } from 'react-i18next';
import List from '@mui/material/List';
import Stack from '@mui/material/Stack';
import { useEffect, useMemo, useState } from 'react';
import IconButton from '@mui/material/IconButton';
import ArrowBack from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import InputAdornment from '@mui/material/InputAdornment';
import InfoIcon from '@mui/icons-material/Info';
import PopupState, { bindPopover, bindTrigger } from 'material-ui-popup-state';
import Popover from '@mui/material/Popover';
import Typography from '@mui/material/Typography';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { SearchTextField } from '@/base/components/inputs/SearchTextField.tsx';
import { makeToast } from '@/base/utils/Toast.ts';
import { TrackerMangaCard } from '@/features/tracker/components/cards/TrackerMangaCard.tsx';
import { DIALOG_PADDING } from '@/features/tracker/Tracker.constants.ts';
import { useGetOptionForDirection } from '@/features/theme/services/ThemeCreator.ts';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { applyStyles } from '@/base/utils/ApplyStyles.ts';
import { Tracker, TrackerIdInfo, TTrackerBind, TrackedMedia } from '@/features/tracker/Tracker.types.ts';
import { CustomButtonIcon } from '@/base/components/buttons/CustomButtonIcon.tsx';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';

const TrackButton = ({
    media,
    selectedTrackerRemoteId,
    trackerId,
    closeSearchMode,
    supportsPrivateTracking,
    onTrackRecordChanged,
}: {
    trackerId: TrackerIdInfo['id'];
    media: TrackedMedia;
    selectedTrackerRemoteId: string | undefined;
    closeSearchMode: () => void;
    supportsPrivateTracking: boolean;
    onTrackRecordChanged: () => Promise<void>;
}) => {
    const { t } = useTranslation();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const trackManga = (asPrivate: boolean) => {
        if (selectedTrackerRemoteId === undefined) {
            return;
        }

        setIsSubmitting(true);
        const request =
            media.mediaType === 'anime'
                ? requestManager.bindAnimeTracker(media.id, trackerId, selectedTrackerRemoteId, asPrivate).response
                : requestManager.bindTracker(media.id, trackerId, selectedTrackerRemoteId, asPrivate).response;

        request
            .then(async () => {
                await onTrackRecordChanged();
                makeToast(t('manga.action.track.add.label.success'), 'success');
                closeSearchMode();
            })
            .catch((e) => makeToast(t('manga.action.track.add.label.error'), 'error', getErrorMessage(e)))
            .finally(() => setIsSubmitting(false));
    };

    return (
        <Stack
            direction="row"
            sx={{
                justifyContent: 'center',
                position: 'sticky',
                bottom: 0,
                marginTop: 2,
                paddingTop: 2,
                paddingBottom: DIALOG_PADDING,
                gap: 2,
                px: DIALOG_PADDING,
                backgroundColor: 'background.paper',
                borderTop: '1px solid',
                borderColor: 'divider',
                zIndex: 1,
            }}
        >
            <Button
                disabled={isSubmitting}
                size="large"
                variant="contained"
                onClick={() => trackManga(false)}
                sx={{ flexBasis: '65%' }}
            >
                {t('manga.action.track.add.label.action')}
            </Button>
            {supportsPrivateTracking && (
                <CustomTooltip title={t('tracking.action.button.track_privately')} disabled={isSubmitting}>
                    <CustomButtonIcon
                        disabled={isSubmitting}
                        sx={{ flexBasis: '10%', maxWidth: '100px' }}
                        variant="contained"
                        onClick={() => trackManga(true)}
                    >
                        <VisibilityOffIcon />
                    </CustomButtonIcon>
                </CustomTooltip>
            )}
        </Stack>
    );
};

export const TrackerSearch = ({
    media,
    tracker,
    closeSearchMode,
    trackedId,
    onTrackRecordChanged,
}: {
    media: TrackedMedia;
    tracker: TTrackerBind;
    closeSearchMode: () => void;
    trackedId?: string;
    onTrackRecordChanged: () => Promise<void>;
}) => {
    const { t } = useTranslation();
    const getOptionForDirection = useGetOptionForDirection();

    const [searchString, setSearchString] = useState<string>(media.title);
    const [tmpSearchString, setTmpSearchString] = useState(searchString);

    const [selectedTrackerRemoteId, setSelectedTrackerRemoteId] = useState<string | undefined>(trackedId);

    const trackerSearch =
        media.mediaType === 'anime'
            ? requestManager.useAnimeTrackerSearch(tracker.id, searchString, media.id, {
                  notifyOnNetworkStatusChange: true,
              })
            : requestManager.useTrackerSearch(tracker.id, searchString, media.id, {
                  notifyOnNetworkStatusChange: true,
              });
    const searchResults = trackerSearch.data?.searchTracker.trackSearches ?? [];

    const hasResults = !!searchResults.length;
    const hasNoResults = !trackerSearch.loading && !trackerSearch.error && !hasResults;
    const hasError = !!trackerSearch.error && !trackerSearch.loading;

    useEffect(() => {
        setSelectedTrackerRemoteId(trackedId);
    }, [trackedId, tracker.id, media.mediaType, media.id]);

    const showTrackButton =
        useMemo(
            () =>
                !!selectedTrackerRemoteId &&
                !!searchResults.find((searchResult) => searchResult.remoteId === selectedTrackerRemoteId),
            [selectedTrackerRemoteId, searchResults],
        ) && !hasError;

    return (
        <>
            <DialogTitle sx={{ padding: DIALOG_PADDING }}>
                <Stack
                    direction="row"
                    sx={{
                        gap: '10px',
                        alignItems: 'center',
                    }}
                >
                    <IconButton onClick={closeSearchMode}>
                        {getOptionForDirection(<ArrowBack />, <ArrowForwardIcon />)}
                    </IconButton>
                    <SearchTextField
                        sx={{ width: '100%' }}
                        variant="standard"
                        value={tmpSearchString}
                        onChange={(e) => setTmpSearchString(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                setSearchString(tmpSearchString);
                            }
                        }}
                        onCancel={() => setTmpSearchString('')}
                        InputProps={{
                            startAdornment: tracker.id === Tracker.MYANIMELIST && (
                                <InputAdornment position="start">
                                    <PopupState variant="popover" popupId="tracker-search-info">
                                        {(popupState) => (
                                            <>
                                                <IconButton {...bindTrigger(popupState)} color="inherit">
                                                    <InfoIcon />
                                                </IconButton>
                                                <Popover
                                                    {...bindPopover(popupState)}
                                                    anchorOrigin={{
                                                        vertical: 'bottom',
                                                        horizontal: 'left',
                                                    }}
                                                >
                                                    <Typography sx={{ padding: 1, whiteSpace: 'pre-line' }}>
                                                        {t('tracking.my_anime_list.search.label.hint')}
                                                    </Typography>
                                                </Popover>
                                            </>
                                        )}
                                    </PopupState>
                                </InputAdornment>
                            ),
                        }}
                    />
                </Stack>
            </DialogTitle>
            <DialogContent
                dividers
                sx={{
                    padding: DIALOG_PADDING,
                    maxHeight: 'calc(100dvh - 160px)',
                    ...applyStyles(hasNoResults || hasError, { position: 'relative' }),
                }}
            >
                {hasNoResults && <EmptyViewAbsoluteCentered message={t('manga.error.label.no_mangas_found')} />}
                {trackerSearch.loading && <LoadingPlaceholder />}
                {hasError && (
                    <EmptyViewAbsoluteCentered
                        message={t('global.error.label.failed_to_load_data')}
                        messageExtra={getErrorMessage(trackerSearch.error)}
                        retry={() =>
                            trackerSearch.refetch().catch(defaultPromiseErrorHandler('TrackerSearch::refetch'))
                        }
                    />
                )}
                <List sx={{ padding: 0 }}>
                    {hasResults &&
                        searchResults.map((trackerManga) => (
                            <TrackerMangaCard
                                key={trackerManga.id}
                                manga={trackerManga}
                                mediaType={media.mediaType}
                                selected={trackerManga.remoteId === selectedTrackerRemoteId}
                                onSelect={() => setSelectedTrackerRemoteId(trackerManga.remoteId)}
                            />
                        ))}
                </List>
                {showTrackButton && (
                    <TrackButton
                        media={media}
                        trackerId={tracker.id}
                        closeSearchMode={closeSearchMode}
                        selectedTrackerRemoteId={selectedTrackerRemoteId}
                        supportsPrivateTracking={tracker.supportsPrivateTracking}
                        onTrackRecordChanged={onTrackRecordChanged}
                    />
                )}
            </DialogContent>
        </>
    );
};
