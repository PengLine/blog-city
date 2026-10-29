/* ==========================================================================
   架构 ↔ 场景页 双向联动运行时
   --------------------------------------------------------------------------
   1. 单一映射源：场景页 ↔ 服务域名（服务目录口径，如「城管」「数据」）。
   2. 架构页发布运行快照（域健康、等保达标率、服务明细）到 localStorage。
   3. 场景页读取快照，在页头回显所属域健康状态、等保达标率与服务定位信息。
   本文件不依赖 ui-kit.js，可被任何页面安全引入；样式自带，缺失 ui-kit 时也能正常显示。
   ========================================================================== */
(function (global) {
    'use strict';

    const HUB = 'city-platform-architecture.html';
    const SNAPSHOT_KEY = 'sc:arch:snapshot';
    const SNAPSHOT_VER = 1;

    /* 场景页配置：primary 决定某服务域的服务行默认跳往哪一页 */
    const PAGES = {
        'digital-city-management.html': { label: '数字城管', icon: '🏠', domains: ['城管'], primary: '城管' },
        'smart-street.html': { label: '智慧街面', icon: '🚦', domains: ['城管'] },
        'central-command.html': { label: '综合指挥', icon: '🚀', domains: ['指挥'], primary: '指挥' },
        'decision-analysis.html': { label: '决策分析', icon: '📊', domains: ['数据'], primary: '数据' },
        'smart-environment.html': { label: '智慧环卫', icon: '🗑️', domains: ['环卫'], primary: '环卫' },
        'smart-municipal.html': { label: '智慧市政', icon: '🏗️', domains: ['市政'], primary: '市政' },
        'smart-drainage.html': { label: '智慧排水', icon: '💧', domains: ['排水'], primary: '排水' },
        'smart-lighting.html': { label: '智慧照明', icon: '💡', domains: ['照明'], primary: '照明' },
        'smart-parking.html': { label: '智慧停车', icon: '🅿️', domains: ['停车'], primary: '停车' },
        'public-service.html': { label: '公共服务', icon: '🏛️', domains: ['公共服务'], primary: '公共服务' },
        'equipment-data.html': { label: '设备数据', icon: '🔧', domains: ['接入', '数据', '基础设施'], primary: '接入' },
        'client-app.html': { label: '客户端', icon: '📱', domains: ['平台'], svcLink: false }
    };

    /* 首次访问场景页（架构页还未发布快照）时的兜底数据，与架构页种子口径一致 */
    const DEFAULT_SERVICES = [
        ['auth-center', '统一认证中心', '平台', '2.8.1', 6, '健康', '平台架构组'],
        ['perm-center', '权限中心', '平台', '2.6.4', 4, '告警', '平台架构组'],
        ['gateway', 'API 网关', '平台', '3.4.0', 8, '健康', '平台架构组'],
        ['msg-center', '消息中心', '平台', '1.9.2', 4, '健康', '平台架构组'],
        ['file-service', '文件与影像服务', '平台', '1.6.7', 4, '健康', '平台架构组'],
        ['job-center', '调度作业中心', '平台', '1.4.3', 3, '健康', '平台架构组'],
        ['case-service', '案件流转服务', '城管', '4.1.2', 8, '告警', '数字城管组'],
        ['dispatch-service', '派遣调度服务', '城管', '3.7.5', 6, '健康', '数字城管组'],
        ['supervise-service', '督查考核服务', '城管', '2.5.0', 4, '健康', '数字城管组'],
        ['vehicle-service', '车辆人员服务', '城管', '2.2.3', 4, '健康', '数字城管组'],
        ['video-proxy', '视频接入代理', '城管', '1.8.0', 4, '健康', '视频平台组'],
        ['grid-service', '网格社区服务', '城管', '2.0.6', 3, '健康', '数字城管组'],
        ['waste-service', '环卫清运服务', '环卫', '3.1.4', 5, '健康', '环卫业务组'],
        ['sanitation-kpi', '环卫考核服务', '环卫', '1.7.2', 3, '告警', '环卫业务组'],
        ['facility-service', '市政设施服务', '市政', '3.6.0', 5, '健康', '市政业务组'],
        ['bridge-monitor', '桥隧结构监测', '市政', '1.3.5', 2, '维护', '市政业务组'],
        ['light-service', '照明控制服务', '照明', '2.4.1', 4, '健康', '照明业务组'],
        ['drain-service', '排水调度服务', '排水', '2.9.0', 5, '健康', '水务业务组'],
        ['flood-warn', '防汛预警服务', '排水', '1.5.6', 3, '健康', '水务业务组'],
        ['parking-service', '停车计费服务', '停车', '3.0.8', 6, '健康', '停车业务组'],
        ['guide-service', '车位引导服务', '停车', '1.4.9', 3, '降级', '停车业务组'],
        ['command-center', '指挥调度服务', '指挥', '2.3.2', 4, '健康', '指挥中心'],
        ['public-service', '公共服务事项', '公共服务', '1.9.8', 3, '健康', '公共服务组'],
        ['iot-gateway', '物联接入网关', '接入', '4.2.0', 10, '健康', '物联网组'],
        ['data-sync', '数据同步服务', '数据', '2.1.1', 4, '健康', '数据平台组'],
        ['report-engine', '报表引擎', '数据', '3.3.0', 4, '健康', '数据平台组'],
        ['ai-vision', '视频 AI 识别', '数据', '2.2.4', 6, '告警', '算法组'],
        ['ops-agent', '运维采集中台', '基础设施', '1.2.0', 12, '健康', '运维组']
    ];

    const DEFAULT_SNAPSHOT = {
        ver: SNAPSHOT_VER,
        at: 0,
        security: { rate: 75, ok: 12, total: 16, level: '三级' },
        domains: {
            '平台': { health: '告警', ok: 5, total: 6 },
            '城管': { health: '告警', ok: 5, total: 6 },
            '环卫': { health: '告警', ok: 1, total: 2 },
            '市政': { health: '维护', ok: 1, total: 2 },
            '照明': { health: '健康', ok: 1, total: 1 },
            '排水': { health: '健康', ok: 2, total: 2 },
            '停车': { health: '降级', ok: 1, total: 2 },
            '指挥': { health: '健康', ok: 1, total: 1 },
            '公共服务': { health: '健康', ok: 1, total: 1 },
            '接入': { health: '健康', ok: 1, total: 1 },
            '数据': { health: '告警', ok: 2, total: 3 },
            '基础设施': { health: '健康', ok: 1, total: 1 }
        },
        services: (function () {
            const out = {};
            DEFAULT_SERVICES.forEach(function (r) {
                out[r[0]] = { id: r[0], name: r[1], domain: r[2], ver: r[3], inst: r[4], health: r[5], owner: r[6] };
            });
            return out;
        })()
    };

    const HEALTH_TAG = { '健康': 'ok', '降级': 'warn', '维护': 'info', '告警': 'bad', '未知': 'off' };
    const HEALTH_ICON = { '健康': '●', '降级': '▲', '维护': '◼', '告警': '◆', '未知': '○' };
    const HEALTH_RANK = { '告警': 3, '降级': 2, '维护': 1, '健康': 0, '未知': 0 };

    function esc(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function currentFile() {
        const parts = location.pathname.split('/');
        return parts[parts.length - 1] || 'index.html';
    }

    function param(name) {
        const m = new RegExp('[?&]' + name + '=([^&#]*)').exec(location.search);
        return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
    }

    function pageOf(domain) {
        let fallback = '';
        for (const file in PAGES) {
            const cfg = PAGES[file];
            if (cfg.svcLink === false) continue;
            if (cfg.primary === domain) return file;
            if (!fallback && cfg.domains.indexOf(domain) > -1) fallback = file;
        }
        return fallback;
    }

    function labelOf(file) {
        const key = String(file || '').split(/[?#]/)[0].split('/').pop();
        return PAGES[key] ? PAGES[key].label : '';
    }

    /** 服务行跳转地址：digital-city-management.html?svc=case-service&from=... */
    function serviceHref(svc, from) {
        const page = pageOf(svc.domain);
        if (!page) return '';
        return page + '?svc=' + encodeURIComponent(svc.id) +
            (from ? '&from=' + encodeURIComponent(from) : '');
    }

    /** 域卡片跳转地址：smart-drainage.html?domain=排水&from=... */
    function domainHref(page, domain, from) {
        return page + '?domain=' + encodeURIComponent(domain) +
            (from ? '&from=' + encodeURIComponent(from) : '');
    }

    /** 读快照：优先架构页发布的实时快照，否则用内置兜底 */
    function snapshot() {
        let stored = null;
        try {
            stored = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || 'null');
        } catch (e) { stored = null; }
        if (stored && stored.ver === SNAPSHOT_VER && stored.domains) return stored;
        return DEFAULT_SNAPSHOT || { ver: SNAPSHOT_VER, at: 0, domains: {}, services: {}, security: {} };
    }

    /** 架构页发布快照（域健康 / 等保达标率 / 服务明细） */
    function publish(data) {
        if (!data) return;
        const payload = {
            ver: SNAPSHOT_VER,
            at: Date.now(),
            security: data.security || {},
            domains: data.domains || {},
            services: data.services || {}
        };
        try {
            localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(payload));
        } catch (e) { /* 隐私模式下忽略写入失败 */ }
        return payload;
    }

    function worstHealth(list) {
        let out = '健康';
        (list || []).forEach(function (h) {
            if ((HEALTH_RANK[h] || 0) > (HEALTH_RANK[out] || 0)) out = h;
        });
        return out;
    }

    function domainInfo(domain) {
        const snap = snapshot();
        const d = snap.domains[domain];
        if (d) return Object.assign({ health: '未知', ok: 0, total: 0 }, d);
        return { health: '未知', ok: 0, total: 0 };
    }

    function timeLabel(ts) {
        if (!ts) return '未同步';
        const d = new Date(ts);
        const p = function (n) { return (n < 10 ? '0' : '') + n; };
        return p(d.getHours()) + ':' + p(d.getMinutes());
    }

    function tag(text, kind) {
        return '<span class="sc-tag ' + (kind || 'info') + '">' + esc(text) + '</span>';
    }

    /* ---------------------------- 页头回显 ---------------------------- */

    function injectStyle() {
        if (document.getElementById('arch-ctx-style')) return;
        const css = '' +
            '.arch-ctx{font-family:"Microsoft YaHei",sans-serif;font-size:13px;color:#2c3e50;' +
            'margin:0 0 18px;padding:11px 16px;border-radius:12px;border:1px solid rgba(44,62,80,.14);' +
            'border-left:3px solid #3498db;background:linear-gradient(90deg,rgba(52,152,219,.09),rgba(52,152,219,.02));' +
            'display:flex;flex-direction:column;gap:8px;line-height:1.7}' +
            '.arch-ctx-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px 16px}' +
            '.arch-ctx-badge{display:inline-flex;align-items:center;gap:5px;padding:1px 9px;border-radius:999px;' +
            'background:#2c3e50;color:#fff;font-size:12px;letter-spacing:.4px}' +
            '.arch-ctx-badge.alt{background:#3498db}' +
            '.arch-ctx-kv{color:#5b6b7c}.arch-ctx-kv b{color:#2c3e50;font-weight:700}' +
            '.arch-ctx-kv em{font-style:normal;color:#7f8c9b;font-size:12px}' +
            '.arch-ctx-code{font-family:Consolas,Monaco,monospace;font-size:12px;color:#34495e;background:rgba(44,62,80,.07);' +
            'padding:1px 6px;border-radius:5px}' +
            '.arch-ctx-link{margin-left:auto;color:#2980b9;text-decoration:none;font-weight:600;white-space:nowrap}' +
            '.arch-ctx-link:hover{color:#1c6ea4;text-decoration:underline}' +
            '.arch-ctx-svc{padding-top:8px;border-top:1px dashed rgba(44,62,80,.16)}' +
            '.arch-ctx-svc .arch-ctx-link{margin-left:0}' +
            '.arch-ctx-dim{color:#95a5a6;font-size:12px}' +
            '.arch-ctx .sc-tag{font-size:12px;padding:1px 7px;border-radius:999px;display:inline-block;' +
            'border:1px solid transparent}' +
            '.arch-ctx .sc-tag.ok{background:rgba(46,204,113,.14);color:#1e8449;border-color:rgba(46,204,113,.35)}' +
            '.arch-ctx .sc-tag.warn{background:rgba(243,156,18,.16);color:#a86a06;border-color:rgba(243,156,18,.38)}' +
            '.arch-ctx .sc-tag.bad{background:rgba(231,76,60,.14);color:#b03a2e;border-color:rgba(231,76,60,.35)}' +
            '.arch-ctx .sc-tag.info{background:rgba(52,152,219,.14);color:#21618c;border-color:rgba(52,152,219,.34)}' +
            '.arch-ctx .sc-tag.off{background:rgba(127,140,155,.16);color:#5d6d7e;border-color:rgba(127,140,155,.32)}' +
            '@media (max-width:720px){.arch-ctx-link{margin-left:0}}';
        const style = document.createElement('style');
        style.id = 'arch-ctx-style';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function mount() {
        const file = currentFile();
        const cfg = PAGES[file];
        if (!cfg || document.getElementById('arch-ctx')) return null;

        const header = document.querySelector('.container > header') || document.querySelector('header');
        if (!header || !header.parentNode) return null;

        const snap = snapshot();
        const requested = param('domain');
        const primary = cfg.domains[0];
        const focus = cfg.domains.indexOf(requested) > -1 ? requested : primary;
        const info = domainInfo(focus);
        const rate = snap.security && snap.security.rate;
        const sec = snap.security || {};
        const svcId = param('svc');
        const svc = svcId ? (snap.services || {})[svcId] : null;
        const from = currentFile();

        const rateTag = rate == null ? tag('未同步', 'off')
            : tag(rate + '%', rate >= 90 ? 'ok' : (rate >= 80 ? 'warn' : 'bad'));
        const health = info.health || '未知';

        const rows = [];
        rows.push('<div class="arch-ctx-row">' +
            '<span class="arch-ctx-badge">🏛 架构联动</span>' +
            '<span class="arch-ctx-kv">所属域 <b>' + esc(focus) + '</b>' +
            (focus !== primary ? ' <em>· 本页主域 ' + esc(primary) + '</em>' : '') + '</span>' +
            '<span class="arch-ctx-kv">域健康 ' + tag(HEALTH_ICON[health] + ' ' + health, HEALTH_TAG[health]) +
            (info.total ? ' <em>' + info.ok + '/' + info.total + ' 服务正常</em>' : '') + '</span>' +
            '<span class="arch-ctx-kv">等保达标率 ' + rateTag +
            (sec.total ? ' <em>' + esc(sec.level || '三级') + ' · ' + sec.ok + '/' + sec.total + ' 项</em>' : '') + '</span>' +
            '<a class="arch-ctx-link" href="' + HUB + '?domain=' + encodeURIComponent(focus) +
            '&from=' + encodeURIComponent(from) + '">查看架构档案 ↗</a>' +
            '</div>');

        if (svcId) {
            if (svc) {
                rows.push('<div class="arch-ctx-row arch-ctx-svc">' +
                    '<span class="arch-ctx-badge alt">服务定位</span>' +
                    '<b>' + esc(svc.name) + '</b>' +
                    '<span class="arch-ctx-code">' + esc(svc.id) + '</span>' +
                    '<span class="arch-ctx-kv">' + esc(svc.ver) + '</span>' +
                    '<span class="arch-ctx-kv">' + esc(svc.inst) + ' 实例</span>' +
                    tag(HEALTH_ICON[svc.health] + ' ' + svc.health, HEALTH_TAG[svc.health]) +
                    (svc.owner ? '<span class="arch-ctx-kv">负责人 ' + esc(svc.owner) + '</span>' : '') +
                    '<a class="arch-ctx-link" href="' + HUB + '?svc=' + encodeURIComponent(svc.id) +
                    '&from=' + encodeURIComponent(from) + '">在架构页查看 ↗</a>' +
                    '</div>');
            } else {
                rows.push('<div class="arch-ctx-row arch-ctx-svc">' +
                    '<span class="arch-ctx-badge alt">服务定位</span>' +
                    '<span class="arch-ctx-kv">未找到服务 <span class="arch-ctx-code">' + esc(svcId) + '</span>' +
                    '<em>（架构档案快照未同步或服务已下线）</em></span>' +
                    '<a class="arch-ctx-link" href="' + HUB + '?from=' + encodeURIComponent(from) + '">打开服务目录 ↗</a>' +
                    '</div>');
            }
        }

        const el = document.createElement('div');
        el.id = 'arch-ctx';
        el.className = 'arch-ctx';
        el.innerHTML = rows.join('');
        header.parentNode.insertBefore(el, header.nextSibling);
        injectStyle();

        /* 支持 ?module=xxx：复用 common.js 的模块切换（点击 .module-btn） */
        const moduleId = param('module');
        if (moduleId) {
            const btn = document.querySelector('.module-btn[data-module="' + moduleId + '"]');
            if (btn) setTimeout(function () { btn.click(); }, 60);
        }

        return {
            page: file, label: cfg.label, domain: focus, health: health,
            rate: rate, service: svc, syncedAt: snap.at
        };
    }

    const ArchLink = {
        version: 1,
        HUB: HUB,
        PAGES: PAGES,
        pageForDomain: pageOf,
        labelOf: labelOf,
        serviceHref: serviceHref,
        domainHref: domainHref,
        snapshot: snapshot,
        publish: publish,
        domainHealth: function (domain) { return domainInfo(domain); },
        worstHealth: worstHealth,
        timeLabel: timeLabel,
        mount: mount,
        context: null
    };

    /* 场景页：DOM 就绪后自动回显 */
    function autoMount() {
        if (!PAGES[currentFile()]) return;
        ArchLink.context = mount();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoMount);
    } else {
        autoMount();
    }

    global.ArchLink = ArchLink;
})(window);
