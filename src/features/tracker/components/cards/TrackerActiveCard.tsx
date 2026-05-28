/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormGroup from '@mui/material/FormGroup';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import ListItemButton from '@mui/material/ListItemButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PopupState, { bindDialog, bindMenu, bindTrigger } from 'material-ui-popup-state';
import { useMemo, useState } from 'react';
import Badge from '@mui/material/Badge';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { Trackers } from '@/features/tracker/services/Trackers.ts';
import { ListPreference } from '@/features/source/configuration/components/ListPreference.tsx';
import { NumberSetting } from '@/base/components/settings/NumberSetting.tsx';
import { DateSetting } from '@/base/components/settings/DateSetting.tsx';
import { makeToast } from '@/base/utils/Toast.ts';
import { Menu } from '@/base/components/menu/Menu.tsx';
import { CARD_STYLING, UNSET_DATE } from '@/features/tracker/Tracker.constants.ts';
import { TypographyMaxLines } from '@/base/components/texts/TypographyMaxLines.tsx';
import { SelectSetting, SelectSettingValue } from '@/base/components/settings/SelectSetting.tsx';
import { CheckboxInput } from '@/base/components/inputs/CheckboxInput.tsx';
import { TrackRecordType } from '@/lib/requests/types.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { TTrackerBind, TTrackRecordBind, TrackedMediaType } from '@/features/tracker/Tracker.types.ts';
import { AvatarSpinner } from '@/base/components/AvatarSpinner.tsx';
import { getTrackerIconUrl } from '@/features/tracker/Tracker.utils.ts';

const TrackerActiveLink = ({ children, url }: { children: React.ReactNode; url: string }) => (
    <Link href={url} rel="noreferrer" target="_blank" underline="none" color="inherit">
        {children}
    </Link>
);

type TTrackerActive = Pick<TTrackerBind, 'id' | 'name' | 'icon' | 'supportsTrackDeletion' | 'supportsPrivateTracking'>;
type TTrackRecordContext = {
    trackerId?: number;
    mangaId?: number;
    animeId?: number;
};

const getTrackerStatusLabel = (mediaType: TrackedMediaType, trackerId: number, value: number, fallback: string) => {
    if (mediaType !== 'anime') {
        return fallback;
    }

    switch (value) {
        case 1:
            return 'Watching';
        case 2:
            return 'Completed';
        case 3:
            return 'On Hold';
        case 4:
            return 'Dropped';
        case 5:
            return trackerId === 2 || trackerId === 3 ? 'Plan to Watch' : fallback;
        case 6:
            if (trackerId === 2) {
                return 'Rewatching';
            }
            if (trackerId === 1) {
                return 'Plan to Watch';
            }
            return fallback;
        case 7:
            return trackerId === 1 ? 'Rewatching' : fallback;
        default:
            return fallback;
    }
};

