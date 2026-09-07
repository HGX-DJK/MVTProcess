import { VectorTile } from '@mapbox/vector-tile';
import Protobuf from 'pbf';
import { getLayerColor } from './colors.js';

/**
 * 将 VectorTile 瓦片解析为标准易用的数据模型
 * @param {ArrayBuffer} buffer - 解压后的二进制瓦片数据
 * @param {string} fileName - 文件名
 */
export function parseVectorTile(buffer, fileName = 'tile.pbf') {
    const pbf = new Protobuf(buffer);
    const tile = new VectorTile(pbf);

    const layers = [];
    let totalFeatures = 0;
    let maxExtent = 4096;

    const layerNames = Object.keys(tile.layers);

    layerNames.forEach((layerName, layerIdx) => {
        const vtLayer = tile.layers[layerName];
        const extent = vtLayer.extent || 4096;
        if (extent > maxExtent) maxExtent = extent;

        const layerData = {
            name: layerName,
            extent: extent,
            visible: true,
            color: getLayerColor(layerName, layerIdx),
            counts: {
                points: 0,
                lines: 0,
                polygons: 0,
                unknown: 0,
                total: vtLayer.length
            },
            features: []
        };

        totalFeatures += vtLayer.length;

        for (let i = 0; i < vtLayer.length; i++) {
            try {
                const feat = vtLayer.feature(i);
                const geom = feat.loadGeometry();
                const props = feat.properties || {};

                let typeName = 'Unknown';
                if (feat.type === 1) {
                    typeName = 'Point';
                    layerData.counts.points++;
                } else if (feat.type === 2) {
                    typeName = 'LineString';
                    layerData.counts.lines++;
                } else if (feat.type === 3) {
                    typeName = 'Polygon';
                    layerData.counts.polygons++;
                } else {
                    layerData.counts.unknown++;
                }

                layerData.features.push({
                    id: feat.id !== undefined ? feat.id : i,
                    type: feat.type,
                    typeName: typeName,
                    properties: props,
                    geometry: geom,
                    extent: extent
                });
            } catch (err) {
                console.warn(`[MVTProcess] 解析图层 ${layerName} 中要素 #${i} 失败:`, err);
            }
        }

        layers.push(layerData);
    });

    return {
        fileName,
        fileSize: buffer.byteLength,
        layers,
        totalFeatures,
        extent: maxExtent,
        rawTile: tile
    };
}

/**
 * 导出图层或全部图层为 GeoJSON FeatureCollection
 */
export function exportToGeoJSON(parsedTile, layerName = null) {
    const features = [];
    const layersToExport = layerName 
        ? parsedTile.layers.filter(l => l.name === layerName)
        : parsedTile.layers;

    for (const layer of layersToExport) {
        for (const feat of layer.features) {
            let geometry = null;
            const geom = feat.geometry;

            if (feat.type === 1) { // Point
                if (geom.length === 1 && geom[0].length === 1) {
                    geometry = {
                        type: 'Point',
                        coordinates: [geom[0][0].x, geom[0][0].y]
                    };
                } else {
                    geometry = {
                        type: 'MultiPoint',
                        coordinates: geom.flat().map(p => [p.x, p.y])
                    };
                }
            } else if (feat.type === 2) { // LineString
                if (geom.length === 1) {
                    geometry = {
                        type: 'LineString',
                        coordinates: geom[0].map(p => [p.x, p.y])
                    };
                } else {
                    geometry = {
                        type: 'MultiLineString',
                        coordinates: geom.map(ring => ring.map(p => [p.x, p.y]))
                    };
                }
            } else if (feat.type === 3) { // Polygon
                geometry = {
                    type: 'Polygon',
                    coordinates: geom.map(ring => ring.map(p => [p.x, p.y]))
                };
            }

            if (geometry) {
                features.push({
                    type: 'Feature',
                    id: feat.id,
                    properties: {
                        ...feat.properties,
                        _layer: layer.name
                    },
                    geometry
                });
            }
        }
    }

    return {
        type: 'FeatureCollection',
        name: layerName ? `${parsedTile.fileName}_${layerName}` : parsedTile.fileName,
        features
    };
}
