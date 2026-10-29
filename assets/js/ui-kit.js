/* ==========================================================================
   ui-kit.js —— 智慧城市平台共享交互运行时（零依赖）
   提供：Toast / 模态框与表单 / 表格引擎（搜索、排序、分页、导出）/
        localStorage 持久化 / CSV 导出 / 数据仿真 / 定时刷新 / 时钟
   使用方式：页面在 common.js 之后引入本文件，通过全局 window.SC 调用
   ========================================================================== */
(function (global) {
    'use strict';

    const SC = global.SC = {};

    /* ======================= 基础工具 ======================= */

    const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

    /** HTML 转义，用于把用户输入安全地拼进模板字符串 */
    SC.esc = function (text) {
        return String(text === null || text === undefined ? '' : text)
            .replace(/[&<>"']/g, c => ESC_MAP[c]);
    };

    /** 由 HTML 片段创建元素 */
    SC.el = function (html) {
        const tpl = document.createElement('template');
        tpl.innerHTML = String(html).trim();
        return tpl.content.firstElementChild;
    };

    SC.pad2 = n => String(n).padStart(2, '0');

    /** 千分位格式化，decimals 控制小数位 */
    SC.num = function (value, decimals) {
        const d = decimals === undefined ? 0 : decimals;
        const n = Number(value);
        if (!isFinite(n)) return '--';
        return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    };

    SC.money = function (value, decimals) {
        return '¥' + SC.num(value, decimals === undefined ? 2 : decimals);
    };

    SC.pct = function (value, decimals) {
        return SC.num(value, decimals === undefined ? 1 : decimals) + '%';
    };

    /** Date -> 'YYYY-MM-DD HH:mm:ss' */
    SC.stamp = function (date, withSeconds) {
        const d = date instanceof Date ? date : new Date(date);
        const base = d.getFullYear() + '-' + SC.pad2(d.getMonth() + 1) + '-' + SC.pad2(d.getDate())
            + ' ' + SC.pad2(d.getHours()) + ':' + SC.pad2(d.getMinutes());
        return withSeconds === false ? base : base + ':' + SC.pad2(d.getSeconds());
    };

    SC.today = function () {
        return SC.stamp(new Date(), false).slice(0, 10);
    };

    /** 'HH:mm' -> 分钟数 */
    SC.toMinutes = function (hhmm) {
        const p = String(hhmm || '0:0').split(':');
        return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0);
    };

    SC.clamp = (v, min, max) => Math.min(max, Math.max(min, v));

    SC.debounce = function (fn, wait) {
        let timer = null;
        return function () {
            const args = arguments;
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), wait || 200);
        };
    };

    let uidSeed = 0;
    SC.uid = prefix => (prefix || 'id') + '-' + Date.now().toString(36) + '-' + (++uidSeed);

    /* ======================= 本地持久化 ======================= */

    /** 按「命名空间 + 键」读写 localStorage，异常时静默降级为内存存储 */
    const memoryFallback = {};
    SC.store = {
        get: function (ns, key, defaultValue) {
            const full = 'sc:' + ns + ':' + key;
            let raw = null;
            try {
                raw = global.localStorage.getItem(full);
            } catch (e) {
                raw = memoryFallback[full] || null;
            }
            if (raw === null || raw === undefined) return defaultValue;
            try {
                return JSON.parse(raw);
            } catch (e) {
                return defaultValue;
            }
        },
        set: function (ns, key, value) {
            const full = 'sc:' + ns + ':' + key;
            const raw = JSON.stringify(value);
            try {
                global.localStorage.setItem(full, raw);
            } catch (e) {
                memoryFallback[full] = raw;
            }
            return value;
        },
        remove: function (ns, key) {
            const full = 'sc:' + ns + ':' + key;
            try {
                global.localStorage.removeItem(full);
            } catch (e) {
                delete memoryFallback[full];
            }
        }
    };

    /* ======================= Toast 通知 ======================= */

    const TOAST_ICON = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '⛔' };
    let toastWrap = null;

    /**
     * 轻提示，替代 alert
     * SC.toast('已保存'); SC.toast('水位超限', {type:'warn', title:'防汛预警', duration:4000})
     */
    SC.toast = function (message, options) {
        const opt = options || {};
        const type = opt.type || 'info';
        if (!toastWrap || !toastWrap.isConnected) {
            toastWrap = SC.el('<div class="sc-toast-wrap"></div>');
            document.body.appendChild(toastWrap);
        }
        const node = SC.el(
            '<div class="sc-toast ' + type + '" role="status">' +
            '<div class="ic">' + (opt.icon || TOAST_ICON[type] || TOAST_ICON.info) + '</div>' +
            '<div class="bd">' + (opt.title ? '<b>' + SC.esc(opt.title) + '</b>' : '') + SC.esc(message) + '</div>' +
            '</div>'
        );
        const dismiss = function () {
            if (!node.isConnected) return;
            node.classList.add('out');
            setTimeout(() => node.remove(), 260);
        };
        node.addEventListener('click', dismiss);
        toastWrap.appendChild(node);
        while (toastWrap.children.length > 5) toastWrap.firstElementChild.remove();
        setTimeout(dismiss, opt.duration || 2800);
        return dismiss;
    };

    /* ======================= 模态框 ======================= */

    const modalStack = [];

    SC.modal = {
        /**
         * 打开模态框
         * cfg: {title, body(HTMLString|Node), size:'sm|md|lg', dismissible,
         *       footer:[{text, kind, close, onClick}], onClose}
         * 返回 API：{ close(), body, footer, root }
         */
        open: function (cfg) {
            const options = cfg || {};
            const api = {};
            const root = SC.el('<div class="sc-mask"></div>');
            const box = SC.el('<div class="sc-modal ' + (options.size || 'md') + '" role="dialog"></div>');
            box.innerHTML =
                '<div class="sc-modal-head"><h4>' + SC.esc(options.title || '详情') + '</h4>' +
                '<button class="sc-modal-x" title="关闭">✕</button></div>' +
                '<div class="sc-modal-body"></div>' +
                '<div class="sc-modal-foot"></div>';
            const bodyEl = box.querySelector('.sc-modal-body');
            if (options.body instanceof Node) {
                bodyEl.appendChild(options.body);
            } else {
                bodyEl.innerHTML = options.body || '';
            }
            const footEl = box.querySelector('.sc-modal-foot');
            (options.footer === null ? [] : (options.footer || [{ text: '关闭', kind: 'ghost' }]))
                .forEach(btnCfg => {
                    const btn = SC.el('<button class="sc-btn ' + (btnCfg.kind || '') + '">' + SC.esc(btnCfg.text) + '</button>');
                    btn.addEventListener('click', function () {
                        const keepOpen = btnCfg.onClick && btnCfg.onClick(api) === false;
                        if (btnCfg.close !== false && !keepOpen) api.close();
                    });
                    footEl.appendChild(btn);
                });
            if (!footEl.children.length) footEl.remove();

            root.appendChild(box);
            root.addEventListener('mousedown', function (ev) {
                if (ev.target === root && options.dismissible !== false) api.close();
            });
            box.querySelector('.sc-modal-x').addEventListener('click', () => api.close());

            api.root = root;
            api.body = bodyEl;
            api.footer = footEl;
            api.close = function () {
                const idx = modalStack.indexOf(api);
                if (idx === -1) return;
                modalStack.splice(idx, 1);
                root.remove();
                if (!modalStack.length) document.body.style.overflow = '';
                if (options.onClose) options.onClose();
            };
            api.setTitle = function (t) {
                box.querySelector('h4').textContent = t;
            };

            document.body.appendChild(root);
            document.body.style.overflow = 'hidden';
            modalStack.push(api);
            const firstInput = bodyEl.querySelector('input:not([type=hidden]),select,textarea');
            if (firstInput && options.autofocus !== false) {
                setTimeout(() => firstInput.focus(), 60);
            }
            return api;
        },

        /** 关闭最顶层模态框 */
        top: () => modalStack[modalStack.length - 1] || null,

        closeTop: function () {
            const m = SC.modal.top();
            if (m) m.close();
        },

        /** 确认框，返回 Promise<boolean> */
        confirm: function (cfg) {
            const options = cfg || {};
            return new Promise(resolve => {
                let done = false;
                const m = SC.modal.open({
                    title: options.title || '操作确认',
                    size: 'sm',
                    body: '<div>' + (options.html || SC.esc(options.text || '确定执行该操作？')) + '</div>',
                    footer: [
                        { text: options.cancelText || '取消', kind: 'ghost', onClick: () => { done = true; resolve(false); } },
                        {
                            text: options.okText || '确定', kind: options.danger ? 'danger' : 'primary',
                            onClick: () => { done = true; resolve(true); }
                        }
                    ],
                    onClose: () => { if (!done) resolve(false); }
                });
                void m;
            });
        },

        /**
         * 表单弹窗，返回 Promise<values|null>（取消时为 null）
         * fields: [{name,label,type,options,required,min,max,step,unit,hint,col,placeholder,value,validate,readonly}]
         * type 支持 text/number/date/time/datetime-local/select/textarea/checkgroup/switch/range/static
         */
        form: function (cfg) {
            const options = cfg || {};
            const fields = options.fields || [];
            return new Promise(resolve => {
                const form = SC.buildForm(fields, options.values || {});
                let done = false;
                const m = SC.modal.open({
                    title: options.title || '编辑',
                    size: options.size || (fields.length > 4 ? 'lg' : 'md'),
                    body: form.node,
                    dismissible: false,
                    footer: [
                        { text: options.cancelText || '取消', kind: 'ghost', onClick: () => { done = true; resolve(null); } },
                        {
                            text: options.submitText || '保存', kind: 'primary',
                            onClick: function () {
                                const res = form.read();
                                if (!res.ok) {
                                    SC.toast(res.message || '请检查填写内容', { type: 'error', duration: 3200 });
                                    return false;
                                }
                                if (options.onSubmit) {
                                    const back = options.onSubmit(res.values, m);
                                    if (back === false) { done = true; return false; }
                                }
                                done = true;
                                resolve(res.values);
                            }
                        }
                    ],
                    onClose: () => { if (!done) resolve(null); }
                });
            });
        }
    };

    global.document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape' && modalStack.length) {
            const m = SC.modal.top();
            // dismissible:false 的表单弹窗不允许 ESC 直接关闭，避免误丢数据
            if (m && m.root.querySelector('.sc-modal-body')) m.close();
        }
    });

    /* ======================= 表单构建器 ======================= */

    /** 生成表单节点，返回 {node, read(), set(name,value)} */
    SC.buildForm = function (fields, values) {
        const wrap = SC.el('<form class="sc-form" autocomplete="off"></form>');
        const items = [];
        fields.forEach(field => {
            if (field.type === 'static') {
                const box = SC.el('<div class="sc-field ' + (field.col === 1 ? '' : 'full') + '">' + (field.html || '') + '</div>');
                wrap.appendChild(box);
                return;
            }
            const initial = values && values[field.name] !== undefined ? values[field.name] : field.value;
            const id = 'f-' + SC.uid(field.name);
            const full = field.col === 1 ? '' : ' full';
            const cell = SC.el('<div class="sc-field' + full + '"></div>');
            const label = SC.el('<label for="' + id + '">' + SC.esc(field.label) +
                (field.required ? '<span class="req">*</span>' : '') + '</label>');
            cell.appendChild(label);

            let read = () => null;
            let control;

            if (field.type === 'select') {
                control = SC.el('<select class="sc-input" id="' + id + '"></select>');
                (field.options || []).forEach(op => {
                    const o = document.createElement('option');
                    o.value = op.value !== undefined ? op.value : op;
                    o.textContent = op.label !== undefined ? op.label : op;
                    if (String(o.value) === String(initial !== undefined ? initial : '')) o.selected = true;
                    control.appendChild(o);
                });
                read = () => control.value;
            } else if (field.type === 'textarea') {
                control = SC.el('<textarea class="sc-input" id="' + id + '" placeholder="' + SC.esc(field.placeholder || '') + '"></textarea>');
                control.value = initial === undefined ? '' : initial;
                read = () => control.value.trim();
            } else if (field.type === 'switch') {
                control = SC.el('<div class="sc-switch ' + (initial ? 'on' : '') + '" id="' + id + '"><i></i><span>' + SC.esc(field.onText || '开启') + '</span></div>');
                control.addEventListener('click', () => control.classList.toggle('on'));
                read = () => control.classList.contains('on');
            } else if (field.type === 'checkgroup') {
                control = SC.el('<div class="sc-check-group" id="' + id + '"></div>');
                const list = typeof field.options === 'function' ? field.options() : (field.options || []);
                list.forEach(op => {
                    const val = op.value !== undefined ? op.value : op;
                    const lab = op.label !== undefined ? op.label : op;
                    const on = Array.isArray(initial) && initial.map(String).indexOf(String(val)) > -1;
                    const chip = SC.el('<span class="sc-check' + (on ? ' on' : '') + '">' + SC.esc(lab) + '</span>');
                    chip.dataset.value = val;
                    chip.addEventListener('click', () => chip.classList.toggle('on'));
                    control.appendChild(chip);
                });
                read = () => Array.prototype.map.call(control.querySelectorAll('.sc-check.on'), n => n.dataset.value);
            } else if (field.type === 'range') {
                control = SC.el('<div class="sc-range"><input type="range" id="' + id + '" min="' + (field.min || 0) +
                    '" max="' + (field.max || 100) + '" step="' + (field.step || 1) + '"><output></output></div>');
                const input = control.querySelector('input');
                const out = control.querySelector('output');
                input.value = initial === undefined ? (field.min || 0) : initial;
                const paint = () => {
                    out.textContent = input.value + (field.unit || '');
                    const ratio = (input.value - input.min) / (input.max - input.min || 1) * 100;
                    input.style.background = 'linear-gradient(90deg,#3498db ' + ratio + '%,#e5e8ec ' + ratio + '%)';
                };
                input.addEventListener('input', paint);
                paint();
                read = () => Number(input.value);
            } else {
                const t = field.type || 'text';
                control = SC.el('<input class="sc-input" id="' + id + '" type="' + t + '" placeholder="' + SC.esc(field.placeholder || '') + '"' +
                    (field.step ? ' step="' + field.step + '"' : '') +
                    (field.min !== undefined ? ' min="' + field.min + '"' : '') +
                    (field.max !== undefined ? ' max="' + field.max + '"' : '') +
                    (field.readonly ? ' readonly' : '') + '>');
                control.value = initial === undefined ? '' : initial;
                read = () => (t === 'number' ? (control.value === '' ? '' : Number(control.value)) : control.value.trim());
            }

            cell.appendChild(control);
            const errEl = SC.el('<div class="sc-field-error"></div>');
            cell.appendChild(errEl);
            if (field.hint) {
                const hint = SC.el('<div class="sc-hint" style="margin-top:5px">' + SC.esc(field.hint) + '</div>');
                cell.appendChild(hint);
            }
            wrap.appendChild(cell);
            items.push({ field, read, errEl, control });
        });

        return {
            node: wrap,
            set: function (name, value) {
                const item = items.filter(i => i.field.name === name)[0];
                if (!item) return;
                const input = item.control.querySelector('input,select,textarea') || item.control;
                if (item.field.type === 'switch') item.control.classList.toggle('on', !!value);
                else input.value = value;
            },
            read: function () {
                const out = {};
                let firstError = null;
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const f = item.field;
                    const value = item.read();
                    const empty = value === '' || value === null || value === undefined ||
                        (Array.isArray(value) && !value.length);
                    item.errEl.textContent = '';
                    item.control.classList.remove('bad');
                    if (f.required && empty) {
                        item.control.classList.add('bad');
                        item.errEl.textContent = f.label + '为必填项';
                        if (!firstError) firstError = item.control;
                        continue;
                    }
                    if (!empty && f.type === 'number') {
                        if (!isFinite(value)) {
                            item.control.classList.add('bad');
                            item.errEl.textContent = '请输入数字';
                            if (!firstError) firstError = item.control;
                            continue;
                        }
                        if (f.min !== undefined && value < f.min) {
                            item.control.classList.add('bad');
                            item.errEl.textContent = '不得小于 ' + f.min;
                            if (!firstError) firstError = item.control;
                            continue;
                        }
                        if (f.max !== undefined && value > f.max) {
                            item.control.classList.add('bad');
                            item.errEl.textContent = '不得大于 ' + f.max;
                            if (!firstError) firstError = item.control;
                            continue;
                        }
                    }
                    if (!empty && f.validate) {
                        const msg = f.validate(value, out);
                        if (msg) {
                            item.control.classList.add('bad');
                            item.errEl.textContent = msg;
                            if (!firstError) firstError = item.control;
                            continue;
                        }
                    }
                    out[f.name] = value;
                }
                if (firstError) {
                    firstError.scrollIntoView({ block: 'center' });
                    if (firstError.focus) firstError.focus();
                    return { ok: false, message: '请检查表单中标红的字段' };
                }
                return { ok: true, values: out };
            }
        };
    };

    /* ======================= 表格引擎 ======================= */

    /** 从单元格文本解析可比较的数值（支持千分位、百分号、货币、单位） */
    function parseComparable(text) {
        const s = String(text).trim();
        const m = s.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
        if (!m) return null;
        return Number(m[0]);
    }

    /**
     * 为原生 table 增加：即时搜索、列排序、分页、结果计数、CSV 导出、多选、自定义过滤
     * opts: {pageSize, search(选择器|元素|false), export(名称|false), selectable, keyAttr,
     *        filter(rows)->rows, onRender(ctrl), emptyText, sizeAttr}
     * 返回控制对象：{reload, refresh, getSelectedIds, setFilter, setKeyword, rows, table}
     */
    SC.table = {
        enhance: function (table, opts) {
            if (table.scTable) return table.scTable;
            const options = Object.assign({ pageSize: 8, emptyText: '没有符合条件的数据', export: false, selectable: false }, opts || {});
            const tbody = table.tBodies[0];
            if (!tbody) return null;
            const CK = 'sc-ck-col';
            const OFFSET = options.selectable ? 1 : 0;
            const foot = SC.el('<div class="sc-table-foot"><div class="sc-count"></div><div class="sc-pager"></div></div>');
            const container = table.closest('.data-table-container') || table.parentNode;
            container.parentNode.insertBefore(foot, container.nextSibling);

            const ctrl = { table, state: { page: 1, sortCol: -1, sortDir: 1, keyword: '', filter: null, selected: new Set() } };

            function rawRows() {
                return Array.prototype.filter.call(table.tBodies[0].rows,
                    tr => !tr.classList.contains('sc-empty-row'))
                    .map(tr => ({
                        tr,
                        cells: Array.prototype.slice.call(tr.cells, OFFSET).map(td => td.textContent.trim()),
                        id: tr.dataset[options.keyAttr || 'id'] || ''
                    }));
            }

            /* 分页/搜索/排序一律以 tbody 里的完整行为数据源，render() 只切换行的
             * 显隐与顺序，绝不把 <tr> 移出文档——一旦移出，DOM 就不再是完整数据源，
             * 再读取时总数会塌成一页，翻页只能看到当前页、搜索也只筛当前页。 */

            function detectNumeric(colIndex, rows) {
                let hit = 0, total = 0;
                rows.slice(0, 12).forEach(r => {
                    const v = r.cells[colIndex];
                    if (!v || v === '-') return;
                    total++;
                    if (parseComparable(v) !== null) hit++;
                });
                return total >= 3 && hit / total > 0.7;
            }

            // 表头排序按钮
            const heads = table.tHead ? Array.prototype.slice.call(table.tHead.rows[0].cells) : [];
            heads.forEach((th, idx) => {
                if (th.dataset.noSort !== undefined) return;
                th.classList.add('sc-sortable');
                const ic = document.createElement('span');
                ic.className = 'sc-sort-ic';
                ic.textContent = '⇅';
                th.appendChild(ic);
                th.addEventListener('click', function () {
                    const st = ctrl.state;
                    if (st.sortCol === idx) {
                        st.sortDir = -st.sortDir;
                    } else {
                        st.sortCol = idx;
                        st.sortDir = 1;
                    }
                    st.page = 1;
                    render();
                });
            });

            if (options.selectable) {
                const headCheck = SC.el('<th style="width:34px" data-no-sort><input type="checkbox" class="sc-checkbox" title="全选本页"></th>');
                heads[0] && heads[0].parentNode.insertBefore(headCheck, heads[0]);
                headCheck.querySelector('input').addEventListener('change', function (ev) {
                    const on = ev.target.checked;
                    (ctrl.pageRows || ctrl.visibleRows).forEach(r => on ? ctrl.state.selected.add(r.id) : ctrl.state.selected.delete(r.id));
                    render();
                });
                table.addEventListener('click', function (ev) {
                    const box = ev.target.closest('.sc-row-check');
                    if (!box) return;
                    box.checked ? ctrl.state.selected.add(box.dataset.id) : ctrl.state.selected.delete(box.dataset.id);
                    box.closest('tr').classList.toggle('sc-muted', false);
                    updateCount();
                });
                ctrl.getSelectedIds = () => Array.from(ctrl.state.selected);
                ctrl.clearSelected = function () { ctrl.state.selected.clear(); render(); };
            }

            // 复选框列需补齐到每一行（含当前不在本页的行），
            // 否则 cells 下标与表头列会错位一格，列与数据对不上。
            function ensureCheckCells() {
                Array.prototype.forEach.call(table.tBodies[0].rows, function (tr) {
                    if (tr.classList.contains('sc-empty-row')) return;
                    const id = tr.dataset[options.keyAttr || 'id'] || '';
                    let box = tr.querySelector('.sc-row-check');
                    if (!box) {
                        const td = SC.el('<td class="' + CK + '"><input type="checkbox" class="sc-checkbox sc-row-check"></td>');
                        tr.insertBefore(td, tr.cells[0]);
                        box = td.querySelector('input');
                    }
                    box.dataset.id = id;
                });
            }

            function currentRows() {
                let rows = rawRows();
                if (typeof options.filter === 'function') rows = options.filter(rows, ctrl.state);
                let view = rows;
                if (ctrl.state.filter) view = view.filter(ctrl.state.filter);
                const kw = ctrl.state.keyword.toLowerCase();
                if (kw) {
                    view = view.filter(r => r.cells.join(' ').toLowerCase().indexOf(kw) > -1);
                }
                if (ctrl.state.sortCol > -1) {
                    const idx = ctrl.state.sortCol;
                    const numeric = detectNumeric(idx, view);
                    view.sort(function (a, b) {
                        const av = a.cells[idx], bv = b.cells[idx];
                        if (numeric) {
                            const an = parseComparable(av), bn = parseComparable(bv);
                            return ((an === null ? -Infinity : an) - (bn === null ? -Infinity : bn)) * ctrl.state.sortDir;
                        }
                        return String(av).localeCompare(String(bv), 'zh-CN') * ctrl.state.sortDir;
                    });
                }
                return view;
            }

            function updateCount() {
                foot.querySelector('.sc-count').innerHTML =
                    '共 <b>' + ctrl.visibleRows.length + '</b> 条' +
                    (options.selectable ? '，已选 <b>' + ctrl.state.selected.size + '</b> 项' : '') +
                    '（第 ' + ctrl.state.page + '/' + Math.max(1, ctrl.totalPages) + ' 页）';
            }

            function render() {
                if (options.selectable) ensureCheckCells();
                const old = tbody.querySelector('.sc-empty-row');
                if (old) old.remove();

                const all = currentRows();
                ctrl.visibleRows = all;
                const size = options.pageSize || all.length || 1;
                ctrl.totalPages = Math.max(1, Math.ceil(all.length / size));
                if (ctrl.state.page > ctrl.totalPages) ctrl.state.page = ctrl.totalPages;
                const start = (ctrl.state.page - 1) * size;
                const page = all.slice(start, start + size);
                ctrl.pageRows = page;

                // 先按当前排序把行顺序落到 DOM 上，再切换显隐：
                // 本页行在 DOM 中的相对顺序即排序后的顺序，非本页行仅隐藏不删除。
                all.forEach(r => tbody.appendChild(r.tr));
                const onPage = new Set(page.map(r => r.tr));
                Array.prototype.forEach.call(tbody.rows, function (tr) {
                    const show = onPage.has(tr);
                    tr.classList.toggle('sc-row-hide', !show);
                    if (show) tr.removeAttribute('hidden');
                    else tr.setAttribute('hidden', 'hidden');
                });
                if (options.selectable) {
                    page.forEach(r => {
                        const box = r.tr.querySelector('.sc-row-check');
                        if (box) box.checked = ctrl.state.selected.has(r.id);
                    });
                }
                if (!page.length) {
                    const colspan = (heads.length || 1) + (options.selectable ? 1 : 0);
                    tbody.appendChild(SC.el('<tr class="sc-empty-row"><td colspan="' + colspan + '">' + SC.esc(options.emptyText) + '</td></tr>'));
                }

                heads.forEach((th, idx) => {
                    const ic = th.querySelector('.sc-sort-ic');
                    if (!ic) return;
                    const active = ctrl.state.sortCol === idx;
                    th.classList.toggle('sc-sorted', active);
                    ic.textContent = active ? (ctrl.state.sortDir > 0 ? '↑' : '↓') : '⇅';
                });

                renderPager(all.length);
                updateCount();
                if (options.onRender) options.onRender(ctrl, all);
            }

            function renderPager(total) {
                const pager = foot.querySelector('.sc-pager');
                pager.innerHTML = '';
                if (total <= (options.pageSize || total)) {
                    if (options.export) pager.appendChild(buildExportButton(options.export, ctrl));
                    return;
                }
                const mk = (label, page, disabled, active) => {
                    const b = SC.el('<button' + (disabled ? ' disabled' : '') + (active ? ' class="active"' : '') + '>' + label + '</button>');
                    if (!disabled && !active) b.addEventListener('click', function () { ctrl.state.page = page; render(); });
                    return b;
                };
                pager.appendChild(mk('‹', ctrl.state.page - 1, ctrl.state.page === 1));
                const pages = [];
                for (let i = 1; i <= ctrl.totalPages; i++) {
                    if (i === 1 || i === ctrl.totalPages || Math.abs(i - ctrl.state.page) <= 1) pages.push(i);
                    else if (pages[pages.length - 1] !== '…') pages.push('…');
                }
                pages.forEach(p => p === '…'
                    ? pager.appendChild(SC.el('<button disabled>…</button>'))
                    : pager.appendChild(mk(p, p, false, p === ctrl.state.page)));
                pager.appendChild(mk('›', ctrl.state.page + 1, ctrl.state.page === ctrl.totalPages));
                if (options.export) pager.appendChild(buildExportButton(options.export, ctrl));
            }

            // 搜索框：显式指定，或自动绑定同一模块内的 .search-input
            let searchEl = null;
            if (options.search) {
                searchEl = typeof options.search === 'string' ? document.querySelector(options.search) : options.search;
            } else if (options.search !== false) {
                const scope = table.closest('.module-content') || table.closest('.tab-content') || document;
                searchEl = scope.querySelector('.search-input');
            }
            if (searchEl) {
                searchEl.addEventListener('input', SC.debounce(function () {
                    ctrl.state.keyword = searchEl.value.trim();
                    ctrl.state.page = 1;
                    render();
                }, 180));
                searchEl.placeholder = searchEl.placeholder || '搜索…';
            }
            ctrl.setKeyword = function (kw) {
                ctrl.state.keyword = kw || '';
                if (searchEl) searchEl.value = kw || '';
                ctrl.state.page = 1;
                render();
            };
            ctrl.setFilter = function (fn) {
                ctrl.state.filter = fn;
                ctrl.state.page = 1;
                render();
            };

            ctrl.reload = render;
            ctrl.refresh = render;
            ctrl.rows = () => rawRows();
            table.scTable = ctrl;
            render();
            return ctrl;
        }
    };

    function buildExportButton(name, ctrl) {
        const btn = SC.el('<button class="sc-btn sm ghost">⬇ 导出 CSV</button>');
        btn.addEventListener('click', function () {
            const heads = Array.prototype.slice.call(ctrl.table.tHead ? ctrl.table.tHead.rows[0].cells : []);
            // 可选列（复选框）不参与 cells，导出时必须同步去掉，否则列与数据会整体错开一格
            const hasCheck = heads.length > 0 && !!heads[0].querySelector('input[type=checkbox]');
            const header = heads.map(th => th.textContent.replace(/[⇅↑↓]/g, '').trim());
            if (hasCheck) header.shift();
            const body = (ctrl.visibleRows || []).map(r => r.cells);
            SC.csv.download(name + '_' + SC.today() + '.csv', [header].concat(body));
            SC.toast('已导出 ' + body.length + ' 条记录', { type: 'success' });
        });
        return btn;
    }

    /* ======================= CSV 导出 ======================= */

    SC.csv = {
        /** 导出 CSV（带 BOM，Excel 打开中文不乱码），rows 为二维数组 */
        download: function (filename, rows) {
            const text = rows.map(line => line.map(cell => {
                const v = String(cell === null || cell === undefined ? '' : cell);
                return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
            }).join(',')).join('\r\n');
            const blob = new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename || 'export.csv';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        }
    };

    /* ======================= 数据仿真 ======================= */

    SC.sim = {
        /** [min,max) 随机数 */
        rand: (min, max) => min + Math.random() * (max - min),
        randInt: (min, max) => Math.floor(SC.sim.rand(min, max + 1)),
        pick: arr => arr[Math.floor(Math.random() * arr.length)],
        /** 真值倾向的整数随机（用于「大约 68%」这类演示数据） */
        around: (base, spread) => base + (Math.random() - 0.5) * 2 * spread,
        /** 随机游走：把当前值往前推一小步，并限制在 [min,max] */
        walk: function (value, opts) {
            const o = Object.assign({ min: 0, max: 100, volatility: 2 }, opts || {});
            const next = value + (Math.random() - 0.5) * 2 * o.volatility;
            return Math.min(o.max, Math.max(o.min, next));
        },
        /** 生成一天 24 小时的双峰曲线（早/晚高峰），base 为基准值 */
        dayCurve: function (base, peakAmp, peakHours) {
            const hs = peakHours || [8, 18];
            return Array.from({ length: 24 }, function (_, h) {
                let v = base;
                hs.forEach(ph => {
                    const d = Math.min(Math.abs(h - ph), 24 - Math.abs(h - ph));
                    v += peakAmp * Math.exp(-(d * d) / 6);
                });
                return Math.max(0, Math.round(v));
            });
        },
        hours: n => Array.from({ length: n }, (_, i) => SC.pad2(i) + ':00')
    };

    /* ======================= 定时刷新（实时/暂停） ======================= */

    /**
     * SC.live({interval:1000, onTick:fn, button:btnEl, onStart, onStop})
     * 返回控制器 {start, stop, toggle, running, setInterval}
     */
    SC.live = function (cfg) {
        const options = cfg || {};
        let timer = null;
        const api = {
            running: false,
            start: function () {
                if (api.running) return;
                api.running = true;
                timer = setInterval(tick, options.interval || 1000);
                sync();
                if (options.onStart) options.onStart();
            },
            stop: function () {
                api.running = false;
                clearInterval(timer);
                timer = null;
                sync();
                if (options.onStop) options.onStop();
            },
            toggle: function () {
                api.running ? api.stop() : api.start();
            },
            setInterval: function (ms) {
                options.interval = ms;
                if (api.running) { api.stop(); api.start(); }
            }
        };
        function tick() {
            try {
                if (options.onTick) options.onTick(api);
            } catch (e) {
                console.error('[SC.live] tick error', e);
                api.stop();
            }
        }
        function sync() {
            if (options.button) {
                const wrap = options.button.closest('.sc-live') || options.button;
                wrap.classList.toggle('paused', !api.running);
                const label = wrap.querySelector('[data-live-label]');
                if (label) label.textContent = api.running ? (options.runningText || '实时') : (options.pausedText || '已暂停');
                options.button.textContent = api.running ? '⏸ 暂停' : '▶ 继续';
            }
        }
        if (options.button) options.button.addEventListener('click', api.toggle);
        if (options.autostart !== false) api.start();
        else sync();
        return api;
    };

    /* ======================= 时钟 ======================= */

    /** 绑定 [data-clock] 元素，每秒输出当前时间 */
    SC.initClocks = function () {
        const nodes = document.querySelectorAll('[data-clock]');
        if (!nodes.length) return;
        const paint = function () {
            const d = new Date();
            const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
            nodes.forEach(function (n) {
                n.textContent = (n.dataset.clock === 'date'
                    ? d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 星期' + week
                    : SC.stamp(d) + ' 星期' + week);
            });
        };
        paint();
        setInterval(paint, 1000);
    };

    document.addEventListener('DOMContentLoaded', SC.initClocks);
})(window);
