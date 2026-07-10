/// <reference lib="dom" />
import { ipcRenderer } from 'electron';

/**
 * Guest-page preload for the embedded Browser's <webview>. It runs in the guest page's isolated
 * world (node integration off), so it cannot read React's `__reactFiber$` expando properties — those
 * are only visible from the page's main world. So this preload injects a self-contained inspector
 * script into the main world and bridges it to the Forge renderer:
 *
 *   main world  --window.postMessage({__forgeInspect})-->  this preload  --sendToHost-->  BrowserView
 *   BrowserView --webview.send('forge:inspect:mode')-->    this preload  --postMessage-->  main world
 *
 * The inspector draws the hover overlay/tooltip, extracts DOM + React fiber + `data-forge-*`
 * metadata, and (in inspect mode) intercepts clicks. It degrades gracefully: no fiber → DOM + route
 * fallback still flows to Forge. Injecting an inline <script> can be blocked by a strict page CSP;
 * local dev servers rarely set one. This is development-tooling only.
 */

const HOST_TO_GUEST_MODE = 'forge:inspect:mode';
const GUEST_TO_HOST_SELECTION = 'forge:inspect:selection';
const GUEST_TO_HOST_NAV = 'forge:inspect:nav';
// Browser Debug capture (console/errors + network) and its host→guest config.
const GUEST_TO_HOST_CONSOLE = 'forge:debug:console';
const GUEST_TO_HOST_NETWORK = 'forge:debug:network';
const HOST_TO_GUEST_DEBUG_CONFIG = 'forge:debug:config';

