/* ==========================================================================
   末端设备接入目录 · 跨页统一口径运行时
   --------------------------------------------------------------------------
   1. 单一口径源：全市 23 类 / 39,263 台末端设备，与数据中台「末端设备接入清单」、
      运维中心设备台账、设备数据页设备目录完全一致；改口径只需改本文件。
   2. 场景页只引入本文件，即在页头自动回显「本域接入设备」：在册台数、类别筹码、
      上报频率与业务口径，并提供跳往设备数据页与数据中台采集模块的入口。
   3. 本文件不依赖 ui-kit.js / common.js，样式自带，任何页面引入均可正常显示。
   ========================================================================== */
(function (global) {
    'use strict';

    const DC_VER = 1;
    const EQ_PAGE = 'equipment-data.html';
    const DP_PAGE = 'data-platform.html';

    /* 编码 / 名称 / 分类 / 接入方式 / 在册数量 / 上报频率 / 归属域 / 业务口径
       —— 顺序与数据中台 DEV_SEED 严格一致，新类别只允许追加到末尾 */
    const KINDS = [
        ['CAM', '视频监控球机', '视频感知', 'GB28181 直连', 3126, '事件触发', '街面', '人员、车辆与商家门店前秩序抓拍'],
        ['SPR', '枪机半球抓拍一体机', '视频感知', 'ONVIF + 边缘 AI', 1862, '事件触发', '街面', '重点部位定点抓拍、商家经营行为识别'],
        ['DME', '卡口电子警察', '视频感知', 'GB28181 + 识别服务', 940, '1 秒', '街面', '过车与车牌识别、违法取证'],
        ['AUT', '人证核验一体机', '公共服务终端', 'HTTP SDK 推送', 486, '实时', '公共服务', '信息采集、人证比对与访客登记'],
        ['WBC', '智能手环', '人员穿戴', 'BLE 网关 + MQTT', 2140, '5 秒', '城管', '作业人员定位、越界与 SOS 告警（MQ → Flink → 告警）'],
        ['PAT', '电子巡更仪', '人员作业', '4G + NFC 打点', 926, '实时', '城管', '到岗记录与巡查轨迹'],
        ['GPS', '车载定位终端', '移动载具', '4G Cat.1', 1268, '5 秒', '街面', '执法车辆定位轨迹（MQ → Flink → 告警）'],
        ['SVW', '环卫作业车终端', '移动载具', '4G / 5G + MQ', 682, '5 秒', '环卫', '垃圾收运与运输轨迹、车载满溢状态'],
        ['SHP', '运输船智能终端', '移动载具', 'AIS / 北斗 + 载重', 46, '10 秒', '环卫', '垃圾运输航线、载重与进出港上报'],
        ['LVL', '低洼水位计', '水务感知', 'NB-IoT / CoAP', 612, '15 秒', '排水', '下立交与低洼处积水水位、内涝预警'],
        ['WLV', '管网水位计', '水务感知', 'NB-IoT', 864, '15 秒', '排水', '检查井与管网水位监测'],
        ['RLV', '雷达液位计', '水务感知', 'NB-IoT', 268, '5 分钟', '排水', '非接触式液位、泵站前池监测'],
        ['ULV', '超声波液位计', '水务感知', 'MQTT / 4G', 341, '5 分钟', '排水', '调蓄池与河道液位监测'],
        ['MNH', '智能井盖探测器', '市政设施', 'NB-IoT', 1482, '10 分钟', '市政', '井盖位移倾覆与井内水位'],
        ['HYD', '智能消防栓终端', '市政设施', 'NB-IoT', 1940, '15 分钟', '市政', '水压监测、放水与碰撞告警'],
        ['GAS', '燃气管网探测终端', '市政设施', 'Modbus 网关', 758, '1 分钟', '市政', '压力与可燃气体检测、防止泄漏'],
        ['STR', '桥隧应变计', '结构安全', '光纤光栅', 318, '10 分钟', '市政', '桥梁隧道结构形变监测'],
        ['MET', '区域气象站', '环境监测', '4G', 96, '5 分钟', '排水', '雨量风速与气象预警联动'],
        ['INC', '焚烧炉 CEMS 监测站', '环保设施', 'Modbus TCP', 68, '1 分钟', '环卫', '烟气气体与排放检测、达标核算'],
        ['BIN', '智能果壳箱', '环卫设施', 'NB-IoT', 5240, '30 分钟', '环卫', '满溢状态与开盖计数'],
        ['RCY', '回收站称重一体机', '环卫设施', 'HTTP + 地磅网关', 1180, '每单实时', '环卫', '站点数据与分类称重计量'],
        ['LTC', '路灯单灯控制器', '照明控制', 'LoRa', 12480, '1 分钟', '照明', '单灯开关调光控制与故障回传'],
        ['MKR', '地磁车检器', '交通感知', 'Sub-1G', 2140, '1 分钟', '停车', '泊位占用检测与周转统计']
    ];

    /* 场景页 → 本域设备口径；ALL 表示回显全量 23 类
       数据中台 / 运维中心 / 设备数据三页已有各自的设备清单面板，不在此挂载 */
    const PAGES = {
        'smart-drainage.html': { label: '智慧排水', domains: ['排水'] },
        'smart-environment.html': { label: '智慧环卫', domains: ['环卫'] },
        'smart-municipal.html': { label: '智慧市政', domains: ['市政'] },
        'smart-lighting.html': { label: '智慧照明', domains: ['照明'] },
        'smart-parking.html': { label: '智慧停车', domains: ['停车'] },
        'public-service.html': { label: '公共服务', domains: ['公共服务'] },
        'smart-street.html': { label: '智慧街面', domains: ['街面', '城管'] },
        'digital-city-management.html': { label: '数字城管', domains: ['城管', '街面'] },
        'central-command.html': { label: '综合指挥', domains: ['ALL'] }
    };

    const CATEGORY_ICON = {
        '视频感知': '📹', '公共服务终端': '🪪', '人员穿戴': '⌚', '人员作业': '📟',
        '移动载具': '🚚', '水务感知': '💧', '市政设施': '🏗️', '结构安全': '🌉',
        '环境监测': '🌦️', '环保设施': '🔥', '环卫设施': '🗑️', '照明控制': '💡', '交通感知': '🅿️'
    };

    function esc(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function num(n) {
        return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function currentFile() {
        const parts = location.pathname.split('/');
        return parts[parts.length - 1] || 'index.html';
    }

    /** 全市在册合计：23 类 / 39,263 台 */
    function total() {
        return KINDS.reduce(function (a, k) { return a + k[4]; }, 0);
    }

    /** 按归属域取设备行；传空返回全量 */
    function kindsByDomain(domains) {
        if (!domains || !domains.length || domains[0] === 'ALL') return KINDS.slice();
        return KINDS.filter(function (k) { return domains.indexOf(k[6]) > -1; });
    }

    function summary(list) {
        return {
            count: list.length,
            units: list.reduce(function (a, k) { return a + k[4]; }, 0)
        };
    }

    function injectStyle() {
        if (document.getElementById('dev-ctx-style')) return;
        const css = '' +
            '.dev-ctx{font-family:"Microsoft YaHei",sans-serif;font-size:13px;color:#2c3e50;' +
            'margin:0 0 18px;padding:11px 16px;border-radius:12px;border:1px solid rgba(38,166,154,.22);' +
            'border-left:3px solid #26a69a;background:linear-gradient(90deg,rgba(38,166,154,.10),rgba(38,166,154,.02));' +
            'display:flex;flex-direction:column;gap:9px;line-height:1.7}' +
            '.dev-ctx-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px}' +
            '.dev-ctx-badge{display:inline-flex;align-items:center;gap:5px;padding:1px 9px;border-radius:999px;' +
            'background:#00695c;color:#fff;font-size:12px;letter-spacing:.4px}' +
            '.dev-ctx-kv{color:#5b6b7c}.dev-ctx-kv b{color:#00695c;font-weight:700}' +
            '.dev-ctx-kv em{font-style:normal;color:#7f8c9b;font-size:12px}' +
            '.dev-ctx-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:999px;' +
            'background:rgba(0,105,92,.08);border:1px solid rgba(0,105,92,.20);color:#00695c;font-size:12px;' +
            'cursor:default;white-space:nowrap}' +
            '.dev-ctx-chip i{font-style:normal;opacity:.78}' +
            '.dev-ctx-chip b{font-weight:700;color:#0b5b52}' +
            '.dev-ctx-chip:hover{background:rgba(0,105,92,.16);border-color:rgba(0,105,92,.42)}' +
            '.dev-ctx-more{color:#78909c;font-size:12px}' +
            '.dev-ctx-link{margin-left:auto;color:#00897b;text-decoration:none;font-weight:600;white-space:nowrap}' +
            '.dev-ctx-link:hover{color:#00695c;text-decoration:underline}' +
            '@media (max-width:720px){.dev-ctx-link{margin-left:0}}';
        const style = document.createElement('style');
        style.id = 'dev-ctx-style';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function chip(k) {
        return '<span class="dev-ctx-chip" title="' + esc(k[1] + '（' + k[0] + '）· ' + k[3] +
            ' · 上报 ' + k[5] + ' · ' + k[7]) + '">' +
            '<i>' + esc(CATEGORY_ICON[k[2]] || '🔧') + '</i>' + esc(k[1]) + ' <b>' + num(k[4]) + '</b></span>';
    }

    function mount() {
        const file = currentFile();
        const cfg = PAGES[file];
        if (!cfg || document.getElementById('dev-ctx')) return null;

        const header = document.querySelector('.container > header') || document.querySelector('header');
        if (!header || !header.parentNode) return null;

        const list = kindsByDomain(cfg.domains);
        const sum = summary(list);
        const all = total();
        const full = cfg.domains[0] === 'ALL';
        const domTxt = full ? '全域' : cfg.domains.join(' + ');

        const chips = list.map(chip).join('');

        const el = document.createElement('div');
        el.id = 'dev-ctx';
        el.className = 'dev-ctx';
        el.innerHTML =
            '<div class="dev-ctx-row">' +
            '<span class="dev-ctx-badge">🔧 本域接入设备</span>' +
            '<span class="dev-ctx-kv">' + esc(domTxt) + '域在册 <b>' + num(sum.units) + '</b> 台 / <b>' +
            sum.count + '</b> 类<em>（全市 ' + num(all) + ' 台 · 23 类，与数据中台采集口径一致）</em></span>' +
            '<a class="dev-ctx-link" href="' + EQ_PAGE + '?from=' + encodeURIComponent(file) + '">设备台账与物模型 ↗</a>' +
            '</div>' +
            '<div class="dev-ctx-row">' + chips + '</div>' +
            '<div class="dev-ctx-row">' +
            '<span class="dev-ctx-more">类别筹码悬停可查看接入方式、上报频率与业务口径；' +
            '轨迹与定位类设备统一走 MQTT → Flink → 告警中心链路。</span>' +
            '<a class="dev-ctx-link" href="' + DP_PAGE + '?module=collect&from=' + encodeURIComponent(file) +
            '">查看采集通道分布 ↗</a>' +
            '</div>';

        const anchor = document.getElementById('arch-ctx') || header;
        anchor.parentNode.insertBefore(el, anchor.nextSibling);
        injectStyle();

        return { page: file, label: cfg.label, domains: cfg.domains, kinds: sum.count, units: sum.units };
    }

    const DevCatalog = {
        version: DC_VER,
        KINDS: KINDS,
        PAGES: PAGES,
        total: total,
        kindsByDomain: kindsByDomain,
        summary: summary,
        mount: mount,
        context: null
    };

    /* 晚于 arch-link.js 注册：架构回显先插入，本条幅紧随其后 */
    function autoMount() {
        if (!PAGES[currentFile()]) return;
        DevCatalog.context = mount();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoMount);
    } else {
        autoMount();
    }

    global.DevCatalog = DevCatalog;
})(window);