const TrackerActiveRemoveBind = ({
    trackerRecordId,
    tracker,
    trackRecordContext,
    onClick,
    onClose,
    onTrackRecordChanged,
}: {
    trackerRecordId: TrackRecordType['id'];
    tracker: TTrackerActive;
    trackRecordContext: TTrackRecordContext;
    onClick: () => void;
    onClose: () => void;
    onTrackRecordChanged: () => Promise<void>;
}) => {
    const { t } = useTranslation();

    const [removeRemoteTracking, setRemoveRemoteTracking] = useState(false);

    const removeBind = () => {
        onClose();
        requestManager
            .unbindTracker(trackerRecordId, removeRemoteTracking, trackRecordContext)
            .response.then(async () => {
                await onTrackRecordChanged();
                makeToast(t('manga.action.track.remove.label.success'), 'success');
            })
            .catch((e) => makeToast(t('manga.action.track.remove.label.error'), 'error', getErrorMessage(e)));
    };

    return (
        <PopupState variant="dialog" popupId={`tracker-active-menu-remove-button-${tracker.id}`}>
            {(popupState) => (
                <>
                    <MenuItem
                        {...bindTrigger(popupState)}
                        onClick={() => {
                            onClick();
                            popupState.open();
                        }}
                    >
                        {t('global.button.remove')}
                    </MenuItem>
                    <Dialog
                        {...bindDialog(popupState)}
                        onClose={() => {
                            onClose();
                            popupState.close();
                        }}
                    >
                        <DialogTitle>
                            {t('manga.action.track.remove.dialog.label.title', { tracker: tracker.name })}
                        </DialogTitle>
                        <DialogContent dividers>
                            <Typography>{t('manga.action.track.remove.dialog.label.description')}</Typography>
                            {tracker.supportsTrackDeletion && (
                                <FormGroup>
                                    <CheckboxInput
                                        disabled={false}
                                        label={t('manga.action.track.remove.dialog.label.delete_remote_track', {
                                            tracker: tracker.name,
                                        })}
                                        checked={removeRemoteTracking}
                                        onChange={(_, checked) => setRemoveRemoteTracking(checked)}
                                    />
                                </FormGroup>
                            )}
                        </DialogContent>
                        <DialogActions>
                            <Button
                                autoFocus
                                onClick={() => {
                                    popupState.close();
                                    onClose();
                                }}
                            >
                                {t('global.button.cancel')}
                            </Button>
                            <Button
                                onClick={() => {
                                    popupState.close();
                                    onClose();
                                    removeBind();
                                }}
                            >
                                {t('global.button.ok')}
                            </Button>
                        </DialogActions>
                    </Dialog>
                </>
            )}
        </PopupState>
    );
};

const TrackerUpdatePrivateStatus = ({
    trackRecordId,
    isPrivate,
    closeMenu,
    supportsPrivateTracking,
    trackRecordContext,
    onTrackRecordChanged,
}: {
    trackRecordId: TrackRecordType['id'];
    isPrivate: boolean;
    closeMenu: () => void;
    supportsPrivateTracking: TTrackerActive['supportsPrivateTracking'];
    trackRecordContext: TTrackRecordContext;
    onTrackRecordChanged: () => Promise<void>;
}) => {
    const { t } = useTranslation();

    if (!supportsPrivateTracking) {
        return null;
    }

    return (
        <MenuItem
            onClick={() => {
                requestManager
                    .updateTrackerBind(trackRecordId, { ...trackRecordContext, private: !isPrivate })
                    .response.then(() => onTrackRecordChanged())
                    .catch((e) =>
                        makeToast(t('global.error.label.failed_to_save_changes'), 'error', getErrorMessage(e)),
                    );
                closeMenu();
            }}
        >
            {t(isPrivate ? 'tracking.action.button.track_publicly' : 'tracking.action.button.track_privately')}
        </MenuItem>
    );
};

