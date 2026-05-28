/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import TextField from '@mui/material/TextField';
import DialogActions from '@mui/material/DialogActions';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Stack from '@mui/material/Stack';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { PasswordTextField } from '@/base/components/inputs/PasswordTextField.tsx';
import { makeToast } from '@/base/utils/Toast.ts';

const getVisibleViewport = () => {
    if (typeof window === 'undefined') {
        return {
            height: 0,
            offsetTop: 0,
        };
    }

    return {
        height: window.visualViewport?.height ?? window.innerHeight,
        offsetTop: window.visualViewport?.offsetTop ?? 0,
    };
};

export type TextSettingDialogProps = {
    settingName: string;
    dialogTitle?: string;
    dialogDescription?: string;
    value?: string;
    handleChange: (value: string) => void;
    isPassword?: boolean;
    placeholder?: string;
    isDialogOpen: boolean;
    setIsDialogOpen: (open: boolean) => void;
    validate?: (value: string) => boolean;
    pickValueButtonTitle?: string;
    onPickValue?: () => Promise<string | null | undefined> | string | null | undefined;
    defaultValueButtonTitle?: string;
    onUseDefaultValue?: () => string;
};

export const TextSettingDialog = ({
    settingName,
    dialogTitle = settingName,
    dialogDescription,
    value,
    handleChange,
    isPassword = false,
    placeholder = '',
    isDialogOpen,
    setIsDialogOpen,
    validate = () => true,
    pickValueButtonTitle,
    onPickValue,
    defaultValueButtonTitle,
    onUseDefaultValue,
}: TextSettingDialogProps) => {
    const { t } = useTranslation();

    const [dialogValue, setDialogValue] = useState(value ?? '');
    const [isValidValue, setIsValidValue] = useState(true);
    const [isPickingValue, setIsPickingValue] = useState(false);
    const [visibleViewport, setVisibleViewport] = useState(getVisibleViewport);

    const error = !isValidValue && !!dialogValue.length;
    const viewportHeight = Math.max(320, visibleViewport.height);

    const TextFieldComponent = useMemo(() => (isPassword ? PasswordTextField : TextField), [isPassword]);

    useEffect(() => {
        if (!value) {
            return;
        }

        setDialogValue(value);
    }, [value]);

    useEffect(() => {
        if (!isDialogOpen || typeof window === 'undefined') {
            return undefined;
        }

        let animationFrameId: number | undefined;

        const updateVisibleViewport = () => {
            if (animationFrameId !== undefined) {
                window.cancelAnimationFrame(animationFrameId);
            }

            animationFrameId = window.requestAnimationFrame(() => {
                setVisibleViewport(getVisibleViewport());
            });
        };

        updateVisibleViewport();
        window.addEventListener('resize', updateVisibleViewport);
        window.visualViewport?.addEventListener('resize', updateVisibleViewport);
        window.visualViewport?.addEventListener('scroll', updateVisibleViewport);

        return () => {
            if (animationFrameId !== undefined) {
                window.cancelAnimationFrame(animationFrameId);
            }

            window.removeEventListener('resize', updateVisibleViewport);
            window.visualViewport?.removeEventListener('resize', updateVisibleViewport);
            window.visualViewport?.removeEventListener('scroll', updateVisibleViewport);
        };
    }, [isDialogOpen]);

    const closeDialog = (resetValue: boolean = true) => {
        if (resetValue) {
            setDialogValue(value ?? '');
            setIsValidValue(true);
        }

        setIsDialogOpen(false);
    };

    const updateSetting = () => {
        closeDialog(false);
        handleChange(dialogValue);
    };

    const updateDialogValue = (newValue: string) => {
        setIsValidValue(validate(newValue));
        setDialogValue(newValue);
    };

    const pickValue = async () => {
        if (!onPickValue || isPickingValue) {
            return;
        }

        setIsPickingValue(true);
        try {
            const pickedValue = (await onPickValue())?.trim();
            if (pickedValue) {
                updateDialogValue(pickedValue);
            }
        } catch (cause) {
            makeToast(cause instanceof Error ? cause.message : String(cause), 'error');
        } finally {
            setIsPickingValue(false);
        }
    };

    const useDefaultValue = () => {
        if (!onUseDefaultValue) {
            return;
        }

        updateDialogValue(onUseDefaultValue());
    };

    return (
        <Dialog
            open={isDialogOpen}
            onClose={() => closeDialog()}
            fullWidth
            scroll="paper"
            sx={{
                '& .MuiDialog-container': {
                    alignItems: 'center',
                    height: `${viewportHeight}px`,
                    transform: visibleViewport.offsetTop ? `translateY(${visibleViewport.offsetTop}px)` : undefined,
                },
                '& .MuiDialog-paper': {
                    margin: 2,
                    maxHeight: `calc(${viewportHeight}px - 32px)`,
                },
            }}
        >
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogContent>
                {!!dialogDescription && (
                    <DialogContentText sx={{ paddingBottom: '10px' }}>{dialogDescription}</DialogContentText>
                )}
                <TextFieldComponent
                    sx={{
                        width: '100%',
                        margin: 'auto',
                    }}
                    autoFocus
                    placeholder={placeholder}
                    value={dialogValue}
                    error={error}
                    helperText={error ? t('global.error.label.invalid_input') : ''}
                    onChange={(e) => {
                        updateDialogValue(e.target.value);
                    }}
                />
            </DialogContent>
            <DialogActions>
                <Stack direction="row" sx={{ justifyContent: 'space-between', width: '100%' }}>
                    <Stack direction="row" spacing={1}>
                        {onUseDefaultValue && (
                            <Button onClick={useDefaultValue} startIcon={<RestartAltIcon />} color="primary">
                                {defaultValueButtonTitle ?? t('global.label.default')}
                            </Button>
                        )}
                        {onPickValue && (
                            <Button
                                onClick={pickValue}
                                disabled={isPickingValue}
                                startIcon={<FolderOpenIcon />}
                                color="primary"
                            >
                                {pickValueButtonTitle ?? t('global.button.browse', { defaultValue: 'Browse' })}
                            </Button>
                        )}
                    </Stack>
                    <Stack direction="row">
                        <Button onClick={() => closeDialog()} color="primary">
                            {t('global.button.cancel')}
                        </Button>
                        <Button onClick={() => updateSetting()} disabled={!isValidValue} color="primary">
                            {t('global.button.ok')}
                        </Button>
                    </Stack>
                </Stack>
            </DialogActions>
        </Dialog>
    );
};
