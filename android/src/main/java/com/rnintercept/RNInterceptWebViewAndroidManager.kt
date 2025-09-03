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
import okhttp3.Headers
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody
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
                  val payload = Arguments.createMap()
                  payload.putString("kind", "native")
                  val reqInfo = Arguments.createMap()
                  reqInfo.putString("url", url)
                  try { reqInfo.putString("method", request.method ?: "GET") } catch (_: Throwable) {}
                  try { reqInfo.putMap("headers", Arguments.createMap().apply {
                    for ((k, v) in request.requestHeaders) putString(k, v)
                  }) } catch (_: Throwable) {}
                  try { reqInfo.putBoolean("isMainFrame", request.isForMainFrame) } catch (_: Throwable) {}
                  try { reqInfo.putBoolean("hasUserGesture", request.hasGesture()) } catch (_: Throwable) {}
                  payload.putMap("request", reqInfo)
                  context
                    .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("RNInterceptNative", payload)
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
  private val httpClient: OkHttpClient by lazy { OkHttpClient.Builder().build() }

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
        return handleIntercept(view, url, null)
      }

      @TargetApi(Build.VERSION_CODES.LOLLIPOP)
      override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
        val url = request.url?.toString()
        return handleIntercept(view, url, request)
      }

      private fun buildHeadersMap(headers: Map<String, String>?): WritableMap {
        val map = Arguments.createMap()
        if (headers != null) {
          for ((k, v) in headers) {
            map.putString(k, v)
          }
        }
        return map
      }

      private fun buildHeadersMap(headers: Headers): WritableMap {
        val map = Arguments.createMap()
        for (name in headers.names()) {
          // Join multiple values with '\n' to preserve multiplicity
          val values = headers.values(name)
          map.putString(name, values.joinToString("\n"))
        }
        return map
      }

      private fun cloneMap(src: WritableMap): WritableMap {
        val copy = Arguments.createMap()
        try { (copy as com.facebook.react.bridge.WritableNativeMap).merge(src) } catch (_: Throwable) {
          try { copy.merge(src) } catch (_: Throwable) {}
        }
        return copy
      }

      private fun emitEvent(view: WebView, payload: WritableMap, alsoBroadcast: Boolean = true) {
        try {
          val reactContext = view.context as ReactContext
          val broadcastPayload = if (alsoBroadcast) cloneMap(payload) else null
          reactContext.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(view.id, "onIntercept", payload)
          if (alsoBroadcast && broadcastPayload != null) {
            reactContext
              .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
              .emit("RNInterceptNative", broadcastPayload)
          }
        } catch (_: Throwable) {}
      }

      private fun handleIntercept(view: WebView, url: String?, request: WebResourceRequest?): WebResourceResponse? {
        if (url.isNullOrEmpty()) return null
        val pattern = viewPatternMap[view.id]
        val matches = try { pattern?.matcher(url)?.find() == true } catch (_: Throwable) { false }

        // Always emit a request event (without response yet)
        try {
          val reqMap = Arguments.createMap()
          val reqInfo = Arguments.createMap()
          reqInfo.putString("url", url)
          if (request != null) {
            try { reqInfo.putString("method", request.method ?: "GET") } catch (_: Throwable) {}
            try { reqInfo.putMap("headers", buildHeadersMap(request.requestHeaders)) } catch (_: Throwable) {}
            try { reqInfo.putBoolean("isMainFrame", request.isForMainFrame) } catch (_: Throwable) {}
            try { reqInfo.putBoolean("hasUserGesture", request.hasGesture()) } catch (_: Throwable) {}
          }
          reqMap.putString("kind", "native")
          reqMap.putMap("request", reqInfo)
          emitEvent(view, reqMap, alsoBroadcast = true)
        } catch (_: Throwable) {}

        if (!matches) {
          // Do not proxy; let WebView handle normally
          return null
        }

        // Proxy matching requests via OkHttp to capture response details
        return try {
          android.util.Log.i("RNInterceptWV", "proxying url=${url}")
          val builder = Request.Builder().url(url)
          if (request != null) {
            // Copy method when known. Body is not available here.
            val method = try { request.method ?: "GET" } catch (_: Throwable) { "GET" }
            builder.method(method, null)
            val headers = request.requestHeaders
            if (headers != null) {
              for ((k, v) in headers) {
                if (!k.equals("Host", true)) builder.addHeader(k, v)
              }
            }
          }
          val httpReq = builder.build()
          val resp: Response = httpClient.newCall(httpReq).execute()

          val body: ResponseBody? = resp.body
          val mimeType = resp.header("Content-Type")?.let {
            // extract mime type without charset
            val semi = it.indexOf(';')
            if (semi > 0) it.substring(0, semi) else it
          } ?: "application/octet-stream"
          val encoding = resp.header("Content-Encoding") ?: "utf-8"
          val statusCode = resp.code
          val reason = try { resp.message?.ifBlank { "OK" } ?: "OK" } catch (_: Throwable) { "OK" }
          val headerMap = mutableMapOf<String, String>()
          for (name in resp.headers.names()) {
            headerMap[name] = resp.headers.values(name).joinToString("\n")
          }

          val responseStream = try { body?.byteStream() } catch (_: Throwable) { null }
            ?: java.io.ByteArrayInputStream(ByteArray(0))
          val webResp = WebResourceResponse(
            mimeType,
            encoding,
            statusCode,
            reason,
            headerMap,
            responseStream
          )

          // Emit detailed payload including response metadata
          try {
            val payload = Arguments.createMap()
            payload.putString("kind", "native")
            val reqInfo = Arguments.createMap()
            reqInfo.putString("url", url)
            if (request != null) {
              try { reqInfo.putString("method", request.method ?: "GET") } catch (_: Throwable) {}
              try { reqInfo.putMap("headers", buildHeadersMap(request.requestHeaders)) } catch (_: Throwable) {}
              try { reqInfo.putBoolean("isMainFrame", request.isForMainFrame) } catch (_: Throwable) {}
              try { reqInfo.putBoolean("hasUserGesture", request.hasGesture()) } catch (_: Throwable) {}
            }
            payload.putMap("request", reqInfo)

            val respInfo = Arguments.createMap()
            respInfo.putInt("status", statusCode)
            respInfo.putString("reason", reason)
            respInfo.putMap("headers", buildHeadersMap(resp.headers))
            respInfo.putString("mimeType", mimeType)
            respInfo.putString("contentEncoding", encoding)
            try { respInfo.putDouble("contentLength", (body?.contentLength() ?: -1L).toDouble()) } catch (_: Throwable) {}
            payload.putMap("response", respInfo)

            emitEvent(view, payload, alsoBroadcast = true)
          } catch (_: Throwable) {}

          webResp
        } catch (_: Throwable) {
          // On error, fallback to default handling
          null
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
