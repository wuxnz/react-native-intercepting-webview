# react-native-intercepting-webview

Android‑first WebView with native request interception and rich JS hooks. Fall back to the standard JS `WebView` on iOS or when the native view is unavailable.

This library lets you observe network requests initiated inside the WebView (e.g., HLS/DASH manifests, media segments, XHR/fetch) and DOM activity, and react to them from React Native.

## Requirements

- React Native: `0.81.x`
- React: `19.x`
- react-native-webview: `^13.8.6` (peer dependency)
- Android: Native module preferred (Fabric view); iOS uses JS fallback path only.

## Installation

Install the package and ensure you also have `react-native-webview` installed in your app:

```sh
yarn add react-native-intercepting-webview react-native-webview
# or
npm i react-native-intercepting-webview react-native-webview
```

On Android, autolinking should register the native view. No additional setup is required.

## Quick start

```tsx
import React from 'react';
import { View } from 'react-native';
import { InterceptingWebView } from 'react-native-intercepting-webview';

export default function App() {
  return (
    <View style={{ flex: 1 }}>
      <InterceptingWebView
        source={{ uri: 'https://example.com' }}
        // Receive all intercept events (native or JS)
        onIntercept={(e) => {
          console.log('[intercept]', e.kind, e.url);
        }}
        // When a native URL matches, invoke this callback
        onNativeMatch={(url) => {
          console.log('[native match]', url);
        }}
        // Optional: customize which URLs native emits (Android)
        nativeUrlRegex={/\.(m3u8|mp4|webm|mpd|ts)(\?.*)?$/i.source}
      />
    </View>
  );
}
```

## API

### Component: `InterceptingWebView`

Android‑first WebView. On Android it prefers a native Fabric view for request interception; otherwise it falls back to the standard JS `WebView` from `react-native-webview`.

```ts
import type { WebViewProps } from 'react-native-webview';

export type InterceptEvent = {
  url: string;
  kind: 'native' | 'dom' | 'video' | 'xhr' | 'fetch' | 'perf';
  userAgent?: string;
};

export type InterceptProps = WebViewProps & {
  onIntercept?: (e: InterceptEvent) => void;
  onNativeMatch?: (url: string) => void; // Android only helper
  nativeUrlRegex?: string;               // Android only
  filterRegexes?: string[];              // Android only (reserved)
  aggressiveDomHooking?: boolean;        // default: true
  echoAllRequestsFromJS?: boolean;       // default: false
  forceFallback?: boolean;               // Force JS WebView even on Android
};
```

#### Props

- __`...WebViewProps`__: All props from `react-native-webview` are supported and forwarded.
- __`onIntercept`__: Called for every intercepted event coming from native or JS. Payload is `InterceptEvent`.
- __`onNativeMatch` (Android)__: Convenience callback fired when a native URL matches `nativeUrlRegex`.
- __`nativeUrlRegex` (Android)__: Case‑insensitive regex string. Defaults to a media‑focused regex (m3u8, mp4, webm, mpd, ts) via `buildDefaultVideoRegex()`.
- __`filterRegexes` (Android)__: Additional native filtering (reserved for parity; may be ignored).
- __`aggressiveDomHooking`__: When true, the injected script watches the DOM for new `<video>`, `<source>`, `<iframe>` and posts events.
- __`echoAllRequestsFromJS`__: When true, proxies JS `fetch`/`XMLHttpRequest` to RN via `postMessage`.
- __`forceFallback`__: Force the JS WebView path even on Android (helpful for debugging).

#### Events

`onIntercept(e: InterceptEvent)`:

- __`e.url`__: The URL detected.
- __`e.kind`__: One of `native | dom | video | xhr | fetch | perf`.
- __`e.userAgent?`__: Optional UA if available.

### Named exports

```ts
import {
  InterceptingWebView,
  buildDefaultVideoRegex,
  type InterceptEvent,
  type InterceptProps,
} from 'react-native-intercepting-webview';
```

- __`buildDefaultVideoRegex()`__: Returns a stringified regex that matches common media URLs.

## Platform notes

- __Android__: Tries to instantiate one of the native components `RNNativeInterceptWebView` or `RNInterceptWebViewAndroid`. If found, it enables native request interception and injects helpers for DOM/JS events.
- __iOS__: The native view is not implemented; the component always renders the JS `WebView` fallback and relies on injected scripts to surface events.

## Advanced usage

```tsx
<InterceptingWebView
  source={{ uri: 'https://video.example.com' }}
  aggressiveDomHooking
  echoAllRequestsFromJS
  nativeUrlRegex={/video|m3u8|mp4/i.source}
  onIntercept={(e) => {
    if (e.kind === 'native' || e.kind === 'video') {
      // e.g., detect HLS playlist or media segment
      console.log('media request:', e.url);
    }
  }}
  onNativeMatch={(url) => {
    // Android-only: handy shortcut when URL matches nativeUrlRegex
    console.log('matched native URL:', url);
  }}
/> 
```

## Troubleshooting

- __TypeScript: "Cannot find module 'react-native-webview'"__
  - Ensure your app has `react-native-webview` installed. When developing this library itself in a monorepo, add `react-native-webview` as a devDependency to satisfy editor/TS resolution (it remains a peer dependency for consumers).

- __No native interception on Android__
  - The library auto-detects native view managers. If not found, it falls back to JS. Make sure Android autolinking is working and you rebuilt the app.

- __iOS differences__
  - iOS is fallback‑only. You will still get `dom/xhr/fetch` events, but there is no native network interception.

## Example app

See `example/` for a minimal app using this component. Run with the usual RN commands from that workspace.

## Contributing

- __Development workflow__: see [CONTRIBUTING.md#development-workflow](CONTRIBUTING.md#development-workflow)
- __Sending a pull request__: see [CONTRIBUTING.md#sending-a-pull-request](CONTRIBUTING.md#sending-a-pull-request)
- __Code of conduct__: see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
