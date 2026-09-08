'use strict';

import { decompressIfNeeded } from './utils/decompress.js';
import { parseVectorTile, exportToGeoJSON } from './utils/mvt-parser.js';
import { TileRenderer } from './renderer.js';

// DOM 元素引用
const canvas = document.getElementById('canvas');
const canvasWrapper = document.getElementById('canvas-wrapper');
const fileInput = document.getElementById('file-input');
const btnOpenFile = document.getElementById('btn-open-file');
const btnResetView = document.getElementById('btn-reset-view');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnExportGeoJSON = document.getElementById('btn-export-geojson');
const btnExportPng = document.getElementById('btn-export-png');
const btnToggleLabels = document.getElementById('btn-toggle-labels');
const btnToggleTheme = document.getElementById('btn-toggle-theme');
const btnToggleAllLayers = document.getElementById('btn-toggle-all-layers');
const btnClearFiles = document.getElementById('btn-clear-files');
const btnCopyFeatureJson = document.getElementById('btn-copy-feature-json');

const fileListEl = document.getElementById('file-list');
const layerListEl = document.getElementById('layer-list');
const layerSearchInput = document.getElementById('layer-search');
const tileInfoPanel = document.getElementById('tile-info');
const inspectorContent = document.getElementById('inspector-content');
const hoverTooltipEl = document.getElementById('hover-tooltip');
const statusZoomEl = document.getElementById('status-zoom');
const statusCoordEl = document.getElementById('status-coord');

// 全局状态
const state = {
    files: [], // { name, size, parsedTile }
    activeFileIndex: -1,
    showLabels: true,
    allLayersVisible: true,
    theme: 'dark',
    selectedFeatureContext: null // { layer, feature }
};

// 初始化 Canvas 渲染器
const renderer = new TileRenderer(canvas, {
    showLabels: state.showLabels,
    theme: state.theme
});

// 响应窗口尺寸变化
window.addEventListener('resize', () => {
    renderer.resize();
});

// 全局拦截窗口拖拽事件，防止拖至边框或侧边栏时浏览器默认打开文件
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

// 格式化文件大小
function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * 载入并处理二进制 ArrayBuffer 瓦片数据
 */
async function loadTileBuffer(arrayBuffer, fileName) {
    try {
        console.log(`[MVTProcess] 加载文件: ${fileName}, 原始大小: ${arrayBuffer.byteLength} 字节`);

        // 1. 自动检测并解压 Gzip / Deflate
        const decompressed = await decompressIfNeeded(arrayBuffer);

        // 2. 解析矢量瓦片
        const parsedTile = parseVectorTile(decompressed, fileName);

        // 3. 加入文件列表
        const fileItem = {
            id: Date.now() + Math.random().toString(36).substr(2, 5),
            name: fileName,
            size: arrayBuffer.byteLength,
            parsedTile: parsedTile
        };

        state.files.push(fileItem);
        switchActiveFile(state.files.length - 1);
    } catch (err) {
        console.error(`[MVTProcess] 解析瓦片 ${fileName} 失败:`, err);
        alert(`解析文件 [${fileName}] 失败:\n${err.message}\n请检查控制台了解详情。`);
    }
}

/**
 * 切换当前显示的瓦片文件
 */
function switchActiveFile(index) {
    if (index < 0 || index >= state.files.length) {
        state.activeFileIndex = -1;
        state.selectedFeatureContext = null;
        renderer.setTileData(null);
        updateFileListUI();
        updateTileInfoUI(null);
        updateLayerListUI(null);
        clearInspectorUI();
        updateStatusUI();
        return;
    }

    state.activeFileIndex = index;
    state.selectedFeatureContext = null;
    const activeItem = state.files[index];
    renderer.setTileData(activeItem.parsedTile);

    updateFileListUI();
    updateTileInfoUI(activeItem.parsedTile);
    updateLayerListUI(activeItem.parsedTile);
    clearInspectorUI();
    updateStatusUI();
}

