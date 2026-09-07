/**
 * 自动检测并解压 Gzip / Deflate 压缩的矢量瓦片数据
 * 解决浏览器直接加载 pbf/mvt/6694 时的 "Unimplemented type: 7" 报错
 */
export async function decompressIfNeeded(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength < 2) {
        return arrayBuffer;
    }

    const header = new Uint8Array(arrayBuffer, 0, Math.min(arrayBuffer.byteLength, 4));

    // 检测 GZIP 魔数 (0x1f 0x8b)
    const isGzip = header[0] === 0x1f && header[1] === 0x8b;

    // 检测 ZLIB/Deflate 魔数 (0x78)
    const isDeflate = header[0] === 0x78 && (
        header[1] === 0x01 ||
        header[1] === 0x5e ||
        header[1] === 0x9c ||
        header[1] === 0xda
    );

    if (!isGzip && !isDeflate) {
        return arrayBuffer;
    }

    const format = isGzip ? 'gzip' : 'deflate';

    if (typeof DecompressionStream !== 'undefined') {
        try {
            const stream = new Response(new Blob([arrayBuffer])).body.pipeThrough(
                new DecompressionStream(format)
            );
            const decompressedBuffer = await new Response(stream).arrayBuffer();
            console.log(`[MVTProcess] 成功自动解压 ${format.toUpperCase()} 瓦片，解压前: ${arrayBuffer.byteLength} 字节，解压后: ${decompressedBuffer.byteLength} 字节`);
            return decompressedBuffer;
        } catch (err) {
            console.warn(`[MVTProcess] 原生 DecompressionStream(${format}) 解压失败，回退尝试原始数据:`, err);
            return arrayBuffer;
        }
    }

    console.warn('[MVTProcess] 当前浏览器环境不支持 DecompressionStream，使用原始数据');
    return arrayBuffer;
}