/** Source of the main-world inspector, injected as a <script>. Self-contained; no imports. */
const INSPECTOR_SOURCE = `(() => {
  if (window.__forgeInspector) return;
  const HL_ID = '__forge_inspect_overlay__';
  const TIP_ID = '__forge_inspect_tooltip__';
  let enabled = false;
  let overlay = null;
  let tooltip = null;
  let raf = 0;

  function ensureEls() {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = HL_ID;
      overlay.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #7c8cff;background:rgba(124,140,255,0.14);border-radius:3px;transition:all 40ms ease;display:none;box-sizing:border-box;';
      tooltip = document.createElement('div');
      tooltip.id = TIP_ID;
      tooltip.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;background:#14141b;color:#e6e6ef;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;padding:6px 8px;border-radius:6px;max-width:420px;box-shadow:0 6px 24px rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.08);white-space:pre;display:none;';
      const attach = () => { document.body.appendChild(overlay); document.body.appendChild(tooltip); };
      if (document.body) attach(); else document.addEventListener('DOMContentLoaded', attach, { once: true });
    }
  }

  function fiberOf(el) {
    const keys = Object.keys(el);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactInternalInstance$') === 0) return el[k];
    }
    return null;
  }

  function nameOfType(type) {
    if (!type || typeof type === 'string') return null;
    if (typeof type === 'function') return type.displayName || type.name || null;
    // forwardRef / memo wrappers
    if (type.displayName) return type.displayName;
    if (type.render) return type.render.displayName || type.render.name || null;
    if (type.type) return nameOfType(type.type);
    return null;
  }

  function extractReact(el) {
    let fiber = fiberOf(el);
    if (!fiber) return undefined;
    let source;
    let nearest = null;
    const ownerChain = [];
    let node = fiber;
    let hops = 0;
    while (node && hops < 60) {
      // Prefer the nearest source that points into the project, not a library's own
      // internals (e.g. MUI). A node_modules _debugSource is never "where it's used".
      if (!source && node._debugSource && node._debugSource.fileName && node._debugSource.fileName.indexOf('node_modules') === -1) source = node._debugSource;
      const nm = nameOfType(node.type);
      if (nm) {
        if (!nearest) nearest = nm;
        if (ownerChain[ownerChain.length - 1] !== nm) ownerChain.push(nm);
      }
      node = node.return;
      hops++;
    }
    const props = fiber.memoizedProps || {};
    const propsKeys = Object.keys(props).filter((k) => k !== 'children').slice(0, 24);
    const react = { componentName: nearest || undefined, displayName: nearest || undefined, ownerChain: ownerChain.slice(0, 10), propsKeys: propsKeys };
    if (source && source.fileName) react.source = { fileName: source.fileName, lineNumber: source.lineNumber, columnNumber: source.columnNumber };
    return react;
  }

  function forgeMeta(el) {
    const host = el.closest && el.closest('[data-forge-source-file],[data-forge-component]');
    if (!host) return undefined;
    const g = (n) => host.getAttribute(n) || undefined;
    const line = g('data-forge-source-line');
    const col = g('data-forge-source-column');
    return {
      component: g('data-forge-component'),
      sourceFile: g('data-forge-source-file'),
      line: line ? parseInt(line, 10) : undefined,
      column: col ? parseInt(col, 10) : undefined,
    };
  }

  function domInfo(el) {
    const r = el.getBoundingClientRect();
    const cls = typeof el.className === 'string' ? el.className : (el.getAttribute && el.getAttribute('class')) || '';
    const text = (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80);
    return {
      tagName: (el.tagName || '').toLowerCase(),
      id: el.id || undefined,
      className: cls || undefined,
      text: text || undefined,
      role: (el.getAttribute && el.getAttribute('role')) || undefined,
      ariaLabel: (el.getAttribute && el.getAttribute('aria-label')) || undefined,
      boundingBox: { x: r.x, y: r.y, width: r.width, height: r.height },
    };
  }

  function selectionFor(el, phase) {
    const react = extractReact(el);
    const forgeMetadata = forgeMeta(el);
    let confidence = 'low';
    if ((forgeMetadata && forgeMetadata.sourceFile) || (react && react.source && react.source.fileName)) confidence = 'high';
    else if (react && react.componentName) confidence = 'medium';
    return {
      phase: phase,
      url: location.href,
      routePath: location.pathname,
      dom: domInfo(el),
      react: react,
      forgeMetadata: forgeMetadata,
      confidence: confidence,
    };
  }

  function drawOverlay(el, sel) {
    ensureEls();
    const r = el.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.left = r.left + 'px';
    overlay.style.top = r.top + 'px';
    overlay.style.width = r.width + 'px';
    overlay.style.height = r.height + 'px';
    const comp = (sel.forgeMetadata && sel.forgeMetadata.component) || (sel.react && sel.react.componentName) || 'Unknown';
    const file = (sel.forgeMetadata && sel.forgeMetadata.sourceFile) || (sel.react && sel.react.source && sel.react.source.fileName) || '';
    let label = 'Component: ' + comp;
    if (file) label += '\\nFile: ' + file;
    label += '\\nRoute: ' + sel.routePath + '\\nDOM: ' + sel.dom.tagName + (sel.dom.className ? '.' + String(sel.dom.className).split(' ').filter(Boolean).slice(0, 2).join('.') : '');
    tooltip.textContent = label;
    tooltip.style.display = 'block';
    const tx = Math.min(r.left, window.innerWidth - tooltip.offsetWidth - 8);
    const ty = r.top > 60 ? r.top - tooltip.offsetHeight - 8 : r.bottom + 8;
    tooltip.style.left = Math.max(4, tx) + 'px';
    tooltip.style.top = Math.max(4, ty) + 'px';
  }

  function hideOverlay() {
    if (overlay) overlay.style.display = 'none';
    if (tooltip) tooltip.style.display = 'none';
  }

  function post(kind, payload) {
    window.postMessage({ __forgeInspect: true, kind: kind, payload: payload }, '*');
  }

  // ── Browser Debug capture ──────────────────────────────────────────────────
  // Wraps console/error/fetch/XHR to stream debug events to Forge. Everything is best-effort and
  // wrapped in try/catch so a capture bug can never break the guest app. Payloads are made
  // structured-clone safe (strings only for args/bodies) before posting.
  var debugCfg = { captureConsole: true, captureNetwork: true, captureRequestBodies: true, captureResponseBodies: true, maxBodyBytes: 512 * 1024 };
  var __seq = 0;
  function nextId() { __seq++; return 'be_' + Date.now().toString(36) + '_' + __seq.toString(36); }

  function safeArg(a) {
    try {
      if (a instanceof Error) return a.stack || (a.name + ': ' + a.message);
      if (typeof a === 'string') return a;
      if (a === null) return 'null';
      if (typeof a === 'undefined') return 'undefined';
      if (typeof a === 'object') { var s = JSON.stringify(a); return typeof s === 'string' ? s : Object.prototype.toString.call(a); }
      return String(a);
    } catch (e) { try { return Object.prototype.toString.call(a); } catch (e2) { return '[unserializable]'; } }
  }

  function clip(s) {
    if (typeof s !== 'string') return undefined;
    return s.length > debugCfg.maxBodyBytes ? s.slice(0, debugCfg.maxBodyBytes) : s;
  }

  // A lightweight guest-side source hint from the first non-node_modules stack frame; the host
  // re-parses the full stack, this just speeds up the common case.
  function firstFrameSource(stack) {
    if (!stack || typeof stack !== 'string') return undefined;
    var lines = stack.split('\\n');
    for (var i = 0; i < lines.length; i++) {
      var m = /\\(?([^\\s()]+):(\\d+):(\\d+)\\)?\\s*$/.exec(lines[i].trim());
      if (m && m[1].indexOf('node_modules') === -1) return { fileName: m[1], lineNumber: parseInt(m[2], 10), columnNumber: parseInt(m[3], 10) };
    }
    return undefined;
  }

  function classifyType(url, body) {
    var path = url;
    try { path = new URL(url, location.href).pathname; } catch (e) {}
    if (/\\/graphql\\b/i.test(path)) return 'graphql';
    if (typeof body === 'string' && body.indexOf('"query"') !== -1) return 'graphql';
    if (/\\.(js|mjs|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|eot|map|mp4|webm|avif)(\\?|$)/i.test(path)) return 'asset';
    return 'unknown';
  }

  function headersToObj(h) {
    var out = {};
    try {
      if (!h) return out;
      if (typeof Headers !== 'undefined' && h instanceof Headers) { h.forEach(function (v, k) { out[k] = v; }); return out; }
      if (Array.isArray(h)) { h.forEach(function (p) { out[p[0]] = p[1]; }); return out; }
      Object.keys(h).forEach(function (k) { out[k] = String(h[k]); });
    } catch (e) {}
    return out;
  }
  function responseHeadersToObj(h) {
    var out = {};
    try { if (h && h.forEach) h.forEach(function (v, k) { out[k] = v; }); } catch (e) {}
    return out;
  }
  function parseRawHeaders(raw) {
    var out = {};
    if (!raw) return out;
    raw.trim().split(/[\\r\\n]+/).forEach(function (line) {
      var i = line.indexOf(':');
      if (i > 0) out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    });
    return out;
  }

  function installConsole() {
    var map = { error: 'error', warn: 'warning', info: 'info' };
    Object.keys(map).forEach(function (method) {
      var orig = console[method];
      if (typeof orig !== 'function') return;
      console[method] = function () {
        try {
          if (debugCfg.captureConsole) {
            var args = Array.prototype.slice.call(arguments);
            var strs = args.map(safeArg);
            var errArg = null;
            for (var i = 0; i < args.length; i++) { if (args[i] instanceof Error) { errArg = args[i]; break; } }
            post('console', {
              id: nextId(), level: map[method],
              message: strs.join(' ').slice(0, 4000), args: strs.slice(0, 12),
              stack: errArg ? errArg.stack : undefined,
              url: location.href, routePath: location.pathname,
              source: errArg ? firstFrameSource(errArg.stack) : undefined,
              timestamp: Date.now(),
            });
          }
        } catch (e) {}
        return orig.apply(console, arguments); // never recurse — original preserved
      };
    });

    window.addEventListener('error', function (ev) {
      if (!debugCfg.captureConsole) return;
      // Ignore resource-load errors (img/script/link) — they carry no message/error.
      if (!ev.error && !ev.message) return;
      try {
        var err = ev.error;
        post('console', {
          id: nextId(), level: 'error',
          message: ev.message || (err && err.message) || 'Uncaught error',
          stack: err && err.stack, args: undefined,
          url: location.href, routePath: location.pathname,
          source: ev.filename ? { fileName: ev.filename, lineNumber: ev.lineno, columnNumber: ev.colno } : (err ? firstFrameSource(err.stack) : undefined),
          timestamp: Date.now(),
        });
      } catch (e) {}
    }, true);

    window.addEventListener('unhandledrejection', function (ev) {
      if (!debugCfg.captureConsole) return;
      try {
        var r = ev.reason;
        var msg = (r && r.message) ? r.message : safeArg(r);
        post('console', {
          id: nextId(), level: 'error',
          message: 'Unhandled promise rejection: ' + msg,
          stack: r && r.stack, args: undefined,
          url: location.href, routePath: location.pathname,
          source: (r && r.stack) ? firstFrameSource(r.stack) : undefined,
          timestamp: Date.now(),
        });
      } catch (e) {}
    });
  }

  function installNetwork() {
    var origFetch = window.fetch;
    if (typeof origFetch === 'function') {
      window.fetch = function (input, init) {
        if (!debugCfg.captureNetwork) return origFetch.apply(this, arguments);
        var started = Date.now();
        var id = nextId();
        var method = (init && init.method) || (input && input.method) || 'GET';
        var url = (typeof input === 'string') ? input : (input && input.url) || String(input);
        try { url = new URL(url, location.href).href; } catch (e) {}
        var reqBody = (debugCfg.captureRequestBodies && init && typeof init.body === 'string') ? clip(init.body) : undefined;
        var reqHeaders = headersToObj(init && init.headers);
        var type = classifyType(url, reqBody);
        return origFetch.apply(this, arguments).then(function (res) {
          try {
            var ended = Date.now();
            var resHeaders = responseHeadersToObj(res.headers);
            var ct = (res.headers && res.headers.get) ? (res.headers.get('content-type') || '') : '';
            var isAsset = /^(image|font|video|audio)\\//.test(ct) || type === 'asset';
            var base = {
              id: id, url: url, method: method, status: res.status, statusText: res.statusText,
              requestHeaders: reqHeaders, responseHeaders: resHeaders, requestBody: reqBody,
              durationMs: ended - started, startedAt: started, endedAt: ended,
              routePath: location.pathname, type: type,
            };
            if (!debugCfg.captureResponseBodies || isAsset) { post('network', base); }
            else {
              res.clone().text().then(function (t) {
                base.responseTruncated = t.length > debugCfg.maxBodyBytes;
                base.responseBody = base.responseTruncated ? t.slice(0, debugCfg.maxBodyBytes) : t;
                post('network', base);
              }, function () { post('network', base); });
            }
          } catch (e) {}
          return res;
        }, function (err) {
          try {
            var ended2 = Date.now();
            post('network', {
              id: id, url: url, method: method, requestHeaders: reqHeaders, requestBody: reqBody,
              durationMs: ended2 - started, startedAt: started, endedAt: ended2,
              routePath: location.pathname, type: type,
              error: (err && err.message) ? err.message : String(err),
            });
          } catch (e) {}
          throw err;
        });
      };
    }

    var XHR = window.XMLHttpRequest;
    if (XHR && XHR.prototype) {
      var open = XHR.prototype.open, send = XHR.prototype.send, setHeader = XHR.prototype.setRequestHeader;
      XHR.prototype.open = function (method, url) {
        var abs = url;
        try { abs = new URL(url, location.href).href; } catch (e) {}
        this.__forgeDbg = { method: method, url: abs, headers: {}, started: 0 };
        return open.apply(this, arguments);
      };
      XHR.prototype.setRequestHeader = function (k, v) {
        if (this.__forgeDbg) this.__forgeDbg.headers[k] = v;
        return setHeader.apply(this, arguments);
      };
      XHR.prototype.send = function (body) {
        var d = this.__forgeDbg;
        if (debugCfg.captureNetwork && d) {
          d.started = Date.now();
          var id = nextId();
          var reqBody = (debugCfg.captureRequestBodies && typeof body === 'string') ? clip(body) : undefined;
          var self = this;
          var type = classifyType(d.url, reqBody);
          this.addEventListener('loadend', function () {
            try {
              var ended = Date.now();
              var resHeaders = parseRawHeaders(self.getAllResponseHeaders ? self.getAllResponseHeaders() : '');
              var ct = resHeaders['content-type'] || '';
              var isAsset = /^(image|font|video|audio)\\//.test(ct) || type === 'asset';
              var respBody = undefined, truncated = false;
              if (debugCfg.captureResponseBodies && !isAsset) {
                try {
                  var rt = (self.responseType === '' || self.responseType === 'text') ? self.responseText : undefined;
                  if (typeof rt === 'string') { truncated = rt.length > debugCfg.maxBodyBytes; respBody = truncated ? rt.slice(0, debugCfg.maxBodyBytes) : rt; }
                } catch (e) {}
              }
              post('network', {
                id: id, url: d.url, method: d.method,
                status: self.status || undefined, statusText: self.statusText || undefined,
                requestHeaders: d.headers, responseHeaders: resHeaders, requestBody: reqBody,
                responseBody: respBody, responseTruncated: truncated,
                durationMs: ended - d.started, startedAt: d.started, endedAt: ended,
                routePath: location.pathname, type: type,
                error: self.status === 0 ? 'Request failed (status 0 — network error or CORS)' : undefined,
              });
            } catch (e) {}
          });
        }
        return send.apply(this, arguments);
      };
    }
  }

  function applyDebugConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return;
    if (typeof cfg.captureConsole === 'boolean') debugCfg.captureConsole = cfg.captureConsole;
    if (typeof cfg.captureNetwork === 'boolean') debugCfg.captureNetwork = cfg.captureNetwork;
    if (typeof cfg.captureRequestBodies === 'boolean') debugCfg.captureRequestBodies = cfg.captureRequestBodies;
    if (typeof cfg.captureResponseBodies === 'boolean') debugCfg.captureResponseBodies = cfg.captureResponseBodies;
    if (typeof cfg.maxBodyKb === 'number' && cfg.maxBodyKb > 0) debugCfg.maxBodyBytes = cfg.maxBodyKb * 1024;
  }

  installConsole();
  installNetwork();

  function onMove(e) {
    if (!enabled) return;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el.id === HL_ID || el.id === TIP_ID) return;
      const sel = selectionFor(el, 'hover');
      drawOverlay(el, sel);
      post('selection', sel);
    });
  }

  function onClick(e) {
    if (!enabled) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    if (!el) return;
    post('selection', selectionFor(el, 'click'));
  }

  function setEnabled(on) {
    enabled = !!on;
    if (enabled) {
      document.documentElement.style.setProperty('cursor', 'crosshair', 'important');
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('click', onClick, true);
    } else {
      document.documentElement.style.removeProperty('cursor');
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      hideOverlay();
    }
  }

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.__forgeCmd !== true) return;
    if (d.cmd === 'mode') setEnabled(d.on);
    else if (d.cmd === 'debugConfig') applyDebugConfig(d.config);
  });

  window.__forgeInspector = { setEnabled: setEnabled };
  post('ready', { url: location.href, routePath: location.pathname });
})();`;

