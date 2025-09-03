package com.rnintercept

import android.annotation.TargetApi
import android.graphics.Color
import android.os.Build
import android.webkit.JavascriptInterface
import android.webkit.ServiceWorkerClient
import android.webkit.ServiceWorkerController
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.common.MapBuilder
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.uimanager.events.RCTEventEmitter
import java.util.concurrent.ConcurrentHashMap
import java.util.regex.Pattern

@ReactModule(name = RNInterceptWebViewAndroidManager.REACT_CLASS)
open class RNInterceptWebViewAndroidManager(private val appContext: ReactApplicationContext) : SimpleViewManager<WebView>() {
  companion object {
    const val REACT_CLASS: String = "RNInterceptWebViewAndroid"

    private var sSwClientSet: Boolean = false

    private fun ensureServiceWorkerClient(context: ReactApplicationContext) {
      if (sSwClientSet) return
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
          val controller = ServiceWorkerController.getInstance()
          controller.setServiceWorkerClient(object : ServiceWorkerClient() {
            override fun shouldInterceptRequest(request: WebResourceRequest): WebResourceResponse? {
              val url = try { request.url?.toString() } catch (_: Throwable) { null }
              if (url != null) {
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
        }
      } catch (_: Throwable) {}
    }

    private fun parseJsRegexToPattern(regex: String?): Pattern? {
      if (regex.isNullOrEmpty()) return null
      val r = regex.trim()
      return try {
        if (r.startsWith("/") && r.length > 2) {
          val last = r.lastIndexOf('/')
          if (last > 0) {
            val body = r.substring(1, last)
            val flagsStr = r.substring(last + 1)
            var flags = 0
            for (ch in flagsStr) {
              when (ch) {
                'i' -> flags = flags or Pattern.CASE_INSENSITIVE
                'm' -> flags = flags or Pattern.MULTILINE
                's' -> flags = flags or Pattern.DOTALL
              }
            }
            return Pattern.compile(body, flags)
          }
        }
        // Fallback: treat as plain pattern with case-insensitive default
        Pattern.compile(r, Pattern.CASE_INSENSITIVE)
      } catch (_: Throwable) {
        null
      }
    }
  }

  init { ensureServiceWorkerClient(appContext) }

  override fun getName(): String = REACT_CLASS

  // Keep per-view state
  private val viewPatternMap = ConcurrentHashMap<Int, Pattern>()
  private val viewEchoMap = ConcurrentHashMap<Int, Boolean>()
  private val viewInjectedBeforeMap = ConcurrentHashMap<Int, String>()
  private val viewInjectedAfterMap = ConcurrentHashMap<Int, String>()

  override fun createViewInstance(reactContext: ThemedReactContext): WebView {
    try { WebView.setWebContentsDebuggingEnabled(true) } catch (_: Throwable) {}
    val wv = WebView(reactContext)
    try { android.util.Log.i("RNInterceptWV", "createViewInstance id=${wv.id}") } catch (_: Throwable) {}
    val s: WebSettings = wv.settings
    s.javaScriptEnabled = true
    s.domStorageEnabled = true
    s.allowFileAccess = true
    s.allowContentAccess = true
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      s.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
    }

    // JS bridge
    wv.addJavascriptInterface(object {
      @JavascriptInterface
      fun postMessage(message: String?) {
        try {
          android.util.Log.i("RNInterceptWV", "postMessage from JS: ${message}")
          val reactCtx = wv.context as ReactContext
          val map: WritableMap = Arguments.createMap()
          map.putString("data", message ?: "")
          reactCtx.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(wv.id, "onMessage", map)
        } catch (_: Throwable) {}
      }
    }, "ReactNativeWebView")

    wv.webViewClient = object : WebViewClient() {
      override fun onPageFinished(view: WebView, url: String?) {
        super.onPageFinished(view, url)
        try {
          android.util.Log.i("RNInterceptWV", "onPageFinished url=${url}")
          val before = viewInjectedBeforeMap[view.id]
          if (!before.isNullOrEmpty()) view.evaluateJavascript(before) { _ -> }
        } catch (_: Throwable) {}
        try {
          val after = viewInjectedAfterMap[view.id]
          if (!after.isNullOrEmpty()) view.evaluateJavascript(after) { _ -> }
        } catch (_: Throwable) {}
      }

      override fun shouldInterceptRequest(view: WebView, url: String?): WebResourceResponse? {
        maybeEmit(view, url)
        return null
      }

      @TargetApi(Build.VERSION_CODES.LOLLIPOP)
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
          } catch (_: Throwable) { matched = false }
        }
        // Note: Do NOT return when not matched. We always emit onIntercept for every request.

        try {
          android.util.Log.i("RNInterceptWV", "maybeEmit url=${url}")
          val reactContext = view.context as ReactContext
          val map: WritableMap = Arguments.createMap()
          map.putString("url", url)
          reactContext.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(view.id, "onIntercept", map)
          // Also broadcast a global event for robustness
          try {
            reactContext
              .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
              .emit("RNInterceptNative", url)
          } catch (_: Throwable) {}
        } catch (_: Throwable) {
          try {
            val reactContext = view.context as ReactContext
            reactContext
              .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
              .emit("RNInterceptNative", url)
          } catch (_: Throwable) {}
        }
      }
    }

    return wv
  }

  // Props
  @ReactProp(name = "nativeUrlRegex")
  fun setNativeUrlRegex(view: WebView, regex: String?) {
    try {
      android.util.Log.i("RNInterceptWV", "setNativeUrlRegex viewId=${view.id} regex=${regex}")
      if (regex.isNullOrEmpty()) {
        viewPatternMap.remove(view.id)
      } else {
        val pattern = parseJsRegexToPattern(regex) ?: Pattern.compile(regex, Pattern.CASE_INSENSITIVE)
        viewPatternMap[view.id] = pattern
      }
    } catch (_: Throwable) {}
  }

  @ReactProp(name = "echoAllRequestsFromJS")
  fun setEchoAllRequests(view: WebView, echo: Boolean?) {
    try { android.util.Log.i("RNInterceptWV", "setEchoAllRequests viewId=${view.id} echo=${echo}") } catch (_: Throwable) {}
    viewEchoMap[view.id] = echo == true
  }

  @ReactProp(name = "source")
  fun setSource(view: WebView, source: ReadableMap?) {
    try {
      android.util.Log.i("RNInterceptWV", "setSource viewId=${view.id} sourceKeys=${source?.toHashMap()?.keys}")
      if (source == null) return
      if (source.hasKey("uri")) {
        val uri = source.getString("uri")
        android.util.Log.i("RNInterceptWV", "loadUrl ${uri}")
        if (!uri.isNullOrEmpty()) view.loadUrl(uri)
      } else if (source.hasKey("html")) {
        val html = source.getString("html") ?: ""
        android.util.Log.i("RNInterceptWV", "loadData html length=${html.length}")
        view.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
      }
    } catch (_: Throwable) {}
  }

  @ReactProp(name = "injectedJavaScriptBeforeContentLoaded")
  fun setInjectedBefore(view: WebView, js: String?) {
    viewInjectedBeforeMap[view.id] = js ?: ""
  }

  @ReactProp(name = "injectedJavaScript")
  fun setInjectedAfter(view: WebView, js: String?) {
    viewInjectedAfterMap[view.id] = js ?: ""
  }

  @ReactProp(name = "backgroundColor")
  fun setBg(view: WebView, color: String?) {
    try { view.setBackgroundColor(Color.parseColor(color)) } catch (_: Throwable) {}
  }

  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any>? {
    val map = MapBuilder.of(
      "onIntercept", MapBuilder.of("registrationName", "onIntercept") as Any,
      "onMessage", MapBuilder.of("registrationName", "onMessage") as Any,
    )
    return map
  }
}
