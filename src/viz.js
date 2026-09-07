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
const btnToggleLabels = document.getElementById('btn-toggle-labels');
const btnToggleAllLayers = document.getElementById('btn-toggle-all-layers');

const fileListEl = document.getElementById('file-list');
const layerListEl = document.getElementById('layer-list');
const layerSearchInput = document.getElementById('layer-search');
const tileInfoPanel = document.getElementById('tile-info');
const inspectorContent = document.getElementById('inspector-content');
const statusZoomEl = document.getElementById('status-zoom');
const statusCoordEl = document.getElementById('status-coord');

// 状态管理
const state = {
    files: [], // { name, size, parsedTile }
    activeFileIndex: -1,
    showLabels: true,
    allLayersVisible: true
};

// 初始化渲染器
const renderer = new TileRenderer(canvas, {
    showLabels: state.showLabels
});

// 响应式自适应尺寸
window.addEventListener('resize', () => {
    renderer.resize();
});

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
        console.log(`[MVTProcess] 正在加载文件: ${fileName}, 原始大小: ${arrayBuffer.byteLength} 字节`);

        // 1. 自动检测并解压 Gzip / Deflate 格式（解决 6694 压缩问题）
        const decompressed = await decompressIfNeeded(arrayBuffer);

        // 2. 解析矢量瓦片
        const parsedTile = parseVectorTile(decompressed, fileName);
        console.log(`[MVTProcess] 解析完成:`, parsedTile);

        // 3. 加入文件管理器
        const fileItem = {
            name: fileName,
            size: arrayBuffer.byteLength,
            parsedTile: parsedTile
        };

        state.files.push(fileItem);
        switchActiveFile(state.files.length - 1);
        updateFileListUI();
    } catch (err) {
        console.error(`[MVTProcess] 解析瓦片 ${fileName} 失败:`, err);
        alert(`解析文件 [${fileName}] 失败:\n${err.message}\n请检查控制台获取详细错误信息。`);
    }
}

/**
 * 切换当前选中的瓦片文件
 */
function switchActiveFile(index) {
    if (index < 0 || index >= state.files.length) return;
    state.activeFileIndex = index;

    const activeItem = state.files[index];
    renderer.setTileData(activeItem.parsedTile);

    updateFileListUI();
    updateTileInfoUI(activeItem.parsedTile);
    updateLayerListUI(activeItem.parsedTile);
    clearInspectorUI();
    updateStatusUI();
}

/**
 * 更新文件列表界面
 */
function updateFileListUI() {
    fileListEl.innerHTML = '';
    state.files.forEach((f, idx) => {
        const item = document.createElement('div');
        item.className = `file-item ${idx === state.activeFileIndex ? 'active' : ''}`;
        item.innerHTML = `
            <div class="file-name" title="${f.name}">${f.name}</div>
            <div class="file-meta">${formatFileSize(f.size)}</div>
        `;
        item.addEventListener('click', () => switchActiveFile(idx));
        fileListEl.appendChild(item);
    });
}

/**
 * 更新瓦片元信息统计
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
            <span class="stat-label">数据大小</span>
            <span class="stat-value">${formatFileSize(tile.fileSize)}</span>
        </div>
    `;
}

/**
 * 更新图层列表
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

        item.innerHTML = `
            <div class="layer-left">
                <input type="checkbox" ${layer.visible ? 'checked' : ''} style="cursor:pointer;">
                <span class="layer-swatch" style="background-color: ${layer.color.stroke};"></span>
                <span class="layer-title" title="${layer.name}">${layer.name}</span>
            </div>
            <span class="layer-count" title="${typesDesc.join(' | ')}">${layer.counts.total}</span>
        `;

        const checkbox = item.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', (e) => {
            layer.visible = e.target.checked;
            renderer.render();
        });

        item.addEventListener('click', (e) => {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
                layer.visible = checkbox.checked;
                renderer.render();
            }
        });

        layerListEl.appendChild(item);
    });
}

/**
 * 清空属性检查器
 */
function clearInspectorUI() {
    inspectorContent.innerHTML = `
        <div class="empty-tip">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <div>点击画布中的要素以查看属性</div>
        </div>
    `;
}

/**
 * 展示要素属性详情
 */
function showFeatureInspector(layer, feature) {
    const props = feature.properties || {};
    const propKeys = Object.keys(props);

    let rowsHtml = '';
    if (propKeys.length === 0) {
        rowsHtml = '<tr><td colspan="2" style="color:var(--text-muted);text-align:center;">该要素无属性标签</td></tr>';
    } else {
        propKeys.forEach(key => {
            rowsHtml += `
                <tr>
                    <td class="prop-key">${key}</td>
                    <td class="prop-val">${String(props[key])}</td>
                </tr>
            `;
        });
    }

    inspectorContent.innerHTML = `
        <div style="margin-bottom:12px;">
            <div style="font-size:14px;font-weight:600;color:var(--accent);">${layer.name}</div>
            <div style="font-size:11px;color:var(--text-muted);">
                类型: <b>${feature.typeName}</b> | ID: <b>${feature.id}</b>
            </div>
        </div>
        <table class="props-table">
            <thead>
                <tr><th>属性名</th><th>属性值</th></tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>
    `;
}

/**
 * 更新底部状态栏
 */
function updateStatusUI() {
    statusZoomEl.textContent = `缩放: ${(renderer.zoom * 100).toFixed(0)}%`;
}

// 注册画布交互回调
renderer.onClickFeature = (hit) => {
    showFeatureInspector(hit.layer, hit.feature);
};

canvas.addEventListener('mousemove', (e) => {
    const tilePt = renderer.screenToTile(e.clientX, e.clientY);
    if (tilePt) {
        statusCoordEl.textContent = `坐标: (${Math.round(tilePt.x)}, ${Math.round(tilePt.y)})`;
    }
    updateStatusUI();
});

// 拖拽事件支持（拖拽单个或多个文件）
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

// 文件选择器
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

btnToggleLabels.addEventListener('click', () => {
    state.showLabels = !state.showLabels;
    renderer.options.showLabels = state.showLabels;
    btnToggleLabels.style.opacity = state.showLabels ? '1' : '0.5';
    renderer.render();
});

btnToggleAllLayers.addEventListener('click', () => {
    if (state.activeFileIndex < 0) return;
    const tile = state.files[state.activeFileIndex].parsedTile;
    state.allLayersVisible = !state.allLayersVisible;

    tile.layers.forEach(l => {
        l.visible = state.allLayersVisible;
    });

    btnToggleAllLayers.textContent = state.allLayersVisible ? '全不选' : '全选';
    updateLayerListUI(tile);
    renderer.render();
});

// 图层搜索过滤
layerSearchInput.addEventListener('input', () => {
    if (state.activeFileIndex < 0) return;
    updateLayerListUI(state.files[state.activeFileIndex].parsedTile);
});

// 导出当前瓦片为 GeoJSON
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
