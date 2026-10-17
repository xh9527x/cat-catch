// cat-catch Projector v11 text-only responsive external controls.
// Add-on only: projector-panel.js, HLS, session and media injection remain unchanged.
(function () {
    'use strict';

    const CONTROL_ID = 'catcatch-projector-external-controls-v11e';
    const RATES = [1, 1.25, 1.5, 2, 3];
    const HORIZONTAL_MIN_WIDTH = 500;

    function init() {
        const video = document.getElementById('projectorVideo');
        const playerBox = document.getElementById('projectorPlayerBox');
        if (!video || !playerBox || document.getElementById(CONTROL_ID)) return;

        const controls = document.createElement('div');
        controls.id = CONTROL_ID;
        controls.setAttribute('aria-label', '投影快捷控制');

        const forwardButton = createButton('cc-projector-forward', '+10s', '前进 10 秒');
        const backButton = createButton('cc-projector-back', '−10s', '后退 10 秒');
        const rateButton = createButton('cc-projector-rate', formatRate(video.playbackRate), '切换播放速度');
        rateButton.classList.add('cc-projector-rate-button');

        controls.append(forwardButton, backButton, rateButton);
        playerBox.appendChild(controls);

        const style = document.createElement('style');
        style.id = CONTROL_ID + '-style';
        style.textContent = `
#${CONTROL_ID}{
 position:absolute;right:14px;bottom:82px;z-index:20;
 display:flex;flex-direction:column;align-items:center;gap:9px;
 pointer-events:auto;
}
#${CONTROL_ID}.cc-horizontal{
 flex-direction:row;align-items:center;gap:22px;
 right:18px;bottom:78px;
}
#${CONTROL_ID} button{
 appearance:none;-webkit-appearance:none;
 box-sizing:border-box;min-width:44px;height:30px;padding:0 2px;
 border:0;outline:0;border-radius:0;
 background:transparent;color:#fff;
 font:700 15px/1 Arial,"Microsoft YaHei",sans-serif;
 text-shadow:0 1px 4px rgba(0,0,0,1),0 0 2px rgba(0,0,0,.9);
 letter-spacing:.1px;cursor:pointer;
 box-shadow:none;
 transition:color .14s ease,transform .12s ease,opacity .14s ease;
}
#${CONTROL_ID} button:hover{background:transparent;color:#69b7ff}
#${CONTROL_ID} button:active{background:transparent;transform:scale(.92);color:#a7d8ff}
#${CONTROL_ID} button:focus{outline:0}
#${CONTROL_ID} button:focus-visible{outline:1px dashed rgba(255,255,255,.7);outline-offset:3px}
#${CONTROL_ID} .cc-projector-rate-button{margin-top:14px}
#${CONTROL_ID}.cc-horizontal .cc-projector-rate-button{margin-top:0;margin-left:8px}
`;
        document.documentElement.appendChild(style);

        function seekBy(seconds) {
            const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
            const duration = Number.isFinite(video.duration) ? video.duration : Infinity;
            try {
                video.currentTime = Math.max(0, Math.min(duration, current + seconds));
            } catch (error) {}
        }

        forwardButton.addEventListener('click', function () { seekBy(10); });
        backButton.addEventListener('click', function () { seekBy(-10); });
        rateButton.addEventListener('click', function () {
            let index = RATES.findIndex(function (value) {
                return Math.abs(value - video.playbackRate) < 0.001;
            });
            if (index < 0) index = 0;
            const nextRate = RATES[(index + 1) % RATES.length];
            video.playbackRate = nextRate;
            rateButton.textContent = formatRate(nextRate);
            rateButton.title = '播放速度 ' + formatRate(nextRate) + '；点击切换';
        });
        video.addEventListener('ratechange', function () {
            rateButton.textContent = formatRate(video.playbackRate);
        });

        function updateLayout() {
            controls.classList.toggle('cc-horizontal', playerBox.clientWidth >= HORIZONTAL_MIN_WIDTH);
        }
        updateLayout();
        if (typeof ResizeObserver === 'function') {
            const observer = new ResizeObserver(updateLayout);
            observer.observe(playerBox);
        } else {
            window.addEventListener('resize', updateLayout);
        }
    }

    function createButton(className, text, title) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.textContent = text;
        button.title = title;
        return button;
    }

    function formatRate(rate) {
        return String(Number(rate || 1)) + '×';
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
