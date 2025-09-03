import { useCallback, useEffect, useMemo, useRef, type FC } from 'react';
import {
  DeviceEventEmitter,
  Platform,
  UIManager,
  requireNativeComponent,
  View,
} from 'react-native';
import type { NativeSyntheticEvent } from 'react-native';
import { buildInjected } from './injected';

/**
 * Intercept events emitted from JS or native.
 */
export type InterceptEvent = {
  url: string;
  kind: 'native' | 'dom' | 'video' | 'xhr' | 'fetch' | 'perf';
  userAgent?: string;
};

/**
 * Props for InterceptingWebView.
 * This component prefers a native Android view when available
 * (RNNativeInterceptWebView or RNInterceptWebViewAndroid),
 * otherwise it falls back to the JS WebView.
 */
export type InterceptSource =
  | { uri: string }
  | { html: string };

export type InterceptProps = {
  style?: any;
  source: InterceptSource;
  /** Called whenever a request is intercepted (native or JS). */
  onIntercept?: (e: InterceptEvent) => void;
  /** If provided, when a native URL matches the regex, this callback will be invoked. */
  onNativeMatch?: (url: string) => void;
  /** Android-only regex that narrows which URLs are emitted by native. */
  nativeUrlRegex?: string;
  /** Android-only: additional native filtering (reserved for parity; may be ignored). */
  filterRegexes?: string[];
  /** When true, aggressively watches the DOM for new <video>/<source>/<iframe> tags. */
  aggressiveDomHooking?: boolean;
  /** When true, echo all JS-initiated requests (fetch/xhr) to RN. */
  echoAllRequestsFromJS?: boolean;
  /** Force fallback to JS WebView even on Android. Useful for debugging. */
  forceFallback?: boolean;
  /** Raw JS executed before content loads. */
  injectedJavaScriptBeforeContentLoaded?: string;
  /** Raw JS executed after content loads. */
  injectedJavaScript?: string;
  /** Receive raw postMessage events from the page. */
  onMessage?: (e: NativeSyntheticEvent<any>) => void;
};

const COMPONENT_CANDIDATES_ANDROID = [
  'RNInterceptWebViewAndroid',
  'RNNativeInterceptWebView',
];

let RNInterceptNative: any = null;
if (Platform.OS === 'android') {
  try {
    for (const name of COMPONENT_CANDIDATES_ANDROID) {
      const cfg = (UIManager as any).getViewManagerConfig?.(name);
      if (cfg) {
        const comp = requireNativeComponent(name);
        RNInterceptNative = comp;
        break;
      }
    }
  } catch (e) {
    RNInterceptNative = null;
  }
}

/** Default regex to detect common media URLs. */
export function buildDefaultVideoRegex() {
  return String(/(\.m3u8(\?.*)?$)|(\.mp4(\?.*)?$)|(\.webm(\?.*)?$)|(\.mpd(\?.*)?$)|(\.ts(\?.*)?$)/i);
}

function parseRegexString(s?: string): RegExp | null {
  if (!s) return null;
  try {
    const trimmed = String(s).trim();
    if (trimmed.startsWith('/') && trimmed.lastIndexOf('/') > 0) {
      const last = trimmed.lastIndexOf('/');
      const body = trimmed.slice(1, last);
      const flags = trimmed.slice(last + 1);
      return new RegExp(body, flags || '');
    }
    return new RegExp(trimmed, 'i');
  } catch {
    return null;
  }
}

/**
 * Android-first WebView with native request interception and rich JS hooks.
 * iOS is intentionally not implemented and will use the JS fallback path.
 */
export const InterceptingWebView: FC<InterceptProps> = ({
  style,
  source,
  onIntercept,
  onNativeMatch,
  nativeUrlRegex,
  filterRegexes,
  aggressiveDomHooking = true,
  echoAllRequestsFromJS = false,
  forceFallback,
  injectedJavaScriptBeforeContentLoaded,
  injectedJavaScript,
  onMessage,
}) => {
  const ref = useRef<any>(null);

  const injected = useMemo(
    () => buildInjected({ aggressiveDomHooking, echoAllRequestsFromJS }),
    [aggressiveDomHooking, echoAllRequestsFromJS]
  );

  const handleMessage = useCallback(
    (e: NativeSyntheticEvent<any>) => {
      try {
        try { console.log('[IWV] onMessage', String(e?.nativeEvent?.data ?? '')); } catch {}
        const data = JSON.parse(e.nativeEvent?.data);
        if (data && data.__rnIntercept) {
          const payload = data.payload as InterceptEvent;
          onIntercept?.(payload);
          try {
            if (
              onNativeMatch &&
              nativeUrlRegex &&
              payload?.url &&
              payload.kind === 'native'
            ) {
              const re = new RegExp(nativeUrlRegex, 'i');
              if (re.test(String(payload.url))) onNativeMatch(String(payload.url));
            }
          } catch { }
          return;
        }
      } catch { }
      onMessage?.(e);
    },
    [onIntercept, onMessage, onNativeMatch, nativeUrlRegex]
  );

  // Global native fallback emitter
  useEffect(() => {
    if (!onIntercept && !onNativeMatch) return;
    const sub = DeviceEventEmitter.addListener('RNInterceptNative', (url: string) => {
      try {
        if (!url) return;
        try { console.log('[IWV] global onIntercept', String(url)); } catch {}
        onIntercept?.({ url: String(url), kind: 'native' });
        if (onNativeMatch && nativeUrlRegex) {
          try {
            const re = parseRegexString(nativeUrlRegex);
            if (re && re.test(String(url))) onNativeMatch(String(url));
          } catch { }
        }
      } catch { }
    });
    return () => {
      try { sub.remove(); } catch { }
    };
  }, [onIntercept, onNativeMatch, nativeUrlRegex]);

  if (Platform.OS === 'android' && RNInterceptNative && !forceFallback) {
    const manualPing = `
      (function(){
        try {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(
              JSON.stringify({ __rnIntercept: true, payload: { kind: 'dom', url: '__manual_post_injected__' } })
            );
          }
        } catch(e) {}
      })();
      true;
    `;

    const props: any = {
      style,
      source,
      nativeUrlRegex: nativeUrlRegex || buildDefaultVideoRegex(),
      filterRegexes,
      echoAllRequestsFromJS,
      injectedJavaScriptBeforeContentLoaded:
        injected + (injectedJavaScriptBeforeContentLoaded || ''),
      injectedJavaScript:
        injected + (injectedJavaScriptBeforeContentLoaded || '') + (injectedJavaScript || '') + manualPing,
      onIntercept: (e: any) => {
        try {
          const url = e?.nativeEvent?.url ?? e?.url;
          if (url) {
            try { console.log('[IWV] direct onIntercept', String(url)); } catch {}
            onIntercept?.({ url: String(url), kind: 'native' });
            if (onNativeMatch && nativeUrlRegex) {
              try {
                const re = parseRegexString(nativeUrlRegex);
                if (re && re.test(String(url))) onNativeMatch(String(url));
              } catch {}
            }
          }
        } catch { }
      },
      onMessage: handleMessage,
      ref,
    };
    try { console.log('[IWV] Using native view'); } catch {}
    return <RNInterceptNative {...props} />;
  }

  // iOS and fallback: not implemented as native. Render an empty View.
  // The library currently focuses on Android native interception.
  return <View style={style} ref={ref} />;
};

export default InterceptingWebView;
