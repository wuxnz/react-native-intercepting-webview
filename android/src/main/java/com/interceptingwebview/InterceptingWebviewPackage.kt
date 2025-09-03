package com.interceptingwebview

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import java.util.ArrayList
import com.rnintercept.RNInterceptWebViewAndroidManager
import com.rnintercept.NativeInterceptWebViewManager

class InterceptingWebviewViewPackage : ReactPackage {
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    val viewManagers: MutableList<ViewManager<*, *>> = ArrayList()
    // Keep generated stub view (no-op for our use case)
    viewManagers.add(InterceptingWebviewViewManager())
    // Also register the actual WebView managers under both names used by JS
    viewManagers.add(RNInterceptWebViewAndroidManager(reactContext))
    viewManagers.add(NativeInterceptWebViewManager(reactContext))
    return viewManagers
  }

  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return emptyList()
  }
}
