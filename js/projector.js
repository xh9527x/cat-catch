/**
 * cat-catch Projector v11 popup 适配器
 * 在 popup 每条可投影资源后追加「投影」按钮，点击后在全局侧边栏打开投影播放器。
 *
 * v11 优化：去掉 v10 的 setInterval(scan, 800) 常驻全量扫描，
 * 改为 MutationObserver + rAF 防抖（popup.js 渲染列表必然触发 DOM 变更）。
 * 依赖：js/projector-common.js（须先加载）、popup.js 的 getAllData()。
 */
(function () {
    'use strict';

    var PC = (typeof globalThis !== 'undefined' ? globalThis : window).CatCatchProjectorCommon;
    var BUTTON_CLASS = 'projectorButton';

    function getTabId() {
        try {
            if (typeof G !== 'undefined' && G.tabId) {
                return Number(G.tabId);
            }
        } catch (e) {}
        return 0;
    }

    function openProjector(data) {
        var tabId = Number(data.tabId || getTabId());
        if (!tabId || !PC) {
            return;
        }
        var list = [];
        if (typeof getAllData === 'function') {
            list = PC.sortProjectorCandidates(getAllData().filter(function (x) {
                return Number(x.tabId) === tabId;
            }), false);
        }
        if (!list.length) {
            list = [PC.cloneProjectorItem(data)];
        }
        var req = data.requestId ? String(data.requestId) : '';
        var idx = list.findIndex(function (x) { return String(x.requestId) === req; });
        if (idx < 0) {
            idx = 0;
        }
        chrome.runtime.sendMessage({
            Message: 'projector-open-session',
            snapshot: {
                sourceTabId: tabId,
                selectedRequestId: req,
                selectedIndex: idx,
                pageTitle: data.title || data._title || '',
                pageUrl: data.webUrl || '',
                list: list
            }
        }, function () {
            if (chrome.runtime.lastError) {
                /* 忽略：background 可能尚未就绪 */
            }
        });
        try {
            chrome.sidePanel.open({ tabId: tabId }, function () {
                if (chrome.runtime.lastError) {
                    /* 忽略 */
                }
            });
        } catch (e) {}
    }

    function attach(data) {
        if (!PC.isProjectorPlayable(data) || !data.html || !data.html.find) {
            return;
        }
        if (data.html.find('.' + BUTTON_CLASS).length) {
            return; // 已附加
        }
        var b = document.createElement('button');
        b.className = BUTTON_CLASS;
        b.textContent = '投影';
        b.title = '在侧边栏投影播放';
        b.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            openProjector(data);
            return false;
        });
        var play = data.html.find('#play');
        if (play.length) {
            play.after(b);
        } else {
            data.html.find('.panel-heading').append(b);
        }
    }

    function scan() {
        if (typeof getAllData !== 'function' || !PC) {
            return;
        }
        var list = getAllData();
        if (Array.isArray(list)) {
            list.forEach(attach);
        }
    }

    // rAF 防抖：批量渲染时一次 MutationObserver 回调只触发一次 scan
    var scanQueued = false;
    function queueScan() {
        if (scanQueued) {
            return;
        }
        scanQueued = true;
        requestAnimationFrame(function () {
            scanQueued = false;
            try {
                scan();
            } catch (e) {}
        });
    }

    new MutationObserver(queueScan).observe(document.documentElement, {
        childList: true,
        subtree: true
    });
    document.addEventListener('DOMContentLoaded', scan);
    scan();
})();
