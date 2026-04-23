#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const OWNER = 'elinking-111';
const REPO = 'foodie-project';
const CATEGORY = 'Announcements';
const OUT_PATH = path.join(process.cwd(), 'discussion-counts.json');
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

if (!TOKEN) {
  console.error('Missing GITHUB_TOKEN or GH_TOKEN');
  process.exit(1);
}

async function graphql(query, variables) {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'foodie-project-discussion-counts',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub GraphQL failed: ${response.status} ${text}`);
  }

  const json = await response.json();
  if (json.errors) {
    throw new Error(`GitHub GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

async function fetchDiscussionCounts() {
  const counts = {};
  let hasNextPage = true;
  let after = null;

  const query = `
    query($owner: String!, $repo: String!, $after: String) {
      repository(owner: $owner, name: $repo) {
        discussions(first: 100, after: $after, orderBy: { field: UPDATED_AT, direction: DESC }) {
          nodes {
            title
            category {
              name
            }
            comments {
              totalCount
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  `;

  while (hasNextPage) {
    const data = await graphql(query, { owner: OWNER, repo: REPO, after });
    const discussions = data.repository.discussions;

    discussions.nodes.forEach((discussion) => {
      if (!discussion || discussion.category?.name !== CATEGORY || !discussion.title) return;
      counts[discussion.title] = discussion.comments?.totalCount || 0;
    });

    hasNextPage = discussions.pageInfo.hasNextPage;
    after = discussions.pageInfo.endCursor;
  }

  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0], 'zh'))
  );
}

async function main() {
  const counts = await fetchDiscussionCounts();
  const output = {
    generatedAt: new Date().toISOString(),
    counts,
  };
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${Object.keys(counts).length} discussion counts to ${path.basename(OUT_PATH)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
