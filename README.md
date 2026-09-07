# MVT-Process

Mapbox矢量瓦片解析、调试、处理工具，消息在控制台中打印 [demo](https://bingqixuan.github.io/magic/index.html#/tools/mvt)

-----------------------------------

## 安装

```bash
   npm install
   npm install --save-dev parcel
```

## 运行

```bash
# 启动开发调试服务
npm start
# 或直接使用 parcel
npx parcel index.html
```

## 功能特性

- [x] **单文件/多文件拖拽解析**：支持直接拖入单个或批量拖入多个 `.pbf`、`.mvt` 或无后缀矢量瓦片（如 `data/6694`）。
- [x] **Gzip / Deflate 自动解压**：解决绝大部分地图服务瓦片因默认压缩导致的 `Unimplemented type: 7` 报错。
- [x] **多文件管理列表**：支持在左侧侧边栏查看所有已载入的瓦片文件，并支持一键切换视图。
- [x] **交互式画布**：
  - 支持鼠标滚轮以指针为中心平滑缩放
  - 支持鼠标左键自由拖拽平移视口
  - 提供居中一键复位
  - 支持 HiDPI 屏幕高分辨率自适应清晰渲染
- [x] **图层管理与自适应渲染**：
  - 图层显隐勾选切换与一键全选/全不选
  - 智能图层色彩区分与要素数量统计
  - 完美支持 Polygon 奇偶环绕挖孔（`evenodd`），精准呈现岛屿、孔洞
- [x] **要素属性检查器（Feature Inspector）**：点击画布要素即可在右侧查看属性表与元数据。
- [x] **GeoJSON 导出**：支持将当前瓦片转换为标准 GeoJSON 格式文件导出。