/**
 * 移除指定文件
 */
function removeFile(index, e) {
    if (e) e.stopPropagation();
    state.files.splice(index, 1);

    if (state.files.length === 0) {
        switchActiveFile(-1);
    } else if (state.activeFileIndex >= state.files.length) {
        switchActiveFile(state.files.length - 1);
    } else if (state.activeFileIndex === index) {
        switchActiveFile(Math.max(0, index - 1));
    } else {
        if (state.activeFileIndex > index) state.activeFileIndex--;
        updateFileListUI();
    }
}

/**
 * 更新已加载文件列表 UI
 */
function updateFileListUI() {
    fileListEl.innerHTML = '';
    btnClearFiles.style.display = state.files.length > 0 ? 'inline-block' : 'none';

    if (state.files.length === 0) {
        fileListEl.innerHTML = `
            <div style="color:var(--text-muted);font-size:12px;padding:12px 6px;text-align:center;">
                暂无导入文件，请拖入瓦片
            </div>
        `;
        return;
    }

    state.files.forEach((f, idx) => {
        const item = document.createElement('div');
        item.className = `file-item ${idx === state.activeFileIndex ? 'active' : ''}`;
        item.innerHTML = `
            <div style="overflow:hidden;flex:1;margin-right:6px;">
                <div class="file-name" title="${f.name}">${f.name}</div>
                <div class="file-meta">${formatFileSize(f.size)} · ${f.parsedTile.layers.length} 图层</div>
            </div>
            <button class="file-del-btn" title="关闭该文件">×</button>
        `;

        item.querySelector('.file-del-btn').addEventListener('click', (e) => removeFile(idx, e));
        item.addEventListener('click', () => switchActiveFile(idx));
        fileListEl.appendChild(item);
    });
}

/**
 * 更新瓦片基础信息面板
 */
function updateTileInfoUI(tile) {
    if (!tile) {
        tileInfoPanel.innerHTML = '<div style="color:var(--text-muted);grid-column:1/-1;">暂无数据</div>';
        return;
    }
    tileInfoPanel.innerHTML = `
        <div class="tile-stat">
            <span class="stat-label">瓦片尺寸 (Extent)</span>
            <span class="stat-value">${tile.extent}</span>
        </div>
        <div class="tile-stat">
            <span class="stat-label">图层总数</span>
            <span class="stat-value">${tile.layers.length}</span>
        </div>
        <div class="tile-stat">
            <span class="stat-label">要素总数</span>
            <span class="stat-value">${tile.totalFeatures.toLocaleString()}</span>
        </div>
        <div class="tile-stat">
            <span class="stat-label">解压后大小</span>
            <span class="stat-value">${formatFileSize(tile.fileSize)}</span>
        </div>
    `;
}

/**
 * 将 RGB/RGBA 转换为 HEX 供原生 color picker 使用
 */
function colorToHex(colorStr) {
    if (colorStr && colorStr.startsWith('#')) return colorStr.slice(0, 7);
    return '#3b82f6';
}

/**
 * 更新图层列表 UI（支持按名称搜索、单个图层 GeoJSON 导出、颜色自定义）
 */
