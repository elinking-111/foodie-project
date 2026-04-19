#!/usr/bin/env python3
"""
setup.py — Customize template.html into index.html using config.json.
Usage: python3 setup.py <config.json> <template.html> <output index.html>
"""
import json, re, sys

if len(sys.argv) < 4:
    print("Usage: python3 setup.py <config.json> <template.html> <output.html>")
    sys.exit(1)

config = json.load(open(sys.argv[1], encoding="utf-8"))
html = open(sys.argv[2], encoding="utf-8").read()
output_path = sys.argv[3]

title = config["siteTitle"]
subtitle = config["siteSubtitle"]
badge = config.get("siteBadge", title)
hero_sub = config.get("heroSub", "Eat · Drink · Explore · Travel")
lang = config.get("lang", "zh-CN")
search_placeholder = config.get("searchPlaceholder", "搜索店名、区域、关键词...")

# Basic text replacements
html = html.replace("孔一一の小众点评 | 吃喝玩乐指南", f"{title} | {subtitle}")
html = html.replace(">孔一一の小众点评<", f">{badge}<")
html = html.replace('<span class="brush">吃喝玩乐指南</span>', f'<span class="brush">{subtitle}</span>')
html = html.replace("Eat · Drink · Explore · Travel", hero_sub)
html = html.replace('lang="zh-CN"', f'lang="{lang}"')
html = html.replace("搜索店名、区域、关键词...", search_placeholder)

# Replace JS config arrays
categories = config.get("categories")
if categories:
    html = re.sub(r'const CATEGORIES = \[.*?\];', f'const CATEGORIES = {json.dumps(categories, ensure_ascii=False)};', html, flags=re.DOTALL, count=1)

regions = config.get("regions")
if regions:
    html = re.sub(r'const REGIONS = \[.*?\];', f'const REGIONS = {json.dumps(regions, ensure_ascii=False)};', html, flags=re.DOTALL, count=1)

area_coords = config.get("areaCoords")
if area_coords:
    lines = [f"  '{k}':[{v[0]},{v[1]}]" for k, v in area_coords.items()]
    html = re.sub(r'const AREA_COORDS=\{.*?\};', 'const AREA_COORDS={\n' + ',\n'.join(lines) + '\n};', html, flags=re.DOTALL, count=1)

region_centers = config.get("regionCenters")
if region_centers:
    rc = ",".join(f"'{k}':[{v[0]},{v[1]}]" for k, v in region_centers.items())
    html = re.sub(r"const REGION_CENTERS=\{.*?\};", f"const REGION_CENTERS={{{rc}}};", html, flags=re.DOTALL, count=1)

district_map = config.get("districtMap")
if district_map is not None:
    html = re.sub(r'const DISTRICT_MAP=\{.*?\};', f'const DISTRICT_MAP={json.dumps(district_map, ensure_ascii=False)};', html, flags=re.DOTALL, count=1)

# PRIMARY_REGION: the "home" region used for district hierarchy and map defaults
primary_region = config.get("primaryRegion")
if not primary_region:
    regions_list = config.get("regions", [])
    non_all = [r for r in regions_list if r.get("key") != "all"]
    primary_region = non_all[0]["key"] if non_all else "北京"
html = re.sub(r"const PRIMARY_REGION = '.*?';", f"const PRIMARY_REGION = '{primary_region}';", html, count=1)

# ALL_LABEL
all_label = config.get("allLabel", "全部" if lang.startswith("zh") else "All")
html = re.sub(r"const ALL_LABEL = '.*?';", f"const ALL_LABEL = '{all_label}';", html, count=1)

# OTHER_LABEL
other_label = config.get("otherLabel", "其他" if lang.startswith("zh") else "Other")
html = re.sub(r"const OTHER_LABEL = '.*?';", f"const OTHER_LABEL = '{other_label}';", html, count=1)

# SORT_LOCALE
sort_locale = config.get("sortLocale", "zh" if lang.startswith("zh") else "en")
html = re.sub(r"const SORT_LOCALE = '.*?';", f"const SORT_LOCALE = '{sort_locale}';", html, count=1)

# READONLY
readonly = config.get("readOnly", False)
html = re.sub(r"const READONLY = (true|false);", f"const READONLY = {'true' if readonly else 'false'};", html, count=1)

