/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useState, useEffect, useLayoutEffect, useCallback, useRef, Ref } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import BrokenImageIcon from '@mui/icons-material/BrokenImage';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useTranslation } from 'react-i18next';
import ImageIcon from '@mui/icons-material/Image';
import { SxProps, Theme } from '@mui/material/styles';
import {
    BackendImagePriority,
    ImageFetchPriority,
    ImageRequest,
    requestManager,
} from '@/lib/requests/RequestManager.ts';
import { QueuePriority } from '@/lib/Queue.ts';
import { applyStyles } from '@/base/utils/ApplyStyles.ts';
import { useIntersectionObserver } from '@/base/hooks/useIntersectionObserver.tsx';
import { noOp } from '@/lib/HelperFunctions.ts';

const OBJECT_URL_REVOKE_DELAY_MS = 1500;

type PreloadedImageSource = {
    imageUrl: string;
    isObjectUrl: boolean;
    cleanup: () => void;
    usageCount: number;
    revokeTimeoutId: number | null;
};

type ResolvedImageSource = {
    src: string;
    imageUrl: string;
};

type PendingImageSource = {
    promise: Promise<{ imageUrl: string; cleanup: () => void; fromCache: boolean }>;
    abortRequest: (reason?: any) => void;
    usageCount: number;
};

const PRELOADED_IMAGE_SOURCES = new Map<string, PreloadedImageSource>();
const PENDING_IMAGE_SOURCES = new Map<string, PendingImageSource>();

const clearRevokeTimeout = (src: string) => {
    const entry = PRELOADED_IMAGE_SOURCES.get(src);
    if (entry?.revokeTimeoutId != null) {
        window.clearTimeout(entry.revokeTimeoutId);
        entry.revokeTimeoutId = null;
    }
};

const acquirePreloadedImageSource = (src: string) => {
    const entry = PRELOADED_IMAGE_SOURCES.get(src);
    if (!entry) {
        return undefined;
    }

    clearRevokeTimeout(src);
    entry.usageCount += 1;

    return entry.imageUrl;
};

const peekPreloadedImageSource = (src: string) => PRELOADED_IMAGE_SOURCES.get(src)?.imageUrl;

const releasePreloadedImageSource = (src: string) => {
    const entry = PRELOADED_IMAGE_SOURCES.get(src);
    if (!entry) {
        return;
    }

    entry.usageCount = Math.max(0, entry.usageCount - 1);
    if (entry.usageCount > 0 || !entry.isObjectUrl) {
        return;
    }

    clearRevokeTimeout(src);
    entry.revokeTimeoutId = window.setTimeout(() => {
        const currentEntry = PRELOADED_IMAGE_SOURCES.get(src);
        if (!currentEntry || currentEntry !== entry || currentEntry.usageCount > 0) {
            return;
        }

        currentEntry.cleanup();
        PRELOADED_IMAGE_SOURCES.delete(src);
    }, OBJECT_URL_REVOKE_DELAY_MS);
};

const retainFetchedImageSource = (src: string, imageUrl: string, cleanup: () => void) => {
    const existingEntry = PRELOADED_IMAGE_SOURCES.get(src);
    if (existingEntry) {
        clearRevokeTimeout(src);
        existingEntry.usageCount += 1;

        if (existingEntry.imageUrl !== imageUrl) {
            cleanup();
        }

        return existingEntry.imageUrl;
    }

    PRELOADED_IMAGE_SOURCES.set(src, {
        imageUrl,
        isObjectUrl: imageUrl.startsWith('blob:'),
        cleanup,
        usageCount: 1,
        revokeTimeoutId: null,
    });

    return imageUrl;
};

const acquirePendingImageSource = (src: string, createRequest: () => Promise<ImageRequest>): PendingImageSource => {
    const existing = PENDING_IMAGE_SOURCES.get(src);
    if (existing) {
        existing.usageCount += 1;
        return existing;
    }

    let abortReason: any;
    let imageRequest: ImageRequest = {
        response: Promise.resolve(''),
        cleanup: noOp,
        abortRequest: noOp,
        fromCache: false,
    };
    const pending: PendingImageSource = {
        promise: (async () => {
            imageRequest = await createRequest();
            if (abortReason !== undefined) {
                imageRequest.abortRequest(abortReason);
            }
            const imageUrl = await imageRequest.response;

            return {
                imageUrl,
                cleanup: imageRequest.cleanup,
                fromCache: imageRequest.fromCache,
            };
        })(),
        abortRequest: (reason?: any) => {
            abortReason = reason;
            imageRequest.abortRequest(reason);
        },
        usageCount: 1,
    };

    pending.promise.then(
        () => {
            if (PENDING_IMAGE_SOURCES.get(src) === pending) {
                PENDING_IMAGE_SOURCES.delete(src);
            }
        },
        () => {
            if (PENDING_IMAGE_SOURCES.get(src) === pending) {
                PENDING_IMAGE_SOURCES.delete(src);
            }
        },
    );
    pending.promise.catch(() => {});

    PENDING_IMAGE_SOURCES.set(src, pending);
    return pending;
};

