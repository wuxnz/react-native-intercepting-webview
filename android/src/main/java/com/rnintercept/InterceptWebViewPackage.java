package com.rnintercept;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.Arrays;
import java.util.List;

/**
 * Package for the library module. Mirrors the example package to expose
 * the NativeInterceptBuffer module and the two WebView view managers.
 */
public class InterceptWebViewPackage implements ReactPackage {
    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        return Arrays.<NativeModule>asList(new NativeInterceptBufferModule(reactContext));
    }

    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        return Arrays.<ViewManager>asList(
            new InterceptWebViewManager(reactContext),
            new NativeInterceptWebViewManager(reactContext)
        );
    }
}