function updateLayerListUI(tile) {
    layerListEl.innerHTML = '';
    if (!tile || !tile.layers.length) {
        layerListEl.innerHTML = '<div style="color:var(--text-muted);padding:12px;text-align:center;">暂无图层</div>';
        return;
    }

    const filterText = (layerSearchInput.value || '').trim().toLowerCase();

    tile.layers.forEach((layer) => {
        if (filterText && !layer.name.toLowerCase().includes(filterText)) {
            return;
        }

        const item = document.createElement('div');
        item.className = 'layer-item';

        const typesDesc = [];
        if (layer.counts.polygons > 0) typesDesc.push(`面:${layer.counts.polygons}`);
        if (layer.counts.lines > 0) typesDesc.push(`线:${layer.counts.lines}`);
        if (layer.counts.points > 0) typesDesc.push(`点:${layer.counts.points}`);

        const hexVal = colorToHex(layer.color.stroke);

        item.innerHTML = `
            <div class="layer-left">
                <input type="checkbox" class="layer-chk" ${layer.visible ? 'checked' : ''} style="cursor:pointer;" title="显隐控制">
                <div class="layer-swatch-container" title="点击更改图层颜色">
                    <span class="layer-swatch" style="background-color: ${layer.color.stroke};"></span>
                    <input type="color" class="layer-color-input" value="${hexVal}">
                </div>
                <span class="layer-title" title="${layer.name}">${layer.name}</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
                <span class="layer-count" title="${typesDesc.join(' | ')}">${layer.counts.total}</span>
                <button class="layer-export-btn" title="单独导出本图层为 GeoJSON">💾</button>
            </div>
        `;

        const checkbox = item.querySelector('.layer-chk');
        checkbox.addEventListener('change', (e) => {
            layer.visible = e.target.checked;
            renderer.requestRender();
        });

        // 颜色选择器与色块容器
        const swatchContainer = item.querySelector('.layer-swatch-container');
        const colorInput = item.querySelector('.layer-color-input');
        const swatchSpan = item.querySelector('.layer-swatch');

        swatchContainer.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        colorInput.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        colorInput.addEventListener('input', (e) => {
            e.stopPropagation();
            const newHex = e.target.value;
            swatchSpan.style.backgroundColor = newHex;
            renderer.setLayerColor(layer.name, newHex);
            // 同步更新右侧属性面板中的小图层色块
            if (state.selectedFeatureContext && state.selectedFeatureContext.layer.name === layer.name) {
                const badge = inspectorContent.querySelector('.inspector-layer-badge');
                if (badge) badge.style.backgroundColor = newHex;
            }
        });

        // 导出单图层
        const exportBtn = item.querySelector('.layer-export-btn');
        exportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportLayerGeoJSON(tile, layer.name);
        });

        item.addEventListener('click', (e) => {
            if (e.target !== checkbox && e.target !== exportBtn && !swatchContainer.contains(e.target)) {
                checkbox.checked = !checkbox.checked;
                layer.visible = checkbox.checked;
                renderer.requestRender();
            }
        });

        layerListEl.appendChild(item);
    });
}

/**
 * 导出单个图层为 GeoJSON
 */
function exportLayerGeoJSON(tile, layerName) {
    const geojson = exportToGeoJSON(tile, layerName);
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tile.fileName}_${layerName}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * 清空要素属性检查器
 */
function clearInspectorUI() {
    state.selectedFeatureContext = null;
    btnCopyFeatureJson.style.display = 'none';
    inspectorContent.innerHTML = `
        <div class="empty-tip">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <div>点击画布中的点、线或面要素查看属性详情</div>
        </div>
    `;
}

/**
 * 展示要素属性详情并支持属性搜索与复制
 */
