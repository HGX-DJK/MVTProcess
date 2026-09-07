/**
 * 地图图层配色方案
 * 针对常见 OSM / Mapbox / 天地图等常见图层提供语义化配色，其余图层根据哈希算法自动分配鲜明和谐的颜色
 */

const PRESET_COLORS = {
    water: { fill: 'rgba(56, 161, 243, 0.45)', stroke: '#3b82f6' },
    ocean: { fill: 'rgba(40, 140, 230, 0.5)', stroke: '#2563eb' },
    river: { fill: 'rgba(56, 161, 243, 0.4)', stroke: '#60a5fa' },
    building: { fill: 'rgba(244, 114, 182, 0.4)', stroke: '#ec4899' },
    buildings: { fill: 'rgba(244, 114, 182, 0.4)', stroke: '#ec4899' },
    road: { fill: 'rgba(251, 146, 60, 0.5)', stroke: '#f97316' },
    roads: { fill: 'rgba(251, 146, 60, 0.5)', stroke: '#f97316' },
    transportation: { fill: 'rgba(251, 191, 36, 0.5)', stroke: '#f59e0b' },
    landuse: { fill: 'rgba(52, 211, 153, 0.35)', stroke: '#10b981' },
    park: { fill: 'rgba(74, 222, 128, 0.4)', stroke: '#22c55e' },
    green: { fill: 'rgba(74, 222, 128, 0.4)', stroke: '#22c55e' },
    boundary: { fill: 'rgba(239, 68, 68, 0.2)', stroke: '#ef4444' },
    admin: { fill: 'rgba(239, 68, 68, 0.2)', stroke: '#f87171' },
    poi: { fill: 'rgba(168, 85, 247, 0.6)', stroke: '#a855f7' },
    label: { fill: 'rgba(255, 255, 255, 0.85)', stroke: '#cbd5e1' },
    place: { fill: 'rgba(248, 250, 252, 0.85)', stroke: '#94a3b8' }
};

// 预备备选色系，用于未匹配的图层
const PALETTE = [
    { fill: 'rgba(56, 189, 248, 0.35)', stroke: '#38bdf8' },
    { fill: 'rgba(129, 140, 248, 0.35)', stroke: '#818cf8' },
    { fill: 'rgba(192, 132, 252, 0.35)', stroke: '#c084fc' },
    { fill: 'rgba(244, 114, 182, 0.35)', stroke: '#f472b6' },
    { fill: 'rgba(251, 113, 133, 0.35)', stroke: '#fb7185' },
    { fill: 'rgba(251, 146, 60, 0.35)', stroke: '#fb923c' },
    { fill: 'rgba(250, 204, 21, 0.35)', stroke: '#facc15' },
    { fill: 'rgba(163, 230, 53, 0.35)', stroke: '#a3e635' },
    { fill: 'rgba(52, 211, 153, 0.35)', stroke: '#34d399' },
    { fill: 'rgba(45, 212, 191, 0.35)', stroke: '#2dd4bf' }
];

function stringHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

export function getLayerColor(layerName, index = 0) {
    const key = (layerName || '').toLowerCase();
    for (const [name, color] of Object.entries(PRESET_COLORS)) {
        if (key.includes(name)) {
            return color;
        }
    }
    const colorIndex = (stringHash(key) + index) % PALETTE.length;
    return PALETTE[colorIndex];
}
