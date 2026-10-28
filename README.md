# Storyboard Motion Studio V1.0

一个轻量级、可在浏览器运行的动态分镜参考工具。当前为前端原型。

## 使用方法

打开 [index.html](./index.html) 或启用 GitHub Pages 后访问网站：

1. 上传一张参考图（或两张首尾帧）。
2. 选择光扫、渐显、虚实、推近、后拉、左右平移、上下摇等效果。
3. 调整时长、幅度与运动曲线，播放预览。
4. 导出 GIF、视频或静态 PNG，必要时保存工程文件。

> 目前支持的是二维动画/参考画面预演，不是真实三维摄影机运动。人物走动、转身和拿起器物等真实动作尚未接入 AI 生成。

## GitHub Pages 发布（仓库管理员只需设置一次）

在 GitHub 仓库：`Settings` → `Pages` → `Build and deployment`：

- **Source**：`Deploy from a branch`
- **Branch**：`main`
- **Folder**：`/(root)`
- 点击 `Save`

发布成功后的访问地址预计是：

https://zhonghongtao1014-cell.github.io/storyboard-motion-studio/

如果页面显示 404，请先到仓库的 `Settings → Pages` 查看发布状态，确认工作流运行完成；初次发布可能需要一定时间。

## 隐私与限制

- 浏览器导入的图片在本地进行演示处理；请勿把商业产品原图提交到公开 GitHub 仓库。
- 仓库内自带的是通用示意器物，不包含实际产品素材。
- 文字直接生成图片、AI 人物动作与复杂空间运镜尚未接入。
- GIF、WebM 等导出功能依赖浏览器支持，建议使用 Chrome 或 Edge。
