/**
 * cat-catch Projector v11 网页悬浮按钮
 *
 * 页面右下角悬浮「投影」按钮：有可投影资源时显示（含数量角标），
 * 左键点击在全局侧边栏打开投影播放器，右键按住拖动可改变位置（位置持久化）。
 *
 * v11 优化：去掉 v10 的每 1.5s 轮询，改为 background 主动 push
 * （save() 存入新资源时发送 projector-candidates-changed），
 * 仅保留 15s 慢轮询做兜底（防止漏掉 push）。
 * 保留 v10.6 的 Extension context invalidated 自动清理。
 */
(function () {
    'use strict';

    if (window.top !== window) {
        return;
    }

    var ID = 'catcatch-projector-float-v11';
    var POS_KEY = 'CatCatchProjectorFloatPos';
    var FALLBACK_POLL_MS = 15000;

    var btn = null;
    var styleEl = null;
    var refreshTimer = 0;
    var alive = true;

    var down = false;
    var drag = false;
    var sx = 0;
    var sy = 0;
    var ox = 0;
    var oy = 0;
    var moved = false;

    var listeners = [];
    var chromeListeners = [];

    function hasExtensionContext() {
        try {
            return !!(chrome && chrome.runtime && chrome.runtime.id);
        } catch (e) {
            return false;
        }
    }

    function isContextInvalidatedError(error) {
        var text = String((error && error.message) || error || '');
        return text.indexOf('Extension context invalidated') !== -1 ||
            text.indexOf('context invalidated') !== -1 ||
            text.indexOf('Extension context') !== -1;
    }

    function cleanup() {
        if (!alive) {
            return;
        }
        alive = false;

        try {
            if (refreshTimer) {
                clearInterval(refreshTimer);
            }
        } catch (e) {}
        refreshTimer = 0;

        for (var i = 0; i < listeners.length; i++) {
            var item = listeners[i];
            try {
                item.target.removeEventListener(item.type, item.listener, item.options);
            } catch (e) {}
        }
        listeners.length = 0;

        for (var j = 0; j < chromeListeners.length; j++) {
            try {
                chromeListeners[j].event.removeListener(chromeListeners[j].listener);
            } catch (e) {}
        }
        chromeListeners.length = 0;

        try {
            if (btn) {
                btn.remove();
            }
        } catch (e) {}
        try {
            if (styleEl) {
                styleEl.remove();
            }
        } catch (e) {}

        btn = null;
        styleEl = null;
    }

    function addListener(target, type, listener, options) {
        try {
            target.addEventListener(type, listener, options);
            listeners.push({ target: target, type: type, listener: listener, options: options });
        } catch (e) {}
    }

    // chrome.* 事件不是 DOM EventTarget，走独立的注册/清理通道
    function addChromeListener(chromeEvent, listener) {
        try {
            chromeEvent.addListener(listener);
            chromeListeners.push({ event: chromeEvent, listener: listener });
        } catch (e) {}
    }

    function safeRuntimeSendMessage(message, callback) {
        if (!alive || !hasExtensionContext()) {
            cleanup();
            return;
        }
        try {
            chrome.runtime.sendMessage(message, function (response) {
                try {
                    if (chrome.runtime.lastError) {
                        var err = chrome.runtime.lastError.message || '';
                        if (err.indexOf('Extension context invalidated') !== -1 ||
                            err.indexOf('context invalidated') !== -1) {
                            cleanup();
                        }
                        return;
                    }
                } catch (e) {
                    cleanup();
                    return;
                }
                if (alive && callback) {
                    callback(response);
                }
            });
        } catch (e) {
            if (isContextInvalidatedError(e)) {
                cleanup();
            }
        }
    }

    function safeStorageGet(defaults, callback) {
        if (!alive || !hasExtensionContext()) {
            cleanup();
            return;
        }
        try {
            chrome.storage.local.get(defaults, function (response) {
                try {
                    if (chrome.runtime.lastError) {
                        return;
                    }
                } catch (e) {
                    cleanup();
                    return;
                }
                if (alive && callback) {
                    callback(response);
                }
            });
        } catch (e) {
            if (isContextInvalidatedError(e)) {
                cleanup();
            }
        }
    }

    function safeStorageSet(value) {
        if (!alive || !hasExtensionContext()) {
            cleanup();
            return;
        }
        try {
            chrome.storage.local.set(value, function () {
                try {
                    if (chrome.runtime.lastError) {
                        /* 忽略 */
                    }
                } catch (e) {
                    cleanup();
                }
            });
        } catch (e) {
            if (isContextInvalidatedError(e)) {
                cleanup();
            }
        }
    }

    function create() {
        if (!alive || !hasExtensionContext()) {
            cleanup();
            return;
        }
        if (document.getElementById(ID)) {
            return;
        }
        var root = document.documentElement || document.body;
        if (!root) {
            setTimeout(create, 200);
            return;
        }

        btn = document.createElement('div');
        btn.id = ID;
        btn.innerHTML = '<span class="ccpf-icon">▶</span><span class="ccpf-text">投影</span><span class="badge"></span>';
        btn.title = '左键投影；右键按住拖动位置';

        Object.assign(btn.style, {
            position: 'fixed',
            right: '18px',
            top: '45%',
            zIndex: '2147483647',
            height: '34px',
            minWidth: '76px',
            padding: '0 12px',
            borderRadius: '999px',
            display: 'none',
            alignItems: 'center',
            gap: '6px',
            background: 'linear-gradient(135deg,#2f80ff,#7c3aed)',
            color: '#fff',
            fontSize: '13px',
            fontWeight: '700',
            boxShadow: '0 8px 22px rgba(47,128,255,.35)',
            cursor: 'pointer',
            userSelect: 'none',
            fontFamily: 'Arial,"Microsoft YaHei",sans-serif',
            backdropFilter: 'blur(6px)',
            transition: 'transform .15s ease, opacity .15s ease, box-shadow .15s ease'
        });

        styleEl = document.createElement('style');
        styleEl.textContent =
            '#' + ID + ':hover{transform:scale(1.04);box-shadow:0 10px 26px rgba(47,128,255,.45)}' +
            '#' + ID + ' .ccpf-icon{font-size:13px;line-height:1}' +
            '#' + ID + ' .badge{display:none;background:#fff;color:#2f56d6;border-radius:999px;padding:1px 6px;font-size:11px;font-weight:800}';

        root.appendChild(styleEl);
        root.appendChild(btn);

        var key = {};
        key[POS_KEY] = null;
        safeStorageGet(key, function (response) {
            if (!alive || !btn) {
                return;
            }
            var pos = response && response[POS_KEY];
            if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
                btn.style.left = pos.x + 'px';
                btn.style.top = pos.y + 'px';
                btn.style.right = 'auto';
            }
        });

        bind();
    }

    function bind() {
        addListener(btn, 'contextmenu', function (event) {
            event.preventDefault();
            return false;
        }, true);

        addListener(btn, 'mousedown', function (event) {
            if (!alive || !btn) {
                return;
            }
            if (event.button === 2) {
                event.preventDefault();
                down = true;
                drag = true;
                moved = false;
                sx = event.clientX;
                sy = event.clientY;
                var rect = btn.getBoundingClientRect();
                ox = rect.left;
                oy = rect.top;
                btn.style.transition = 'none';
                btn.style.opacity = '.86';
                return;
            }
            if (event.button === 0) {
                down = true;
                drag = false;
                moved = false;
                sx = event.clientX;
                sy = event.clientY;
            }
        }, true);

        addListener(document, 'mousemove', function (event) {
            if (!alive || !down || !drag || !btn) {
                return;
            }
            event.preventDefault();
            var dx = event.clientX - sx;
            var dy = event.clientY - sy;
            if (Math.abs(dx) + Math.abs(dy) > 3) {
                moved = true;
            }
            var x = Math.max(0, Math.min(window.innerWidth - btn.offsetWidth, ox + dx));
            var y = Math.max(0, Math.min(window.innerHeight - btn.offsetHeight, oy + dy));
            btn.style.left = x + 'px';
            btn.style.top = y + 'px';
            btn.style.right = 'auto';
        }, true);

        addListener(document, 'mouseup', function (event) {
            if (!alive || !down) {
                return;
            }
            var wasDragging = drag;
            down = false;
            drag = false;
            if (btn) {
                btn.style.transition = 'transform .15s ease, opacity .15s ease, box-shadow .15s ease';
                btn.style.opacity = '1';
            }
            if (wasDragging && btn) {
                var rect = btn.getBoundingClientRect();
                var val = {};
                val[POS_KEY] = { x: rect.left, y: rect.top };
                safeStorageSet(val);
                return;
            }
            if (event.button === 0 && !moved) {
                openProjector();
            }
        }, true);

        // v11: background 主动 push（projector-candidates-changed）时立即刷新
        addChromeListener(chrome.runtime.onMessage, function (message) {
            if (message && message.Message === 'projector-candidates-changed') {
                refresh();
            }
        });
    }

    function refresh() {
        if (!alive) {
            return;
        }
        if (!hasExtensionContext()) {
            cleanup();
            return;
        }
        safeRuntimeSendMessage({ Message: 'projector-get-candidates-count' }, function (response) {
            if (!alive || !btn || !response || !response.ok) {
                return;
            }
            var count = Number(response.count || 0);
            var badge = btn.querySelector('.badge');
            if (count > 0) {
                btn.style.display = 'flex';
                if (count > 1) {
                    badge.textContent = String(count);
                    badge.style.display = 'inline-block';
                } else {
                    badge.textContent = '';
                    badge.style.display = 'none';
                }
            } else {
                btn.style.display = 'none';
            }
        });
    }

    function openProjector() {
        safeRuntimeSendMessage({ Message: 'projector-open-from-tab' }, function () {});
    }

    function start() {
        try {
            if (!hasExtensionContext()) {
                cleanup();
                return;
            }
            create();
            refresh();
            // 兜底慢轮询：防止漏掉 background 的 push
            refreshTimer = setInterval(refresh, FALLBACK_POLL_MS);
        } catch (e) {
            if (isContextInvalidatedError(e)) {
                cleanup();
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
