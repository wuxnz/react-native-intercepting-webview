package com.rnintercept

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule

/**
 * Backwards-compat manager that exports the legacy name "RNNativeInterceptWebView"
 * but uses our pure-native RNInterceptWebViewAndroidManager under the hood.
 */
@ReactModule(name = NativeInterceptWebViewManager.REACT_CLASS)
class NativeInterceptWebViewManager(appContext: ReactApplicationContext) : RNInterceptWebViewAndroidManager(appContext) {
  companion object { const val REACT_CLASS: String = "RNNativeInterceptWebView" }

  override fun getName(): String = REACT_CLASS
}
