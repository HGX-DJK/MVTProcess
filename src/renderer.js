/**
 * 矢量瓦片交互式 Canvas 渲染引擎
 * 支持：视口拖拽平移、滚轮缩放、高分屏 (HiDPI) 适配、图层显隐、EvenOdd 带孔多边形正确填充、瓦片自适应
 */
export class TileRenderer {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.options = {
            backgroundColor: '#13151b',
            tileBorderColor: '#374151',
            showGrid: true,
            showLabels: true,
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

        this.onHoverFeature = null;
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

        this.render();
    }

    setTileData(tileData) {
        this.tileData = tileData;
        this.resetView();
    }

    resetView() {
        this.zoom = 0.92;
        this.panX = 0;
        this.panY = 0;
        this.render();
    }

    setZoom(newZoom) {
        this.zoom = Math.max(0.1, Math.min(newZoom, 50));
        this.render();
    }

    zoomBy(factor) {
        this.setZoom(this.zoom * factor);
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
                this.render();
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
            const newZoom = Math.max(0.1, Math.min(this.zoom * zoomFactor, 50));

            // 以鼠标指针为中心进行平移调整
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            this.panX -= (mouseX - centerX - this.panX) * (newZoom / this.zoom - 1);
            this.panY -= (mouseY - centerY - this.panY) * (newZoom / this.zoom - 1);

            this.zoom = newZoom;
            this.render();
        }, { passive: false });

        c.addEventListener('click', (e) => {
            if (!this.tileData || !this.onClickFeature) return;
            const hit = this.hitTest(e.clientX, e.clientY);
            if (hit) {
                this.onClickFeature(hit);
            }
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

    hitTest(screenX, screenY) {
        const pt = this.screenToTile(screenX, screenY);
        if (!pt || !this.tileData) return null;

        const tolerance = (15 / (Math.min(this.canvas.clientWidth, this.canvas.clientHeight) / (this.tileData.extent || 4096))) / this.zoom;

        for (let i = this.tileData.layers.length - 1; i >= 0; i--) {
            const layer = this.tileData.layers[i];
            if (!layer.visible) continue;

            for (const feat of layer.features) {
                if (feat.type === 1) { // Point
                    for (const ring of feat.geometry) {
                        for (const p of ring) {
                            const dist = Math.hypot(p.x - pt.x, p.y - pt.y);
                            if (dist <= tolerance) {
                                return { layer, feature: feat };
                            }
                        }
                    }
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
        // 设置 DPI 缩放
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        // 绘制深色背景
        ctx.fillStyle = this.options.backgroundColor;
        ctx.fillRect(0, 0, width, height);

        if (!this.tileData) {
            // 未载入数据时的提示
            ctx.fillStyle = '#6b7280';
            ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('请拖拽 PBF / MVT 矢量瓦片文件到此，或从左上角快速加载', width / 2, height / 2);
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

        // 绘制瓦片外边框及微弱网格
        ctx.strokeStyle = this.options.tileBorderColor;
        ctx.lineWidth = 1.5 / scale;
        ctx.strokeRect(0, 0, extent, extent);

        if (this.options.showGrid) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
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

        // 绘制各图层几何要素
        for (const layer of this.tileData.layers) {
            if (!layer.visible) continue;
            this.renderLayer(ctx, layer, scale);
        }

        ctx.restore();
    }

    renderLayer(ctx, layer, scale) {
        const color = layer.color;
        const lineWidth = Math.max(0.75, 1.2 / scale);

        // 分类型绘制以提高渲染效率与层级表现：Polygons -> LineStrings -> Points
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
        ctx.fill('evenodd'); // 关键：evenodd 奇偶填充规则，确保湖泊、孔洞镂空

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

                // 提取标注名称（安全读取 name / name_zh / name_en 等属性）
                if (this.options.showLabels && feat.properties) {
                    const label = feat.properties.name || feat.properties.name_zh || feat.properties.name_en || feat.properties.title;
                    if (label && typeof label === 'string' && label.trim() !== '') {
                        const fontSize = Math.max(10, 12 / scale);
                        ctx.font = `${fontSize}px -apple-system, sans-serif`;
                        ctx.fillStyle = '#f3f4f6';
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(label, pt.x + radius + 3 / scale, pt.y);
                    }
                }
            }
        }
    }
}
