---
name: foodie-site
description: "Generate a beautiful foodie/travel review map website from notes and deploy it to GitHub Pages. Use this skill whenever a user wants to turn their food, restaurant, travel, or place lists into a website — whether from Apple Notes, pasted text, a file, social media posts (小红书/Xiaohongshu, Yelp, TripAdvisor, etc.), or any list of places they've been or want to visit. Also trigger when users mention: making a food map, restaurant guide, travel diary website, personal review site, place collection, 探店地图, 美食地图, or anything involving turning a list of locations/venues into a browsable web page with filters and maps."
---

# Foodie Site Generator

Turn a user's personal collection of restaurants, cafes, bars, travel destinations, and points of interest into a beautiful, filterable, map-enabled static website — then deploy it live.

## Overview

The workflow has 5 steps. The key design: you do NOT write HTML from scratch. A production-quality template is bundled in `assets/template.html`. You generate two small files (`data.js` and `config.json`), then run `scripts/setup.py` to customize the template.

1. **Collect** — Get the user's notes
2. **Parse** — Convert notes into `data.js`
3. **Configure** — Write `config.json` to customize the template
4. **Build** — Run `setup.py` to generate `index.html` from template + config
5. **Deploy** — Push to GitHub Pages

## Step 1: Collect the notes

Support these input modes:

**Paste text**: User pastes notes directly. Most common path.

**File path**: User provides a path. Read it.

**Apple Notes (macOS)**: Use AppleScript:
```bash
osascript -e 'tell application "Notes" to set n to body of note "NOTE_NAME"' | python3 -c "import sys,re; print(re.sub('<[^>]+>','',sys.stdin.read()))"
```
If it fails, ask user to copy-paste manually.

**Social media content (小红书, etc.)**: User pastes copied text from social platforms. Common formats:
- Xiaohongshu/小红书: Title + body text with store names, locations, emoji markers
- Yelp/TripAdvisor: Copied review text or lists
- WeChat articles: Forwarded food guide text

These are all handled as paste text — no scraping needed. Just parse the content.

## Step 2: Parse notes into `data.js`

Users' notes come in many formats. Be flexible.

### Input formats to handle

- **Checklist**: `- [x]` = visited, `- [ ]` = want to go
- **Simple list**: `Name - description` or `Name（描述）`
- **Sectioned**: Headers like `## 北京美食` or `COFFEE:` group items
- **Freeform**: Mixed formats, emoji markers (🌟=favorite, ✅=visited)
- **Social media (小红书 etc.)**: Posts with titles like "北京必吃10家店", numbered lists (`1. 店名 - 描述`), POI tags (`📍三里屯`), hashtags (`#探店 #咖啡`). Extract place names from the body, not the post title. Ratings like `人均💰80` or `⭐4.8` can go into desc/tags.

### Parsing rules

For each line that looks like a place:

1. **Visited**: `- [x]`, `✅`, `(visited)`, `been there` → visited:true
2. **Star**: `🌟`, `⭐`, `★`, `必吃`, `必去`, `推荐` → star:true
3. **Name**: Primary text before parenthetical/dash. Split Chinese+English into name/nameEn.
4. **Desc**: Parenthetical content, text after `-` or `—`
5. **Category** from keywords:
   - `coffee`: 咖啡, coffee, cafe, 拿铁
   - `restaurant`: default for food entries
   - `bar`: 酒吧, 酒馆, bar, wine, 精酿, speakeasy, cocktail
   - `bakery`: 面包, 甜点, 蛋糕, bagel, bakery
   - `culture`: 美术馆, 书店, 展览, 博物馆, 古城, temple, museum
   - `explore`: 山, 湖, 公园, forest, hiking, camping
   - `leisure`: live, music, 脱口秀, 温泉, comedy
6. **Region**: From section headers or location context
7. **Area**: From neighborhood/district mentions, POI tags (`📍`), or `#区域` hashtags
8. **Social media signals**: `📍` = location/area, `💰` = price (put in desc), `#tag` = tags array, numbered lists = one place per number

### Output format

Write `data.js`:
```javascript
const DATA = [
  {"name":"Store Name","nameEn":"","cat":"coffee","region":"北京","area":"鼓楼/南锣","desc":"描述","star":false,"visited":true,"tags":[]},
  // ...
];
```

## Step 3: Write `config.json`

Analyze the parsed data and write a `config.json` that adapts the template to the user's content. This is how the template becomes personalized.

