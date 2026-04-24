# Firebase Comments MVP Setup

This repo now supports a Google-login comment MVP backed by Firebase Auth + Firestore.

The public repo does **not** commit a live `firebase-config.js`. Instead, GitHub Pages deployment injects it from a GitHub Actions secret at build time.

## 1. Create a Firebase project

1. Open Firebase Console.
2. Create a project for this site.
3. Add a Web App.
4. Copy the Web App config values.

## 2. Store the runtime config in GitHub Secrets

Create a repository secret named `FOODIE_FIREBASE_CONFIG_JS`.

The value should be the full JS file body:

```js
window.FOODIE_FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID",
};
```

Why this repo uses a secret:

- the public GitHub repo should not expose the live Firebase runtime config file
- the deployed website still needs `firebase-config.js` at runtime
- GitHub Pages Actions can generate that file during deployment without committing it

## 3. Enable Authentication

Turn on both of these providers:

1. In Firebase Console, open `Authentication`.
2. Go to `Sign-in method`.
3. Enable `Google`.
4. Enable `Anonymous`.
5. Add your GitHub Pages domain and any preview domains to the authorized domains list.

## 4. Create Firestore

1. In Firebase Console, open `Firestore Database`.
2. Create the database in Native mode.
3. Pick a region close to your users.

## 5. Apply security rules

Use the rules in `firestore.rules`:

```bash
firebase deploy --only firestore:rules
```

Rules in this MVP allow:

- public read
- authenticated create for comments
- authenticated anonymous-or-user create/delete for likes
- admin-only create/update/delete for shared place edits

If you update `firestore.rules`, deploy them separately:

```bash
npx firebase-tools deploy --only firestore:rules
```

## 6. Expected collection shape

Collection: `comments`

Example document:

```json
{
  "threadKey": "restaurant|北京|三里屯/工体|Example Cafe",
  "body": "适合下午坐一会，甜品比咖啡更值得点。",
  "scope": "place",
  "place": {
    "name": "Example Cafe",
    "region": "北京",
    "area": "三里屯/工体",
    "cat": "coffee"
  },
  "authorUid": "firebase-auth-uid",
  "authorName": "User Name",
  "authorPhotoURL": "https://...",
  "authorEmail": "user@example.com",
  "createdAt": "server timestamp",
  "updatedAt": "server timestamp",
  "clientCreatedAtMs": 1710000000000
}
```

## 7. Deploy

This repo now deploys with GitHub Pages Actions instead of legacy branch publishing.

Deployment flow:

1. push to `main`
2. GitHub Actions runs `.github/workflows/deploy-pages.yml`
3. the workflow copies the site into `dist/`
4. it writes `dist/firebase-config.js` from `FOODIE_FIREBASE_CONFIG_JS`
5. it uploads the artifact and deploys Pages

If the secret is missing, the workflow should fail instead of publishing a degraded site.

## Notes

- Current MVP supports Google login for comments.
- Likes use Firebase Anonymous Auth automatically, so users can点赞 without manual login.
- Reading comments does not require login.
- Writing comments requires Google login.
- Shared likes and comments only become active after Firebase is configured.
- The previous giscus path remains as fallback until Firebase is configured.
- Admin editing also depends on Firebase being available at runtime.