# MAP_DEFAULT
map_default = config.get("mapDefault")
if not map_default and region_centers:
    rc_first = list(region_centers.values())[0]
    map_default = {"center": rc_first, "zoom": 11}
if map_default:
    html = re.sub(r'const MAP_DEFAULT = \{.*?\};', f'const MAP_DEFAULT = {{center:[{map_default["center"][0]},{map_default["center"][1]}],zoom:{map_default.get("zoom",11)}}};', html, count=1)

# MAP_JUMPS_DATA
map_jumps = config.get("mapJumps")
if map_jumps:
    mj_items = []
    for mj in map_jumps:
        mj_items.append(f"{{key:'{mj['key']}',label:'{mj['label']}',center:[{mj['center'][0]},{mj['center'][1]}],zoom:{mj.get('zoom',12)}}}")
    html = re.sub(r'const MAP_JUMPS_DATA = \[.*?\];', 'const MAP_JUMPS_DATA = [' + ','.join(mj_items) + '];', html, flags=re.DOTALL, count=1)

# UI strings
ui_defaults_zh = {
    "recommend": "推荐", "manual": "手动",
    "markVisited": "标记为已去过", "markUnvisited": "标记为未去过",
    "emptyText": "没有找到匹配的地方，试试其他关键词？",
    "alertNoName": "请输入名称",
    "confirmDeletePrefix": "确定要删除「", "confirmDeleteSuffix": "」吗？",
    "editPlace": "编辑地点", "addPlace": "添加新地点",
    "popupStar": "推荐",
    "editTooltip": "编辑", "deleteTooltip": "删除",
}
ui_defaults_en = {
    "recommend": "Recommended", "manual": "Custom",
    "markVisited": "Mark as visited", "markUnvisited": "Mark as unvisited",
    "emptyText": "No matching places found. Try different keywords?",
    "alertNoName": "Please enter a name",
    "confirmDeletePrefix": "Delete \"", "confirmDeleteSuffix": "\"?",
    "editPlace": "Edit Place", "addPlace": "Add New Place",
    "popupStar": "Recommended",
    "editTooltip": "Edit", "deleteTooltip": "Delete",
}
ui_base = ui_defaults_zh if lang.startswith("zh") else ui_defaults_en
ui_cfg = config.get("ui", {})
ui_final = {**ui_base, **ui_cfg}
ui_js = ",".join(f"'{k}':'{v}'" for k, v in ui_final.items())
html = re.sub(r'const UI = \{.*?\};', f'const UI = {{{ui_js}}};', html, flags=re.DOTALL, count=1)

# HTML UI labels (form, buttons, results)
html_labels_zh = {
    "resultPrefix": "找到", "resultSuffix": "个地方",
    "mapToggle": "地图", "exportBtn": "导出数据 (data.js)",
    "fabTitle": "添加新地点",
    "labelName": "名称 *", "placeholderName": "例：蓝瓶咖啡",
    "labelNameEn": "英文名", "placeholderNameEn": "例：Blue Bottle Coffee",
    "labelCat": "分类 *", "labelRegion": "地区 *",
    "labelArea": "区域", "placeholderArea": "例：三里屯/工体",
    "labelDesc": "描述/特色", "placeholderDesc": "例：露台很美，适合拍照",
    "labelTags": "标签（逗号分隔）", "placeholderTags": "例：brunch, 四合院, 日落",
    "labelVisited": "已去过",
    "btnCancel": "取消", "btnSave": "保存",
}
html_labels_en = {
    "resultPrefix": "Found", "resultSuffix": "places",
    "mapToggle": "Map", "exportBtn": "Export Data (data.js)",
    "fabTitle": "Add new place",
    "labelName": "Name *", "placeholderName": "e.g. Blue Bottle Coffee",
    "labelNameEn": "English Name", "placeholderNameEn": "e.g. Blue Bottle Coffee",
    "labelCat": "Category *", "labelRegion": "Region *",
    "labelArea": "Area", "placeholderArea": "e.g. Williamsburg",
    "labelDesc": "Description", "placeholderDesc": "e.g. Great outdoor seating",
    "labelTags": "Tags (comma-separated)", "placeholderTags": "e.g. brunch, date night",
    "labelVisited": "Visited",
    "btnCancel": "Cancel", "btnSave": "Save",
}
labels = html_labels_zh if lang.startswith("zh") else html_labels_en
labels.update(config.get("htmlLabels", {}))