type TTrackRecordActive = Pick<TTrackRecordBind, 'id' | 'remoteUrl' | 'title' | 'private'>;
const TrackerActiveHeader = ({
    trackRecord,
    tracker,
    trackRecordContext,
    openSearch,
    onTrackRecordChanged,
}: {
    trackRecord: TTrackRecordActive;
    tracker: TTrackerActive;
    trackRecordContext: TTrackRecordContext;
    openSearch: () => void;
    onTrackRecordChanged: () => Promise<void>;
}) => {
    const { t } = useTranslation();

    return (
        <Stack
            direction="row"
            sx={{
                alignItems: 'stretch',
                paddingBottom: 2,
            }}
        >
            <Badge
                badgeContent={
                    trackRecord.private ? (
                        <Stack sx={{ p: '2px 6px', backgroundColor: 'primary.main', borderRadius: 100 }}>
                            <VisibilityOffIcon fontSize="small" sx={{ color: 'primary.contrastText' }} />
                        </Stack>
                    ) : null
                }
            >
                <TrackerActiveLink url={trackRecord.remoteUrl}>
                    <AvatarSpinner
                        alt={`${tracker.name}`}
                        iconUrl={getTrackerIconUrl(tracker)}
                        slots={{
                            avatarProps: {
                                variant: 'rounded',
                                sx: { width: 64, height: 64 },
                            },
                            spinnerImageProps: {
                                ignoreQueue: true,
                            },
                        }}
                    />
                </TrackerActiveLink>
            </Badge>

            <ListItemButton sx={{ flexGrow: 1 }} onClick={openSearch}>
                <CustomTooltip title={trackRecord.title}>
                    <TypographyMaxLines flexGrow={1} lines={1}>
                        {trackRecord.title}
                    </TypographyMaxLines>
                </CustomTooltip>
            </ListItemButton>
            <Stack
                sx={{
                    justifyContent: 'center',
                }}
            >
                <PopupState variant="popover" popupId={`tracker-active-menu-popup-${tracker.id}`}>
                    {(popupState) => (
                        <>
                            <IconButton {...bindTrigger(popupState)}>
                                <MoreVertIcon />
                            </IconButton>
                            <Menu {...bindMenu(popupState)} id={`tracker-active-menu-${tracker.id}`}>
                                {(onClose, setHideMenu) => [
                                    <TrackerActiveLink
                                        key={`tracker-active-menu-item-browser-${tracker.id}`}
                                        url={trackRecord.remoteUrl}
                                    >
                                        <MenuItem onClick={() => onClose()}>
                                            {t('global.label.open_in_browser')}
                                        </MenuItem>
                                    </TrackerActiveLink>,
                                    <TrackerActiveRemoveBind
                                        key={`tracker-active-menu-item-remove-${tracker.id}`}
                                        trackerRecordId={trackRecord.id}
                                        tracker={tracker}
                                        trackRecordContext={trackRecordContext}
                                        onClick={() => setHideMenu(true)}
                                        onClose={onClose}
                                        onTrackRecordChanged={onTrackRecordChanged}
                                    />,
                                    <TrackerUpdatePrivateStatus
                                        trackRecordId={trackRecord.id}
                                        isPrivate={trackRecord.private}
                                        closeMenu={onClose}
                                        supportsPrivateTracking={tracker.supportsPrivateTracking}
                                        trackRecordContext={trackRecordContext}
                                        onTrackRecordChanged={onTrackRecordChanged}
                                    />,
                                ]}
                            </Menu>
                        </>
                    )}
                </PopupState>
            </Stack>
        </Stack>
    );
};

const TrackerActiveCardInfoRow = ({ children }: { children: React.ReactNode }) => (
    <Stack direction="row" sx={{ textAlignLast: 'center' }}>
        {children}
    </Stack>
);

const isUnsetScore = (score: string | number): boolean => !Math.trunc(Number(score));

