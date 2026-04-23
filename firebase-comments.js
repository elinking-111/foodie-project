const FIREBASE_VERSION = "10.12.2";
const FIREBASE_CONFIG = window.FOODIE_FIREBASE_CONFIG || null;
const IS_CONFIGURED = !!(FIREBASE_CONFIG && typeof FIREBASE_CONFIG === "object" && FIREBASE_CONFIG.apiKey);

const listeners = new Set();
let auth = null;
let db = null;
let authModuleRef = null;
let firestoreModuleRef = null;
let loginProvider = null;
let initError = null;
let allLikeEntries = [];

let state = {
  ready: false,
  configured: IS_CONFIGURED,
  user: null,
  viewerUid: null,
  comments: [],
  likes: {},
  likedThreadKeys: [],
  likePendingKeys: [],
  error: null,
  loading: IS_CONFIGURED,
  loginPending: false,
  postPending: false,
};

let resolveReady;
const readyPromise = new Promise((resolve) => {
  resolveReady = resolve;
});

function cloneState() {
  return {
    ...state,
    comments: (state.comments || []).map((comment) => ({ ...comment })),
    likes: { ...(state.likes || {}) },
    likedThreadKeys: [...(state.likedThreadKeys || [])],
    likePendingKeys: [...(state.likePendingKeys || [])],
    user: state.user ? { ...state.user } : null,
  };
}

function notify() {
  const snapshot = cloneState();
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      console.error("[foodie-comments] subscriber failed", error);
    }
  });
}

function setState(patch) {
  state = { ...state, ...patch };
  notify();
}

function finalizeReady() {
  if (!state.ready) {
    state = { ...state, ready: true };
    notify();
  }
  if (resolveReady) {
    resolveReady();
    resolveReady = null;
  }
}

function dispatchReady() {
  window.dispatchEvent(new CustomEvent("foodie-comments-ready"));
}

function normalizeCommentUser(user) {
  if (!user || user.isAnonymous) return null;
  return {
    uid: user.uid,
    displayName: user.displayName || user.email || "Google 用户",
    email: user.email || "",
    photoURL: user.photoURL || "",
  };
}

function normalizeComment(doc) {
  const data = doc.data() || {};
  const createdAtMs =
    data.createdAt && typeof data.createdAt.toMillis === "function"
      ? data.createdAt.toMillis()
      : Number(data.clientCreatedAtMs) || 0;

  return {
    id: doc.id,
    threadKey: String(data.threadKey || ""),
    body: String(data.body || ""),
    authorUid: data.authorUid || "",
    authorName: data.authorName || "",
    authorPhotoURL: data.authorPhotoURL || "",
    authorEmail: data.authorEmail || "",
    createdAtMs,
    scope: data.scope || "place",
    place: data.place || null,
  };
}

function normalizeLike(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    threadKey: String(data.threadKey || ""),
    authorUid: String(data.authorUid || ""),
  };
}

function syncLikesState() {
  const counts = {};
  const likedThreadKeys = [];
  const viewerUid = state.viewerUid;

  allLikeEntries.forEach((entry) => {
    if (!entry.threadKey) return;
    counts[entry.threadKey] = (counts[entry.threadKey] || 0) + 1;
    if (viewerUid && entry.authorUid === viewerUid) likedThreadKeys.push(entry.threadKey);
  });

  setState({
    likes: counts,
    likedThreadKeys: Array.from(new Set(likedThreadKeys)),
  });
}

function setLikePending(threadKey, pending) {
  const next = new Set(state.likePendingKeys || []);
  if (pending) next.add(threadKey);
  else next.delete(threadKey);
  setState({ likePendingKeys: Array.from(next) });
}

function applyOptimisticLike(threadKey, liked) {
  const likes = { ...(state.likes || {}) };
  const likedThreadKeys = new Set(state.likedThreadKeys || []);
  const currentlyLiked = likedThreadKeys.has(threadKey);

  if (liked === currentlyLiked) return;

  if (liked) {
    likes[threadKey] = (Number(likes[threadKey]) || 0) + 1;
    likedThreadKeys.add(threadKey);
  } else {
    likes[threadKey] = Math.max(0, (Number(likes[threadKey]) || 0) - 1);
    likedThreadKeys.delete(threadKey);
  }

  setState({
    likes,
    likedThreadKeys: Array.from(likedThreadKeys),
  });
}

async function ensureReady() {
  await readyPromise;
  if (!IS_CONFIGURED) throw new Error("Firebase 未配置");
  if (initError) throw initError;
}

function userFacingError(error, fallback) {
  const code = error && error.code ? String(error.code) : "";
  if (code === "auth/popup-closed-by-user") return null;
  if (code === "auth/popup-blocked") return new Error("登录弹窗被浏览器拦截，请允许弹窗后重试");
  if (code === "auth/cancelled-popup-request") return null;
  if (code === "auth/admin-restricted-operation") return new Error("请先在 Firebase 后台开启对应登录方式");
  return new Error(fallback);
}

