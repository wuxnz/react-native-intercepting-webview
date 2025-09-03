/**
 * Build the JavaScript source string to inject into the page.
 *
 * The injected code:
 * - Hooks into HTMLMediaElement sources to observe media URLs.
 * - Optionally echoes all JS-initiated requests (fetch/xhr).
 * - Samples the Performance API to catch resource URLs.
 * - Sends events through `window.ReactNativeWebView.postMessage` with a queue fallback.
 *
 * @param opts.aggressiveDomHooking When true, attach a MutationObserver to aggressively hook new nodes.
 * @param opts.echoAllRequestsFromJS When true, echo all fetch/xhr URLs to React Native.
 * @returns JavaScript source as a string to inject into the WebView.
 */
export function buildInjected(opts: {
  aggressiveDomHooking: boolean;
  echoAllRequestsFromJS: boolean;
}): string {
  const { aggressiveDomHooking, echoAllRequestsFromJS } = opts;
  return `
(function(){
  var ECHO_ALL = ${echoAllRequestsFromJS ? 'true' : 'false'};

  // Robust postMessage -> React Native with queuing until bridge is ready
  try { window.__rnInterceptQueue = window.__rnInterceptQueue || []; } catch(e) {}
  function _emit(payload){
    try{
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage){
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      } else {
        window.__rnInterceptQueue.push(JSON.stringify(payload));
      }
      try { console.log('__RNINT__:' + JSON.stringify(payload)); } catch(e) {}
    }catch(e){}
  }
  function _drain(){
    try{
      if (!(window.ReactNativeWebView && window.ReactNativeWebView.postMessage)) return;
      var q = window.__rnInterceptQueue || [];
      while(q.length){
        try{ window.ReactNativeWebView.postMessage(q.shift()); }catch(e){ break; }
      }
    }catch(e){}
  }
  try{ document.addEventListener('DOMContentLoaded', _drain, { once: true }); }catch(e){}
  try{ setTimeout(_drain, 0); }catch(e){}

  function post(kind, url){
    try{ _emit({ __rnIntercept: true, payload: { kind: String(kind||'dom'), url: String(url||'') } }); }catch(e){}
  }

  function isMediaLike(url){
    try{ url = String(url || ''); }catch(e){ return false; }
    return /(\.m3u8(\?.*)?$)|(\.mp4(\?.*)?$)|(\.webm(\?.*)?$)|(\.mpd(\?.*)?$)|(\.ts(\?.*)?$)/i.test(url);
  }

  function hookVideoEl(v){
    if (!v || v.__rn_hooked) return; v.__rn_hooked = true;
    function emit(){
      try {
        var src = v.currentSrc || v.src;
        if (src && (isMediaLike(src) || ECHO_ALL)) post('video', src);
      } catch(e){}
    }
    emit();
    v.addEventListener('loadedmetadata', emit, { passive: true });
    v.addEventListener('loadstart', emit, { passive: true });
    var desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    if (desc && desc.set) {
      try {
        Object.defineProperty(v, 'src', {
          set: function(val){ try{ post('video', val); }catch(e){} return desc.set.call(this, val); },
          get: function(){ return desc.get.call(this); }
        });
      } catch(e) {}
    }
  }

  function scanDoc(doc){
    try{
      var vids = doc.getElementsByTagName('video');
      for (var i=0;i<vids.length;i++) hookVideoEl(vids[i]);
      var sources = doc.getElementsByTagName('source');
      for (var k=0;k<sources.length;k++){
        try{ var p = sources[k].parentElement; if (p && p.tagName==='VIDEO') hookVideoEl(p); }catch(e){}
      }
    }catch(e){}
  }

  function hookIframes(){
    try{
      var ifr = document.getElementsByTagName('iframe');
      for (var i=0;i<ifr.length;i++){
        var f = ifr[i];
        try{ scanDoc(f.contentDocument); }catch(e){}
        try{ f.addEventListener('load', function(){ try{ scanDoc(this.contentDocument); }catch(e){} }, { passive: true }); }catch(e){}
      }
    }catch(e){}
  }

  scanDoc(document);
  hookIframes();

  // Optional network hooks for JS requests (works under Fabric/newArch)
  if (ECHO_ALL) {
    // fetch
    try {
      var _fetch = window.fetch;
      window.fetch = function(){
        try{
          var arg0 = arguments && arguments[0];
          var url = (typeof arg0 === 'string') ? arg0 : (arg0 && arg0.url);
          if (url) post('fetch', url);
        }catch(e){}
        return _fetch.apply(this, arguments);
      };
    } catch(e) {}

    // XHR
    try {
      var _open = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url){
        try{ if (url) post('xhr', url); }catch(e){}
        return _open.apply(this, arguments);
      };
    } catch(e) {}
  }

  // Performance API sampling to catch resource URLs (including cross-origin)
  try {
    var __rn_seen = new Set();
    function samplePerf(){
      try{
        var list = (performance && performance.getEntriesByType) ? performance.getEntriesByType('resource') : [];
        for (var i=0;i<list.length;i++){
          var e = list[i];
          var url = e && (e.name || e.initiatorType);
          if (!url) continue;
          if (!__rn_seen.has(url)){
            __rn_seen.add(url);
            post('perf', url);
          }
        }
      }catch(e){}
      try{ setTimeout(samplePerf, 1000); }catch(e){}
    }
    setTimeout(samplePerf, 500);
  }catch(e){}

  ${
    aggressiveDomHooking
      ? `
  try{
    var mo = new MutationObserver(function(muts){
      for (var i=0;i<muts.length;i++){
        var nodes = muts[i].addedNodes;
        for (var j=0;j<nodes.length;j++){
          var n = nodes[j];
          try{
            if (n.tagName === 'VIDEO') hookVideoEl(n);
            if (n.tagName === 'SOURCE' && n.parentElement && n.parentElement.tagName==='VIDEO') hookVideoEl(n.parentElement);
            if (n.tagName === 'IFRAME' && n.contentDocument) scanDoc(n.contentDocument);
            if (n.querySelectorAll){
              var vs = n.querySelectorAll('video'); for (var x=0;x<vs.length;x++) hookVideoEl(vs[x]);
              var ss = n.querySelectorAll('source'); for (var s=0;s<ss.length;s++){ try{ var pe = ss[s].parentElement; if (pe && pe.tagName==='VIDEO') hookVideoEl(pe);}catch(e){} }
              var fs = n.querySelectorAll('iframe'); for (var y=0;y<fs.length;y++) try{ scanDoc(fs[y].contentDocument); }catch(e){}
            }
          }catch(e){}
        }
      }
    });
    mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }catch(e){}
  `
      : ''
  }
})();
true;`;
}
