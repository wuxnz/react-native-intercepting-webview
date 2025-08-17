#import "InterceptWebViewManager.h"
#import <WebKit/WebKit.h>
#import <React/RCTLog.h>
#import <objc/runtime.h>

@implementation InterceptWebViewManager

RCT_EXPORT_MODULE(RNInterceptWebView)

- (UIView *)view
{
	RNCWebView *view = (RNCWebView *)[super view];

	__weak WKWebView *wk = view.webView;
	id<WKNavigationDelegate> original = wk.navigationDelegate;

	@interface ProxyNavDelegate : NSObject<WKNavigationDelegate>
	@property(nonatomic, weak) id<WKNavigationDelegate> inner;
	@end
	static ProxyNavDelegate *proxy;
	if (!proxy) proxy = [ProxyNavDelegate new];
	proxy.inner = original;
	wk.navigationDelegate = (id<WKNavigationDelegate>)proxy;

	Method m = class_getInstanceMethod([ProxyNavDelegate class], @selector(webView:decidePolicyForNavigationResponse:decisionHandler:));
	if (!m) {
		class_addMethod([ProxyNavDelegate class], @selector(webView:decidePolicyForNavigationResponse:decisionHandler:), (IMP)decidePolicyForNavigationResponseIMP, "v@:@@?");
	}

	return view;
}

static void decidePolicyForNavigationResponseIMP(id self, SEL _cmd, WKWebView *webView, WKNavigationResponse *response, void (^decisionHandler)(WKNavigationResponsePolicy)) {
	id inner = [self valueForKey:@"inner"];
	if (inner && [inner respondsToSelector:_cmd]) {
		void (*innerImp)(id, SEL, WKWebView*, WKNavigationResponse*, void(^)(WKNavigationResponsePolicy)) = (void*)class_getMethodImplementation([inner class], _cmd);
		__block BOOL called = NO;
		innerImp(inner, _cmd, webView, response, ^(WKNavigationResponsePolicy policy){ called = YES; decisionHandler(policy); });
		if (!called) { decisionHandler(WKNavigationResponsePolicyAllow); }
	} else {
		decisionHandler(WKNavigationResponsePolicyAllow);
	}

	NSString *mime = response.response.MIMEType ?: @"";
	NSString *url = response.response.URL.absoluteString ?: @"";
	NSRegularExpression *re = [NSRegularExpression regularExpressionWithPattern:@"(\\.m3u8(\\?.*)?$)|(\\.mp4(\\?.*)?$)|(\\.webm(\\?.*)?$)|(\\.mpd(\\?.*)?$)|(\\.ts(\\?.*)?$)" options:NSRegularExpressionCaseInsensitive error:nil];
	NSUInteger matches = [re numberOfMatchesInString:url options:0 range:NSMakeRange(0, url.length)];
	BOOL mimeVideo = [mime containsString:@"video"] || [mime containsString:@"application/vnd.apple.mpegurl"];

	if (matches > 0 || mimeVideo) {
		NSString *payload = [NSString stringWithFormat:@"{\\\"__rnIntercept\\\":true,\\\"payload\\\":{\\\"kind\\\":\\\"native\\\",\\\"url\\\":\\\"%@\\\"}}", url];
		NSString *js = [NSString stringWithFormat:@"window.ReactNativeWebView.postMessage(\"%@\");", [payload stringByReplacingOccurrencesOfString:@"\\" withString:@"\\\\"]];
		[webView evaluateJavaScript:js completionHandler:nil];
	}
}

@end


