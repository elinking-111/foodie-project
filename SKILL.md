---
name: foodie-site
description: "Build or iteratively evolve a foodie/travel review website from notes and deploy it to GitHub Pages. Use this skill both for greenfield generation from Apple Notes/pasted text/social posts and for ongoing upgrades to an existing site: visual refinement, map/filter changes, showcase pages, shared interactions, and admin editing for shared content."
---

# Foodie Site Generator

Turn a user's personal collection of restaurants, cafes, bars, travel destinations, and points of interest into a beautiful, filterable, map-enabled website — then keep evolving it as the product grows.

## Overview

This skill now has 2 modes.

1. **Greenfield mode**: Create a new site from notes or pasted lists.
2. **Iteration mode**: Upgrade an existing deployed site with product and growth features.

The original core still matters: do NOT hand-write a brand-new HTML app when the project is in bootstrap mode. Use the bundled template workflow unless there is already a customized `index.html` in the repo that has diverged materially.

For this repo specifically:
- `assets/template.html` is the template mirror.
- `index.html` is the live page.
- Once a site has accumulated custom product work, edit both `index.html` and `assets/template.html` together unless you are intentionally regenerating from scratch.
- Do not claim a change is live until the git push succeeds and the latest GitHub Pages build reports `built`.

## Core Workflows

### A. Greenfield build

Use this when the user is turning notes, Apple Notes exports, pasted restaurant lists, or social-media food content into a new site.

1. **Collect** — Get the user's notes
2. **Parse** — Convert notes into `data.js`
3. **Configure** — Write `config.json` to customize the template
4. **Build** — Run `setup.py` to generate `index.html` from template + config
5. **Deploy** — Push to GitHub Pages

### B. Iteration / live-site upgrades

Use this when the user already has a foodie site and wants to keep iterating. Typical requests now include:

- visual refinement and lighter UI
- comment and recommendation UX changes
- shared likes / thumbs-up
- Firebase-backed comments
- admin-only editing for live restaurant data
- showcase / case-study pages
- homepage wording / title / information hierarchy changes

Recommended iteration order:

1. Inspect current `index.html`, `assets/template.html`, and related JS/CSS before proposing changes.
2. Prefer the existing visual language of the current site over regenerating from template.
3. If the change affects shared interactions, check whether it belongs in Firebase rather than localStorage.
4. If the page has a corresponding template mirror, keep both files in sync.
5. After changes, push and verify GitHub Pages build status.

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

**Do NOT write a new `index.html` manually in greenfield mode.** The template has the base CSS, JS, and HTML. Use the setup script.

**Exception for iteration mode:** if the live site already contains substantial custom logic not represented in `config.json` or `setup.py` output, patch the existing `index.html` and keep `assets/template.html` aligned. Do not wipe out product-layer changes by blindly regenerating.

## Firebase Interaction Layer

When the user wants shared interaction instead of browser-local state, prefer Firebase.

Current supported patterns in this repo:

- `firebase-config.js`: runtime config
- `firebase-comments.js`: auth sessions, anonymous like sessions, Firestore subscriptions
- `firestore.rules`: auth and write restrictions

Use Firebase for:

- shared comments
- shared likes / thumbs-up counts
- admin-only shared editing of restaurant data

Important:

- Likes can be anonymous if the product goal is lightweight interaction.
- Comments should require a signed-in user if identity matters.
- Admin editing should be gated by an allowlist identity and Firestore rules.
- If Firestore rules change, they must be deployed separately; code changes alone are not enough.

If `firebase-tools` is unavailable, fall back to `npx firebase-tools ...`.
If deployment fails because auth is missing, explicitly tell the user they must run `npx firebase-tools login` first.

## Admin Editing

For this repo's current architecture, "editable by owner" means:

- only a specific owner account can see edit controls
- changes write to Firestore, not just localStorage
- all users see the updated restaurant data

Do not mistake local modal editing for shared CMS behavior. If the request is to fix a restaurant for everyone, the write path must be shared.

## Showcase / Growth Pages

This project now supports adjacent pages beyond the main directory:

- `showcase.html`: public showcase / case-study page
- `PROJECT_SHOWCASE.md`: narrative/source content for the showcase

Use a separate page when the user wants to explain:

- how the site was built
- prompts used during the project
- product evolution
- before/after capability demos

Do not add showcase entry points to the hero unless the user explicitly wants that.

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
6. Verify push succeeded
7. Check Pages build status:
   - `gh api repos/<owner>/<repo>/pages/builds --jq '.[0] | {status, error: .error.message, commit}'`
8. Verify site URL after the latest build is `built`

## For content updates

Re-parse notes, regenerate `data.js`, commit and push. The template and localStorage state are preserved.

For iterative live-site updates:

- inspect whether the current request is content-only, UI-only, or shared-data/product-layer
- keep `index.html` and `assets/template.html` aligned if both exist
- preserve user changes already in the repo
- verify the latest deploy before telling the user to refresh

## Important

- Always ask for the site title first.
- `data.js` and `index.html` must be in the same directory.
- User state (visited toggles, stars, manual additions) lives in localStorage — updating data.js won't lose it.
- Shared Firebase-backed state is separate from localStorage and must be treated as source-of-truth for collaborative features.
- If `gh` is unavailable, give manual GitHub instructions.
- The final site is two files: `index.html` + `data.js`. No build tools needed.
- If this specific repo already has Firebase, showcase pages, or custom interaction modules, do not revert to the minimal static-site workflow by default.
