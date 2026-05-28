/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { makeToast } from '@/base/utils/Toast.ts';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';

export const TrackerOAuthLogin = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
    const callbackUrl = url.searchParams.get('manatan_callback_url') ?? window.location.href;
    const statePayload = url.searchParams.get('state') ?? hashParams.get('state') ?? '{}';
    const { trackerId, trackerName }: { trackerId: number; trackerName: string } = JSON.parse(statePayload);

    useEffect(() => {
        const login = async () => {
            try {
                await requestManager.loginToTrackerOauth(trackerId, callbackUrl).response;
            } catch (e) {
                makeToast(t('tracking.action.login.label.failure', { name: trackerName }), 'error', getErrorMessage(e));
            }

            navigate(AppRoutes.settings.childRoutes.tracking.path, {
                replace: true,
                state: { refreshTrackers: true },
            });
        };

        login();
    }, [callbackUrl, trackerId, trackerName, t, navigate]);

    return t('tracking.action.login.label.progress', { name: trackerName });
};