function showFeatureInspector(layer, feature) {
    state.selectedFeatureContext = { layer, feature };
    btnCopyFeatureJson.style.display = 'inline-block';

    const props = feature.properties || {};
    const propKeys = Object.keys(props);

    function renderPropsTable(filterText = '') {
        const lowerFilter = filterText.toLowerCase();
        let rowsHtml = '';
        let matchedCount = 0;

        propKeys.forEach(key => {
            const valStr = String(props[key]);
            if (!filterText || key.toLowerCase().includes(lowerFilter) || valStr.toLowerCase().includes(lowerFilter)) {
                matchedCount++;
                rowsHtml += `
                    <tr>
                        <td class="prop-key">${key}</td>
                        <td class="prop-val">${valStr}</td>
                    </tr>
                `;
            }
        });

        if (matchedCount === 0) {
            rowsHtml = '<tr><td colspan="2" style="color:var(--text-muted);text-align:center;padding:12px;">无匹配属性</td></tr>';
        }
        return rowsHtml;
    }

    inspectorContent.innerHTML = `
        <div style="margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border-color);">
            <div style="font-size:14px;font-weight:600;color:var(--accent);display:flex;align-items:center;gap:6px;">
                <span class="inspector-layer-badge" style="width:10px;height:10px;border-radius:2px;background:${layer.color.stroke};display:inline-block;"></span>
                ${layer.name}
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:3px;">
                类型: <b>${feature.typeName}</b> | ID: <b>${feature.id !== undefined ? feature.id : '无'}</b> | 属性: <b>${propKeys.length} 项</b>
            </div>
        </div>
        ${propKeys.length > 5 ? `
            <div class="prop-search-box">
                <input type="text" id="prop-filter-input" class="prop-search-input" placeholder="搜索属性名或值...">
            </div>
        ` : ''}
        <table class="props-table">
            <thead>
                <tr><th>属性名</th><th>属性值</th></tr>
            </thead>
            <tbody id="props-table-body">${renderPropsTable()}</tbody>
        </table>
    `;

    const filterInput = document.getElementById('prop-filter-input');
    if (filterInput) {
        filterInput.addEventListener('input', (e) => {
            const tbody = document.getElementById('props-table-body');
            if (tbody) {
                tbody.innerHTML = renderPropsTable(e.target.value.trim());
            }
        });
    }
}

/**
 * 复制当前要素属性为 JSON 到剪贴板
 */
btnCopyFeatureJson.addEventListener('click', () => {
    if (!state.selectedFeatureContext) return;
    const { layer, feature } = state.selectedFeatureContext;
    const data = {
        layer: layer.name,
        type: feature.typeName,
        id: feature.id,
        properties: feature.properties
    };
    navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
        const originalText = btnCopyFeatureJson.textContent;
        btnCopyFeatureJson.textContent = '✓ 已复制';
        setTimeout(() => {
            btnCopyFeatureJson.textContent = originalText;
        }, 1500);
    }).catch(err => {
        alert('复制失败: ' + err.message);
    });
});

/**
 * 更新底部状态栏
 */
function updateStatusUI() {
    statusZoomEl.textContent = `缩放: ${(renderer.zoom * 100).toFixed(0)}%`;
}

// 监听渲染器视口平移与滚轮缩放事件，即时刷新状态栏
renderer.onViewChange = () => {
    updateStatusUI();
};

// 注册画布要素拾取回调
renderer.onClickFeature = (hit) => {
    if (hit) {
        showFeatureInspector(hit.layer, hit.feature);
    } else {
        clearInspectorUI();
    }
};

// 注册鼠标悬浮提示回调
renderer.onHoverFeature = (hit, clientX, clientY) => {
    if (!hit) {
        hoverTooltipEl.style.display = 'none';
        return;
    }

    const rect = canvasWrapper.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const props = hit.feature.properties || {};
    const primaryLabel = props.name || props.name_zh || props.name_en || props.title || props.class || '';

    hoverTooltipEl.innerHTML = `
        <div class="hover-tooltip-layer">
            <span style="width:8px;height:8px;border-radius:2px;background:${hit.layer.color.stroke};display:inline-block;"></span>
            ${hit.layer.name} · ${hit.feature.typeName}
        </div>
        ${primaryLabel 
            ? `<div class="hover-tooltip-val">${primaryLabel}</div>` 
            : `<div class="hover-tooltip-val" style="color:var(--text-muted)">ID: ${hit.feature.id}</div>`
        }
    `;

    // 边界检测防止溢出屏幕右侧或下侧
    let posX = x + 14;
    let posY = y + 14;
    if (posX + 200 > rect.width) posX = x - 180;
    if (posY + 60 > rect.height) posY = y - 50;

    hoverTooltipEl.style.left = `${posX}px`;
    hoverTooltipEl.style.top = `${posY}px`;
    hoverTooltipEl.style.display = 'block';
};

