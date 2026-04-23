# Firebase Comments MVP Setup

This repo now supports a Google-login comment MVP backed by Firebase Auth + Firestore.

If `firebase-config.js` stays `null`, the site continues to use the existing giscus / GitHub discussion flow.

## 1. Create a Firebase project

1. Open Firebase Console.
2. Create a project for this site.
3. Add a Web App.
4. Copy the Web App config values.

## 2. Fill the local config

1. Copy `firebase-config.example.js` to `firebase-config.js`.
2. Replace the placeholder values with your Firebase Web App config.

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
- no public update/delete

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

Once `firebase-config.js` is filled, deploy the site as usual.

If you keep `.nojekyll`, GitHub Pages should continue to serve the added JS files directly.

## Notes

- Current MVP supports Google login for comments.
- Likes use Firebase Anonymous Auth automatically, so users can点赞 without manual login.
- Reading comments does not require login.
- Writing comments requires Google login.
- Shared likes and comments only become active after Firebase is configured.
- The previous giscus path remains as fallback until Firebase is configured.