function inject(): void {
  try {
    const script = document.createElement('script');
    script.textContent = INSPECTOR_SOURCE;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  } catch {
    /* CSP or timing — inspector unavailable, host still has route/URL fallbacks */
  }
}

if (document.documentElement) inject();
else document.addEventListener('DOMContentLoaded', inject, { once: true });

// main world -> host
window.addEventListener('message', (e) => {
  const d = e.data as { __forgeInspect?: boolean; kind?: string; payload?: unknown };
  if (!d || d.__forgeInspect !== true) return;
  if (d.kind === 'selection') ipcRenderer.sendToHost(GUEST_TO_HOST_SELECTION, d.payload);
  else if (d.kind === 'ready') ipcRenderer.sendToHost(GUEST_TO_HOST_NAV, d.payload);
  else if (d.kind === 'console') ipcRenderer.sendToHost(GUEST_TO_HOST_CONSOLE, d.payload);
  else if (d.kind === 'network') ipcRenderer.sendToHost(GUEST_TO_HOST_NETWORK, d.payload);
});

// host -> main world
ipcRenderer.on(HOST_TO_GUEST_MODE, (_e, on: boolean) => {
  window.postMessage({ __forgeCmd: true, cmd: 'mode', on }, '*');
});
ipcRenderer.on(HOST_TO_GUEST_DEBUG_CONFIG, (_e, config: unknown) => {
  window.postMessage({ __forgeCmd: true, cmd: 'debugConfig', config }, '*');
});