def set_inner(element_id, text):
    global html
    html = re.sub(f'id="{element_id}">[^<]*<', f'id="{element_id}">{text}<', html, count=1)

def set_attr(element_id, attr, val):
    global html
    html = re.sub(f'(id="{element_id}"[^>]*){attr}="[^"]*"', f'\\1{attr}="{val}"', html, count=1)

set_inner("resultPrefix", labels["resultPrefix"])
set_inner("resultSuffix", labels["resultSuffix"])
set_inner("mapToggleLabel", labels["mapToggle"])
set_inner("exportBtn", labels["exportBtn"])
set_attr("fabBtn", "title", labels["fabTitle"])
set_inner("labelName", labels["labelName"])
set_attr("fName", "placeholder", labels["placeholderName"])
set_inner("labelNameEn", labels["labelNameEn"])
set_attr("fNameEn", "placeholder", labels["placeholderNameEn"])
set_inner("labelCat", labels["labelCat"])
set_inner("labelRegion", labels["labelRegion"])
set_inner("labelArea", labels["labelArea"])
set_attr("fArea", "placeholder", labels["placeholderArea"])
set_inner("labelDesc", labels["labelDesc"])
set_attr("fDesc", "placeholder", labels["placeholderDesc"])
set_inner("labelTags", labels["labelTags"])
set_attr("fTags", "placeholder", labels["placeholderTags"])
set_inner("labelVisited", labels["labelVisited"])
set_inner("btnCancel", labels["btnCancel"])
set_inner("btnSave", labels["btnSave"])

# Stats
stats = config.get("stats")
if stats:
    stats_html = "\n".join(f'    <div class="hero-stat"><div class="num" id="{s["id"]}">0</div><div class="label">{s["label"]}</div></div>' for s in stats)
    html = re.sub(r'<div class="hero-stats">.*?</div>\n</div>', f'<div class="hero-stats">\n{stats_html}\n  </div>\n</div>', html, flags=re.DOTALL, count=1)

    stat_lines = []
    for s in stats:
        filt = s.get("filter")
        if filt:
            stat_lines.append(f"  document.getElementById('{s['id']}').textContent=md.filter(d=>{filt}).length;")
        else:
            stat_lines.append(f"  document.getElementById('{s['id']}').textContent=md.length;")
    html = re.sub(
        r'function updateStats\(\)\{.*?\}',
        'function updateStats(){\n  const md=getCachedMerged();\n' + '\n'.join(stat_lines) + '\n}',
        html, flags=re.DOTALL, count=1
    )

# Map jump buttons (HTML)
map_jumps = config.get("mapJumps")
if map_jumps:
    btn_html = "\n".join(f"    <button class=\"map-jump-btn\" data-jump=\"{mj['key']}\" onclick=\"mapJump('{mj['key']}')\">{mj['label']}</button>" for mj in map_jumps)
    html = re.sub(r'<div class="map-jump">.*?</div>', f'<div class="map-jump">\n{btn_html}\n  </div>', html, flags=re.DOTALL, count=1)

# Status labels (with lang-based defaults)
sl_defaults_zh = {"all": "全部", "visited": "已去过", "unvisited": "想去"}
sl_defaults_en = {"all": "All", "visited": "Been", "unvisited": "Want to go"}
sl_base = sl_defaults_zh if lang.startswith("zh") else sl_defaults_en
sl = {**sl_base, **config.get("statusLabels", {})}
html = html.replace("onclick=\"setStatusFilter('all')\">全部<", f"onclick=\"setStatusFilter('all')\">{sl['all']}<")
html = html.replace("onclick=\"setStatusFilter('visited')\">已去过<", f"onclick=\"setStatusFilter('visited')\">{sl['visited']}<")
html = html.replace("onclick=\"setStatusFilter('unvisited')\">想去<", f"onclick=\"setStatusFilter('unvisited')\">{sl['unvisited']}<")

# Footer text
footer = config.get("footerText", hero_sub)
set_inner("footerText", footer)

with open(output_path, "w", encoding="utf-8") as f:
    f.write(html)

print(f"[setup] Generated {output_path} — {title}")
