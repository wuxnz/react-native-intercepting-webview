package com.interceptingwebview

import android.graphics.Color
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.InterceptingWebviewViewManagerInterface
import com.facebook.react.viewmanagers.InterceptingWebviewViewManagerDelegate

@ReactModule(name = InterceptingWebviewViewManager.NAME)
class InterceptingWebviewViewManager : SimpleViewManager<InterceptingWebviewView>(),
  InterceptingWebviewViewManagerInterface<InterceptingWebviewView> {
  private val mDelegate: ViewManagerDelegate<InterceptingWebviewView>

  init {
    mDelegate = InterceptingWebviewViewManagerDelegate(this)
  }

  override fun getDelegate(): ViewManagerDelegate<InterceptingWebviewView>? {
    return mDelegate
  }

  override fun getName(): String {
    return NAME
  }

  public override fun createViewInstance(context: ThemedReactContext): InterceptingWebviewView {
    return InterceptingWebviewView(context)
  }

  @ReactProp(name = "color")
  override fun setColor(view: InterceptingWebviewView?, color: String?) {
    view?.setBackgroundColor(Color.parseColor(color))
  }

  companion object {
    const val NAME = "InterceptingWebviewView"
  }
}
