/**
 * cat-catch Projector v11 全局单例侧边栏播放器
 * 由 sidepanel.html 加载：读取全局投影会话，播放 m3u8 / mpd / 音视频直链，支持多源切换。
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
                paused: video.paused
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

    function bind() {
        video.onloadedmetadata = function () {
            var p = session && session.playback;
            if (p && Number(p.selectedIndex) === Number(currentIndex) && Number(p.currentTime) > 1) {
                try {
                    video.currentTime = Math.max(0, Number(p.currentTime) - 0.8);
                } catch (e) {}
            }
        };
        video.ontimeupdate = save;
        video.onpause = save;
        video.onplay = save;
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

    function play(i) {
        var d = mediaList[i];
        if (!d) {
            return;
        }
        currentIndex = i;
        destroy();
        render();
        info(d);
        bind();
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
                video.play().catch(function () {
                    msg('浏览器阻止自动播放，请手动点击播放', 2000);
                });
            });
            hlsInstance.on(Hls.Events.ERROR, function (ev, er) { hlsErr(er); });
            return;
        }
        headers(d, function () {
            video.src = d.url;
            video.play().catch(function () {
                msg('浏览器阻止自动播放，请手动点击播放', 2000);
            });
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
        play(currentIndex);
    }

    chrome.runtime.sendMessage({ Message: 'projector-get-session' }, function (r) {
        if (chrome.runtime.lastError) {
            msg(chrome.runtime.lastError.message);
            return;
        }
        init(r && r.session);
    });
})();
