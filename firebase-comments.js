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
  placeEdits: {},
  placeAdds: [],
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
    placeEdits: Object.fromEntries(
      Object.entries(state.placeEdits || {}).map(([key, value]) => [key, { ...value }])
    ),
    placeAdds: (state.placeAdds || []).map((item) => ({ ...item })),
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

function normalizePlacePayload(data) {
  return {
    name: String(data.name || "").trim(),
    nameEn: String(data.nameEn || "").trim(),
    cat: String(data.cat || "restaurant").trim(),
    region: String(data.region || "北京").trim(),
    area: String(data.area || "其他").trim(),
    desc: String(data.desc || "").trim(),
    star: !!data.star,
    tags: Array.isArray(data.tags)
      ? data.tags.map((tag) => String(tag || "").trim()).filter(Boolean).slice(0, 20)
      : [],
  };
}

function normalizePlaceEdit(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    sourceKey: String(data.sourceKey || doc.id || ""),
    deleted: !!data.deleted,
    ...normalizePlacePayload(data),
  };
}

function normalizePlaceAdd(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    ...normalizePlacePayload(data),
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
  if (code === "auth/unauthorized-domain") return new Error("当前网站域名还没加入 Firebase Authorized domains");
  if (code === "auth/operation-not-allowed") return new Error("Firebase 还没开启 Google 登录方式");
  if (code === "auth/operation-not-supported-in-this-environment") return new Error("当前浏览器环境不支持弹窗登录，请换浏览器或改成重定向登录");
  if (code === "auth/network-request-failed") return new Error("登录请求失败，请检查当前网络后重试");
  return new Error(code ? `${fallback}（${code}）` : fallback);
}

function userFacingFirestoreError(error, fallback) {
  const code = error && error.code ? String(error.code) : "";
  const message = error && error.message ? String(error.message) : "";
  if (code === "permission-denied") return new Error("写入被 Firestore 规则拦截，请先发布最新规则");
  if (code === "unauthenticated") return new Error("登录状态已失效，请重新登录后再试");
  if (code === "unavailable") return new Error("Firebase 服务暂时不可用，请稍后再试");
  if (code === "failed-precondition") return new Error("Firebase 当前配置还没准备好，请检查规则或索引后重试");
  if (code === "invalid-argument" || /invalid document reference/i.test(message)) {
    return new Error("保存目标格式无效，已拦截这次写入，请刷新页面后重试");
  }
  return new Error(code ? `${fallback}（${code}）` : fallback);
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

function getPlaceEditDocId(sourceKey) {
  return `sync__${encodeThreadKey(sourceKey)}`;
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
      const friendly = userFacingFirestoreError(error, "评论发布失败，请稍后再试");
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
      const friendly = userFacingFirestoreError(error, "点赞失败，请稍后再试");
      setState({ error: friendly.message });
      throw friendly;
    } finally {
      setLikePending(normalizedThreadKey, false);
    }
  },
  async savePlace(payload) {
    await ensureReady();
    if (!auth || !auth.currentUser || auth.currentUser.isAnonymous) throw new Error("请先使用 Google 登录");
    const user = auth.currentUser;
    const email = String(user.email || "").toLowerCase();
    if (email !== "elinking@gmail.com") throw new Error("当前账号没有编辑权限");

    const mode = payload && payload.mode === "sync" ? "sync" : "add";
    const item = normalizePlacePayload(payload && payload.item ? payload.item : {});
    if (!item.name) throw new Error("请输入名称");

    try {
      if (mode === "sync") {
        const sourceKey = String(payload && payload.sourceKey ? payload.sourceKey : "").trim();
        if (!sourceKey) throw new Error("编辑目标无效");
        await firestoreModuleRef.setDoc(firestoreModuleRef.doc(db, "placeEdits", getPlaceEditDocId(sourceKey)), {
          sourceKey,
          deleted: false,
          ...item,
          updatedAt: firestoreModuleRef.serverTimestamp(),
          updatedByUid: user.uid,
          updatedByEmail: user.email || "",
        });
        return { id: sourceKey, mode };
      }

      const id = String(payload && payload.id ? payload.id : "").trim();
      if (!id) throw new Error("新增条目标识无效");
      await firestoreModuleRef.setDoc(firestoreModuleRef.doc(db, "placeAdds", id), {
        ...item,
        createdAt: firestoreModuleRef.serverTimestamp(),
        updatedAt: firestoreModuleRef.serverTimestamp(),
        updatedByUid: user.uid,
        updatedByEmail: user.email || "",
      }, { merge: true });
      return { id, mode };
    } catch (error) {
      const friendly = userFacingFirestoreError(error, "保存餐厅失败，请稍后再试");
      setState({ error: friendly.message });
      throw friendly;
    }
  },
  async deletePlace(payload) {
    await ensureReady();
    if (!auth || !auth.currentUser || auth.currentUser.isAnonymous) throw new Error("请先使用 Google 登录");
    const user = auth.currentUser;
    const email = String(user.email || "").toLowerCase();
    if (email !== "elinking@gmail.com") throw new Error("当前账号没有编辑权限");

    const mode = payload && payload.mode === "sync" ? "sync" : "add";
    try {
      if (mode === "sync") {
        const sourceKey = String(payload && payload.sourceKey ? payload.sourceKey : "").trim();
        if (!sourceKey) throw new Error("删除目标无效");
        await firestoreModuleRef.setDoc(firestoreModuleRef.doc(db, "placeEdits", getPlaceEditDocId(sourceKey)), {
          sourceKey,
          deleted: true,
          updatedAt: firestoreModuleRef.serverTimestamp(),
          updatedByUid: user.uid,
          updatedByEmail: user.email || "",
        }, { merge: true });
        return { id: sourceKey, mode };
      }

      const id = String(payload && payload.id ? payload.id : "").trim();
      if (!id) throw new Error("删除目标无效");
      await firestoreModuleRef.deleteDoc(firestoreModuleRef.doc(db, "placeAdds", id));
      return { id, mode };
    } catch (error) {
      const friendly = userFacingFirestoreError(error, "删除餐厅失败，请稍后再试");
      setState({ error: friendly.message });
      throw friendly;
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

    firestoreModule.onSnapshot(
      firestoreModule.collection(db, "placeEdits"),
      (snapshot) => {
        const edits = {};
        snapshot.docs.map(normalizePlaceEdit).forEach((entry) => {
          if (!entry.sourceKey) return;
          edits[entry.sourceKey] = entry;
        });
        setState({ placeEdits: edits });
      },
      (error) => {
        console.error("[foodie-comments] place edits snapshot failed", error);
        setState({ placeEdits: {} });
      }
    );

    firestoreModule.onSnapshot(
      firestoreModule.collection(db, "placeAdds"),
      (snapshot) => {
        const placeAdds = snapshot.docs.map(normalizePlaceAdd).filter((entry) => entry.id && entry.name);
        setState({ placeAdds });
      },
      (error) => {
        console.error("[foodie-comments] place adds snapshot failed", error);
        setState({ placeAdds: [] });
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
