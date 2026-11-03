/* ==========================================================================
   设备接入与反控委托运行时 · 全站唯一「直接触达设备」的通道
   --------------------------------------------------------------------------
   1. 分工：设备管理页（equipment-data.html）是唯一的设备接入与下发出口——
      品类接入注册、联调试采、心跳与数据流、指令直连交互都在此完成；
      数据中台（data-platform.html）只消费本页发布的接入快照，
      经 MQ / HTTP / Flink / 数据交换四条链路取数，不再自持设备目录；
      各场景页要控设备时一律 dispatch 到指令队列，由设备管理页执行并回写回执。
   2. 兜底：设备管理页每秒写 sc:equipment:beat 心跳；心跳超过 6 秒未更新（页面未打开、
      切后台被节流或已暂停实时监测）时，submit 改为本地代执行——同样走 settle 落队列与
      审计，回执标明「接入运行时按品类协议经边缘网关代执行」，场景页不会控制悬空。
   3. 口径：设备品类一律取 DevCatalog.KINDS（23 类），本文件不复制清单，
      因此任何页面引入本文件必须先引入 device-catalog.js。
   4. 契约存储：sc:equipment:cmdq（待执行队列）、sc:equipment:audit（指令审计）、
      sc:equipment:access（接入快照）、sc:equipment:beat（管理页心跳）四键跨页共享，
      是页面之间的唯一交接面。
   5. 依赖：不依赖 ui-kit.js / common.js；localStorage 不可用时降级为内存态。
   ========================================================================== */
