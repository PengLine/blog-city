/* ==========================================================================
   charts.js —— 轻量 Canvas 图表（折线 / 柱状 / 饼图 / 仪表盘 / 迷你走势）
   零依赖、支持高分屏、自适应容器宽度、内置悬浮提示
   用法：SC.chart.line(canvasEl, cfg) -> { update(cfg) }
   ========================================================================== */
(function (global) {
    'use strict';

    const SC = global.SC = global.SC || {};
    const chart = SC.chart = {};

    const PALETTE = ['#3498db', '#27ae60', '#f39c12', '#e74c3c', '#9b59b6', '#00b4d8', '#e67e22', '#16a085'];
    const AXIS = '#dfe6ec';
    const TEXT = '#8a97a5';
    const FONT = '12px "Microsoft YaHei", sans-serif';

    function roundRectPath(ctx, x, y, w, h, r) {
        const rad = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rad, y);
        ctx.lineTo(x + w - rad, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x, y + rad);
        ctx.quadraticCurveTo(x, y, x + rad, y);
        ctx.closePath();
    }

    /** 依据容器尺寸按 devicePixelRatio 铺满画布，返回绘图上下文与逻辑宽高 */
    function surface(canvas) {
        const dpr = global.devicePixelRatio || 1;
        const parent = canvas.parentNode;
        const parentW = parent ? parent.clientWidth : 0;
        /* 画布未被 CSS 约束宽度时，clientWidth 取自画布自身的属性宽度，
           直接回写会形成「越画越宽」的正反馈，这里统一以父容器宽度封顶。 */
        let w = canvas.clientWidth || parentW || 320;
        if (parentW > 40 && w > parentW) w = parentW;
        const h = canvas.clientHeight || 220;
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
        }
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.font = FONT;
        return { ctx, w, h };
    }

    function short(v, unit) {
        const n = Number(v);
        if (!isFinite(n)) return '--';
        const abs = Math.abs(n);
        let text;
        if (abs >= 100000000) text = (n / 100000000).toFixed(1) + '亿';
        else if (abs >= 10000) text = (n / 10000).toFixed(abs >= 100000 ? 0 : 1) + '万';
        else if (abs >= 1000) text = n.toLocaleString('en-US', { maximumFractionDigits: 0 });
        else text = String(Math.round(n * 100) / 100);
        return text + (unit || '');
    }

    /** 绑定画布：负责首绘、容器缩放重绘、悬浮提示的显示隐藏 */
    function attach(canvas, cfg, draw) {
        if (!canvas) return null;
        if (canvas.__chart && canvas.__chart.detach) canvas.__chart.detach();
        const tipHost = canvas.parentNode;
        let tip = tipHost.querySelector('.sc-chart-tip');
        if (!tip) {
            tip = document.createElement('div');
            tip.className = 'sc-chart-tip';
            tipHost.appendChild(tip);
        }
        const inst = {
            cfg: cfg || {},
            geo: null,
            hover: -1,
            showTip(html, x, y) {
                if (!html) {
                    tip.style.opacity = 0;
                    return;
                }
                tip.innerHTML = html;
                tip.style.opacity = 1;
                const hostW = tipHost.clientWidth;
                const tipW = tip.offsetWidth;
                tip.style.left = Math.max(4, Math.min(hostW - tipW - 4, x - tipW / 2)) + 'px';
                tip.style.top = Math.max(4, y - tip.offsetHeight - 12) + 'px';
            },
            update(next) {
                inst.cfg = Object.assign({}, inst.cfg, next || {});
                paint();
            },
            detach() {
                global.removeEventListener('resize', onResize);
                canvas.removeEventListener('mousemove', onMove);
                canvas.removeEventListener('mouseleave', onLeave);
            }
        };
        function paint() {
            const s = surface(canvas);
            inst.geo = draw(s.ctx, s.w, s.h, inst.cfg, inst) || null;
        }
        function onResize() {
            // 画布已被移除（例如表格重绘）时自动解绑，避免无谓重算与空引用
            if (!canvas.isConnected) {
                inst.detach();
                return;
            }
            paint();
        }
        function onMove(ev) {
            const rect = canvas.getBoundingClientRect();
            const hit = inst.geo && inst.geo.hit ? inst.geo.hit(ev.clientX - rect.left, ev.clientY - rect.top) : null;
            inst.hover = hit ? hit.index : -1;
            paint();
            if (hit && hit.html) inst.showTip(hit.html, hit.x, hit.y);
            else inst.showTip(null);
        }
        function onLeave() {
            inst.hover = -1;
            inst.showTip(null);
            paint();
        }
        global.addEventListener('resize', SC.debounce(onResize, 150));
        canvas.addEventListener('mousemove', onMove);
        canvas.addEventListener('mouseleave', onLeave);
        paint();
        canvas.__chart = inst;
        return inst;
    }

    /* ======================= 折线 / 面积图 ======================= */

    /**
     * cfg = {labels, series:[{name,data,color,fill,dash}], unit, yMin, yMax, yTicks,
     *        minimal, smooth, thresholds:[{value,label,color}], xEvery}
     */
    chart.line = function (canvas, cfg) {
        return attach(canvas, cfg, function (ctx, w, h, c, inst) {
            const minimal = !!c.minimal;
            const padL = minimal ? 2 : (c.padL || 52);
            const padR = minimal ? 2 : 14;
            const padT = minimal ? 4 : 14;
            const padB = minimal ? 4 : 26;
            const axisColor = c.axisColor || AXIS;
            const textColor = c.textColor || TEXT;
            const series = (c.series || []).filter(s => s && s.visible !== false);
            const labels = c.labels || [];
            const plotW = Math.max(10, w - padL - padR);
            const plotH = Math.max(10, h - padT - padB);

            let max = c.yMax, min = c.yMin;
            if (max === undefined || min === undefined) {
                const flat = [];
                series.forEach(s => s.data.forEach(v => isFinite(v) && flat.push(v)));
                (c.thresholds || []).forEach(t => flat.push(t.value));
                if (!flat.length) flat.push(0, 1);
                const dMax = Math.max.apply(null, flat);
                const dMin = Math.min.apply(null, flat);
                const span = dMax - dMin || Math.abs(dMax) || 1;
                if (max === undefined) max = dMax + span * 0.12;
                if (min === undefined) min = c.zeroBased ? 0 : Math.max(0, dMin - span * 0.18);
            }
            if (max === min) max = min + 1;
            const xAt = i => padL + (labels.length < 2 ? plotW / 2 : plotW * i / (labels.length - 1));
            const yAt = v => padT + plotH - (v - min) / (max - min) * plotH;

            // 网格与坐标轴
            if (!minimal) {
                const ticks = c.yTicks || 4;
                ctx.textBaseline = 'middle';
                for (let t = 0; t <= ticks; t++) {
                    const value = min + (max - min) * t / ticks;
                    const y = yAt(value);
                    ctx.strokeStyle = axisColor;
                    ctx.lineWidth = 1;
                    ctx.setLineDash(t === 0 ? [] : [4, 4]);
                    ctx.beginPath();
                    ctx.moveTo(padL, y);
                    ctx.lineTo(padL + plotW, y);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.fillStyle = textColor;
                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(short(value, c.unit), padL - 8, y);
                }
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                const every = c.xEvery || Math.ceil(labels.length / 8);
                labels.forEach((lab, i) => {
                    if (i % every === 0 || i === labels.length - 1) {
                        ctx.fillStyle = textColor;
                        ctx.fillText(String(lab), xAt(i), padT + plotH + 8);
                    }
                });
            }

            // 阈值参考线（如警戒水位）
            (c.thresholds || []).forEach(function (th) {
                if (th.value < min || th.value > max) return;
                const y = yAt(th.value);
                ctx.strokeStyle = th.color || '#e74c3c';
                ctx.lineWidth = 1.4;
                ctx.setLineDash([6, 4]);
                ctx.beginPath();
                ctx.moveTo(padL, y);
                ctx.lineTo(padL + plotW, y);
                ctx.stroke();
                ctx.setLineDash([]);
                if (!minimal) {
                    ctx.fillStyle = th.color || '#e74c3c';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(th.label || '', padL + 4, y - 3);
                }
            });

            // 数据线
            series.forEach(function (s, si) {
                const color = s.color || PALETTE[si % PALETTE.length];
                const pts = s.data.map((v, i) => [xAt(i), isFinite(v) ? yAt(v) : null]).filter(p => p[1] !== null);
                if (!pts.length) return;
                if (s.fill !== false && !minimal) {
                    const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
                    grad.addColorStop(0, hexA(color, c.area === false ? 0.05 : 0.28));
                    grad.addColorStop(1, hexA(color, 0.02));
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    tracePath(ctx, pts, c.smooth === false);
                    ctx.lineTo(pts[pts.length - 1][0], padT + plotH);
                    ctx.lineTo(pts[0][0], padT + plotH);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.strokeStyle = color;
                ctx.lineWidth = s.width || (minimal ? 1.6 : 2.2);
                ctx.setLineDash(s.dash || []);
                ctx.lineJoin = 'round';
                ctx.beginPath();
                tracePath(ctx, pts, c.smooth === false);
                ctx.stroke();
                ctx.setLineDash([]);
                if (inst.hover >= 0 && s.data[inst.hover] !== undefined) {
                    const hx = xAt(inst.hover), hy = yAt(s.data[inst.hover]);
                    ctx.fillStyle = 'white';
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2.4;
                    ctx.beginPath();
                    ctx.arc(hx, hy, 4.2, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                }
            });

            // 悬浮竖线
            if (inst.hover >= 0 && !minimal) {
                ctx.strokeStyle = c.hoverColor || 'rgba(44,62,80,0.35)';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(xAt(inst.hover), padT);
                ctx.lineTo(xAt(inst.hover), padT + plotH);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            return {
                hit(mx, my) {
                    if (!labels.length || mx < padL - 12 || mx > w - padR + 6) return null;
                    const ratio = (mx - padL) / plotW;
                    const index = SC.clamp(Math.round(ratio * (labels.length - 1)), 0, labels.length - 1);
                    const lines = ['<b>' + SC.esc(labels[index]) + '</b>'];
                    series.forEach(function (s, si) {
                        const v = s.data[index];
                        lines.push('<span style="color:' + (s.color || PALETTE[si % PALETTE.length]) + '">●</span> ' +
                            SC.esc(s.name || '系列' + (si + 1)) + '：' + SC.esc(short(v, c.unit)));
                    });
                    return { index, html: minimal ? null : lines.join('<br>'), x: xAt(index), y: padT + 6 };
                }
            };
        });
    };

    function tracePath(ctx, pts, straight) {
        ctx.moveTo(pts[0][0], pts[0][1]);
        if (straight || pts.length < 3) {
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
            return;
        }
        for (let i = 1; i < pts.length - 1; i++) {
            const midX = (pts[i][0] + pts[i + 1][0]) / 2;
            const midY = (pts[i][1] + pts[i + 1][1]) / 2;
            ctx.quadraticCurveTo(pts[i][0], pts[i][1], midX, midY);
        }
        ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    }

    /** #rrggbb -> rgba(r,g,b,a) */
    function hexA(hex, alpha) {
        const m = String(hex).replace('#', '');
        if (m.length !== 6) return hex;
        return 'rgba(' + parseInt(m.slice(0, 2), 16) + ',' + parseInt(m.slice(2, 4), 16) + ',' +
            parseInt(m.slice(4, 6), 16) + ',' + alpha + ')';
    }

    /* ======================= 柱状图 ======================= */

    /** cfg = {labels, series:[{name,data,color}], stacked, unit, yMax, horizontal} */
    chart.bar = function (canvas, cfg) {
        return attach(canvas, cfg, function (ctx, w, h, c, inst) {
            const axisColor = c.axisColor || AXIS;
            const textColor = c.textColor || TEXT;
            const labels = c.labels || [];
            const series = (c.series || []).filter(s => s && s.visible !== false);
            const padL = c.padL || 52, padR = 14, padT = 14, padB = 28;
            const plotW = Math.max(10, w - padL - padR);
            const plotH = Math.max(10, h - padT - padB);
            let max = c.yMax;
            if (max === undefined) {
                const totals = labels.map((_, i) => {
                    if (c.stacked) return series.reduce((sum, s) => sum + (Number(s.data[i]) || 0), 0);
                    return Math.max.apply(null, series.map(s => Number(s.data[i]) || 0).concat([0]));
                });
                max = Math.max.apply(null, totals.concat([1])) * 1.15;
            }
            const min = 0;
            const bandW = plotW / Math.max(1, labels.length);
            const groupCount = c.stacked ? 1 : series.length || 1;
            const barW = Math.max(4, Math.min(38, bandW * 0.62 / groupCount));
            const yAt = v => padT + plotH - (v - min) / (max - min) * plotH;

            for (let t = 0; t <= 4; t++) {
                const value = min + (max - min) * t / 4;
                const y = yAt(value);
                ctx.strokeStyle = axisColor;
                ctx.setLineDash(t === 0 ? [] : [4, 4]);
                ctx.beginPath();
                ctx.moveTo(padL, y);
                ctx.lineTo(padL + plotW, y);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = textColor;
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                ctx.fillText(short(value, c.unit), padL - 8, y);
            }

            labels.forEach(function (lab, i) {
                const center = padL + bandW * (i + 0.5);
                ctx.fillStyle = textColor;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                if (bandW > 26 || i % 2 === 0) ctx.fillText(String(lab), center, padT + plotH + 8);
                if (c.stacked) {
                    let acc = 0;
                    const x = center - barW / 2;
                    series.forEach(function (s, si) {
                        const v = Number(s.data[i]) || 0;
                        const top = yAt(acc + v), bottom = yAt(acc);
                        ctx.fillStyle = (s.color || PALETTE[si % PALETTE.length]);
                        ctx.globalAlpha = inst.hover === -1 || inst.hover === i ? 1 : 0.45;
                        ctx.fillRect(x, top, barW, Math.max(1, bottom - top));
                        ctx.globalAlpha = 1;
                        acc += v;
                    });
                } else {
                    const total = barW * series.length;
                    series.forEach(function (s, si) {
                        const v = Number(s.data[i]) || 0;
                        const x = center - total / 2 + si * barW;
                        const color = s.color || PALETTE[si % PALETTE.length];
                        ctx.fillStyle = color;
                        ctx.globalAlpha = inst.hover === -1 || inst.hover === i ? 1 : 0.45;
                        roundRectPath(ctx, x, yAt(v), barW - 2, padT + plotH - yAt(v), 4);
                        ctx.fill();
                        ctx.globalAlpha = 1;
                    });
                }
            });

            return {
                hit(mx, my) {
                    if (mx < padL || mx > padL + plotW || !labels.length) return null;
                    const index = SC.clamp(Math.floor((mx - padL) / bandW), 0, labels.length - 1);
                    const lines = ['<b>' + SC.esc(labels[index]) + '</b>'];
                    let total = 0;
                    series.forEach(function (s, si) {
                        const v = Number(s.data[index]) || 0;
                        total += v;
                        lines.push('<span style="color:' + (s.color || PALETTE[si % PALETTE.length]) + '">●</span> ' +
                            SC.esc(s.name || '系列' + (si + 1)) + '：' + SC.esc(short(v, c.unit)));
                    });
                    if (c.stacked || series.length > 1) lines.push('合计：' + SC.esc(short(total, c.unit)));
                    return { index, html: lines.join('<br>'), x: padL + bandW * (index + 0.5), y: padT + 4 };
                }
            };
        });
    };

    /* ======================= 饼图 / 环形图 ======================= */

    /** cfg = {labels, data, colors, donut, centerTop, centerBottom, unit} */
    chart.pie = function (canvas, cfg) {
        return attach(canvas, cfg, function (ctx, w, h, c, inst) {
            const data = c.data || [];
            const total = data.reduce((s, v) => s + (Number(v) || 0), 0) || 1;
            const cx = w / 2, cy = h / 2;
            const outer = Math.min(w, h) / 2 - 14;
            const inner = c.donut === false ? 0 : outer * 0.58;
            let angle = -Math.PI / 2;
            const slices = [];
            data.forEach(function (v, i) {
                const sweep = (Number(v) || 0) / total * Math.PI * 2;
                const color = (c.colors && c.colors[i]) || PALETTE[i % PALETTE.length];
                const active = inst.hover === i;
                const r = active ? outer + 5 : outer;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
                ctx.arc(cx, cy, r, angle, angle + sweep);
                ctx.arc(cx, cy, inner, angle + sweep, angle, true);
                ctx.closePath();
                ctx.fillStyle = color;
                ctx.globalAlpha = inst.hover === -1 || active ? 1 : 0.55;
                ctx.fill();
                ctx.globalAlpha = 1;
                slices.push({ start: angle, end: angle + sweep, value: v, label: c.labels[i], color });
                angle += sweep;
            });
            if (inner) {
                ctx.fillStyle = 'white';
                ctx.beginPath();
                ctx.arc(cx, cy, inner - 1, 0, Math.PI * 2);
                ctx.fill();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#2c3e50';
                ctx.font = 'bold 18px "Microsoft YaHei", sans-serif';
                ctx.fillText(c.centerTop !== undefined ? c.centerTop : short(total, c.unit), cx, cy - 8);
                ctx.font = FONT;
                ctx.fillStyle = TEXT;
                ctx.fillText(c.centerBottom || '合计', cx, cy + 13);
            }
            return {
                hit(mx, my) {
                    const dx = mx - cx, dy = my - cy;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > outer + 6 || dist < inner) return null;
                    let a = Math.atan2(dy, dx);
                    if (a < -Math.PI / 2) a += Math.PI * 2;
                    const idx = slices.findIndex(s => a >= s.start && a < s.end);
                    if (idx < 0) return null;
                    const s = slices[idx];
                    return {
                        index: idx,
                        html: '<b>' + SC.esc(s.label) + '</b><br>' + SC.esc(short(s.value, c.unit)) +
                            '（' + (s.value / total * 100).toFixed(1) + '%）',
                        x: mx, y: my
                    };
                }
            };
        });
    };

    /* ======================= 仪表盘 ======================= */

    /** cfg = {value, min, max, label, unit, color, decimals, segments:[{to,color,name}]} */
    chart.gauge = function (canvas, cfg) {
        return attach(canvas, cfg, function (ctx, w, h, c) {
            const min = c.min || 0, max = c.max === undefined ? 100 : c.max;
            const cx = w / 2, cy = h * 0.78;
            const r = Math.min(w / 2 - 10, h * 0.72);
            const start = Math.PI * 0.85, end = Math.PI * 2.15;
            const ratio = SC.clamp((Number(c.value) - min) / (max - min || 1), 0, 1);
            ctx.lineWidth = Math.max(10, r * 0.2);
            ctx.lineCap = 'round';
            ctx.strokeStyle = '#eef2f6';
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.78, start, end);
            ctx.stroke();
            let color = c.color || '#3498db';
            if (c.segments) {
                const hitSeg = c.segments.filter(s => Number(c.value) <= s.to)[0];
                color = (hitSeg && hitSeg.color) || c.segments[c.segments.length - 1].color;
            }
            ctx.strokeStyle = color;
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.78, start, start + (end - start) * ratio);
            ctx.stroke();
            if (c.segments) {
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                c.segments.forEach(function (s) {
                    const a = start + (end - start) * SC.clamp((s.to - min) / (max - min || 1), 0, 1);
                    ctx.beginPath();
                    ctx.moveTo(cx + Math.cos(a) * (r * 0.78 - r * 0.1), cy + Math.sin(a) * (r * 0.78 - r * 0.1));
                    ctx.lineTo(cx + Math.cos(a) * (r * 0.78 + r * 0.1), cy + Math.sin(a) * (r * 0.78 + r * 0.1));
                    ctx.stroke();
                });
            }
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#2c3e50';
            ctx.font = 'bold ' + Math.max(18, r * 0.34) + 'px "Microsoft YaHei", sans-serif';
            ctx.fillText(SC.num(c.value, c.decimals === undefined ? 1 : c.decimals) + (c.unit || ''), cx, cy - r * 0.12);
            ctx.font = FONT;
            ctx.fillStyle = TEXT;
            ctx.fillText(c.label || '', cx, cy + r * 0.28);
            return null;
        });
    };

    /* ======================= 迷你走势线（表格内嵌） ======================= */

    chart.spark = function (canvas, cfg) {
        return chart.line(canvas, Object.assign({ minimal: true, smooth: false, unit: '' }, cfg || {}));
    };

    /* ======================= HTML 图例（可点击切换系列） ======================= */

    /** legend(hostEl, [{name,color,value,off}], onToggle(index)) */
    chart.legend = function (host, items, onToggle) {
        if (!host) return;
        host.className = 'sc-legend';
        host.innerHTML = '';
        items.forEach(function (item, i) {
            const span = SC.el('<span' + (item.off ? ' class="off">' : '>') +
                '<i style="background:' + item.color + '"></i>' + SC.esc(item.name) +
                (item.value === undefined || item.value === null ? '' : ' <b>' + SC.esc(item.value) + '</b>') + '</span>');
            if (onToggle) {
                span.addEventListener('click', function () {
                    span.classList.toggle('off');
                    onToggle(i, !span.classList.contains('off'));
                });
            }
            host.appendChild(span);
        });
    };

    SC.chartPalette = PALETTE;
})(window);
