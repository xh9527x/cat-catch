/**
 * cat-catch Projector 共享模块 v11
 *
 * 统一三处曾经各自手写的资源判据 / 排序 / 克隆逻辑：
 * popup 适配器 (projector.js) / background (service worker) / 侧边栏播放器 (projector-panel.js)
 * 避免改一处漏两处（v10 曾出现 float 排除 m4s/ts 而 panel 包含 m4s 的分歧）。
 *
 * 加载方式：popup.html / sidepanel.html 用 <script src="js/projector-common.js">
 * background.js 用 importScripts("/js/projector-common.js")
 * 对外暴露：globalThis.CatCatchProjectorCommon
 */
(function (root) {
    'use strict';

    function str(value) {
        return String(value || '').toLowerCase();
    }

    function isM3u8(data) {
        var ext = str(data.ext);
        var type = str(data.type);
        var url = str(data.url);
        return ext === 'm3u8' || ext === 'm3u' ||
            type.indexOf('mpegurl') !== -1 ||
            url.indexOf('.m3u8') !== -1;
    }

    function isMpd(data) {
        var ext = str(data.ext);
        var type = str(data.type);
        var url = str(data.url);
        return ext === 'mpd' ||
            type === 'application/dash+xml' ||
            url.indexOf('.mpd') !== -1;
    }

    /**
     * 是否可投影播放。覆盖 hls / dash / 常见音视频直链。
     * 注意：m4s / ts 切片不算可投影（单个切片无法正常播放，如哔哩哔哩；
     * Wu 2026-10-17 定：B 站不需要显示投影按钮）。
     */
    function isProjectorPlayable(data) {
        if (!data || !data.url) {
            return false;
        }
        var ext = str(data.ext);
        var type = str(data.type);
        if (ext === 'm4s' || ext === 'ts') {
            return false;
        }
        if (isM3u8(data) || isMpd(data)) {
            return true;
        }
        if (['mp4', 'webm', 'mp3', 'wav', 'm4a', 'ogg', 'ogv', '3gp', 'mpeg', 'mov', 'aac'].indexOf(ext) !== -1) {
            return true;
        }
        return type.indexOf('video/') === 0 || type.indexOf('audio/') === 0;
    }

    /** 悬浮按钮用的候选：可投影且排除切片类 URL */
    function isFloatCandidate(data) {
        if (!isProjectorPlayable(data)) {
            return false;
        }
        var url = str(data.url);
        return url.indexOf('.m4s') === -1 && url.indexOf('.ts') === -1;
    }

    /** 候选排序：m3u8 > 视频直链 > mpd > 音频；小文件(<10KB)降权（多为广告/埋点） */
    function projectorPriority(data) {
        var ext = str(data.ext);
        var type = str(data.type);
        var url = str(data.url);
        var p = 100;
        if (isM3u8(data)) {
            p = 10;
        } else if (['mp4', 'webm', 'mov', 'mpeg'].indexOf(ext) !== -1 || type.indexOf('video/') === 0) {
            p = 20;
        } else if (isMpd(data)) {
            p = 30;
        } else if (type.indexOf('audio/') === 0 || ['mp3', 'wav', 'm4a', 'aac', 'ogg'].indexOf(ext) !== -1) {
            p = 60;
        }
        var size = Number(data.size || 0);
        if (size > 0 && size < 10240) {
            p += 40;
        }
        return p;
    }

    /** 跨上下文传递的精简克隆（去掉 html/jQuery 等不可序列化字段） */
    function cloneProjectorItem(data) {
        return {
            name: data.name,
            url: data.url,
            size: data.size,
            _size: data._size,
            ext: data.ext,
            type: data.type,
            tabId: data.tabId,
            isRegex: data.isRegex,
            requestId: data.requestId,
            initiator: data.initiator,
            requestHeaders: data.requestHeaders,
            cookie: data.cookie,
            getTime: data.getTime,
            title: data.title,
            _title: data._title,
            favIconUrl: data.favIconUrl,
            webUrl: data.webUrl,
            parsing: data.parsing,
            isPlay: data.isPlay,
            duration: data.duration,
            videoWidth: data.videoWidth,
            videoHeight: data.videoHeight
        };
    }

    /** 去重（按 requestId / url）+ 排序，返回克隆后的候选数组 */
    function sortProjectorCandidates(list, floatOnly) {
        var out = [];
        var seen = {};
        (list || []).forEach(function (item) {
            var ok = floatOnly ? isFloatCandidate(item) : isProjectorPlayable(item);
            if (!ok) {
                return;
            }
            var key = item.requestId || item.url;
            if (!key || seen[key]) {
                return;
            }
            seen[key] = true;
            out.push(cloneProjectorItem(item));
        });
        out.sort(function (a, b) {
            return projectorPriority(a) - projectorPriority(b) ||
                Number(b.size || 0) - Number(a.size || 0);
        });
        return out;
    }

    root.CatCatchProjectorCommon = {
        isM3u8: isM3u8,
        isMpd: isMpd,
        isProjectorPlayable: isProjectorPlayable,
        isFloatCandidate: isFloatCandidate,
        projectorPriority: projectorPriority,
        cloneProjectorItem: cloneProjectorItem,
        sortProjectorCandidates: sortProjectorCandidates
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