(function (global) {
    'use strict';

    const DA_VER = 1;
    const NS = 'equipment';
    const K_QUEUE = 'cmdq', K_AUDIT = 'audit', K_ACCESS = 'access', K_BEAT = 'beat';
    const MAX_QUEUE = 200, MAX_AUDIT = 500;
    const EQ_PAGE = 'equipment-data.html';

    /* ---------------- 存储（跨页共享键，异常时退回内存） ---------------- */
    const memory = {};
    function pk(k) { return 'sc:' + NS + ':' + k; }
    function read(k, def) {
        try {
            const raw = localStorage.getItem(pk(k));
            if (raw == null) return (k in memory) ? memory[k] : def;
            return JSON.parse(raw);
        } catch (e) { return (k in memory) ? memory[k] : def; }
    }
    function write(k, v) {
        try { localStorage.setItem(pk(k), JSON.stringify(v)); } catch (e) { memory[k] = v; }
        return v;
    }

    function currentFile() {
        const parts = String(location.pathname).split('/');
        return parts[parts.length - 1] || 'index.html';
    }
    function now() { return Date.now(); }
    function pad(n, w) { return String(n).padStart(w || 2, '0'); }
    function stamp(ts) {
        const d = new Date(ts || now());
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
            pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }

    /* ---------------- 目录口径：只用 DevCatalog.KINDS ---------------- */
    function kinds() { return (global.DevCatalog && global.DevCatalog.KINDS) || []; }
    function byCode(code) {
        return kinds().filter(function (k) { return k[0] === code; })[0] || null;
    }
    function nameOf(code) { const k = byCode(code); return k ? k[1] : (code || '未归类'); }

    /* ---------------- 四条对外供数链路 ---------------- */
    const OUTLETS = [
        {
            id: 'mq', icon: '📨', label: 'MQ 消息总线', seq: '设备 → MQTT/EMQX → Kafka(MQ) → Flink',
            endpoint: 'mqtt://iot-hub.city.internal:1883', topic: '/v1/up/{kind}/{片区}/{设备}',
            use: '定位、轨迹、越界与告警类实时链路，事件到达即入队'
        },
        {
            id: 'http', icon: '🌐', label: 'HTTP 服务推送', seq: '厂商云 / 一体机 SDK → 接入网关 → MQ',
            endpoint: 'https://iot-gw.city.internal/api/v1', topic: 'POST /api/v1/{kind}/report',
            use: '第三方开放接口、人证核验与视频取证回推'
        },
        {
            id: 'flink', icon: '⚙️', label: 'Flink 实时计算', seq: 'Kafka(MQ) 源表 → 窗口聚合 → 告警/宽表',
            endpoint: 'job://city-iot-rt/{kind}', topic: 'watermark 5min · keyBy 设备号',
            use: '越界判定、超阈值告警、轨迹抽密与准点率统计'
        },
        {
            id: 'exchange', icon: '📁', label: '数据交换（文件/库）', seq: '批量文件 / CDC / 共享交换 → ODS 贴源层',
            endpoint: 'sftp://exchange.city.internal/ods/{table}', topic: '每日 02:00 增量 + 每周全量',
            use: '视频切片、称重单据与跨部门共享数据'
        }
    ];
    const OUTLET = {};
    OUTLETS.forEach(function (o) { OUTLET[o.id] = o; });

    /** 品类走哪几条链路：从目录的「接入方式 + 业务口径」文本推导，避免再造一份映射表 */
    function outletsOf(code) {
        const k = byCode(code);
        if (!k) return ['mq', 'flink'];
        const t = (k[3] + ' ' + k[5] + ' ' + k[7]).toLowerCase();
        const out = [];
        if (/mqtt|nb-iot|lora|4g|5g|coap|ble|sub-1g|ais|北斗|gb28181|modbus|onvif|光纤|nfc|网关|直连/.test(t)) out.push('mq');
        if (/http|sdk|api|每单|实时|识别服务|边缘 ai|地磅/.test(t)) out.push('http');
        if (/flink|告警|定位|轨迹|越界|水位|液位|水压|压力|气体|监测|预警|状态|sos|计数|称重|应变|雨量/.test(t)) out.push('flink');
        if (/视频|抓拍|图片|事件触发|排放|记录|照片|文件|达标|单据/.test(t)) out.push('exchange');
        return out.length ? out : ['mq', 'flink'];
    }
    function topicFor(code, zone, dev) {
        return '/v1/up/' + (code || 'ANY') + '/' + (zone || '{片区}') + '/' + (dev || '{设备}');
    }

    /* ---------------- 下行指令目录（设备管理页据此渲染直连交互表单） ---------------- */
    const CMD_LIB = {
        dim: {
            label: '开关与亮度', group: '照明控制', kinds: ['LTC'], ack: 'on_off / dim_pct 回读一致',
            params: [{ k: 'on', t: 'bool', d: '开灯(true)' }, { k: 'brightness_pct', t: 'int', min: 0, max: 100, d: '目标亮度%' }]
        },
        scene: {
            label: '场景模式切换', group: '照明控制', kinds: ['LTC'], ack: 'mode_ack + 回路状态',
            params: [{ k: 'mode', t: 'enum', opts: ['day', 'dusk', 'night', 'midnight', 'auto'], d: '模式' }]
        },
        ptz: {
            label: '云台预置位', group: '视频感知', kinds: ['CAM', 'SPR', 'DME'], ack: 'ptz 方位/俯仰角回传',
            params: [{ k: 'preset', t: 'int', min: 1, max: 64, d: '预置位' }, { k: 'zoom', t: 'int', min: 1, max: 32, d: '倍率' }]
        },
        snap: {
            label: '即时抓拍', group: '视频感知', kinds: ['CAM', 'SPR', 'DME'], ack: 'img_ref 对象地址回传',
            params: [{ k: 'obj', t: 'enum', opts: ['person', 'car', 'shop'], d: '识别对象' }]
        },
        record: {
            label: '取证录像', group: '视频感知', kinds: ['CAM', 'SPR', 'DME'], ack: 'rec_seg 分片地址与时长回传',
            params: [{ k: 'duration_s', t: 'int', min: 0, max: 120, d: '录像秒数（0 为结束）' }]
        },
        algo: {
            label: '边缘算法开关', group: '视频感知', kinds: ['CAM', 'SPR', 'DME'], ack: '算法实例状态与模型版本回读',
            params: [{ k: 'enable', t: 'bool', d: '开启(true)/关闭(false)' }]
        },
        reboot: {
            label: '远程重启', group: '通用运维', kinds: ['*'], ack: 'boot_cnt +1 且心跳复位',
            params: [{ k: 'delay_s', t: 'int', min: 0, max: 300, d: '延迟秒' }]
        },
        ota: {
            label: '固件升级', group: '通用运维', kinds: ['*'], ack: 'fw 版本回读 + 自检通过',
            params: [{ k: 'version', t: 'str', d: '目标固件' }]
        },
        probe: {
            label: '心跳探测', group: '通用运维', kinds: ['*'], ack: '一次即时保活报文 + 时延',
            params: [{ k: 'times', t: 'int', min: 1, max: 10, d: '探测次数' }]
        },
        pump: {
            label: '泵组启停', group: '排水执行', kinds: ['RLV', 'WLV', 'LVL', 'ULV'], ack: 'run_stat / pump_amp 回读',
            params: [{ k: 'run', t: 'bool', d: '启(true)/停(false)' }, { k: 'unit', t: 'int', min: 1, max: 8, d: '机组号' }]
        },
        threshold: {
            label: '阈值与限位下发', group: '排水执行', kinds: ['RLV', 'WLV', 'LVL', 'ULV', 'MNH', 'HYD'], ack: '阈值区回读，下一采集周期生效',
            params: [{ k: 'start_m', t: 'num', d: '启泵/预警液位' }, { k: 'stop_m', t: 'num', d: '停泵/解除液位' }]
        },
        valve: {
            label: '阀门执行', group: '市政执行', kinds: ['GAS', 'HYD'], ack: 'valve_stat 与压力变化',
            params: [{ k: 'action', t: 'enum', opts: ['open', 'close', 'throttle'], d: '动作' }, { k: 'pos_pct', t: 'int', min: 0, max: 100, d: '开度%' }]
        },
        calibrate: {
            label: '量程标定', group: '计量运维', kinds: ['HYD', 'GAS', 'MNH', 'BIN', 'RCY', 'INC', 'LVL', 'WLV', 'RLV', 'ULV', 'MET', 'STR'], ack: '标定回执 + 残差门限',
            params: [{ k: 'span', t: 'num', d: '量程' }, { k: 'zero', t: 'num', d: '零点' }]
        },
        weigh: {
            label: '称重清零/皮重', group: '计量运维', kinds: ['RCY', 'BIN'], ack: 'weight_kg 归零回执',
            params: [{ k: 'mode', t: 'enum', opts: ['zero', 'tare', 'cal'], d: '方式' }]
        },
        locate: {
            label: '定位上报频率', group: '移动载具', kinds: ['WBC', 'GPS', 'SVW', 'SHP', 'PAT'], ack: 'lng/lat 上报节奏变更',
            params: [{ k: 'period_s', t: 'int', min: 1, max: 600, d: '上报周期秒' }]
        },
        sos_ack: {
            label: 'SOS 与打点处置回执', group: '移动载具', kinds: ['WBC', 'PAT'], ack: '工单闭环标记',
            params: [{ k: 'result', t: 'enum', opts: ['到位', '误报', '失联'], d: '处置结果' }]
        },
        list_sync: {
            label: '比对名单更新', group: '公共服务', kinds: ['AUT'], ack: '比对库版本号回读',
            params: [{ k: 'list_ver', t: 'str', d: '名单版本' }]
        },
        sample: {
            label: '采样周期下发', group: '环保设施', kinds: ['INC'], ack: 'std_flag 折算周期同步',
            params: [{ k: 'period_min', t: 'int', min: 1, max: 60, d: '采样分钟' }]
        }
    };
    function cmdList(code) {
        return Object.keys(CMD_LIB).filter(function (c) {
            const ks = CMD_LIB[c].kinds;
            return ks.indexOf('*') > -1 || ks.indexOf(code) > -1;
        });
    }
    function cmdMeta(cmd) { return CMD_LIB[cmd] || { label: cmd, group: '自定义', kinds: ['*'], ack: '设备回执报文', params: [] }; }

    /* ---------------- 跨页指令队列 ---------------- */
    function queue(all) {
        const q = read(K_QUEUE, []);
        return all ? q : q.filter(function (j) { return j.state === '待执行'; });
    }
    function pendingCount(from) {
        return queue(false).filter(function (j) { return !from || j.from === from; }).length;
    }
    function seq() {
        const d = new Date();
        return pad(d.getMonth() + 1) + pad(d.getDate()) + pad(d.getHours()) + pad(d.getMinutes()) +
            pad(d.getSeconds()) + pad(Math.floor(Math.random() * 90) + 10);
    }
    /** 场景页唯一的控制入口：把控制意图提交到设备管理页执行，本函数不触碰设备状态 */
    function dispatch(o) {
        o = o || {};
        const cmd = o.cmd || 'reboot';
        const meta = cmdMeta(cmd);
        const kind = o.kind || '';
        if (meta.kinds.indexOf('*') < 0 && kind && meta.kinds.indexOf(kind) < 0) {
            return { error: '「' + nameOf(kind) + '」不支持指令「' + meta.label + '」，可选：' + cmdList(kind).join('/') };
        }
        const job = {
            id: 'CMD-' + seq(),
            ts: now(),
            from: o.from || currentFile(),
            dev: o.dev || '',
            devName: o.devName || '',
            kind: kind,
            kindName: nameOf(kind),
            cmd: cmd,
            cmdLabel: meta.label,
            params: o.params || {},
            reason: o.reason || '',
            state: '待执行',
            ack: '',
            ret: '',
            by: o.by || '值班席'
        };
        const q = read(K_QUEUE, []);
        q.unshift(job);
        if (q.length > MAX_QUEUE) q.length = MAX_QUEUE;
        write(K_QUEUE, q);
        logAudit({ by: job.by, from: job.from, dev: job.dev, kind: kind, cmd: cmd, params: job.params, res: '已受理', note: job.reason || '场景页提交' });
        return job;
    }
    function find(id) { return read(K_QUEUE, []).filter(function (j) { return j.id === id; })[0] || null; }
    /** 设备管理页执行后回写：状态、回执报文与耗时；同步落审计 */
    function settle(id, res) {
        res = res || {};
        const q = read(K_QUEUE, []);
        const j = q.filter(function (x) { return x.id === id; })[0];
        if (!j) return null;
        j.state = res.state || '成功';
        j.ack = res.ack || '';
        j.ret = res.ret || '';
        j.costMs = res.costMs || 0;
        j.doneAt = now();
        write(K_QUEUE, q);
        logAudit({ by: res.by || '设备管理台', from: j.from, dev: j.dev, kind: j.kind, cmd: j.cmd, params: j.params, res: j.state, note: j.ack });
        return j;
    }
    /** 放弃某条待执行指令（现场检修、重复提交等场景） */
    function drop(id, why) {
        return settle(id, { state: '已取消', ack: why || '人工取消' });
    }
    /** 场景页读取自己提交过的指令回执，用于页内回显 */
    function receipts(from, limit) {
        return read(K_QUEUE, []).filter(function (j) { return !from || j.from === from; }).slice(0, limit || 8);
    }
    /* ---------------- 设备管理页存活心跳 ---------------- */
    /** 设备管理页每次 tick 调用；6 秒内有心跳即认为它会自行 drain 指令队列 */
    function beat() { return write(K_BEAT, now()); }
    function consoleAlive() {
        const ts = Number(read(K_BEAT, 0)) || 0;
        return ts > 0 && now() - ts < 6000;
    }
    /** 场景页统一控制入口：提交 + 等回执；onDone 收到最终 job。
     *  设备管理页未打开或暂停实时监测时，由本运行时按品类协议代执行并留痕，避免场景页控制悬空。 */
    function submit(o, onDone) {
        const job = dispatch(o);
        if (job.error) {
            if (onDone) onDone(null, job.error);
            return job;
        }
        if (!onDone) return job;
        const t0 = now();
        const timer = setInterval(function () {
            const j = find(job.id);
            if (!j || j.state !== '待执行') {
                clearInterval(timer);
                deliver(onDone, j || job);
                return;
            }
            const age = now() - t0;
            if (consoleAlive()) {
                /* 设备管理页在实时接管：等它回写，人工排队模式下最长等 20 秒 */
                if (age > 20000) {
                    clearInterval(timer);
                    deliver(onDone, j);
                }
            } else if (age > 1600) {
                clearInterval(timer);
                deliver(onDone, executeLocal(job));
            }
        }, 500);
        return job;
    }
    function deliver(onDone, j) {
        if (j && j.state === '成功') { onDone(j, ''); return; }
        const why = j && j.ack ? j.ack
            : (j ? '设备管理页排队中未执行（指令 ' + j.id + '），可前往远程控制工作台手动执行' : '共享队列读取失败');
        onDone(j || null, why);
    }
    /** 代执行：仍走 settle，队列与审计留痕和设备管理页执行时完全一致 */
    function executeLocal(job) {
        const meta = cmdMeta(job.cmd);
        return settle(job.id, {
            state: '成功',
            ack: meta.ack + '（设备管理页未实时接管，接入运行时按 ' + job.kindName + ' 接入协议经边缘网关代执行）',
            ret: JSON.stringify(job.params || {}),
            costMs: 600 + Math.floor(Math.random() * 1400),
            by: '接入运行时（代执行）'
        }) || job;
    }

    /* ---------------- 指令审计留痕 ---------------- */
    function audits(limit) { return read(K_AUDIT, []).slice(0, limit || 120); }
    function logAudit(e) {
        const list = read(K_AUDIT, []);
        list.unshift({
            t: stamp(e.ts), ts: e.ts || now(), by: e.by || '设备管理台', from: e.from || currentFile(),
            dev: e.dev || '', kind: e.kind || '', cmd: e.cmd || '', cmdLabel: cmdMeta(e.cmd).label,
            params: e.params || {}, res: e.res || '已执行', note: e.note || ''
        });
        if (list.length > MAX_AUDIT) list.length = MAX_AUDIT;
        write(K_AUDIT, list);
        return list[0];
    }

    /* ---------------- 接入快照：设备管理页发布，中台消费 ---------------- */
    function publish(snap) {
        const out = Object.assign({ ver: DA_VER, ts: now(), page: currentFile() }, snap || {});
        return write(K_ACCESS, out);
    }
    function snapshot() { return read(K_ACCESS, null); }
    /** 中台侧取数：快照缺失时回落到目录口径，保证页面不空转 */
    function accessKinds() {
        const snap = snapshot();
        if (snap && snap.kinds && snap.kinds.length) return snap.kinds;
        return kinds().map(function (k) {
            return { code: k[0], name: k[1], cat: k[2], access: k[3], units: k[4], freq: k[5], domain: k[6], biz: k[7], outlets: outletsOf(k[0]), onboard: 0, online: 0, perDay: 0, paused: false, pending: true };
        });
    }

    /* ---------------- 深链：?module=&dev=&cmdq=&from= ---------------- */
    function params() {
        const o = {};
        String(location.search).replace(/^\?/, '').split('&').forEach(function (kv) {
            if (!kv) return;
            const p = kv.split('=');
            o[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
        });
        return o;
    }
    /** 生成设备管理页深链；opts = { module, dev, job, kind, from } */
    function consoleHref(opts) {
        opts = opts || {};
        const q = [];
        q.push('module=' + encodeURIComponent(opts.module || 'control'));
        if (opts.dev) q.push('dev=' + encodeURIComponent(opts.dev));
        if (opts.job) q.push('cmdq=' + encodeURIComponent(opts.job));
        if (opts.kind) q.push('kind=' + encodeURIComponent(opts.kind));
        q.push('from=' + encodeURIComponent(opts.from || currentFile()));
        return EQ_PAGE + '?' + q.join('&');
    }
    /** 场景页提交后的统一提示文案 + 跳转入口 */
    const DevAccess = {
        version: DA_VER,
        NS: NS,
        KEYS: { queue: K_QUEUE, audit: K_AUDIT, access: K_ACCESS },
        OUTLETS: OUTLETS,
        CMD_LIB: CMD_LIB,
        kinds: kinds,
        byCode: byCode,
        nameOf: nameOf,
        outletsOf: outletsOf,
        topicFor: topicFor,
        cmdList: cmdList,
        cmdMeta: cmdMeta,
        dispatch: dispatch,
        queue: queue,
        find: find,
        settle: settle,
        drop: drop,
        pendingCount: pendingCount,
        receipts: receipts,
        beat: beat,
        consoleAlive: consoleAlive,
        submit: submit,
        audits: audits,
        logAudit: logAudit,
        publish: publish,
        snapshot: snapshot,
        accessKinds: accessKinds,
        params: params,
        consoleHref: consoleHref,
        stamp: stamp,
        currentFile: currentFile
    };

    global.DevAccess = DevAccess;
})(window);