canvas.addEventListener('mousemove', (e) => {
    const tilePt = renderer.screenToTile(e.clientX, e.clientY);
    if (tilePt) {
        statusCoordEl.textContent = `坐标: (${Math.round(tilePt.x)}, ${Math.round(tilePt.y)})`;
    }
    updateStatusUI();
});

// 画布区域拖拽交互
canvasWrapper.addEventListener('dragover', (e) => {
    e.preventDefault();
    canvasWrapper.classList.add('dragover');
});

canvasWrapper.addEventListener('dragleave', (e) => {
    if (!canvasWrapper.contains(e.relatedTarget)) {
        canvasWrapper.classList.remove('dragover');
    }
});

canvasWrapper.addEventListener('drop', async (e) => {
    e.preventDefault();
    canvasWrapper.classList.remove('dragover');

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        reader.onload = (event) => {
            loadTileBuffer(event.target.result, file.name);
        };
        reader.readAsArrayBuffer(file);
    }
});

// 打开文件选择器
btnOpenFile.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        reader.onload = (event) => {
            loadTileBuffer(event.target.result, file.name);
        };
        reader.readAsArrayBuffer(file);
    }
    fileInput.value = '';
});

// 清空文件列表
btnClearFiles.addEventListener('click', () => {
    if (confirm('确认清空所有已加载的文件吗？')) {
        state.files = [];
        switchActiveFile(-1);
    }
});

// 视图操作
btnResetView.addEventListener('click', () => {
    renderer.resetView();
    updateStatusUI();
});

btnZoomIn.addEventListener('click', () => {
    renderer.zoomBy(1.25);
    updateStatusUI();
});

btnZoomOut.addEventListener('click', () => {
    renderer.zoomBy(0.8);
    updateStatusUI();
});

// 导出画布高清 PNG 截图
btnExportPng.addEventListener('click', () => {
    if (state.activeFileIndex < 0) {
        alert('请先载入瓦片数据再截图');
        return;
    }
    const current = state.files[state.activeFileIndex];
    renderer.exportImage(`${current.name}_snapshot.png`);
});

// 地名标注开关初始化
btnToggleLabels.classList.add('btn-active');
btnToggleLabels.textContent = '🏷 标注: 开';
btnToggleLabels.addEventListener('click', () => {
    state.showLabels = !state.showLabels;
    renderer.options.showLabels = state.showLabels;
    btnToggleLabels.classList.toggle('btn-active', state.showLabels);
    btnToggleLabels.textContent = state.showLabels ? '🏷 标注: 开' : '🏷 标注: 关';
    renderer.requestRender();
});

// 全站主题模式切换（深色 / 浅色）
btnToggleTheme.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    renderer.setTheme(state.theme);
    btnToggleTheme.textContent = state.theme === 'dark' ? '🌓 底色' : '☀️ 底色';
    btnToggleTheme.classList.toggle('btn-active', state.theme === 'light');
});

// 图层全选 / 全不选
btnToggleAllLayers.addEventListener('click', () => {
    if (state.activeFileIndex < 0) return;
    const tile = state.files[state.activeFileIndex].parsedTile;
    state.allLayersVisible = !state.allLayersVisible;

    tile.layers.forEach(l => {
        l.visible = state.allLayersVisible;
    });

    btnToggleAllLayers.textContent = state.allLayersVisible ? '全不选' : '全选';
    updateLayerListUI(tile);
    renderer.requestRender();
});

// 图层搜索过滤
layerSearchInput.addEventListener('input', () => {
    if (state.activeFileIndex < 0) return;
    updateLayerListUI(state.files[state.activeFileIndex].parsedTile);
});

// 导出整张瓦片为 GeoJSON
btnExportGeoJSON.addEventListener('click', () => {
    if (state.activeFileIndex < 0) {
        alert('请先载入瓦片数据');
        return;
    }
    const current = state.files[state.activeFileIndex];
    const geojson = exportToGeoJSON(current.parsedTile);
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${current.name}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
});