export const TrackerActiveCard = ({
    trackRecord,
    tracker,
    mediaType,
    onClick,
    onTrackRecordChanged,
}: {
    trackRecord: TTrackRecordBind;
    tracker: TTrackerBind;
    mediaType: TrackedMediaType;
    onClick: () => void;
    onTrackRecordChanged: () => Promise<void>;
}) => {
    const { t } = useTranslation();
    const progressLabel = mediaType === 'anime' ? 'Episodes' : t('chapter.title_other');
    const progressValue =
        mediaType === 'anime'
            ? `${trackRecord.lastEpisodeSeen ?? trackRecord.lastChapterRead}/${trackRecord.totalEpisodes ?? trackRecord.totalChapters}`
            : `${trackRecord.lastChapterRead}/${trackRecord.totalChapters}`;

    const hasScores = tracker.scores.length > 0;
    const supportsReadingDates = tracker.supportsReadingDates === true;
    const isScoreUnset = isUnsetScore(trackRecord.displayScore);
    let currentScore: string | undefined;
    if (hasScores) {
        currentScore = isScoreUnset ? tracker.scores[0] : trackRecord.displayScore;
    }

    const selectSettingValues = useMemo(
        () =>
            tracker.scores.map(
                (score) =>
                    [score, { text: isUnsetScore(score) ? '-' : score }] satisfies SelectSettingValue<
                        TTrackerBind['scores'][number]
                    >,
            ),
        [tracker.scores],
    );

    const trackRecordContext = useMemo(
        () => ({
            trackerId: tracker.id,
            mangaId: trackRecord.manga?.id,
            animeId: trackRecord.anime?.id,
        }),
        [trackRecord.anime?.id, trackRecord.manga?.id, tracker.id],
    );

    const statusOptions = useMemo(
        () =>
            tracker.statuses.map((status) => ({
                ...status,
                label: getTrackerStatusLabel(mediaType, tracker.id, status.value, status.name),
            })),
        [mediaType, tracker.id, tracker.statuses],
    );

    const updateTrackerBind = (patch: Parameters<typeof requestManager.updateTrackerBind>[1]) => {
        requestManager
            .updateTrackerBind(trackRecord.id, { ...trackRecordContext, ...patch })
            .response.then(() => onTrackRecordChanged())
            .catch((e) => makeToast(t('global.error.label.failed_to_save_changes'), 'error', getErrorMessage(e)));
    };

    return (
        <Card sx={CARD_STYLING}>
            <CardContent sx={{ padding: 0 }}>
                <TrackerActiveHeader
                    trackRecord={trackRecord}
                    tracker={tracker}
                    trackRecordContext={trackRecordContext}
                    openSearch={onClick}
                    onTrackRecordChanged={onTrackRecordChanged}
                />
                <Card sx={{ backgroundColor: 'background.default' }}>
                    <CardContent sx={{ padding: '0' }}>
                        <Box sx={{ padding: 1 }}>
                            <TrackerActiveCardInfoRow>
                                <ListPreference
                                    ListPreferenceTitle={t('manga.label.status')}
                                    entries={statusOptions.map((status) => status.label)}
                                    key="status"
                                    type="ListPreference"
                                    entryValues={statusOptions.map((status) => `${status.value}`)}
                                    ListPreferenceCurrentValue={`${trackRecord.status}`}
                                    updateValue={(_, status) => updateTrackerBind({ status: Number(status) })}
                                    summary="%s"
                                />
                                <Divider orientation="vertical" flexItem />
                                <NumberSetting
                                    settingTitle={progressLabel}
                                    dialogTitle={progressLabel}
                                    settingValue={progressValue}
                                    value={
                                        mediaType === 'anime'
                                            ? (trackRecord.lastEpisodeSeen ?? trackRecord.lastChapterRead)
                                            : trackRecord.lastChapterRead
                                    }
                                    minValue={0}
                                    maxValue={Number.MAX_SAFE_INTEGER}
                                    valueUnit=""
                                    handleUpdate={(lastChapterRead) =>
                                        updateTrackerBind(
                                            mediaType === 'anime'
                                                ? { lastEpisodeSeen: lastChapterRead }
                                                : { lastChapterRead },
                                        )
                                    }
                                />
                                {hasScores && (
                                    <>
                                        <Divider orientation="vertical" flexItem />
                                        <SelectSetting<string>
                                            settingName={t('tracking.track_record.label.score')}
                                            value={currentScore!}
                                            values={selectSettingValues}
                                            handleChange={(score) => updateTrackerBind({ scoreString: score })}
                                        />
                                    </>
                                )}
                            </TrackerActiveCardInfoRow>
                            {supportsReadingDates && (
                                <>
                                    <Divider />
                                    <TrackerActiveCardInfoRow>
                                        <DateSetting
                                            settingName={t('tracking.track_record.label.start_date')}
                                            value={Trackers.getDateString(trackRecord.startDate)}
                                            maxDate={Trackers.getDateString(trackRecord.finishDate)}
                                            disableFuture
                                            remove
                                            handleChange={(startDate) =>
                                                updateTrackerBind({ startDate: startDate ?? UNSET_DATE })
                                            }
                                        />
                                        <Divider orientation="vertical" flexItem />
                                        <DateSetting
                                            settingName={t('tracking.track_record.label.finish_date')}
                                            value={Trackers.getDateString(trackRecord.finishDate)}
                                            minDate={Trackers.getDateString(trackRecord.startDate)}
                                            disableFuture
                                            remove
                                            handleChange={(finishDate) =>
                                                updateTrackerBind({ finishDate: finishDate ?? UNSET_DATE })
                                            }
                                        />
                                    </TrackerActiveCardInfoRow>
                                </>
                            )}
                        </Box>
                    </CardContent>
                </Card>
            </CardContent>
        </Card>
    );
};
