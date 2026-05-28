/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { ListItemLink } from '@/base/components/lists/ListItemLink.tsx';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { VersionInfo, WebUIVersionInfo } from '@/features/app-updates/components/VersionInfo.tsx';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { dateFormatter, epochToDate } from '@/base/utils/DateHelper.ts';
import { useAppTitle } from '@/features/navigation-bar/hooks/useAppTitle.ts';
import { makeToast } from '@/base/utils/Toast.ts';
import {
    MANATAN_DISCORD_URL,
    MANATAN_DONATION_ADDRESSES,
    MANATAN_MEMBERSHIP_ACCOUNT_URL,
    MANATAN_MEMBERSHIP_PERKS,
    MANATAN_PRODUCT_DESCRIPTION,
    MANATAN_PRODUCT_NAME,
    MANATAN_PUBLIC_BACKERS_API,
    MANATAN_REPO_API,
    MANATAN_REPO_URL,
    MANATAN_SUPPORT_URL,
    MANATAN_WEBUI_REPO_API,
} from '@/Manatan/branding/ManatanBranding.tsx';

type Contributor = {
    key: string;
    name: string;
    count: number;
    profileUrl?: string;
};

type ContributorsCache = {
    updatedAt: number;
    contributors: Contributor[];
};

type MembershipTier = {
    key: string;
    label: string;
    backers: string[];
};

type PublicBackerTier = {
    tier_id?: string;
    tier_label?: string;
    backers?: string[];
    count?: number;
};

type PublicBackersResponse = {
    tiers?: PublicBackerTier[];
    total_backers?: number;
    cached_at?: number;
};

type BackersCache = {
    updatedAt: number;
    tiers: MembershipTier[];
    totalBackers: number;
};

const CONTRIBUTORS_CACHE_KEY = 'manatan:contributors:v1';
const CONTRIBUTORS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BACKERS_CACHE_KEY = 'manatan:public-backers:v1';
const BACKERS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const BACKERS_MANUAL_REFRESH_COOLDOWN_MS = 60 * 1000;
const WEBUI_SINCE_ISO = '2025-12-26T00:00:00Z';
const MAX_GITHUB_PAGES = 10;
const MEMBERSHIP_TIER_ICON_BY_ID: Record<string, string> = {
    diamond: '💎',
    ruby: '❤️',
    sapphire: '🔷',
    emerald: '🟩',
    crystal: '✨',
    stone: '🪨',
};
const MEMBERSHIP_TIER_ORDER = ['diamond', 'ruby', 'sapphire', 'emerald', 'crystal', 'stone'];

const parseNextLink = (linkHeader: string | null): string | null => {
    if (!linkHeader) {
        return null;
    }
    const entries = linkHeader.split(',');
    for (const entry of entries) {
        const match = entry.match(/<([^>]+)>;\s*rel="([^"]+)"/);
        if (match && match[2] === 'next') {
            return match[1];
        }
    }
    return null;
};

const fetchGithubPages = async (url: string): Promise<any[]> => {
    let nextUrl: string | null = url;
    const results: any[] = [];
    let page = 0;

    while (nextUrl && page < MAX_GITHUB_PAGES) {
        // GitHub pagination must stay sequential because each page provides the next URL.
        // eslint-disable-next-line no-await-in-loop
        const response = await fetch(nextUrl, {
            headers: { Accept: 'application/vnd.github+json' },
        });
        if (!response.ok) {
            throw new Error(`GitHub request failed (${response.status})`);
        }
        // eslint-disable-next-line no-await-in-loop
        const data = await response.json();
        if (Array.isArray(data)) {
            results.push(...data);
        }
        nextUrl = parseNextLink(response.headers.get('Link'));
        page += 1;
    }

    return results;
};

