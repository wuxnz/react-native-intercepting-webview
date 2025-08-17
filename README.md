# react-native-intercepting-webview

A React Native module that provides a WebView with request interception hooks (native and JS), buffering utilities, and an easy-to-use React component wrapper.

This package exports a single React component:

- [`InterceptWebView`](src/intercepting-webview/index.tsx:70) — a drop-in component that wraps `react-native-webview` and adds request interception plumbing.

Highlights

- Native-level request interception on Android with per-view and device-level fallbacks.
- JS-side DOM/video/XHR/fetch hooks via injected script.
- onIntercept and onNativeMatch hooks to receive URLs as they are intercepted.
- A small native buffer module to retrieve recent matches from native side: [`NativeInterceptBufferModule`](android/app/src/main/java/com/rnintercept/NativeInterceptBufferModule.java:28).
- Built-in ad blocker (planned): optional URL-filter based ad-blocking that blocks requests matching a configurable blocklist and provides a lightweight default blocklist; configurable per-WebView via props (e.g. `enableAdBlocker`, `adBlockList`).
  Installation

npm

```bash
npm install react-native-intercepting-webview react-native-webview
```

yarn

```bash
yarn add react-native-intercepting-webview react-native-webview
```

Linking

- Autolinking (React Native >= 0.60)

  - If your app uses React Native 0.60 or newer, autolinking will automatically pick up the native Android and iOS modules. After installing the package, run:

    ```bash
    # Install JS dependency
    npm install react-native-intercepting-webview react-native-webview
    # or
    yarn add react-native-intercepting-webview react-native-webview

    # iOS: install CocoaPods
    cd ios && pod install && cd ..
    ```

- Manual linking (React Native < 0.60) — Android

  - 1. Add the package to your application's package list (Java example):
    - Open `android/app/src/main/java/.../MainApplication.java` (or `.kt`) and add:
      ```java
      import com.rnintercept.InterceptWebViewPackage;
      // ...
      @Override
      protected List<ReactPackage> getPackages() {
        List<ReactPackage> packages = new PackageList(this).getPackages();
        packages.add(new InterceptWebViewPackage());
        return packages;
      }
      ```
    - If your project requires enabling the package in `settings.gradle` or `build.gradle`, follow your RN <0.60 linking pattern (this repository already contains the package code).
  - 2. Rebuild the Android app:
    ```bash
    cd android && ./gradlew clean && cd .. && react-native run-android
    ```

- Manual linking (React Native < 0.60) — iOS
  - 1. In Xcode, add the iOS library project (if present) to your workspace and include it in your app target.
  - 2. From `ios/` run:
    ```bash
    pod install
    ```
  - 3. Rebuild the iOS app from Xcode.

Note: This repository already demonstrates adding `InterceptWebViewPackage()` to `MainApplication` in the example app. If you are using autolinking and still don't see the native module at runtime, try cleaning build artifacts and reinstalling (Android: `cd android && ./gradlew clean`; iOS: delete DerivedData and `pod install`).

Quick usage

A minimal example showing how to import and mount the component. This snippet is formatted for copy-paste into a screen component.

```js
// BasicExample.js
import React from 'react';
import InterceptWebView from 'react-native-intercepting-webview';

/*
  Minimal example: mount a full-screen InterceptWebView and
  log intercepted events to the console.
*/
export default function BasicExample() {
  return (
    <InterceptWebView
      source={{uri: 'https://example.com'}}
      // Native-side regex for URLs of interest (media in this example)
      nativeUrlRegex={'\\.mp4(\\?.*)?$|\\.m3u8(\\?.*)?$'}
      // General intercept callback (native/dom/video/xhr/fetch)
      onIntercept={e => console.log('Intercept event:', e)}
      // Called when a native-intercepted URL matches the nativeUrlRegex
      onNativeMatch={url => console.log('Native matched URL:', url)}
      style={{flex: 1}}
    />
  );
}
```

Below are more advanced examples and explanations.

## Examples

Below are several usage examples with explanatory comments to help integrate the component into your app.

### Basic usage (drop-in)

