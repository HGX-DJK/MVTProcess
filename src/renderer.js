/**
 * 矢量瓦片交互式 Canvas 渲染引擎
 * 支持：视口拖拽平移、滚轮缩放、rAF 帧率优化、高分屏 (HiDPI) 适配、图层显隐、EvenOdd 带孔多边形填充、全要素拾取与高亮
 */

function distToSegment(p, v, w) {
    const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projX = v.x + t * (w.x - v.x);
    const projY = v.y + t * (w.y - v.y);
    return Math.hypot(p.x - projX, p.y - projY);
}

function pointInPolygon(p, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i].x, yi = ring[i].y;
        const xj = ring[j].x, yj = ring[j].y;
        const intersect = ((yi > p.y) !== (yj > p.y)) &&
            (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

export class TileRenderer {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.options = {
            backgroundColor: '#13151b',
            tileBorderColor: '#374151',
            showGrid: true,
            showLabels: true,
            theme: 'dark',
            ...options
        };

        this.tileData = null;
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.dpr = window.devicePixelRatio || 1;
        this._renderRequested = false;

        this.selectedFeature = null; // 当前高亮选中的要素
        this.onClickFeature = null;

        this.initEvents();
        this.resize();
    }

    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;

        this.canvas.width = width * this.dpr;
        this.canvas.height = height * this.dpr;
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';

        this.requestRender();
    }

    setTileData(tileData) {
        this.tileData = tileData;
        this.selectedFeature = null;
        this.resetView();
    }

    resetView() {
        this.zoom = 0.92;
        this.panX = 0;
        this.panY = 0;
        this.requestRender();
    }

    setZoom(newZoom) {
        this.zoom = Math.max(0.05, Math.min(newZoom, 80));
        this.requestRender();
    }

    zoomBy(factor) {
        this.setZoom(this.zoom * factor);
    }

    setTheme(themeName) {
        if (themeName === 'light') {
            this.options.theme = 'light';
            this.options.backgroundColor = '#f8fafc';
            this.options.tileBorderColor = '#cbd5e1';
        } else {
            this.options.theme = 'dark';
            this.options.backgroundColor = '#13151b';
            this.options.tileBorderColor = '#374151';
        }
        this.requestRender();
    }

    setSelectedFeature(feat) {
        this.selectedFeature = feat;
        this.requestRender();
    }

    requestRender() {
        if (!this._renderRequested) {
            this._renderRequested = true;
            requestAnimationFrame(() => {
                this._renderRequested = false;
                this.render();
            });
        }
    }

    initEvents() {
        const c = this.canvas;

        c.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // 左键拖拽
                this.isDragging = true;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                c.style.cursor = 'grabbing';
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                const dx = e.clientX - this.lastMouseX;
                const dy = e.clientY - this.lastMouseY;
                this.panX += dx;
                this.panY += dy;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                this.requestRender();
            }
        });

        window.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                c.style.cursor = 'grab';
            }
        });

        c.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = c.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
            const newZoom = Math.max(0.05, Math.min(this.zoom * zoomFactor, 80));

            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            this.panX -= (mouseX - centerX - this.panX) * (newZoom / this.zoom - 1);
            this.panY -= (mouseY - centerY - this.panY) * (newZoom / this.zoom - 1);

            this.zoom = newZoom;
            this.requestRender();
        }, { passive: false });

        c.addEventListener('click', (e) => {
            if (!this.tileData || !this.onClickFeature) return;
            const hit = this.hitTest(e.clientX, e.clientY);
            this.setSelectedFeature(hit ? hit.feature : null);
            this.onClickFeature(hit);
        });
    }

    screenToTile(screenX, screenY) {
        if (!this.tileData) return null;
        const rect = this.canvas.getBoundingClientRect();
        const extent = this.tileData.extent || 4096;
        const baseScale = Math.min(rect.width, rect.height) / extent;
        const scale = baseScale * this.zoom;

        const centerX = rect.width / 2 + this.panX;
        const centerY = rect.height / 2 + this.panY;

        const tileX = (screenX - rect.left - centerX) / scale + extent / 2;
        const tileY = (screenY - rect.top - centerY) / scale + extent / 2;

        return { x: tileX, y: tileY };
    }

    /**
     * 全几何类型拾取检测（点、线、面）
     */
    hitTest(screenX, screenY) {
        const pt = this.screenToTile(screenX, screenY);
        if (!pt || !this.tileData) return null;

        const extent = this.tileData.extent || 4096;
        const baseScale = Math.min(this.canvas.clientWidth, this.canvas.clientHeight) / extent;
        const scale = baseScale * this.zoom;
        const tolerance = 12 / scale; // 屏幕 12px 容差转瓦片坐标

        // 优先拾取点要素 -> 线要素 -> 面要素
        const layers = this.tileData.layers;

        // 1. 点拾取 (Point)
        for (let i = layers.length - 1; i >= 0; i--) {
            const layer = layers[i];
            if (!layer.visible) continue;
            for (const feat of layer.features) {
                if (feat.type !== 1) continue;
                for (const ring of feat.geometry) {
                    for (const p of ring) {
                        if (Math.hypot(p.x - pt.x, p.y - pt.y) <= tolerance) {
                            return { layer, feature: feat };
                        }
                    }
                }
            }
        }

        // 2. 线拾取 (LineString)
        for (let i = layers.length - 1; i >= 0; i--) {
            const layer = layers[i];
            if (!layer.visible) continue;
            for (const feat of layer.features) {
                if (feat.type !== 2) continue;
                for (const line of feat.geometry) {
                    for (let k = 0; k < line.length - 1; k++) {
                        if (distToSegment(pt, line[k], line[k + 1]) <= tolerance) {
                            return { layer, feature: feat };
                        }
                    }
                }
            }
        }

        // 3. 面拾取 (Polygon)
        for (let i = layers.length - 1; i >= 0; i--) {
            const layer = layers[i];
            if (!layer.visible) continue;
            for (const feat of layer.features) {
                if (feat.type !== 3) continue;
                // 外环包含且未落在内环中
                let inside = false;
                for (const ring of feat.geometry) {
                    if (pointInPolygon(pt, ring)) {
                        inside = !inside;
                    }
                }
                if (inside) {
                    return { layer, feature: feat };
                }
            }
        }

        return null;
    }

    render() {
        const ctx = this.ctx;
        const width = this.canvas.width / this.dpr;
        const height = this.canvas.height / this.dpr;

        ctx.save();
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        // 背景
        ctx.fillStyle = this.options.backgroundColor;
        ctx.fillRect(0, 0, width, height);

        if (!this.tileData) {
            ctx.fillStyle = this.options.theme === 'light' ? '#94a3b8' : '#6b7280';
            ctx.font = '15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('请拖拽 PBF / MVT 矢量瓦片文件到此，或点击左上角打开文件', width / 2, height / 2);
            ctx.restore();
            return;
        }

        const extent = this.tileData.extent || 4096;
        const baseScale = Math.min(width, height) / extent;
        const scale = baseScale * this.zoom;

        const centerX = width / 2 + this.panX;
        const centerY = height / 2 + this.panY;

        ctx.translate(centerX, centerY);
        ctx.scale(scale, scale);
        ctx.translate(-extent / 2, -extent / 2);

        // 边框及参考网格
        ctx.strokeStyle = this.options.tileBorderColor;
        ctx.lineWidth = 1.5 / scale;
        ctx.strokeRect(0, 0, extent, extent);

        if (this.options.showGrid) {
            const gridColor = this.options.theme === 'light' ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.04)';
            ctx.strokeStyle = gridColor;
            ctx.lineWidth = 1 / scale;
            const step = extent / 8;
            ctx.beginPath();
            for (let i = step; i < extent; i += step) {
                ctx.moveTo(i, 0);
                ctx.lineTo(i, extent);
                ctx.moveTo(0, i);
                ctx.lineTo(extent, i);
            }
            ctx.stroke();
        }

        // 绘制图层
        for (const layer of this.tileData.layers) {
            if (!layer.visible) continue;
            this.renderLayer(ctx, layer, scale);
        }

        // 绘制当前高亮选中的要素
        if (this.selectedFeature) {
            this.renderHighlight(ctx, this.selectedFeature, scale);
        }

        ctx.restore();
    }

    renderLayer(ctx, layer, scale) {
        const color = layer.color;
        const lineWidth = Math.max(0.75, 1.2 / scale);

        // 1. Polygons
        for (const feat of layer.features) {
            if (feat.type !== 3) continue;
            this.drawPolygon(ctx, feat.geometry, color, lineWidth);
        }

        // 2. LineStrings
        for (const feat of layer.features) {
            if (feat.type !== 2) continue;
            this.drawLineString(ctx, feat.geometry, color, lineWidth * 1.5);
        }

        // 3. Points
        for (const feat of layer.features) {
            if (feat.type !== 1) continue;
            this.drawPoint(ctx, feat, color, scale);
        }
    }

    drawPolygon(ctx, geometry, color, lineWidth) {
        ctx.beginPath();
        for (let i = 0; i < geometry.length; i++) {
            const ring = geometry[i];
            if (!ring || ring.length === 0) continue;
            ctx.moveTo(ring[0].x, ring[0].y);
            for (let j = 1; j < ring.length; j++) {
                ctx.lineTo(ring[j].x, ring[j].y);
            }
            ctx.closePath();
        }
        ctx.fillStyle = color.fill;
        ctx.fill('evenodd');

        ctx.strokeStyle = color.stroke;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
    }

    drawLineString(ctx, geometry, color, lineWidth) {
        ctx.beginPath();
        ctx.strokeStyle = color.stroke;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (let i = 0; i < geometry.length; i++) {
            const line = geometry[i];
            if (!line || line.length === 0) continue;
            ctx.moveTo(line[0].x, line[0].y);
            for (let j = 1; j < line.length; j++) {
                ctx.lineTo(line[j].x, line[j].y);
            }
        }
        ctx.stroke();
    }

    drawPoint(ctx, feat, color, scale) {
        const radius = Math.max(2.5, 4 / scale);
        const geom = feat.geometry;

        for (let i = 0; i < geom.length; i++) {
            const points = geom[i];
            for (let j = 0; j < points.length; j++) {
                const pt = points[j];

                ctx.beginPath();
                ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
                ctx.fillStyle = color.stroke;
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = Math.max(0.5, 1 / scale);
                ctx.stroke();

                if (this.options.showLabels && feat.properties) {
                    const label = feat.properties.name || feat.properties.name_zh || feat.properties.name_en || feat.properties.title;
                    if (label && typeof label === 'string' && label.trim() !== '') {
                        const fontSize = Math.max(10, 12 / scale);
                        ctx.font = `${fontSize}px -apple-system, sans-serif`;
                        ctx.fillStyle = this.options.theme === 'light' ? '#0f172a' : '#f3f4f6';
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(label, pt.x + radius + 3 / scale, pt.y);
                    }
                }
            }
        }
    }

    /**
     * 高亮渲染被选中的要素
     */
    renderHighlight(ctx, feat, scale) {
        ctx.save();
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 10;
        ctx.strokeStyle = '#00ffff';
        ctx.fillStyle = 'rgba(0, 255, 255, 0.35)';

        if (feat.type === 3) { // Polygon
            ctx.lineWidth = 3 / scale;
            ctx.beginPath();
            for (const ring of feat.geometry) {
                if (!ring.length) continue;
                ctx.moveTo(ring[0].x, ring[0].y);
                for (let j = 1; j < ring.length; j++) {
                    ctx.lineTo(ring[j].x, ring[j].y);
                }
                ctx.closePath();
            }
            ctx.fill('evenodd');
            ctx.stroke();
        } else if (feat.type === 2) { // LineString
            ctx.lineWidth = 5 / scale;
            ctx.lineCap = 'round';
            ctx.beginPath();
            for (const line of feat.geometry) {
                if (!line.length) continue;
                ctx.moveTo(line[0].x, line[0].y);
                for (let j = 1; j < line.length; j++) {
                    ctx.lineTo(line[j].x, line[j].y);
                }
            }
            ctx.stroke();
        } else if (feat.type === 1) { // Point
            const radius = Math.max(6, 8 / scale);
            for (const ring of feat.geometry) {
                for (const pt of ring) {
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                }
            }
        }
        ctx.restore();
    }
}