```json
{
  "siteTitle": "小王の探店日记",
  "siteSubtitle": "吃喝玩乐指南",
  "siteBadge": "小王の探店日记",
  "heroSub": "Eat · Drink · Explore · Travel",
  "lang": "zh-CN",
  "searchPlaceholder": "搜索店名、区域、关键词...",
  "categories": [
    {"key":"all","label":"全部","emoji":""},
    {"key":"coffee","label":"咖啡","emoji":"☕"},
    {"key":"restaurant","label":"餐厅","emoji":"🍜"},
    {"key":"bar","label":"酒吧","emoji":"🍷"},
    {"key":"bakery","label":"烘焙甜点","emoji":"🧁"},
    {"key":"culture","label":"文化景点","emoji":"🏛️"},
    {"key":"explore","label":"探索出行","emoji":"🌿"},
    {"key":"leisure","label":"休闲娱乐","emoji":"🎵"}
  ],
  "regions": [
    {"key":"all","label":"All","emoji":"🌏"},
    {"key":"NYC","label":"NYC","emoji":"🏙️"},
    {"key":"Travel","label":"Travel","emoji":"✈️"}
  ],
  "stats": [
    {"id":"statTotal","label":"TOTAL"},
    {"id":"statNYC","label":"NYC","filter":"d.region==='NYC'"},
    {"id":"statTravel","label":"TRAVEL","filter":"d.region==='Travel'"}
  ],
  "areaCoords": {
    "Williamsburg": [40.7081, -73.9571],
    "East Village": [40.7265, -73.9815]
  },
  "regionCenters": {
    "NYC": [40.7128, -74.0060],
    "Travel": [30, 10]
  },
  "districtMap": {},
  "mapJumps": [
    {"key":"nyc","label":"NYC","center":[40.7128,-74.006],"zoom":12},
    {"key":"world","label":"World","center":[30,10],"zoom":3}
  ],
  "statusLabels": {"all":"All","visited":"Been","unvisited":"Want to go"}
}
```

Key rules for config:
- **Only include categories actually used** in the data (plus "all")
- **Only include regions actually present** in the data (plus "all")
- **areaCoords**: Map every unique `area` value to approximate [lat, lng]. Look up real coordinates.
- **regionCenters**: One center per region for map fallback.
- **stats**: One counter per region, with JS filter expressions.
- **mapJumps**: 2-3 useful zoom presets based on the data's geography.
- **lang**: Set `"zh-CN"` for Chinese content, `"en"` for English. The setup script auto-localizes all UI text (form labels, buttons, tooltips, empty states, etc.) based on this field — you do NOT need to translate UI strings manually.
- **statusLabels**: Customize the visited/unvisited filter buttons. Chinese defaults: 全部/已去过/想去. English defaults: All/Been/Want to go.
- **districtMap**: Only needed for hierarchical filtering (e.g., Beijing districts → sub-areas). Leave `{}` for flat area lists.

## Step 4: Build index.html

Run the setup script (it's bundled with this skill):

```bash
python3 <skill-path>/scripts/setup.py config.json <skill-path>/assets/template.html index.html
```

This takes the production-quality template and injects the config values. The result is a complete, working `index.html`.

**Do NOT write index.html manually.** The template has 1100+ lines of carefully crafted CSS, JS, and HTML. Always use the setup script.

## Step 5: Deploy to GitHub Pages

1. Check `gh` CLI: `gh auth status`
2. Init git: `git init` (if needed)
3. Create repo: `gh repo create <name> --public --source=. --push`
   - Must be **public** for free GitHub Pages
4. Enable Pages: `gh api repos/<owner>/<repo>/pages -X POST -f "build_type=legacy" -f "source[branch]=main" -f "source[path]=/"`
5. Custom domain (optional):
   - Write domain to `CNAME` file, commit, push
   - Tell user to add DNS CNAME record → `<username>.github.io`
   - Cloudflare users: set Proxy to "DNS only" (grey cloud)
6. Verify: `curl -sI http://<domain-or-github-url>`

## For content updates

Re-parse notes, regenerate `data.js`, commit and push. The template and localStorage state are preserved.

## Important

- Always ask for the site title first.
- `data.js` and `index.html` must be in the same directory.
- User state (visited toggles, stars, manual additions) lives in localStorage — updating data.js won't lose it.
- If `gh` is unavailable, give manual GitHub instructions.
- The final site is two files: `index.html` + `data.js`. No build tools needed.
