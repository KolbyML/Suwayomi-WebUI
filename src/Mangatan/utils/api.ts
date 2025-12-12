import { requestManager } from "@/lib/requests/RequestManager";

declare const GMXmlXttpRequest: any;

export const logDebug = (msg: string, isDebug: boolean) => {
    // eslint-disable-next-line no-console
    if (isDebug) console.log(`[OCR PC Hybrid] ${new Date().toLocaleTimeString()} ${msg}`);
};

export const apiRequest = async <T>(
    url: string,
    options: { method?: string; body?: any; headers?: any } = {},
): Promise<T> => {
    const isUserScript = typeof GMXmlXttpRequest !== 'undefined';

    const fullUrl = url.startsWith('http')
        ? url
        : `${requestManager.getBaseUrl()}${url.startsWith('/') ? '' : '/'}${url}`;

    if (isUserScript) {
        return new Promise((resolve, reject) => {
            GMXmlXttpRequest({
                url: fullUrl,
                method: options.method || 'GET',
                headers: { 'Content-Type': 'application/json', ...options.headers },
                data: options.body ? JSON.stringify(options.body) : undefined,
                onload: (res: any) => {
                    try {
                        const json = JSON.parse(res.responseText);
                        if (res.status >= 400) reject(json);
                        else resolve(json);
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: reject,
                ontimeout: reject,
            });
        });
    }

    const response = await fetch(fullUrl, {
        method: options.method || 'GET',
        headers: { 'Content-Type': 'application/json', ...options.headers },
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const json = await response.json();
    if (!response.ok) throw json;
    return json;
};

export type ChapterStatus = 'idle' | 'processing' | 'processed';

export interface AuthCredentials {
    user?: string;
    pass?: string;
}

export const checkChapterStatus = async (baseUrl: string, creds?: AuthCredentials): Promise<ChapterStatus> => {
    try {
        const body: any = { base_url: baseUrl, context: 'Check Status' };
        if (creds?.user) body.user = creds.user;
        if (creds?.pass) body.pass = creds.pass;

        const res = await apiRequest<{ status: string }>('/api/ocr/is-chapter-preprocessed', {
            method: 'POST',
            body: body
        });
        
        if (res.status === 'processing') return 'processing';
        if (res.status === 'processed') return 'processed';
        return 'idle';
    } catch (e) {
        console.error("Failed to check chapter status", e);
        return 'idle';
    }
};

export const preprocessChapter = async (baseUrl: string, creds?: AuthCredentials): Promise<void> => {
    const body: any = { base_url: baseUrl, context: document.title };
    if (creds?.user) body.user = creds.user;
    if (creds?.pass) body.pass = creds.pass;

    await apiRequest('/api/ocr/preprocess-chapter', {
        method: 'POST',
        body: body
    });
};

export const cleanPunctuation = (text: string): string => {
    if (!text) return text;
    let t = text
        .replace(/[ ]*!!+/g, '‼')
        .replace(/[ ]*\?\?+/g, '⁇')
        .replace(/[ ]*\.\.+/g, '…')
        .replace(/[ ]*(!\?)+/g, '⁉')
        .replace(/[ ]*(\?!)+/g, '⁈')
        .replace(/[ ]*\u2026+/g, '…')
        .replace(/[ ]*\u30FB\u30FB+/g, '…')
        .replace(/[ ]*\uFF65\uFF65+/g, '…')
        .replace(/[ ]*-+/g, 'ー')
        .replace(/[ ]*\u2013+/g, '―')
        .replace(/[ ]*:+[ ]*/g, '…');

    t = t
        .replace(/^[!?:]+$/g, '')
        .replace(/([⁉⁈‼⁇])[!?:]+/g, '$1')
        .replace(/[!?:]+([⁉⁈‼⁇])/g, '$1');
    return t.replace(/\u0020/g, '');
};
