import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getDatabase, ref, push, set, onValue, update, remove 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { 
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, 
  onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyBdT1yWLsKQ8hyktm0TgCtkc3jLKlOVllY",
  authDomain: "takei-netplus.firebaseapp.com",
  projectId: "takei-netplus",
  databaseURL: "https://takei-netplus-default-rtdb.asia-southeast1.firebasedatabase.app",
  storageBucket: "takei-netplus.appspot.com",
  messagingSenderId: "180284787102",
  appId: "1:180284787102:web:4c9880b6930f323a94ee8f"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// --- グローバル状態管理 ---
let currentUserData = null;
let currentQuotedPost = null; 
let currentReplyToId = null;  
let currentViewMode = "home"; // "home", "replies", "dm", "channel"
let currentThreadPostId = null; 
let currentChannelId = "general"; // 選択中のチャンネル（初期値：全体）

// DM用の状態
let currentActiveDmPartnerUid = null;
let dmMessagesListener = null;

// チャンネルリストの定義
const CHANNELS = [
  { id: "general", name: "🌐 全体タイムライン" },
  { id: "class-1a", name: "🧪 1年A組スレッド" },
  { id: "research", name: "🔬 開発・研究" }
];

// --- Firebaseエラーメッセージ日本語化ヘルパー ---
function getFriendlyErrorMessage(errorCode) {
  if (!errorCode) return "エラーが発生しました。入力内容を確認してください。";
  switch (errorCode) {
    case "auth/weak-password":
      return "パスワードが短すぎます。6文字以上で設定してください。";
    case "auth/email-already-in-use":
      return "このメールアドレスはすでに登録されています。";
    case "auth/invalid-email":
      return "無効なメールアドレスの形式です。";
    case "auth/wrong-password":
      return "パスワードが間違っています。";
    case "auth/user-not-found":
      return "登録されていないメールアドレスです。";
    case "auth/invalid-credential":
      return "メールアドレス、またはパスワードが間違っています。";
    default:
      return `エラーが発生しました。(${errorCode})`;
  }
}

// --- 日付フォーマット ---
function formatDate(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes}`;
}

// --- 画像圧縮 ＆ Base64テキスト変換ロジック ---
async function compressAndConvertToBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const max_size = 120; 
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > max_size) {
            height *= max_size / width;
            width = max_size;
          }
        } else {
          if (height > max_size) {
            width *= max_size / height;
            height = max_size;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.4);
        resolve(compressedBase64);
      };
    };
  });
}

// 安全にDOMの表示非表示を切り替えるヘルパー
function setDisplay(id, displayStyle) {
  const el = document.getElementById(id);
  if (el) el.style.display = displayStyle;
}

// 安全にイベント登録を行うヘルパー
function safeAddListener(id, event, callback) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, callback);
}

// --- スレッド（チャンネル）一覧をHTMLを壊さずにサイドバーに強制追加する関数 ---
function injectChannelListUI() {
  const sidebar = document.querySelector(".sidebar div");
  if (!sidebar) return;

  // 既に挿入済みの場合はスキップ
  if (document.getElementById("channels-container")) {
    renderChannelList();
    return;
  }

  // 「管理者専用ページへ」ボタンまたは最後の要素の直前にチャンネル切り替えコンテナを動的に挿入する
  const container = document.createElement("div");
  container.id = "channels-container";
  container.style.marginTop = "15px";
  container.style.borderTop = "1px solid #2f3336";
  container.style.paddingTop = "10px";

  const adminLink = document.getElementById("nav-admin");
  if (adminLink) {
    sidebar.insertBefore(container, adminLink);
  } else {
    sidebar.appendChild(container);
  }

  renderChannelList();
}

// スレッド（チャンネル）一覧を画面に描画する
function renderChannelList() {
  const container = document.getElementById("channels-container");
  if (!container) return;

  container.innerHTML = `<div style="font-size: 13px; color: #71767b; padding: 5px 12px; font-weight: bold;">スレッド</div>`;

  CHANNELS.forEach((ch) => {
    const item = document.createElement("div");
    item.className = "nav-item";
    item.style.fontSize = "16px";
    item.style.padding = "8px 12px";
    item.style.marginBottom = "4px";
    item.innerText = ch.name;

    // 現在選択中のチャンネルは背景を目立たせる
    if (currentViewMode === "channel" && currentChannelId === ch.id) {
      item.style.background = "#1c2025";
      item.style.fontWeight = "bold";
    }

    item.addEventListener("click", () => {
      switchChannel(ch.id);
    });

    container.appendChild(item);
  });
}

function switchChannel(channelId) {
  currentViewMode = "channel";
  currentChannelId = channelId;
  currentThreadPostId = null;
  renderChannelList();
  
  // ホームボタンなどのアクティブ表示をリセット
  const homeBtn = document.getElementById("nav-home");
  if (homeBtn) homeBtn.style.background = "";
  const dmBtn = document.getElementById("nav-dm");
  if (dmBtn) dmBtn.style.background = "";

  setDisplay("main-content", "block");
  setDisplay("dm-content", "none");
  loadTimeline();
}

// --- UI表示切り替え ---
function showApp(user, docData) {
  currentUserData = docData;
  setDisplay("auth-gateway", "none");
  setDisplay("app-container", "flex");

  // アバター表示
  const avatarEl = document.getElementById("current-user-avatar");
  if (avatarEl) {
    if (docData.photoURL && docData.photoURL.startsWith("data:image")) {
      avatarEl.innerText = "";
      avatarEl.style.backgroundImage = `url(${docData.photoURL})`;
    } else {
      avatarEl.innerText = docData.photoURL || "🧪";
      avatarEl.style.backgroundImage = "none";
    }
  }

  // 管理者権限チェック
  const normalizedEmail = (docData.email || "").toLowerCase().trim();
  if (docData.role === "admin" || normalizedEmail === "ryukond2@gmail.com") {
    setDisplay("nav-admin", "flex");
  } else {
    setDisplay("nav-admin", "none");
  }

  // チャンネルリストをUIに埋め込む
  injectChannelListUI();

  if (currentViewMode === "dm") {
    loadDmThreads();
  } else {
    loadTimeline();
  }
}

function showAuth() {
  currentUserData = null;
  setDisplay("auth-gateway", "flex");
  setDisplay("app-container", "none");
}

// --- 新規投稿の作成 ---
async function createPost(content, replyToId = null, quotedPostId = null, quotedData = null, imageBase64 = null) {
  if (!currentUserData) return;
  try {
    const postsRef = ref(db, "posts");
    const newPostRef = push(postsRef);
    await set(newPostRef, {
      content: content,
      createdAt: Date.now(),
      senderId: currentUserData.uid,
      senderName: currentUserData.displayName,
      senderLoginId: currentUserData.userLoginId,
      senderIcon: currentUserData.photoURL, 
      likes: {},
      replyTo: replyToId, 
      quotedPostId: quotedPostId, 
      quotedData: quotedData, 
      isMigrated: false,
      image: imageBase64 || null,
      channelId: currentViewMode === "channel" ? currentChannelId : "general" // チャンネルを判別して格納
    });

    closeQuotePreview();
  } catch (error) {
    console.error("投稿エラー:", error);
  }
}

// --- タイムライン描画 ---
function loadTimeline() {
  const postsRef = ref(db, "posts");

  onValue(postsRef, (snapshot) => {
    if (currentViewMode !== "home" && currentViewMode !== "replies" && currentViewMode !== "channel") return; 

    const timelineEl = document.getElementById("timeline");
    if (!timelineEl) return;
    timelineEl.innerHTML = ""; 

    let rawData = snapshot.val();

    if (!rawData || typeof rawData !== "object") {
      timelineEl.innerHTML = "<div style='text-align:center; padding: 20px; color:#71767b;'>投稿がまだありません。最初の投稿をしてみよう！</div>";
      return;
    }

    const postsList = Object.keys(rawData).map(key => ({
      id: key,
      ...rawData[key]
    })).sort((a, b) => b.createdAt - a.createdAt);

    let filteredPosts = [];

    if (currentViewMode === "home") {
      // ホーム（一般全体タイムライン、またはチャンネル未指定のもののみ）
      filteredPosts = postsList.filter(p => !p.replyTo && (!p.channelId || p.channelId === "general"));
      const titleEl = document.getElementById("page-title");
      if (titleEl) titleEl.innerText = "ホーム (全体タイムライン)";
      setDisplay("back-to-home-btn", "none");
      setDisplay("global-tweet-box", "flex");
    } else if (currentViewMode === "channel") {
      // 特定のスレッド（チャンネル）宛ての通常投稿のみを表示
      filteredPosts = postsList.filter(p => !p.replyTo && p.channelId === currentChannelId);
      const titleEl = document.getElementById("page-title");
      const activeCh = CHANNELS.find(c => c.id === currentChannelId);
      if (titleEl && activeCh) titleEl.innerText = activeCh.name;
      setDisplay("back-to-home-btn", "none");
      setDisplay("global-tweet-box", "flex");
    } else if (currentViewMode === "replies" && currentThreadPostId) {
      // 返信スレッド表示（親投稿とその返信のみ）
      const parentPost = postsList.find(p => p.id === currentThreadPostId);
      const replies = postsList.filter(p => p.replyTo === currentThreadPostId).reverse(); 
      filteredPosts = parentPost ? [parentPost, ...replies] : replies;

      const titleEl = document.getElementById("page-title");
      if (titleEl) titleEl.innerText = "会話";
      setDisplay("back-to-home-btn", "block");
      setDisplay("global-tweet-box", "none"); 
    }

    filteredPosts.forEach((post, index) => {
      const postId = post.id;
      const dispName = post.isMigrated ? "旧 takei.net のみんな" : post.senderName;
      const loginId = post.isMigrated ? "archive" : post.senderLoginId;

      const likesObj = post.likes || {};
      const likeCount = Object.keys(likesObj).length;
      const hasLiked = likesObj[currentUserData?.uid] === true;
      const likeColor = hasLiked ? "color: #f4212e;" : "";

      const container = document.createElement("div");
      container.className = "thread-line-container";

      const isParentInThread = currentViewMode === "replies" && index === 0 && filteredPosts.length > 1;
      const threadLineHTML = isParentInThread ? `<div class="thread-line"></div>` : "";

      let avatarStyle = "";
      let avatarText = "🧪";
      if (post.senderIcon && post.senderIcon.startsWith("data:image")) {
        avatarStyle = `background-image: url(${post.senderIcon});`;
        avatarText = "";
      } else if (post.senderIcon) {
        avatarText = post.senderIcon;
      }

      let postImageHTML = "";
      if (post.image && post.image.startsWith("data:image")) {
        postImageHTML = `
          <div class="post-attached-image-container" style="margin-top: 8px; border-radius: 8px; overflow: hidden; max-width: 100%;">
            <img src="${post.image}" alt="投稿画像" style="max-width: 100%; max-height: 200px; object-fit: contain; border-radius: 8px; border: 1px solid #2f3336;" />
          </div>
        `;
      }

      let quoteHTML = "";
      if (post.quotedPostId && post.quotedData) {
        quoteHTML = `
          <div class="quoted-container">
            <div class="post-header" style="font-size: 13px;">
              <span class="display-name">${post.quotedData.senderName}</span>
              <span class="user-id">@${post.quotedData.senderLoginId}</span>
            </div>
            <div class="post-content" style="font-size: 13px; color: #536471;">
              ${post.quotedData.content}
            </div>
          </div>
        `;
      }

      container.innerHTML = `
        ${threadLineHTML}
        <div class="post" id="post-${postId}">
          <div class="avatar" style="${avatarStyle}">${avatarText}</div>
          <div class="post-body" id="body-${postId}" style="cursor: pointer;">
            <div class="post-header" style="display: flex; align-items: center; width: 100%;">
              <span class="display-name" style="font-weight: bold; font-size: 15px; margin-right: 4px;">${dispName}</span>
              <span class="user-id">@${loginId}</span>
              <span class="post-time" style="color: #71767b; font-size: 13px; margin-left: auto;">${formatDate(post.createdAt)}</span>
            </div>
            <div class="post-content">${post.content}</div>
            ${postImageHTML}
            ${quoteHTML}
            <div class="post-actions">
              <div class="action-btn" id="reply-btn-${postId}">💬 返信</div>
              <div class="action-btn" style="${likeColor}" id="like-btn-${postId}">
                ❤️ <span id="like-count-${postId}">${likeCount}</span>
              </div>
              <div class="action-btn" id="quote-btn-${postId}">🔁 引用</div>
            </div>
          </div>
        </div>
      `;

      timelineEl.appendChild(container);

      // イベントリスナー登録 (イベントバッティング防止用 e.stopPropagation)
      document.getElementById(`body-${postId}`)?.addEventListener("click", () => {
        viewThread(postId);
      });

      document.getElementById(`like-btn-${postId}`)?.addEventListener("click", (e) => {
        e.stopPropagation(); 
        toggleLike(postId, likesObj);
      });

      document.getElementById(`reply-btn-${postId}`)?.addEventListener("click", (e) => {
        e.stopPropagation(); // タイムラインを開く処理とバッティングするのを防止！
        openReplyModal(postId, post);
      });

      document.getElementById(`quote-btn-${postId}`)?.addEventListener("click", (e) => {
        e.stopPropagation(); 
        setQuoteTarget(post);
      });
    });
  });
}

// --- いいね、返信、引用システム ---
async function toggleLike(postId, currentLikes) {
  if (!currentUserData) return;
  const likeRef = ref(db, `posts/${postId}/likes/${currentUserData.uid}`);
  await set(likeRef, currentLikes[currentUserData.uid] ? null : true);
}

function openReplyModal(postId, post) {
  currentReplyToId = postId;
  const targetEl = document.getElementById("reply-target-post-content");
  if (targetEl) targetEl.innerText = `@${post.senderLoginId}: ${post.content}`;
  setDisplay("reply-modal", "flex");
}

function setQuoteTarget(post) {
  currentQuotedPost = post;
  const preview = document.getElementById("quote-preview");
  const previewContent = document.getElementById("quote-preview-content");
  if (previewContent) {
    previewContent.innerText = `引用元: @${post.senderLoginId} "${post.content.substring(0, 30)}..."`;
  }
  if (preview) preview.style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeQuotePreview() {
  currentQuotedPost = null;
  setDisplay("quote-preview", "none");
}

window.viewThread = function(postId) {
  currentViewMode = "replies";
  currentThreadPostId = postId;
  loadTimeline();
};

// --- ダイレクトメッセージ (DM) システム ---
function switchView(mode) {
  currentViewMode = mode;
  if (mode === "home" || mode === "replies") {
    // アクティブ表示の切り替え
    const homeBtn = document.getElementById("nav-home");
    if (homeBtn) homeBtn.style.background = "#181818";
    const dmBtn = document.getElementById("nav-dm");
    if (dmBtn) dmBtn.style.background = "";

    setDisplay("main-content", "block");
    setDisplay("dm-content", "none");
    renderChannelList(); // チャンネル側のアクティブ背景を外す
    loadTimeline();
  } else if (mode === "dm") {
    // アクティブ表示の切り替え
    const homeBtn = document.getElementById("nav-home");
    if (homeBtn) homeBtn.style.background = "";
    const dmBtn = document.getElementById("nav-dm");
    if (dmBtn) dmBtn.style.background = "#181818";

    setDisplay("main-content", "none");
    setDisplay("dm-content", "flex");
    renderChannelList(); // チャンネル側のアクティブ背景を外す
    loadDmThreads();
  }
}

// ユーザーが関わっているDMスレッドリストを取得
function loadDmThreads() {
  if (!currentUserData) return;
  const dmThreadsRef = ref(db, `users/${currentUserData.uid}/dmThreads`);
  onValue(dmThreadsRef, (snapshot) => {
    const listEl = document.getElementById("dm-thread-list");
    if (!listEl) return;
    listEl.innerHTML = "";

    const threads = snapshot.val();
    if (!threads || typeof threads !== "object") {
      listEl.innerHTML = "<div style='color: #71767b; font-size: 13px; text-align: center; margin-top: 10px;'>スレッドがありません。上の検索からDMを開始してね！</div>";
      return;
    }

    Object.keys(threads).forEach((partnerUid) => {
      const threadInfo = threads[partnerUid];
      const item = document.createElement("div");
      item.className = "dm-thread-item";
      if (partnerUid === currentActiveDmPartnerUid) {
        item.classList.add("active");
      }

      let avatarStyle = "";
      if (threadInfo.photoURL && threadInfo.photoURL.startsWith("data:image")) {
        avatarStyle = `background-image: url(${threadInfo.photoURL});`;
      }

      item.innerHTML = `
        <div class="avatar" style="${avatarStyle}">${threadInfo.photoURL && threadInfo.photoURL.startsWith("data:image") ? "" : (threadInfo.photoURL || "🧪")}</div>
        <div style="flex:1;">
          <div style="font-weight: bold; font-size: 14px; color: white;">${threadInfo.displayName}</div>
          <div style="font-size: 12px; color: #71767b;">@${threadInfo.userLoginId}</div>
        </div>
      `;

      item.addEventListener("click", () => {
        openDmChat(partnerUid, threadInfo);
      });

      listEl.appendChild(item);
    });
  });
}

// チャット画面を開く
function openDmChat(partnerUid, partnerData) {
  currentActiveDmPartnerUid = partnerUid;

  // UI更新
  const headerEl = document.getElementById("dm-chat-header");
  if (headerEl) {
    headerEl.innerHTML = `${partnerData.displayName} (@${partnerData.userLoginId}) とのDM`;
  }
  setDisplay("dm-input-area", "flex");

  // スレッドIDの決定 (UIDをソートして結合し、一意のスレッドを作る)
  const threadId = [currentUserData.uid, partnerUid].sort().join("_");
  const messagesRef = ref(db, `dms/${threadId}`);

  const msgContainer = document.getElementById("dm-messages");
  if (msgContainer) {
    msgContainer.style.display = "flex";
    msgContainer.style.flexDirection = "column";
    msgContainer.style.gap = "10px";
  }

  dmMessagesListener = onValue(messagesRef, (snapshot) => {
    if (!msgContainer) return;
    msgContainer.innerHTML = "";

    const data = snapshot.val();
    if (!data || typeof data !== "object") {
      msgContainer.innerHTML = "<div style='color: #71767b; font-size: 13px; text-align: center; margin-top: 20px;'>メッセージはまだありません。挨拶を送ってみよう！</div>";
      return;
    }

    const msgs = Object.keys(data).map(key => data[key]).sort((a,b) => a.timestamp - b.timestamp);
    msgs.forEach((msg) => {
      const bubble = document.createElement("div");
      const isMe = msg.senderId === currentUserData.uid;

      bubble.className = `dm-bubble ${isMe ? 'sent' : 'received'}`;
      bubble.innerText = msg.text;

      if (isMe) {
        bubble.style.alignSelf = "flex-end";
      } else {
        bubble.style.alignSelf = "flex-start";
      }

      msgContainer.appendChild(bubble);
    });

    // 最新のメッセージまでスクロール
    msgContainer.scrollTop = msgContainer.scrollHeight;
  });
}

// DM開始のためのユーザー検索
async function searchAndStartDm() {
  const searchInput = document.getElementById("dm-search-id");
  if (!searchInput) return;
  const queryId = searchInput.value.trim().toLowerCase().replace("@", "");
  if (!queryId) return alert("検索したいIDを入力してね！");

  if (queryId === currentUserData.userLoginId.toLowerCase()) {
    return alert("自分自身とDMすることはできないよ！");
  }

  const usersRef = ref(db, "users");
  onValue(usersRef, async (snapshot) => {
    const users = snapshot.val();
    if (!users) return alert("ユーザーが見つかりませんでした。");

    let foundUser = null;
    Object.keys(users).forEach((uid) => {
      if (users[uid].userLoginId && users[uid].userLoginId.toLowerCase() === queryId) {
        foundUser = users[uid];
      }
    });

    if (foundUser) {
      const myRef = ref(db, `users/${currentUserData.uid}/dmThreads/${foundUser.uid}`);
      const partnerRef = ref(db, `users/${foundUser.uid}/dmThreads/${currentUserData.uid}`);

      await set(myRef, {
        uid: foundUser.uid,
        displayName: foundUser.displayName,
        userLoginId: foundUser.userLoginId,
        photoURL: foundUser.photoURL
      });

      await set(partnerRef, {
        uid: currentUserData.uid,
        displayName: currentUserData.displayName,
        userLoginId: currentUserData.userLoginId,
        photoURL: currentUserData.photoURL
      });

      searchInput.value = "";
      openDmChat(foundUser.uid, foundUser);
    } else {
      alert(`@${queryId} のユーザーは見つからなかったよ。`);
    }
  }, { onlyOnce: true });
}

// DM送信
async function sendDmMessage() {
  const inputEl = document.getElementById("dm-message-input");
  if (!inputEl || !currentActiveDmPartnerUid || !currentUserData) return;

  const text = inputEl.value.trim();
  if (!text) return;

  const threadId = [currentUserData.uid, currentActiveDmPartnerUid].sort().join("_");
  const newMsgRef = push(ref(db, `dms/${threadId}`));

  await set(newMsgRef, {
    senderId: currentUserData.uid,
    receiverId: currentActiveDmPartnerUid, 
    text: text,
    timestamp: Date.now()
  });

  inputEl.value = "";
}

// --- DOMツリー読み込み完了後の初期化 ---
window.addEventListener("DOMContentLoaded", () => {

  // 1. ユーザー認証状態の監視
  onAuthStateChanged(auth, (user) => {
    if (user) {
      const userRef = ref(db, `users/${user.uid}`);
      onValue(userRef, (snapshot) => {
        const data = snapshot.val();
        if (data && typeof data === "object") {
          showApp(user, data);
        } else {
          const fallbackData = {
            uid: user.uid,
            email: user.email,
            displayName: user.email.split("@")[0],
            userLoginId: "user" + Math.floor(1000 + Math.random() * 9000),
            photoURL: "🧪",
            role: user.email.toLowerCase().trim() === "ryukond2@gmail.com" ? "admin" : "user",
            createdAt: Date.now()
          };
          set(ref(db, `users/${user.uid}`), fallbackData).then(() => {
            showApp(user, fallbackData);
          });
        }
      }, { onlyOnce: true });
    } else {
      showAuth();
    }
  });

  // 2. イベント登録

  // 新規登録 (安全なエラーハンドリング)
  safeAddListener("btn-signup", "click", async () => {
    const name = document.getElementById("signup-name")?.value.trim();
    const romanName = document.getElementById("signup-name-roman")?.value.trim();
    const email = document.getElementById("signup-email")?.value.trim();
    const password = document.getElementById("signup-password")?.value;
    const avatarFile = document.getElementById("signup-avatar-file")?.files[0];

    if (!name || !romanName || !email || !password) {
      alert("すべての項目を入力してね！");
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const generatedId = romanName.toLowerCase().replace(/[^a-z0-9]/g, "") + Math.floor(1000 + Math.random() * 9000);

      let finalPhotoUrl = "🧪"; 
      if (avatarFile) {
        finalPhotoUrl = await compressAndConvertToBase64(avatarFile);
      }

      const userData = {
        uid: user.uid,
        email: email,
        displayName: name,
        userLoginId: generatedId,
        photoURL: finalPhotoUrl,
        role: email.toLowerCase().trim() === "ryukond2@gmail.com" ? "admin" : "user",
        createdAt: Date.now()
      };

      await set(ref(db, `users/${user.uid}`), userData);
      alert(`登録完了！ID: @${generatedId}`);
    } catch (error) {
      const errCode = error && error.code ? error.code : "";
      const friendlyMessage = getFriendlyErrorMessage(errCode);
      alert("登録失敗: " + friendlyMessage);
    }
  });

  // ログイン (安全なエラーハンドリング)
  safeAddListener("btn-login", "click", async () => {
    const email = document.getElementById("login-email")?.value.trim();
    const password = document.getElementById("login-password")?.value;
    if (!email || !password) return alert("入力してね");
    try { 
      await signInWithEmailAndPassword(auth, email, password); 
    } catch (error) { 
      const errCode = error && error.code ? error.code : "";
      const friendlyMessage = getFriendlyErrorMessage(errCode);
      alert("ログイン失敗: " + friendlyMessage); 
    }
  });

  // ログアウト
  safeAddListener("btn-logout", "click", () => { 
    signOut(auth); 
  });

  // タブ切り替え（ホーム / DM）
  safeAddListener("nav-home", "click", () => {
    switchView("home");
  });

  safeAddListener("nav-dm", "click", () => {
    switchView("dm");
  });

  // DM機能ボタン
  safeAddListener("btn-start-dm-search", "click", searchAndStartDm);
  safeAddListener("btn-send-dm", "click", sendDmMessage);

  // DM入力フィールドでのEnterキー送信
  const dmMsgInput = document.getElementById("dm-message-input");
  if (dmMsgInput) {
    dmMsgInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        sendDmMessage();
      }
    });
  }

  // 投稿ボタン
  safeAddListener("submit-post", "click", async () => {
    const input = document.getElementById("post-input");
    const imageInput = document.getElementById("post-image-file");

    if (input && (input.value.trim() !== "" || (imageInput && imageInput.files[0]))) {
      let finalImageUrl = null;

      if (imageInput && imageInput.files[0]) {
        finalImageUrl = await compressAndConvertToBase64(imageInput.files[0]);
      }

      if (currentQuotedPost) {
        await createPost(input.value, null, currentQuotedPost.id, {
          senderName: currentQuotedPost.senderName,
          senderLoginId: currentQuotedPost.senderLoginId,
          content: currentQuotedPost.content
        }, finalImageUrl);
      } else {
        await createPost(input.value, null, null, null, finalImageUrl);
      }

      input.value = "";
      if (imageInput) imageInput.value = "";
    }
  });

  // 引用、返信モーダルなどの閉じるボタン
  safeAddListener("close-quote-preview", "click", closeQuotePreview);
  safeAddListener("close-reply-modal", "click", () => { setDisplay("reply-modal", "none"); });
  safeAddListener("back-to-home-btn", "click", () => {
    // もしスレッド表示から戻るとき、以前見ていたビューがチャンネルならチャンネル表示に戻す
    if (currentChannelId && currentChannelId !== "general") {
      currentViewMode = "channel";
    } else {
      currentViewMode = "home";
    }
    currentThreadPostId = null;
    loadTimeline();
  });

  // 返信送信ボタン
  safeAddListener("submit-reply", "click", async () => {
    const replyInput = document.getElementById("reply-input");
    if (replyInput && replyInput.value.trim() !== "") {
      await createPost(replyInput.value, currentReplyToId);
      replyInput.value = "";
      setDisplay("reply-modal", "none");
    }
  });

  // サインアップ画面とログイン画面の切り替え
  safeAddListener("to-signup", "click", () => {
    setDisplay("login-card", "none");
    setDisplay("signup-card", "block");
  });
  safeAddListener("to-login", "click", () => {
    setDisplay("signup-card", "none");
    setDisplay("login-card", "block");
  });

  // --- プロフィール編集関連のイベント ---
  safeAddListener("current-user-avatar", "click", () => {
    if (!currentUserData) return;
    const nameInput = document.getElementById("edit-display-name");
    if (nameInput) nameInput.value = currentUserData.displayName || "";
    setDisplay("profile-modal", "flex");
  });

  safeAddListener("close-profile-modal", "click", () => {
    setDisplay("profile-modal", "none");
  });

  // プロフィール情報の保存処理
  safeAddListener("btn-save-profile", "click", async () => {
    if (!currentUserData) return;
    const newName = document.getElementById("edit-display-name")?.value.trim();
    const avatarFile = document.getElementById("edit-avatar-file")?.files[0];

    if (!newName) return alert("お名前を入力してね！");

    try {
      let finalPhotoUrl = currentUserData.photoURL || "🧪";
      if (avatarFile) {
        finalPhotoUrl = await compressAndConvertToBase64(avatarFile);
      }

      const updates = {
        [`users/${currentUserData.uid}/displayName`]: newName,
        [`users/${currentUserData.uid}/photoURL`]: finalPhotoUrl
      };

      await update(ref(db), updates);

      currentUserData.displayName = newName;
      currentUserData.photoURL = finalPhotoUrl;

      showApp(auth.currentUser, currentUserData);

      setDisplay("profile-modal", "none");
      alert("プロフィールを更新したよ！");
    } catch (e) {
      alert("更新に失敗しちゃいました: " + e.message);
    }
  });

});