const readContributorsCache = (): ContributorsCache | null => {
    try {
        const raw = localStorage.getItem(CONTRIBUTORS_CACHE_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw) as ContributorsCache;
        if (!parsed || !Array.isArray(parsed.contributors) || typeof parsed.updatedAt !== 'number') {
            return null;
        }
        if (Date.now() - parsed.updatedAt > CONTRIBUTORS_CACHE_TTL_MS) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
};

const writeContributorsCache = (payload: ContributorsCache) => {
    try {
        localStorage.setItem(CONTRIBUTORS_CACHE_KEY, JSON.stringify(payload));
    } catch {
        // Ignore cache write errors.
    }
};

const readBackersCache = (): BackersCache | null => {
    try {
        const raw = localStorage.getItem(BACKERS_CACHE_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw) as BackersCache;
        if (
            !parsed ||
            !Array.isArray(parsed.tiers) ||
            typeof parsed.updatedAt !== 'number' ||
            typeof parsed.totalBackers !== 'number'
        ) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
};

const writeBackersCache = (payload: BackersCache) => {
    try {
        localStorage.setItem(BACKERS_CACHE_KEY, JSON.stringify(payload));
    } catch {
        // Ignore cache write errors.
    }
};

const normalizeBackerTier = (tier: PublicBackerTier): MembershipTier | null => {
    const tierId = tier.tier_id?.trim() || tier.tier_label?.trim().toLowerCase().replace(/\s+/g, '-') || '';
    const rawLabel = tier.tier_label?.trim() || tierId || 'Backer';
    const icon = MEMBERSHIP_TIER_ICON_BY_ID[tierId.toLowerCase()];
    const label = icon && !rawLabel.startsWith(icon) ? `${icon} ${rawLabel}` : rawLabel;
    const backers = Array.isArray(tier.backers)
        ? tier.backers
              .map((backer) => (typeof backer === 'string' ? backer.trim() : ''))
              .filter((backer) => backer.length > 0)
        : [];

    if (!tierId && !backers.length) {
        return null;
    }

    return {
        key: tierId || label,
        label,
        backers,
    };
};

const sortBackerTiers = (tiers: MembershipTier[]) =>
    [...tiers].sort((a, b) => {
        const aIndex = MEMBERSHIP_TIER_ORDER.indexOf(a.key.toLowerCase());
        const bIndex = MEMBERSHIP_TIER_ORDER.indexOf(b.key.toLowerCase());
        if (aIndex !== -1 || bIndex !== -1) {
            return (
                (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex)
            );
        }
        return a.label.localeCompare(b.label);
    });

const isMembershipTier = (tier: MembershipTier | null): tier is MembershipTier => tier !== null;

const fetchPublicBackers = async (options: { refresh?: boolean } = {}): Promise<BackersCache> => {
    const response = await fetch(
        options.refresh ? `${MANATAN_PUBLIC_BACKERS_API}?refresh=1` : MANATAN_PUBLIC_BACKERS_API,
        {
            headers: { Accept: 'application/json' },
        },
    );
    if (!response.ok) {
        throw new Error(`Backers request failed (${response.status})`);
    }

    const payload = (await response.json()) as PublicBackersResponse;
    const tiers = sortBackerTiers((payload.tiers ?? []).map(normalizeBackerTier).filter(isMembershipTier));
    const totalBackers =
        typeof payload.total_backers === 'number'
            ? payload.total_backers
            : tiers.reduce((total, tier) => total + tier.backers.length, 0);

    return {
        updatedAt: typeof payload.cached_at === 'number' ? payload.cached_at : Date.now(),
        tiers,
        totalBackers,
    };
};

const fetchManatanContributors = async (): Promise<Contributor[]> => {
    const contributors = await fetchGithubPages(`${MANATAN_REPO_API}/contributors?per_page=100&anon=1`);
    return contributors.map((entry: any) => {
        const login = entry.login as string | undefined;
        const name = login || entry.name || 'Unknown';
        const key = login ? `gh:${login}` : `anon:${entry.name || entry.email || name}`;
        return {
            key,
            name,
            count: typeof entry.contributions === 'number' ? entry.contributions : 0,
            profileUrl: login ? entry.html_url : undefined,
        };
    });
};

const fetchWebUiContributors = async (): Promise<Contributor[]> => {
    const commits = await fetchGithubPages(
        `${MANATAN_WEBUI_REPO_API}/commits?since=${encodeURIComponent(WEBUI_SINCE_ISO)}&per_page=100`,
    );
    const map = new Map<string, Contributor>();

    commits.forEach((entry: any) => {
        const { author } = entry;
        const login = author?.login as string | undefined;
        const name = login || entry.commit?.author?.name || 'Unknown';
        const key = login ? `gh:${login}` : `name:${name}`;
        const existing = map.get(key);
        if (existing) {
            existing.count += 1;
            if (!existing.profileUrl && author?.html_url) {
                existing.profileUrl = author.html_url;
            }
        } else {
            map.set(key, {
                key,
                name,
                count: 1,
                profileUrl: author?.html_url,
            });
        }
    });

    return Array.from(map.values());
};

const fetchCombinedContributors = async (): Promise<ContributorsCache> => {
    const [manatan, webui] = await Promise.all([fetchManatanContributors(), fetchWebUiContributors()]);
    const combined = new Map<string, Contributor>();

    const merge = (entry: Contributor) => {
        const existing = combined.get(entry.key);
        if (existing) {
            existing.count += entry.count;
            if (!existing.profileUrl && entry.profileUrl) {
                existing.profileUrl = entry.profileUrl;
            }
        } else {
            combined.set(entry.key, { ...entry });
        }
    };

    manatan.forEach(merge);
    webui.forEach(merge);

    const contributors = Array.from(combined.values()).sort((a, b) => {
        if (b.count !== a.count) {
            return b.count - a.count;
        }
        return a.name.localeCompare(b.name);
    });

    return { updatedAt: Date.now(), contributors };
};

const renderContributorInline = (contributors: Contributor[]): ReactNode => {
    if (!contributors.length) {
        return 'No contributors found yet.';
    }
    const nodes: ReactNode[] = [];
    contributors.forEach((contributor, index) => {
        if (index > 0) {
            nodes.push(', ');
        }
        const label = `${contributor.name} (${contributor.count})`;
        if (contributor.profileUrl) {
            nodes.push(
                <a
                    key={contributor.key}
                    href={contributor.profileUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#fff', textDecoration: 'underline' }}
                >
                    {label}
                </a>,
            );
        } else {
            nodes.push(<span key={contributor.key}>{label}</span>);
        }
    });
    return nodes;
};

export function About() {
    const { t } = useTranslation();

    const [contributors, setContributors] = useState<Contributor[]>([]);
    const [contributorsUpdatedAt, setContributorsUpdatedAt] = useState<number | null>(null);
    const [contributorsLoading, setContributorsLoading] = useState(false);
    const [contributorsError, setContributorsError] = useState<string | null>(null);
    const [backerTiers, setBackerTiers] = useState<MembershipTier[]>([]);
    const [backersUpdatedAt, setBackersUpdatedAt] = useState<number | null>(null);
    const [backersTotal, setBackersTotal] = useState(0);
    const [backersLoading, setBackersLoading] = useState(false);
    const [backersError, setBackersError] = useState<string | null>(null);

    useAppTitle(t('settings.about.title'));

    const { data, loading, error, refetch } = requestManager.useGetAbout({ notifyOnNetworkStatusChange: true });

    const {
        data: serverUpdateCheckData,
        loading: isCheckingForServerUpdate,
        refetch: checkForServerUpdate,
        error: serverUpdateCheckError,
    } = requestManager.useCheckForServerUpdate({ notifyOnNetworkStatusChange: true });

    useEffect(() => {
        let cancelled = false;

        const loadContributors = async () => {
            setContributorsLoading(true);
            setContributorsError(null);

            const cached = readContributorsCache();
            if (cached) {
                setContributors(cached.contributors);
                setContributorsUpdatedAt(cached.updatedAt);
                setContributorsLoading(false);
                return;
            }

            try {
                const combined = await fetchCombinedContributors();
                if (cancelled) {
                    return;
                }
                setContributors(combined.contributors);
                setContributorsUpdatedAt(combined.updatedAt);
                writeContributorsCache(combined);
            } catch (err) {
                if (cancelled) {
                    return;
                }
                setContributorsError(err instanceof Error ? err.message : 'Failed to load contributors.');
            } finally {
                if (!cancelled) {
                    setContributorsLoading(false);
                }
            }
        };

        loadContributors();

        return () => {
            cancelled = true;
        };
    }, []);

    const loadBackers = useCallback(async (options: { force?: boolean } = {}) => {
        const cached = readBackersCache();
        const now = Date.now();

        if (!options.force && cached) {
            setBackerTiers(cached.tiers);
            setBackersTotal(cached.totalBackers);
            setBackersUpdatedAt(cached.updatedAt);
            if (now - cached.updatedAt <= BACKERS_CACHE_TTL_MS) {
                return;
            }
        }

        if (options.force && cached && now - cached.updatedAt < BACKERS_MANUAL_REFRESH_COOLDOWN_MS) {
            makeToast('Backers were refreshed recently. Showing cached backers for now.', 'info');
            setBackerTiers(cached.tiers);
            setBackersTotal(cached.totalBackers);
            setBackersUpdatedAt(cached.updatedAt);
            return;
        }

        setBackersLoading(true);
        setBackersError(null);

        try {
            const fresh = await fetchPublicBackers({ refresh: options.force === true });
            setBackerTiers(fresh.tiers);
            setBackersTotal(fresh.totalBackers);
            setBackersUpdatedAt(fresh.updatedAt);
            writeBackersCache(fresh);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load backers.';
            setBackersError(message);
            if (!cached) {
                setBackerTiers([]);
                setBackersTotal(0);
                setBackersUpdatedAt(null);
            }
        } finally {
            setBackersLoading(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            if (cancelled) {
                return;
            }
            await loadBackers();
        };

        load().catch(defaultPromiseErrorHandler('About::loadBackers'));

        return () => {
            cancelled = true;
        };
    }, [loadBackers]);

    const copyDonationAddress = (address: string) => {
        navigator.clipboard
            .writeText(address)
            .then(() => makeToast(t('global.label.copied_clipboard'), 'info'))
            .catch(defaultPromiseErrorHandler('About::copyDonationAddress'));
    };

    let content: ReactNode;

    if (loading) {
        content = <LoadingPlaceholder />;
    } else if (error || !data) {
        content = (
            <EmptyViewAbsoluteCentered
                message={t('global.error.label.failed_to_load_data')}
                messageExtra={getErrorMessage(error ?? new Error('Missing about response'))}
                retry={() => refetch().catch(defaultPromiseErrorHandler('About::refetch'))}
            />
        );
    } else {
        const { aboutServer } = data;
        const selectedServerChannelInfo = serverUpdateCheckData?.checkForServerUpdates?.find(
            (channel) => channel.channel === aboutServer.buildType,
        );
        const isServerUpdateAvailable =
            !!selectedServerChannelInfo?.tag && selectedServerChannelInfo.tag !== aboutServer.version;
        const publicBackerCountLabel = backersTotal
            ? `${backersTotal} public backer${backersTotal === 1 ? '' : 's'}`
            : 'Public backers';
        let contributorsContent: ReactNode;
        let backersContent: ReactNode;

        if (contributorsLoading) {
            contributorsContent = <Typography variant="body2">Loading contributors...</Typography>;
        } else if (contributorsError) {
            contributorsContent = (
                <Typography variant="body2" color="error">
                    Failed to load contributors. {contributorsError}
                </Typography>
            );
        } else {
            contributorsContent = (
                <Typography component="div" variant="body2" sx={{ lineHeight: 1.55 }}>
                    {renderContributorInline(contributors)}
                </Typography>
            );
        }

        if (backersLoading && !backerTiers.length) {
            backersContent = <Typography variant="body2">Loading backers...</Typography>;
        } else if (backersError && !backerTiers.length) {
            backersContent = (
                <Typography variant="body2" color="error">
                    Failed to load backers. {backersError}
                </Typography>
            );
        } else if (backerTiers.length) {
            backersContent = (
                <Stack spacing={1}>
                    {backerTiers.map((tier) => {
                        const backerNames = tier.backers.length ? tier.backers.join(', ') : 'No public backers yet';

                        return (
                            <Box
                                key={tier.key}
                                sx={{
                                    p: 1.25,
                                    borderRadius: 1.5,
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    backgroundColor: 'action.hover',
                                }}
                            >
                                <Typography variant="subtitle2">{tier.label}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {backerNames}
                                </Typography>
                            </Box>
                        );
                    })}
                </Stack>
            );
        } else {
            backersContent = (
                <Typography variant="body2" color="text.secondary">
                    No public backers yet.
                </Typography>
            );
        }

        content = (
            <Stack spacing={2.5}>
                <Paper
                    variant="outlined"
                    sx={{
                        p: 2.5,
                        borderRadius: 2,
                        background: 'linear-gradient(135deg, rgba(46, 204, 113, 0.12), rgba(52, 152, 219, 0.08))',
                    }}
                >
                    <Stack
                        direction={{ xs: 'column', md: 'row' }}
                        spacing={2}
                        alignItems={{ xs: 'flex-start', md: 'center' }}
                        justifyContent="space-between"
                    >
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography variant="h4" sx={{ fontWeight: 700 }}>
                                {MANATAN_PRODUCT_NAME}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {MANATAN_PRODUCT_DESCRIPTION}
                            </Typography>
                        </Box>
                        <Stack
                            direction="column"
                            spacing={0.5}
                            alignItems={{ xs: 'flex-start', md: 'flex-end' }}
                            sx={{ flexShrink: 0, minWidth: { md: 200 } }}
                        >
                            <Chip label={`Server ${aboutServer.buildType}`} size="small" variant="outlined" />
                            <Chip label={`Version ${aboutServer.version}`} size="small" variant="outlined" />
                            <Chip
                                label={`Build ${dateFormatter.format(epochToDate(Number(aboutServer.buildTime)).toDate())}`}
                                size="small"
                                variant="outlined"
                            />
                        </Stack>
                    </Stack>
                </Paper>

                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
                        gap: 2,
                        alignItems: 'stretch',
                    }}
                >
                    <Box>
                        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, height: '100%' }}>
                            <Stack spacing={2}>
                                <Typography variant="h6">{`Support ${MANATAN_PRODUCT_NAME}`}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {`Donations help keep ${MANATAN_PRODUCT_NAME} free and support development, hosting, and testing.`}
                                </Typography>
                                <List dense disablePadding>
                                    <ListItemLink
                                        to={MANATAN_SUPPORT_URL}
                                        target="_blank"
                                        rel="noreferrer"
                                        sx={{ borderRadius: 1, px: 1, py: 0.75 }}
                                    >
                                        <ListItemText
                                            primary={`${MANATAN_PRODUCT_NAME} Support`}
                                            secondary={MANATAN_SUPPORT_URL}
                                        />
                                    </ListItemLink>
                                </List>
                                <Divider />
                                <Stack spacing={1}>
                                    <Typography variant="subtitle2">Crypto</Typography>
                                    <List
                                        dense
                                        disablePadding
                                        sx={{
                                            '& .MuiListItemText-secondary': {
                                                overflowWrap: 'anywhere',
                                                wordBreak: 'break-word',
                                            },
                                        }}
                                    >
                                        {MANATAN_DONATION_ADDRESSES.map((entry) => (
                                            <ListItem
                                                key={entry.key}
                                                disableGutters
                                                secondaryAction={
                                                    <IconButton
                                                        edge="end"
                                                        size="small"
                                                        aria-label={`Copy ${entry.ariaLabel} address`}
                                                        onClick={() => copyDonationAddress(entry.address)}
                                                    >
                                                        <ContentCopyIcon fontSize="small" />
                                                    </IconButton>
                                                }
                                                sx={{
                                                    py: 0.75,
                                                    pr: 6,
                                                    alignItems: 'flex-start',
                                                    '& .MuiListItemSecondaryAction-root': {
                                                        right: 0,
                                                        top: 34,
                                                        transform: 'none',
                                                    },
                                                }}
                                            >
                                                <ListItemText primary={entry.label} secondary={entry.address} />
                                            </ListItem>
                                        ))}
                                    </List>
                                </Stack>
                                <Divider />
                                <Stack spacing={1}>
                                    <Typography variant="subtitle2">Backer perks</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {MANATAN_MEMBERSHIP_PERKS.join(' · ')}
                                    </Typography>
                                </Stack>
                            </Stack>
                        </Paper>
                    </Box>

                    <Box>
                        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, height: '100%' }}>
                            <Stack spacing={2}>
                                <Typography variant="h6">Contributors</Typography>
                                {contributorsContent}
                                {contributorsUpdatedAt && (
                                    <Typography variant="caption" color="text.secondary">
                                        Updated {new Date(contributorsUpdatedAt).toLocaleDateString()}
                                    </Typography>
                                )}
                                <Typography variant="body2" color="text.secondary">
                                    Contributors who make meaningful contributions receive all backer perks.
                                </Typography>
                                <Divider />
                                <Stack spacing={1}>
                                    <Stack
                                        direction="row"
                                        spacing={1}
                                        alignItems="center"
                                        justifyContent="space-between"
                                    >
                                        <Box>
                                            <Typography variant="h6">Backers</Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {publicBackerCountLabel}
                                            </Typography>
                                        </Box>
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            startIcon={<RefreshIcon fontSize="small" />}
                                            disabled={backersLoading}
                                            onClick={() => loadBackers({ force: true })}
                                        >
                                            Refresh
                                        </Button>
                                    </Stack>
                                    {backersContent}
                                    {backersError && backerTiers.length > 0 && (
                                        <Typography variant="caption" color="error">
                                            Could not refresh backers. {backersError}
                                        </Typography>
                                    )}
                                    {backersUpdatedAt && (
                                        <Typography variant="caption" color="text.secondary">
                                            Updated {new Date(backersUpdatedAt).toLocaleString()}
                                        </Typography>
                                    )}
                                    <Typography variant="caption" color="text.secondary">
                                        To appear here, enable public display in your{' '}
                                        <a
                                            href={MANATAN_MEMBERSHIP_ACCOUNT_URL}
                                            target="_blank"
                                            rel="noreferrer"
                                            style={{ color: 'inherit', textDecoration: 'underline' }}
                                        >
                                            membership account
                                        </a>
                                        . If you have a legacy subscription, you may need to contact Kolby to link it to
                                        your website account.
                                    </Typography>
                                </Stack>
                            </Stack>
                        </Paper>
                    </Box>

                    <Box>
                        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, height: '100%' }}>
                            <Stack spacing={2}>
                                <Typography variant="h6">{t('global.label.links')}</Typography>
                                <List dense disablePadding>
                                    <ListItemLink
                                        to={MANATAN_REPO_URL}
                                        target="_blank"
                                        rel="noreferrer"
                                        sx={{ borderRadius: 1, px: 1, py: 0.75 }}
                                    >
                                        <ListItemText primary={MANATAN_PRODUCT_NAME} secondary={MANATAN_REPO_URL} />
                                    </ListItemLink>
                                    <ListItemLink
                                        to={MANATAN_DISCORD_URL}
                                        target="_blank"
                                        rel="noreferrer"
                                        sx={{ borderRadius: 1, px: 1, py: 0.75 }}
                                    >
                                        <ListItemText
                                            primary={`${MANATAN_PRODUCT_NAME} Discord`}
                                            secondary={MANATAN_DISCORD_URL}
                                        />
                                    </ListItemLink>
                                    <ListItemLink
                                        to={aboutServer.github}
                                        target="_blank"
                                        rel="noreferrer"
                                        sx={{ borderRadius: 1, px: 1, py: 0.75 }}
                                    >
                                        <ListItemText
                                            primary={`${MANATAN_PRODUCT_NAME} Server`}
                                            secondary={aboutServer.github}
                                        />
                                    </ListItemLink>
                                </List>
                            </Stack>
                        </Paper>
                    </Box>

                    <Box>
                        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, height: '100%' }}>
                            <Stack spacing={2}>
                                <Typography variant="h6">Build info</Typography>
                                <Stack
                                    direction={{ xs: 'column', md: 'row' }}
                                    spacing={2}
                                    divider={
                                        <Divider
                                            flexItem
                                            orientation="vertical"
                                            sx={{ display: { xs: 'none', md: 'block' } }}
                                        />
                                    }
                                >
                                    <Box sx={{ flex: 1 }}>
                                        <Typography variant="subtitle2">{t('settings.server.title.server')}</Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {aboutServer.name} ({aboutServer.buildType})
                                        </Typography>
                                        <Typography
                                            variant="caption"
                                            color="text.secondary"
                                            sx={{ mt: 1, display: 'block' }}
                                        >
                                            {t('settings.about.server.label.version')}
                                        </Typography>
                                        <VersionInfo
                                            version={aboutServer.version}
                                            isCheckingForUpdate={isCheckingForServerUpdate}
                                            isUpdateAvailable={isServerUpdateAvailable}
                                            updateCheckError={serverUpdateCheckError}
                                            checkForUpdate={checkForServerUpdate}
                                            downloadAsLink
                                            url={selectedServerChannelInfo?.url ?? ''}
                                        />
                                        <Typography
                                            variant="caption"
                                            color="text.secondary"
                                            sx={{ mt: 1, display: 'block' }}
                                        >
                                            {t('settings.about.server.label.build_time')}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {epochToDate(Number(aboutServer.buildTime)).toString()}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ flex: 1 }}>
                                        <Typography variant="subtitle2">{t('settings.webui.title.webui')}</Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {t('settings.about.webui.label.channel')}: BUNDLED
                                        </Typography>
                                        <Typography
                                            variant="caption"
                                            color="text.secondary"
                                            sx={{ mt: 1, display: 'block' }}
                                        >
                                            {t('settings.about.webui.label.version')}
                                        </Typography>
                                        <WebUIVersionInfo />
                                    </Box>
                                </Stack>
                            </Stack>
                        </Paper>
                    </Box>
                </Box>
            </Stack>
        );
    }

    return <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>{content}</Box>;
}
