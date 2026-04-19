# Foodie Site Generator

从用户的备忘录/笔记内容，生成一个精美的吃喝玩乐地图点评网站，并部署上线。

## 输入

用户会提供以下信息（通过对话获取缺失的部分）：

1. **笔记内容**：用户的吃喝玩乐清单，可以是：
   - 直接粘贴的文本
   - Apple Notes 备忘录的名称（通过 AppleScript 读取，仅限 macOS）
   - 文本文件路径
2. **站点名称**：网站标题，例如"孔一一の小众点评"
3. **域名**（可选）：自定义域名，例如 `foodie.govibepark.com`
4. **GitHub 仓库名**（可选）：默认用 `foodie-site`

## 全流程步骤

### Step 1: 获取笔记内容

根据用户提供的方式获取内容：

- **粘贴文本**：直接使用用户粘贴的内容
- **Apple Notes**：使用 AppleScript 从 Notes app 读取。注意：
  - 需要 macOS 环境
  - 需要用户授权 Accessibility 权限
  - 通过 `osascript` 执行，先 `pbcopy < /dev/null` 清空剪贴板，然后打开笔记、全选、拷贝
  - 如果 AppleScript 失败，提示用户手动复制粘贴
- **文件路径**：直接读取文件内容

### Step 2: 解析笔记为结构化数据

笔记格式说明：
- 使用 checklist 格式：`- [x]` 表示已去过，`- [ ]` 表示想去
- 支持 emoji 标记：🌟 表示推荐/收藏
- 笔记可能按地区、类别分段（如"北京-吃"、"北京-玩"、"国外"等）
- 每行一个地点，可能包含：地点名、英文名、描述、地址、标签

使用项目中已有的 `parse_notes.js` 来解析（如果项目中有的话），或者根据笔记内容的实际格式编写解析逻辑。解析后的数据结构：

```json
{
  "name": "店铺名",
  "nameEn": "English Name",
  "cat": "coffee|restaurant|bar|bakery|culture|leisure|explore",
  "region": "北京|中国|海外",
  "area": "鼓楼/南锣",
  "desc": "描述信息",
  "star": false,
  "visited": true,
  "tags": []
}
```

生成 `data.js`，格式为 `const DATA = [...]`。

### Step 3: 生成网站

生成 `index.html`，这是一个单页静态网站，包含以下功能：

- 精美的 hero 区域，展示站点名称
- 分类筛选（咖啡、餐厅、酒吧、面包甜点、文化、休闲、探索）
- 地区筛选
- 已去/想去筛选
- 搜索功能
- 卡片式布局展示每个地点
- Leaflet 地图集成（如果有坐标数据）
- 响应式设计，支持手机和桌面
- 中文排版优化，使用 Google Fonts（Noto Serif SC、DM Sans、Cormorant Garamond）
- 暖色调设计风格（米白背景、赤陶红主色、鼠尾草绿点缀）

参考项目中已有的 `index.html` 的设计风格和功能。

### Step 4: 部署到 GitHub Pages

1. 初始化 git 仓库（如果还没有）
2. 检查 `gh` CLI 是否已登录
3. 创建 GitHub 仓库（public，因为 GitHub Pages 免费版需要 public 仓库）
4. 提交 `index.html`、`data.js` 和辅助脚本
5. 开启 GitHub Pages（source: main branch, path: /）
6. 如果用户提供了自定义域名：
   - 创建 `CNAME` 文件写入域名
   - 提交并推送
   - 提示用户在 DNS 服务商添加 CNAME 记录指向 `<username>.github.io`
   - 等待用户确认 DNS 配置完成后验证
7. 验证网站可访问

### Step 5: 输出结果

告诉用户：
- 网站地址（GitHub Pages URL 和自定义域名）
- 如何更新内容（重新运行 sync 或手动编辑 data.js）
- 如何在 DNS 服务商配置域名（如果需要）

## 注意事项

- 如果用户没有 `gh` CLI 或未登录，指导用户安装和登录
- 如果 GitHub Pages 不支持（private 仓库 + 免费计划），建议改为 public
- 部署前确认用户同意仓库 visibility
- HTTPS 证书由 GitHub 自动签发，通常需要 10-30 分钟
- 如果用户使用 Cloudflare DNS，提醒关闭 Proxy（橙色云朵改灰色）