const releasePendingImageSource = (src: string, pending: PendingImageSource, reason?: any): boolean => {
    const current = PENDING_IMAGE_SOURCES.get(src);
    if (current !== pending) {
        return false;
    }

    current.usageCount = Math.max(0, current.usageCount - 1);
    if (current.usageCount > 0) {
        return false;
    }

    PENDING_IMAGE_SOURCES.delete(src);
    pending.abortRequest(reason);
    return true;
};

export interface SpinnerImageProps {
    shouldLoad?: boolean;

    src: string;
    alt: string;

    spinnerStyle?: SxProps<Theme> & { small?: boolean };
    imgStyle?: SxProps<Theme>;
    hideImgStyle?: Omit<SxProps<Theme>, 'accentColor'>;

    onLoad?: () => void;
    onError?: () => void;
    onImageLoad?: (image: HTMLImageElement) => void;

    shouldDecode?: boolean;
    useFetchApi?: boolean;
    disableCors?: boolean;
    ignoreQueue?: boolean;
    fetchPriority?: ImageFetchPriority;
    backendPriority?: BackendImagePriority;

    priority?: QueuePriority;

    retryKeyPrefix?: string;

    ref?: Ref<HTMLImageElement | HTMLDivElement | null>;
}

export const SpinnerImage = ({ ref, ...props }: SpinnerImageProps) => {
    const {
        shouldLoad = true,
        shouldDecode,
        useFetchApi,
        disableCors,
        ignoreQueue,
        fetchPriority,
        backendPriority,
        src,
        alt,
        onLoad,
        onError,
        onImageLoad,
        spinnerStyle: { small, ...spinnerStyle } = {},
        imgStyle,
        hideImgStyle,
        priority,
        retryKeyPrefix,
    } = props;

    const { t } = useTranslation();

    const loadingIndicatorRef = useRef<HTMLDivElement | null>(null);

    const showMissingImageIcon = !src.length;
    const retainedSourceRef = useRef<string | null>(null);

    const [resolvedImageSource, setResolvedImageSource] = useState<ResolvedImageSource | undefined>(() => {
        const cached = shouldLoad ? peekPreloadedImageSource(src) : undefined;
        return cached
            ? {
                  src,
                  imageUrl: cached,
              }
            : undefined;
    });
    const [imgLoadRetryKey, setImgLoadRetryKey] = useState(0);
    const [isLoading, setIsLoading] = useState<boolean | undefined>(() =>
        shouldLoad && peekPreloadedImageSource(src) ? false : undefined,
    );
    const [hasError, setHasError] = useState(false);
    const [isVisible, setIsVisible] = useState(false);

    const immediateCachedImageSource = shouldLoad ? peekPreloadedImageSource(src) : undefined;
    const imageSourceUrl = resolvedImageSource?.src === src ? resolvedImageSource.imageUrl : immediateCachedImageSource;
    const hasResolvedImageSource = !!imageSourceUrl;

    useLayoutEffect(() => {
        if (retainedSourceRef.current) {
            releasePreloadedImageSource(retainedSourceRef.current);
            retainedSourceRef.current = null;
        }

        const cached = shouldLoad ? acquirePreloadedImageSource(src) : undefined;
        if (cached) {
            retainedSourceRef.current = src;
        }
        setResolvedImageSource(
            cached
                ? {
                      src,
                      imageUrl: cached,
                  }
                : undefined,
        );
        setIsLoading(cached ? false : undefined);
        setHasError(false);

        return () => {
            if (!retainedSourceRef.current) {
                return;
            }

            releasePreloadedImageSource(retainedSourceRef.current);
            retainedSourceRef.current = null;
        };
    }, [src, shouldLoad]);

    const updateImageState = (loading: boolean, error: boolean = false, aborted: boolean = false) => {
        setIsLoading(loading);
        setHasError(error);

        if (error && !loading && !aborted) {
            onError?.();
        }

        if (!loading && !error && !aborted) {
            onLoad?.();
        }
    };

    useIntersectionObserver(
        loadingIndicatorRef,
        useCallback((entries) => setIsVisible(entries[0].isIntersecting), []),
    );

    useEffect(() => {
        if (showMissingImageIcon || !shouldLoad || hasResolvedImageSource) {
            return () => {};
        }

        let pendingImageSource: PendingImageSource | null = null;
        let shouldCleanupFetchedSource = true;
        const fetchImage = async () => {
            try {
                pendingImageSource = acquirePendingImageSource(src, () =>
                    requestManager.requestImage(src, {
                        priority,
                        shouldDecode,
                        useFetchApi,
                        disableCors,
                        ignoreQueue,
                        fetchPriority,
                        backendPriority,
                    }),
                );
                updateImageState(true);

                const pendingImage = await pendingImageSource.promise;

                const { imageUrl } = pendingImage;

                if (imageUrl) {
                    const retainedImage = retainFetchedImageSource(src, imageUrl, pendingImage.cleanup);
                    retainedSourceRef.current = src;
                    shouldCleanupFetchedSource = false;
                    setResolvedImageSource({
                        src,
                        imageUrl: retainedImage,
                    });
                }
                updateImageState(false);
            } catch (e) {
                const wasAborted =
                    e instanceof Error && (e.name === 'AbortError' || e.message === 'Component was unmounted');
                updateImageState(false, !wasAborted, wasAborted);
            }
        };

        fetchImage().catch(() => {});

        return () => {
            const releasedLastPendingConsumer = pendingImageSource
                ? releasePendingImageSource(src, pendingImageSource, new Error('Component was unmounted'))
                : false;
            if (shouldCleanupFetchedSource && releasedLastPendingConsumer) {
                pendingImageSource?.promise.then((pendingImage) => pendingImage.cleanup()).catch(() => {});
            }
        };
    }, [
        src,
        imgLoadRetryKey,
        retryKeyPrefix,
        showMissingImageIcon,
        shouldLoad,
        hasResolvedImageSource,
        fetchPriority,
        backendPriority,
    ]);

    return (
        <>
            {showMissingImageIcon ? (
                <Stack
                    ref={ref}
                    sx={{
                        height: '100%',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: (theme) => theme.palette.background.default,
                        ...spinnerStyle,
                    }}
                >
                    <ImageIcon fontSize="large" />
                </Stack>
            ) : (
                <Box
                    component="img"
                    key={`${src}_${imgLoadRetryKey}_${retryKeyPrefix}`}
                    sx={[
                        ...(Array.isArray(imgStyle) ? (imgStyle ?? []) : [imgStyle]),
                        applyStyles(!imageSourceUrl || isLoading || hasError, {
                            ...hideImgStyle,
                            ...applyStyles(!hideImgStyle, {
                                display: 'none',
                            }),
                        }),
                    ]}
                    ref={ref}
                    crossOrigin={disableCors ? undefined : 'anonymous'}
                    src={imageSourceUrl}
                    alt={alt}
                    onLoad={(event) => onImageLoad?.(event.currentTarget)}
                    fetchPriority={fetchPriority}
                    draggable={false}
                />
            )}

            {(!!isLoading || (src && !imageSourceUrl) || hasError) && (
                <Stack
                    ref={loadingIndicatorRef}
                    sx={{
                        height: '100%',
                        justifyContent: 'center',
                        alignItems: 'center',
                        ...spinnerStyle,
                    }}
                >
                    <Stack
                        sx={{
                            height: '100%',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        {isVisible && !!isLoading && <CircularProgress thickness={5} />}
                        {hasError && isLoading === false && (
                            <>
                                <BrokenImageIcon />
                                <Button
                                    startIcon={!small && <RefreshIcon />}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        setImgLoadRetryKey((prevState) => (prevState + 1) % 100);
                                    }}
                                    size={small ? 'small' : 'large'}
                                >
                                    {small ? <RefreshIcon /> : t('global.button.retry')}
                                </Button>
                            </>
                        )}
                    </Stack>
                </Stack>
            )}
        </>
    );
};