A minimal example that mounts the component and logs all intercept events to the console.

```js
// BasicExample.js
import React from 'react';
import InterceptWebView from 'react-native-intercepting-webview';

/*
  This mounts a full-screen webview that posts intercepted requests back to JS via
  onIntercept. The `nativeUrlRegex` prop is used by the native side to mark URLs
  of interest (e.g. media files).
*/
export default function BasicExample() {
  return (
    <InterceptWebView
      source={{uri: 'https://example.com'}}
      // Regex to match common media file extensions (pass as a JS string)
      nativeUrlRegex={'\\.mp4(\\?.*)?$|\\.m3u8(\\?.*)?$'}
      onIntercept={e => {
        // Called for every intercepted message forwarded to JS
        console.log('Intercept event:', e);
      }}
      style={{flex: 1}}
    />
  );
}
```

See implementation details in [`src/intercepting-webview/index.tsx:70`](src/intercepting-webview/index.tsx:70).

### Advanced usage — runtime JS injection, native-match hook, and buffer access

This example demonstrates:

- Using a ref to run arbitrary JS in the page at runtime (via the underlying WebView).
- Receiving native-matched URLs via `onNativeMatch`.
- Fetching recent matches from the native buffer module.

```js
// AdvancedExample.js
import React, {useRef, useEffect} from 'react';
import {NativeModules, DeviceEventEmitter} from 'react-native';
import InterceptWebView from 'react-native-intercepting-webview';

const {NativeInterceptBuffer} = NativeModules;

export default function AdvancedExample() {
  // ref forwarded to the underlying WebView so we can inject JS at runtime
  const webviewRef = useRef(null);

  useEffect(() => {
    // Example: subscribe to device-level buffer events (optional)
    const sub = DeviceEventEmitter.addListener(
      'NativeInterceptBuffer',
      ({viewId, url}) => {
        console.log('Buffered native match event:', viewId, url);
      },
    );
    return () => sub.remove();
  }, []);

  // Example API: call this to inject JS into the page context
  const injectAlert = () => {
    const js = `alert('Hello from React Native (injected)'); true;`;
    // The InterceptWebView component forwards ref to the internal WebView,
    // so this uses the WebView inject mechanism.
    webviewRef.current?.injectJavaScript?.(js);
  };

  const getRecentMatches = async viewId => {
    try {
      // NativeInterceptBuffer.getRecent(viewId, n) returns a Promise<string[]>
      const recent = await NativeInterceptBuffer.getRecent(viewId, 10);
      console.log('Recent native matches for view', viewId, recent);
    } catch (err) {
      console.warn('Failed to get recent matches', err);
    }
  };

  return (
    <>
      <InterceptWebView
        ref={webviewRef}
        source={{uri: 'https://example.com'}}
        nativeUrlRegex={'\\.mp4(\\?.*)?$|\\.m3u8(\\?.*)?$'}
        onIntercept={e => {
          // General intercept callback (all kinds: native/dom/video/xhr/fetch)
          console.log('onIntercept', e);
        }}
        onNativeMatch={url => {
          // Called when the native regex matches a captured URL
          console.log('onNativeMatch:', url);
          // Optionally use native buffer API to get more context
          // NOTE: viewId must come from native (if you store it or expose it)
        }}
        style={{flex: 1}}
      />
      {/* Example controls (UI omitted) */}
      <button onClick={injectAlert}>Inject JS</button>
      {/* Note: getRecentMatches requires a viewId which React Native provides at native level */}
    </>
  );
}
```

Notes:

- Runtime injection uses the underlying WebView API (e.g., [`react-native-webview` injectJavaScript]) and works because this module forwards refs to the inner WebView. See [`src/intercepting-webview/index.tsx:81`](src/intercepting-webview/index.tsx:81).
- The native buffer interface is implemented in [`android/app/src/main/java/com/rnintercept/NativeInterceptBufferModule.java:28`](android/app/src/main/java/com/rnintercept/NativeInterceptBufferModule.java:28).

### Planned feature usage: built-in ad blocker (example config)

The ad blocker is a planned feature. When implemented the API will look similar to this and allow you to pass a per-view blocklist:

