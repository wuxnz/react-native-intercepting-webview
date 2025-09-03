package com.rnintercept

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * ReactPackage to register the native view manager used by InterceptingWebView.
 * Android-only. iOS intentionally not implemented.
 */
class InterceptingWebViewPackage : ReactPackage {
  override fun createViewManagers(reactContext: ReactApplicationContext): MutableList<ViewManager<*, *>> {
    return mutableListOf<ViewManager<*, *>>(
      // Preferred new name
      RNInterceptWebViewAndroidManager(reactContext),
      // Legacy compatibility name
      NativeInterceptWebViewManager(reactContext)
    )
  }

  override fun createNativeModules(reactContext: ReactApplicationContext): MutableList<NativeModule> {
    return mutableListOf()
  }
}