function encodeThreadKey(threadKey) {
  return btoa(unescape(encodeURIComponent(threadKey)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function getLikeDocId(uid, threadKey) {
  return `${uid}__${encodeThreadKey(threadKey)}`;
}

async function ensureViewerSession() {
  await ensureReady();
  if (auth && auth.currentUser) return auth.currentUser;
  try {
    const credential = await authModuleRef.signInAnonymously(auth);
    return credential.user;
  } catch (error) {
    const friendly = userFacingError(error, "匿名点赞初始化失败，请稍后再试");
    if (friendly) {
      setState({ error: friendly.message });
      throw friendly;
    }
    throw error;
  }
}

const api = {
  subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    listener(cloneState());
    return () => listeners.delete(listener);
  },
  async login() {
    await ensureReady();
    setState({ loginPending: true, error: null });
    try {
      await authModuleRef.signInWithPopup(auth, loginProvider);
    } catch (error) {
      const friendly = userFacingError(error, "Google 登录失败，请稍后重试");
      if (friendly) {
        setState({ error: friendly.message });
        throw friendly;
      }
    } finally {
      setState({ loginPending: false });
    }
  },
  async logout() {
    await ensureReady();
    setState({ error: null });
    try {
      await authModuleRef.signOut(auth);
    } catch (error) {
      const friendly = new Error("退出登录失败，请稍后再试");
      setState({ error: friendly.message });
      throw friendly;
    }
  },
  async postComment(payload) {
    await ensureReady();
    if (!auth || !auth.currentUser || auth.currentUser.isAnonymous) throw new Error("请先使用 Google 登录");

    const body = String(payload && payload.body ? payload.body : "").trim();
    if (!body) throw new Error("请输入评论内容");
    if (body.length > 2000) throw new Error("评论请控制在 2000 字以内");

    setState({ postPending: true, error: null });
    try {
      const user = auth.currentUser;
      await firestoreModuleRef.addDoc(firestoreModuleRef.collection(db, "comments"), {
        threadKey: String(payload.threadKey || ""),
        body,
        scope: payload.scope === "global" ? "global" : "place",
        place: payload.place || null,
        authorUid: user.uid,
        authorName: user.displayName || user.email || "Google 用户",
        authorPhotoURL: user.photoURL || "",
        authorEmail: user.email || "",
        createdAt: firestoreModuleRef.serverTimestamp(),
        updatedAt: firestoreModuleRef.serverTimestamp(),
        clientCreatedAtMs: Date.now(),
      });
    } catch (error) {
      const friendly = new Error("评论发布失败，请稍后再试");
      setState({ error: friendly.message });
      throw friendly;
    } finally {
      setState({ postPending: false });
    }
  },
  async toggleLike(threadKey) {
    await ensureReady();
    const normalizedThreadKey = String(threadKey || "");
    if (!normalizedThreadKey) throw new Error("点赞目标无效");
    if ((state.likePendingKeys || []).includes(normalizedThreadKey)) return;

    const wasLiked = (state.likedThreadKeys || []).includes(normalizedThreadKey);
    const shouldLike = !wasLiked;
    setLikePending(normalizedThreadKey, true);
    applyOptimisticLike(normalizedThreadKey, shouldLike);
    setState({ error: null });

    try {
      const viewer = await ensureViewerSession();
      const uid = viewer && viewer.uid;
      if (!uid) throw new Error("点赞身份初始化失败");

      // Auth state changes can arrive before the write finishes, so keep the button responsive.
      applyOptimisticLike(normalizedThreadKey, shouldLike);

      const likeRef = firestoreModuleRef.doc(db, "likes", getLikeDocId(uid, normalizedThreadKey));

      if (wasLiked) {
        await firestoreModuleRef.deleteDoc(likeRef);
      } else {
        await firestoreModuleRef.setDoc(likeRef, {
          threadKey: normalizedThreadKey,
          authorUid: uid,
          createdAt: firestoreModuleRef.serverTimestamp(),
        });
      }
    } catch (error) {
      applyOptimisticLike(normalizedThreadKey, wasLiked);
      const friendly = new Error("点赞失败，请稍后再试");
      setState({ error: friendly.message });
      throw friendly;
    } finally {
      setLikePending(normalizedThreadKey, false);
    }
  },
};

window.foodieComments = api;
notify();

async function bootstrap() {
  if (!IS_CONFIGURED) {
    setState({ ready: true, loading: false });
    finalizeReady();
    dispatchReady();
    return;
  }

  try {
    const [{ initializeApp }, authModule, firestoreModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`),
    ]);

    authModuleRef = authModule;
    firestoreModuleRef = firestoreModule;

    const app = initializeApp(FIREBASE_CONFIG);
    auth = authModule.getAuth(app);
    db = firestoreModule.getFirestore(app);
    loginProvider = new authModule.GoogleAuthProvider();
    loginProvider.setCustomParameters({ prompt: "select_account" });

    authModule.onAuthStateChanged(auth, (user) => {
      setState({
        viewerUid: user ? user.uid : null,
        user: normalizeCommentUser(user),
      });
      syncLikesState();
    });

    const commentsQuery = firestoreModule.query(
      firestoreModule.collection(db, "comments"),
      firestoreModule.orderBy("createdAt", "asc")
    );

    firestoreModule.onSnapshot(
      commentsQuery,
      (snapshot) => {
        const comments = snapshot.docs.map(normalizeComment).filter((comment) => comment.threadKey);
        setState({ comments, loading: false, error: null });
      },
      (error) => {
        console.error("[foodie-comments] comments snapshot failed", error);
        setState({ loading: false, error: "评论加载失败，请稍后刷新重试" });
      }
    );

    const likesQuery = firestoreModule.query(firestoreModule.collection(db, "likes"));
    firestoreModule.onSnapshot(
      likesQuery,
      (snapshot) => {
        allLikeEntries = snapshot.docs.map(normalizeLike).filter((entry) => entry.threadKey && entry.authorUid);
        syncLikesState();
      },
      (error) => {
        console.error("[foodie-comments] likes snapshot failed", error);
        setState({ error: "点赞加载失败，请稍后刷新重试" });
      }
    );

    finalizeReady();
    dispatchReady();
  } catch (error) {
    initError = error instanceof Error ? error : new Error("Firebase 初始化失败");
    console.error("[foodie-comments] bootstrap failed", error);
    setState({
      loading: false,
      error: "Firebase 初始化失败，请检查 firebase-config.js",
    });
    finalizeReady();
    dispatchReady();
  }
}

bootstrap();