```js
<InterceptWebView
  source={{uri: 'https://news.example'}}
  enableAdBlocker={true}
  // Example: pass an array of string regexes to block matching requests
  adBlockList={[
    '.*ads?\\..*',
    '.*doubleclick\\.net.*',
    '\\.adservice\\.(com|net).*',
  ]}
/>
```

This will instruct the native `shouldInterceptRequest` handler to drop matching requests before they reach the page. The default blocklist will be conservative and configurable.

API

Component: InterceptWebView

- Props (in addition to all `WebView` props):
  - onIntercept?: (e: { url: string; kind: 'native'|'dom'|'video'|'xhr'|'fetch'; userAgent?: string }) => void
    - Called for intercepted messages forwarded to JS. Useful for logging and processing.
    - See JS handler at [`src/intercepting-webview/index.tsx`](src/intercepting-webview/index.tsx:86).
  - onNativeMatch?: (url: string) => void
    - Called when a native-intercepted URL matches `nativeUrlRegex`. Receives the matched URL string.
    - Wired to both per-view messages and device-level fallback events.
  - nativeUrlRegex?: string
    - JS-compatible regex string used to test intercepted native URLs (case-insensitive).
  - aggressiveDomHooking?: boolean (default: true)
    - Whether to use MutationObserver to hook dynamically added DOM elements (video/iframes).
    - See injected script at [`src/intercepting-webview/injected.ts`](src/intercepting-webview/injected.ts:6).
  - echoAllRequestsFromJS?: boolean (default: false)
    - When set, JS DOM hooks will echo all URLs they detect instead of only media-like URLs.

Native modules (Android)

- The Android native code provides:
  - `RNInterceptWebViewAndroid` view manager (per-view direct emits).
    - Implemented in [`android/app/src/main/java/com/rnintercept/InterceptWebViewManager.java`](android/app/src/main/java/com/rnintercept/InterceptWebViewManager.java:20).
  - `RNNativeInterceptWebView` (alternate manager with filterRegexes).
    - Implemented in [`android/app/src/main/java/com/rnintercept/NativeInterceptWebViewManager.java`](android/app/src/main/java/com/rnintercept/NativeInterceptWebViewManager.java:36).
  - `NativeInterceptBuffer` native module for buffered recent URLs and event emissions.
    - Implemented in [`android/app/src/main/java/com/rnintercept/NativeInterceptBufferModule.java`](android/app/src/main/java/com/rnintercept/NativeInterceptBufferModule.java:28).

Android manual install (if not using autolinking)

1. Add the package to your app's package list:

   - In `android/app/src/main/java/.../MainApplication.kt`, add:
     - import com.rnintercept.InterceptWebViewPackage
     - add(InterceptWebViewPackage()) to the packages list (this repo already demonstrates this).

2. Rebuild the Android app:

```bash
cd android && ./gradlew clean && cd .. && npx react-native run-android
```

iOS notes

- The iOS view manager files are present in `ios/InterceptWebViewManager.*`. If you need manual steps, open the Xcode workspace and ensure the module is included in your app target and run `pod install` in the `ios` directory.

Testing & Debugging

- Enable WebView remote debugging (Android) and inspect via chrome://inspect. The sample `MainApplication.kt` already sets:
  - WebView.setWebContentsDebuggingEnabled(true) in onCreate.
- Native Android logging tags:
  - `RNIntercept` — general native intercept logs (`InterceptWebViewManager`).
  - `RNNativeIntercept` — logs from the native intercept manager.
  - `NativeInterceptBuffer` — logs from the buffer module.

Advanced usage

- Buffer: use `NativeInterceptBuffer.getRecent(viewId, n)` from JS (bridge) to retrieve recent matches for a given viewId (see `NativeInterceptBufferModule`).
- If you need capture groups from regex matches, modify the `onNativeMatch` wiring in JS to return capture arrays instead of the raw URL; I can add this if desired.

Contributing

- Pull requests welcome. Please follow the repository coding style & run `npm test` and `npm run lint` before submitting PRs.

License

- MIT (see `package.json`).
