package com.rnintercept

import android.annotation.TargetApi
import android.os.Build
import android.webkit.ServiceWorkerClient
import android.webkit.ServiceWorkerController
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.annotation.NonNull
import androidx.annotation.Nullable
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.uimanager.events.RCTEventEmitter
import com.reactnativecommunity.webview.RNCWebViewClient
import com.reactnativecommunity.webview.RNCWebViewManager
import com.reactnativecommunity.webview.RNCWebViewWrapper
import java.util.concurrent.ConcurrentHashMap
import java.util.regex.Pattern

/**
 * Android-only WebView manager that intercepts requests and emits them to JS.
 * Exports the view name "RNNativeInterceptWebView" for compatibility.
 *
 * This manager extends react-native-webview's RNCWebViewManager so that we get the
 * same props/behavior as the community WebView while adding interception.
 */
class NativeInterceptWebViewManager(private val appContext: ReactApplicationContext) : RNCWebViewManager() {
  companion object {
    const val REACT_CLASS: String = "RNNativeInterceptWebView"

    private var sSwClientSet: Boolean = false

    // Per-view state: compiled regex and echo flag
    private val viewPatternMap = ConcurrentHashMap<Int, Pattern>()
    private val viewEchoMap = ConcurrentHashMap<Int, Boolean>()

    private fun ensureServiceWorkerClient(context: ReactApplicationContext) {
      if (sSwClientSet) return
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
          val controller = ServiceWorkerController.getInstance()
          controller.setServiceWorkerClient(object : ServiceWorkerClient() {
            override fun shouldInterceptRequest(request: WebResourceRequest): WebResourceResponse? {
              val url = try { request.url?.toString() } catch (_: Throwable) { null }
              if (url != null) {
                try { android.util.Log.i("RNNativeIntercept", "SW intercept url: $url") } catch (_: Throwable) {}
                try {
                  context
                    .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("RNInterceptNative", url)
                } catch (_: Throwable) {}
              }
              return null
            }
          })
          sSwClientSet = true
          try { android.util.Log.i("RNNativeIntercept", "ServiceWorkerClient set") } catch (_: Throwable) {}
        }
      } catch (t: Throwable) {
        try { android.util.Log.i("RNNativeIntercept", "ServiceWorkerClient failed: ${t.message}") } catch (_: Throwable) {}
      }
    }
  }

  init { ensureServiceWorkerClient(appContext) }

  @NonNull
  override fun getName(): String = REACT_CLASS

  override fun createViewInstance(reactContext: ThemedReactContext): RNCWebViewWrapper {
    val wrapper = super.createViewInstance(reactContext)
    wrapper.webView?.let { wv ->
      try { wv.setMessagingEnabled(true) } catch (_: Throwable) {}
      wv.webViewClient = NativeInterceptingWebViewClient()
    }
    return wrapper
  }

  override fun onAfterUpdateTransaction(viewWrapper: RNCWebViewWrapper) {
    super.onAfterUpdateTransaction(viewWrapper)
    viewWrapper.webView?.let { wv ->
      try { wv.setMessagingEnabled(true) } catch (_: Throwable) {}
      wv.webViewClient = NativeInterceptingWebViewClient()
    }
  }

  override fun addEventEmitters(@NonNull reactContext: ThemedReactContext, @NonNull viewWrapper: RNCWebViewWrapper) {
    super.addEventEmitters(reactContext, viewWrapper)
    viewWrapper.webView?.let { wv ->
      try { wv.setMessagingEnabled(true) } catch (_: Throwable) {}
      wv.webViewClient = NativeInterceptingWebViewClient()
    }
  }

  private inner class NativeInterceptingWebViewClient : RNCWebViewClient() {
    @Nullable
    override fun shouldInterceptRequest(view: WebView, url: String?): WebResourceResponse? {
      maybeEmit(view, url)
      return null
    }

    @TargetApi(Build.VERSION_CODES.LOLLIPOP)
    @Nullable
    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
      val url = request.url?.toString()
      maybeEmit(view, url)
      return null
    }

    private fun maybeEmit(view: WebView, url: String?) {
      if (url.isNullOrEmpty()) return

      val echo = viewEchoMap[view.id] == true
      var matched = false
      if (echo) {
        matched = true
      } else {
        try {
          val pattern = viewPatternMap[view.id]
          matched = pattern?.matcher(url)?.find() == true
        } catch (t: Throwable) {
          try { android.util.Log.i("RNNativeIntercept", "filter check failed: ${t.message}") } catch (_: Throwable) {}
          matched = false
        }
      }
      if (!matched) return

      try { android.util.Log.i("RNNativeIntercept", "maybeEmit called for url: $url") } catch (_: Throwable) {}

      var emitted = false
      try {
        val reactContext = view.context as ReactContext
        val map: WritableMap = Arguments.createMap()
        map.putString("url", url)
        reactContext.getJSModule(RCTEventEmitter::class.java)
          .receiveEvent(view.id, "onIntercept", map)
        emitted = true
        try { android.util.Log.i("RNNativeIntercept", "direct emit succeeded for viewId=${view.id}") } catch (_: Throwable) {}
      } catch (t: Throwable) {
        try { android.util.Log.i("RNNativeIntercept", "direct emit failed: ${t.message}") } catch (_: Throwable) {}
      }

      if (!emitted) {
        try {
          val reactContext = view.context as ReactContext
          reactContext
            .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("RNInterceptNative", url)
          try { android.util.Log.i("RNNativeIntercept", "device emitter used for url: $url") } catch (_: Throwable) {}
        } catch (t: Throwable) {
          try { android.util.Log.i("RNNativeIntercept", "device emitter failed: ${t.message}") } catch (_: Throwable) {}
        }
      }
    }
  }

  @ReactProp(name = "echoAllRequestsFromJS")
  fun setEchoAllRequests(viewWrapper: RNCWebViewWrapper, echo: Boolean?) {
    val wv = viewWrapper.webView ?: return
    viewEchoMap[wv.id] = echo == true
  }

  @ReactProp(name = "nativeUrlRegex")
  fun setNativeUrlRegex(viewWrapper: RNCWebViewWrapper, regex: String?) {
    val wv = viewWrapper.webView ?: return
    try {
      if (regex.isNullOrEmpty()) {
        viewPatternMap.remove(wv.id)
      } else {
        val pattern = Pattern.compile(regex, Pattern.CASE_INSENSITIVE)
        viewPatternMap[wv.id] = pattern
      }
    } catch (t: Throwable) {
      try { android.util.Log.i("RNNativeIntercept", "setNativeUrlRegex failed: ${t.message}") } catch (_: Throwable) {}
    }
  }

  @Nullable
  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any>? {
    return try {
      val superMap = super.getExportedCustomDirectEventTypeConstants()
      val myMap = MapBuilder.of(
        "onIntercept", MapBuilder.of("registrationName", "onIntercept") as Any
      )
      if (superMap == null) myMap else HashMap<String, Any>(superMap).apply { putAll(myMap) }
    } catch (t: Throwable) {
      MapBuilder.of(
        "onIntercept", MapBuilder.of("registrationName", "onIntercept") as Any
      )
    }
  }
}
