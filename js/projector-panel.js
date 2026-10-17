/**
 * cat-catch Projector v11 侧边播放器（侧边浏览器模型）
 * 由 sidepanel.html 加载：读取全局投影会话，播放 m3u8 / mpd / 音视频直链，支持多源切换。
 * 单播放器：只活在点了"投影"的源标签页；切标签不刷新不重建；投影按钮=向它注入视频地址。
 * 依赖：js/projector-common.js（须先加载）、lib/hls.min.js、js/function.js 的 setRequestHeaders。
 */
(function () {
    'use strict';

    var PC = (typeof globalThis !== 'undefined' ? globalThis : window).CatCatchProjectorCommon;

    var video = document.getElementById('projectorVideo');
    var image = document.getElementById('projectorImage');
    var sourceBox = document.getElementById('projectorSources');
    var messageBox = document.getElementById('projectorMessage');
    var infoBox = document.getElementById('projectorInfo');

    var session = null;
    var mediaList = [];
    var currentIndex = 0;
    var hlsInstance = null;
    var msgTimer = null;
    var lastSoft = '';
    // v11-单播放器：播放器只活在点了"投影"的源标签页（侧边浏览器模型），
    // 同一时间只存在一个播放器文档，无需多实例仲裁。

    function msg(text, ms) {
        clearTimeout(msgTimer);
        messageBox.textContent = text || '';
        messageBox.style.display = text ? 'block' : 'none';
        if (text && ms) {
            msgTimer = setTimeout(function () {
                messageBox.style.display = 'none';
                messageBox.textContent = '';
            }, ms);
        }
    }

    function save() {
        if (!session || !session.sessionId) {
            return;
        }
        chrome.runtime.sendMessage({
            Message: 'projector-update-playback',
            sessionId: session.sessionId,
            playback: {
                selectedIndex: currentIndex,
                currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
                paused: video.paused,
                playbackRate: Number.isFinite(video.playbackRate) ? video.playbackRate : 1,
                volume: Number.isFinite(video.volume) ? video.volume : 1,
                muted: !!video.muted
            }
        }, function () {
            if (chrome.runtime.lastError) {
                /* 忽略 */
            }
        });
    }

    function destroy() {
        if (hlsInstance) {
            try {
                hlsInstance.destroy();
            } catch (e) {}
            hlsInstance = null;
        }
        video.pause();
        video.removeAttribute('src');
        video.load();
        image.classList.add('projectorHide');
        image.removeAttribute('src');
        video.style.display = 'block';
    }

    function render() {
        sourceBox.innerHTML = '';
        var lab = document.createElement('span');
        lab.className = 'projectorSourceLabel';
        lab.textContent = '源(' + mediaList.length + ')：';
        sourceBox.appendChild(lab);
        mediaList.forEach(function (it, i) {
            var b = document.createElement('button');
            b.className = 'projectorSourceButton' + (i === currentIndex ? ' active' : '');
            b.textContent = String(i + 1);
            b.title = it.name || it.url || '';
            b.addEventListener('click', function () { play(i); });
            sourceBox.appendChild(b);
        });
    }

    function info(d) {
        infoBox.textContent = [
            '投影页：' + (session.pageTitle || ''),
            d.title ? '标题：' + d.title : '',
            d.name ? '文件：' + d.name : '',
            d.type ? 'MIME：' + d.type : '',
            d.ext ? 'EXT：' + d.ext : '',
            d.url ? 'URL：' + d.url : ''
        ].filter(Boolean).join('\n');
    }

    // 播放前注入请求头（referer/cookie 等），失败则直接回调
    function headers(d, cb) {
        if (d.requestHeaders && typeof setRequestHeaders === 'function') {
            try {
                setRequestHeaders(d.requestHeaders, cb);
                return;
            } catch (e) {}
        }
        cb();
    }

    // v11-方案二：把会话里的播放状态（倍速/音量/静音）应用到 video 元素
    // （倍速按钮文字由 controls.js 的 ratechange 监听自动同步）
    function applyPlaybackState() {
        var p = session && session.playback;
        if (!p) {
            return;
        }
        try {
            if (Number.isFinite(Number(p.volume))) {
                video.volume = Math.min(1, Math.max(0, Number(p.volume)));
            }
            if (typeof p.muted === 'boolean') {
                video.muted = p.muted;
            }
            if (Number(p.playbackRate) > 0) {
                video.playbackRate = Number(p.playbackRate);
            }
        } catch (e) {}
    }

    function seekToSavedPosition() {
        var p = session && session.playback;
        if (p && Number(p.currentTime) > 1) {
            try {
                video.currentTime = Math.max(0, Number(p.currentTime) - 0.8);
            } catch (e) {}
        }
    }

    // 会话记录是否为暂停态（恢复时用：暂停则不自动播）
    function shouldResumePaused() {
        var p = session && session.playback;
        return !!(p && p.paused);
    }

    function bind() {
        video.onloadedmetadata = function () {
            applyPlaybackState();
            var p = session && session.playback;
            if (p && Number(p.selectedIndex) === Number(currentIndex)) {
                seekToSavedPosition();
            }
        };
        video.ontimeupdate = save;
        video.onpause = save;
        video.onplay = save;
        video.onratechange = save;
        video.onvolumechange = save;
    }

    function hlsErr(e) {
        var det = (e && e.details) ? String(e.details) : 'unknown';
        var fatal = !!(e && e.fatal);
        // 可恢复的缓冲类错误：只提示，不打断
        if (['bufferStalledError', 'bufferNudgeOnStall', 'bufferSeekOverHole', 'bufferAppendingError', 'fragGap'].indexOf(det) !== -1 && !fatal) {
            if (lastSoft !== det) {
                lastSoft = det;
                msg('m3u8 缓冲中', 1500);
            }
            return;
        }
        if (!fatal) {
            return;
        }
        try {
            if (e.type === Hls.ErrorTypes.NETWORK_ERROR) {
                hlsInstance.startLoad();
                msg('m3u8 网络恢复中', 1500);
                return;
            }
            if (e.type === Hls.ErrorTypes.MEDIA_ERROR) {
                hlsInstance.recoverMediaError();
                msg('m3u8 媒体恢复中', 1500);
                return;
            }
        } catch (x) {}
        msg('m3u8 播放失败：' + det, 3500);
    }

    // resumeOnly=true：会话恢复场景；若会话记录为暂停态则不自动播
    function play(i, resumeOnly) {
        var d = mediaList[i];
        if (!d) {
            return;
        }
        currentIndex = i;
        destroy();
        render();
        info(d);
        bind();
        var autoplay = !(resumeOnly && shouldResumePaused());
        msg('正在加载投影源 ' + (i + 1) + '...', 1000);
        if (PC.isM3u8(d) && window.Hls && Hls.isSupported()) {
            hlsInstance = new Hls({
                enableWorker: false,
                lowLatencyMode: false,
                backBufferLength: 60,
                maxBufferHole: 1.5,
                maxSeekHole: 2
            });
            headers(d, function () {
                hlsInstance.loadSource(d.url);
                hlsInstance.attachMedia(video);
            });
            hlsInstance.on(Hls.Events.MANIFEST_PARSED, function () {
                msg('');
                if (autoplay) {
                    video.play().catch(function () {
                        msg('浏览器阻止自动播放，请手动点击播放', 2000);
                    });
                }
            });
            hlsInstance.on(Hls.Events.ERROR, function (ev, er) { hlsErr(er); });
            return;
        }
        headers(d, function () {
            video.src = d.url;
            if (autoplay) {
                video.play().catch(function () {
                    msg('浏览器阻止自动播放，请手动点击播放', 2000);
                });
            }
        });
    }

    function init(s) {
        session = s;
        if (!s || !s.active || !Array.isArray(s.list) || !s.list.length) {
            msg('没有投影会话，请先在媒体列表点击投影');
            return;
        }
        mediaList = s.list.filter(PC.isProjectorPlayable);
        currentIndex = Math.max(0, Math.min(mediaList.length - 1,
            Number(s.playback && s.playback.selectedIndex !== undefined ? s.playback.selectedIndex : (s.selectedIndex || 0))));
        play(currentIndex, true);
    }

    // v11-单播放器：文档被缓存复用时对一下会话状态。
    // 同一会话什么都不做 —— video 保持原样，切 tab 不刷新不重建（侧边浏览器模型）。
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible' && session && session.sessionId) {
            chrome.runtime.sendMessage({ Message: 'projector-get-session' }, function (r) {
                if (chrome.runtime.lastError) {
                    return;
                }
                var s = r && r.session;
                if (!s || !s.active) {
                    destroy();
                    msg('投影会话已结束');
                } else if (String(s.sessionId) !== String(session.sessionId)) {
                    init(s); // 会话已换（极端情况兜底）
                }
            });
        }
    });

    // 显式"停止投影"入口 —— 会话结束只由它或新会话覆盖触发；源 tab 关闭则播放器搬到活动 tab
    (function setupStopButton() {
        var header = document.getElementById('projectorHeader');
        if (!header || document.getElementById('projectorStopBtn')) {
            return;
        }
        var b = document.createElement('button');
        b.id = 'projectorStopBtn';
        b.className = 'projectorStopBtn';
        b.textContent = '⏹ 停止';
        b.title = '停止投影并恢复侧边栏列表';
        b.addEventListener('click', function () {
            try {
                chrome.runtime.sendMessage({ Message: 'projector-close-session' }, function () {});
            } catch (e) {}
            try { save(); } catch (e) {}
            destroy();
            msg('已停止投影', 2000);
        });
        header.appendChild(b);
    })();

    chrome.runtime.sendMessage({ Message: 'projector-get-session' }, function (r) {
        if (chrome.runtime.lastError) {
            msg(chrome.runtime.lastError.message);
            return;
        }
        init(r && r.session);
    });
})();
