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
let currentViewMode = "home"; // "home", "replies", "dm"
let currentThreadPostId = null; 
let currentActiveDmRoomId = null; 

// --- ミリ秒を「MM/DD HH:MM」に変換する関数 ---
function formatDate(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes}`;
}

// --- 画像圧縮 ＆ Base64テキスト変換 ---
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

// 【超重要】要素が存在するときだけ style.display を変更する安全関数
function setDisplay(id, displayStyle) {
  const el = document.getElementById(id);
  if (el) {
    el.style.display = displayStyle;
  }
}

// --- UI表示切り替え ---
function showApp(user, docData) {
  currentUserData = docData;
  
  // 安全に画面表示を切り替え
  setDisplay("auth-gateway", "none");
  setDisplay("app-container", "flex");
  
  // アバター表示（要素がある場合のみ実行）
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

  // 管理者権限チェック（要素がある場合のみ）
  const normalizedEmail = (docData.email || "").toLowerCase().trim();
  if (docData.role === "admin" || normalizedEmail === "ryukond2@gmail.com") {
    setDisplay("nav-admin", "flex");
  } else {
    setDisplay("nav-admin", "none");
  }

  if (currentViewMode === "dm") {
    switchToDmView();
  } else {
    loadTimeline();
  }
}

function showAuth() {
  currentUserData = null;
  setDisplay("auth-gateway", "flex");
  setDisplay("app-container", "none");
}

// --- ユーザー認証状態の監視 ---
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

// --- 新規登録 ---
const btnSignup = document.getElementById("btn-signup");
if (btnSignup) {
  btnSignup.addEventListener("click", async () => {
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
      alert(`登録完了！君のIDは @${generatedId} に決定したよ！`);
    } catch (error) {
      console.error("登録エラー:", error);
      alert("登録に失敗しちゃった: " + error.message);
    }
  });
}

// --- ログイン・ログアウト ---
const btnLogin = document.getElementById("btn-login");
if (btnLogin) {
  btnLogin.addEventListener("click", async () => {
    const email = document.getElementById("login-email")?.value.trim();
    const password = document.getElementById("login-password")?.value;
    if (!email || !password) return alert("入力してね");
    try { await signInWithEmailAndPassword(auth, email, password); } catch (e) { alert(e.message); }
  });
}

const btnLogout = document.getElementById("btn-logout");
if (btnLogout) {
  btnLogout.addEventListener("click", () => { signOut(auth); });
}

// --- 新規投稿の作成 ---
async function createPost(content, replyToId = null, quotedPostId = null, quotedData = null) {
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
      isMigrated: false
    });
    
    closeQuotePreview();
  } catch (error) {
    console.error("投稿エラー:", error);
  }
}

// --- プロフィールモーダルを開く関数 ---
function openProfileModal(uid) {
  const userRef = ref(db, `users/${uid}`);
  onValue(userRef, (snapshot) => {
    const userData = snapshot.val();
    if (!userData) return;

    const modalName = document.getElementById("profile-modal-name");
    const modalId = document.getElementById("profile-modal-id");
    const modalAvatar = document.getElementById("profile-modal-avatar");
    const dmBtn = document.getElementById("profile-modal-dm-btn");

    if (modalName) modalName.innerText = userData.displayName;
    if (modalId) modalId.innerText = `@${userData.userLoginId}`;
    
    if (modalAvatar) {
      if (userData.photoURL && userData.photoURL.startsWith("data:image")) {
        modalAvatar.innerText = "";
        modalAvatar.style.backgroundImage = `url(${userData.photoURL})`;
      } else {
        modalAvatar.innerText = userData.photoURL || "🧪";
        modalAvatar.style.backgroundImage = "none";
      }
    }

    if (dmBtn) {
      if (uid === currentUserData.uid) {
        dmBtn.style.display = "none";
      } else {
        dmBtn.style.display = "block";
        dmBtn.onclick = () => {
          setDisplay("profile-modal", "none");
          startDmWithUser(userData);
        };
      }
    }

    setDisplay("profile-modal", "flex");
  }, { onlyOnce: true });
}

const closeProfileModalBtn = document.getElementById("close-profile-modal");
if (closeProfileModalBtn) {
  closeProfileModalBtn.onclick = () => { setDisplay("profile-modal", "none"); };
}

// --- タイムライン描画 ---
function loadTimeline() {
  const postsRef = ref(db, "posts");

  onValue(postsRef, (snapshot) => {
    if (currentViewMode === "dm") return; 

    const timelineEl = document.getElementById("timeline");
    if (!timelineEl) return;
    timelineEl.innerHTML = ""; 
    
    const rawData = snapshot.val();
    if (!rawData || typeof rawData !== "object") {
      timelineEl.innerHTML = "<div style='text-align:center; padding: 20px; color:#71767b;'>投稿がまだありません。最初の投稿をしてみよう！</div>";
      return;
    }

    const postsList = Object.keys(rawData).map(key => ({
      id: key,
      ...rawData[key]
    })).sort((a, b) => b.createdAt - a.createdAt);

    let filteredPosts = postsList;
    if (currentViewMode === "home") {
      filteredPosts = postsList.filter(p => !p.replyTo);
      const titleEl = document.getElementById("page-title");
      if (titleEl) titleEl.innerText = "ホーム";
      setDisplay("back-to-home-btn", "none");
      setDisplay("global-tweet-box", "flex");
    } else if (currentViewMode === "replies" && currentThreadPostId) {
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
          <div class="avatar" id="avatar-click-${postId}" style="${avatarStyle} cursor: pointer;">${avatarText}</div>
          <div class="post-body" id="body-${postId}" style="cursor: pointer;">
            <div class="post-header" style="display: flex; align-items: center; width: 100%;">
              <span class="display-name" id="name-click-${postId}" style="font-weight: bold; font-size: 15px; margin-right: 4px; cursor: pointer;">${dispName}</span>
              <span class="user-id">@${loginId}</span>
              <span class="post-time" style="color: #71767b; font-size: 13px; margin-left: auto;">${formatDate(post.createdAt)}</span>
            </div>
            <div class="post-content">${post.content}</div>
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

      // プロフィール画面ポップアップイベント登録
      if (!post.isMigrated && post.senderId) {
        document.getElementById(`avatar-click-${postId}`)?.addEventListener("click", (e) => {
          e.stopPropagation();
          openProfileModal(post.senderId);
        });
        document.getElementById(`name-click-${postId}`)?.addEventListener("click", (e) => {
          e.stopPropagation();
          openProfileModal(post.senderId);
        });
      }

      // 各種イベント
      document.getElementById(`body-${postId}`)?.addEventListener("click", () => {
        viewThread(postId);
      });

      document.getElementById(`like-btn-${postId}`)?.addEventListener("click", (e) => {
        e.stopPropagation(); 
        toggleLike(postId, likesObj);
      });

      document.getElementById(`reply-btn-${postId}`)?.addEventListener("click", (e) => {
        e.stopPropagation(); 
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

// 【安全対策】要素の存在チェックを挟んでからイベント登録（onclickの代入エラーを防ぐ）
const closeReplyBtn = document.getElementById("close-reply-modal");
if (closeReplyBtn) {
  closeReplyBtn.onclick = () => { setDisplay("reply-modal", "none"); };
}

const submitReplyBtn = document.getElementById("submit-reply");
if (submitReplyBtn) {
  submitReplyBtn.onclick = () => {
    const replyInput = document.getElementById("reply-input");
    if (replyInput && replyInput.value.trim() !== "") {
      createPost(replyInput.value, currentReplyToId);
      replyInput.value = "";
      setDisplay("reply-modal", "none");
    }
  };
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

// 【安全対策】
const closeQuoteBtn = document.getElementById("close-quote-preview");
if (closeQuoteBtn) {
  closeQuoteBtn.onclick = closeQuotePreview;
}

window.viewThread = function(postId) {
  currentViewMode = "replies";
  currentThreadPostId = postId;
  loadTimeline();
};

const backToHomeBtn = document.getElementById("back-to-home-btn");
if (backToHomeBtn) {
  backToHomeBtn.onclick = () => {
    currentViewMode = "home";
    currentThreadPostId = null;
    loadTimeline();
  };
}

// --- ダイレクトメッセージ (DM) システム ---
function switchToDmView() {
  currentViewMode = "dm";
  setDisplay("main-content", "none");
  setDisplay("dm-content", "flex");
  loadDmThreads();
}

const navDm = document.getElementById("nav-dm");
if (navDm) {
  navDm.onclick = () => {
    switchToDmView();
  };
}

const navHome = document.getElementById("nav-home");
if (navHome) {
  navHome.onclick = () => {
    currentViewMode = "home";
    setDisplay("main-content", "block");
    setDisplay("dm-content", "none");
    loadTimeline();
  };
}

// ユーザーIDからDMを開始
const btnStartDmSearch = document.getElementById("btn-start-dm-search");
if (btnStartDmSearch) {
  btnStartDmSearch.addEventListener("click", () => {
    const searchIdInput = document.getElementById("dm-search-id");
    if (!searchIdInput) return;
    const searchId = searchIdInput.value.trim().toLowerCase().replace("@", "");
    if (!searchId) return alert("ユーザーIDを入力してね");

    const usersRef = ref(db, "users");
    onValue(usersRef, (snapshot) => {
      const users = snapshot.val() || {};
      const foundUser = Object.values(users).find(u => (u.userLoginId || "").toLowerCase() === searchId);

      if (foundUser) {
        startDmWithUser(foundUser);
        searchIdInput.value = "";
      } else {
        alert(`@${searchId} というユーザーIDは見つかりませんでした。`);
      }
    }, { onlyOnce: true });
  });
}

// チャットルーム開始処理
function startDmWithUser(targetUser) {
  if (targetUser.uid === currentUserData.uid) return alert("自分自身とはDMできません");

  const roomIds = [currentUserData.uid, targetUser.uid].sort();
  const roomId = `${roomIds[0]}_${roomIds[1]}`;

  currentActiveDmRoomId = roomId;
  switchToDmView();
  
  const threadRef = ref(db, `dm_threads/${roomId}`);
  set(threadRef, {
    roomId: roomId,
    user1: roomIds[0],
    user2: roomIds[1],
    lastActive: Date.now()
  });

  loadDmChat(roomId, targetUser);
}

// DMスレッド一覧
function loadDmThreads() {
  const threadsRef = ref(db, "dm_threads");
  onValue(threadsRef, (snapshot) => {
    const threadListEl = document.getElementById("dm-thread-list");
    if (!threadListEl) return;
    threadListEl.innerHTML = "";

    const threads = snapshot.val() || {};
    const myThreads = Object.values(threads).filter(t => t.user1 === currentUserData.uid || t.user2 === currentUserData.uid);

    if (myThreads.length === 0) {
      threadListEl.innerHTML = "<div style='color:#71767b; font-size: 13px; text-align:center; padding:15px;'>スレッドはありません</div>";
      return;
    }

    myThreads.forEach(thread => {
      const partnerUid = thread.user1 === currentUserData.uid ? thread.user2 : thread.user1;
      
      const userRef = ref(db, `users/${partnerUid}`);
      onValue(userRef, (userSnap) => {
        const partnerData = userSnap.val();
        if (!partnerData) return;

        const row = document.createElement("div");
        row.style.cssText = "display:flex; align-items:center; gap:10px; padding:10px; cursor:pointer; border-radius:8px; border-bottom:1px solid #2f3336;";
        if (currentActiveDmRoomId === thread.roomId) {
          row.style.background = "#2f3336";
        }

        let partnerAvatar = "🧪";
        let avatarStyle = "";
        if (partnerData.photoURL && partnerData.photoURL.startsWith("data:image")) {
          avatarStyle = `background-image: url(${partnerData.photoURL}); background-size: cover; background-position: center;`;
          partnerAvatar = "";
        } else if (partnerData.photoURL) {
          partnerAvatar = partnerData.photoURL;
        }

        row.innerHTML = `
          <div style="width:40px; height:40px; border-radius:50%; background-color:#15181c; display:flex; align-items:center; justify-content:center; font-size:18px; ${avatarStyle}">${partnerAvatar}</div>
          <div>
            <div style="font-weight:bold; font-size:14px; color:white;">${partnerData.displayName}</div>
            <div style="font-size:12px; color:#71767b;">@${partnerData.userLoginId}</div>
          </div>
        `;

        row.onclick = () => {
          currentActiveDmRoomId = thread.roomId;
          loadDmThreads(); 
          loadDmChat(thread.roomId, partnerData);
        };

        threadListEl.appendChild(row);
      }, { onlyOnce: true });
    });
  });
}

// チャットルーム表示
function loadDmChat(roomId, partnerData) {
  const headerEl = document.getElementById("dm-chat-header");
  if (headerEl) headerEl.innerText = `${partnerData.displayName} (@${partnerData.userLoginId}) へのメッセージ`;

  setDisplay("dm-input-area", "flex");

  const messagesRef = ref(db, `dm_messages/${roomId}`);
  onValue(messagesRef, (snapshot) => {
    const messagesEl = document.getElementById("dm-messages");
    if (!messagesEl) return;
    messagesEl.innerHTML = "";

    const data = snapshot.val() || {};
    const sortedMessages = Object.values(data).sort((a, b) => a.createdAt - b.createdAt);

    sortedMessages.forEach(msg => {
      const isMe = msg.senderId === currentUserData.uid;
      const bubble = document.createElement("div");
      bubble.style.cssText = `max-width: 60%; padding: 10px 15px; border-radius: 18px; line-height: 1.4; word-break: break-word; font-size: 14px; margin-bottom: 5px;`;
      
      if (isMe) {
        bubble.style.background = "#1d9bf0";
        bubble.style.color = "white";
        bubble.style.alignSelf = "flex-end";
        bubble.style.borderRadius = "18px 18px 0 18px";
      } else {
        bubble.style.background = "#2f3336";
        bubble.style.color = "white";
        bubble.style.alignSelf = "flex-start";
        bubble.style.borderRadius = "18px 18px 18px 0";
      }

      bubble.innerText = msg.content;

      const timeSpan = document.createElement("span");
      timeSpan.style.cssText = "font-size: 10px; color:#71767b; margin-top: 2px;";
      timeSpan.style.alignSelf = isMe ? "flex-end" : "flex-start";
      timeSpan.innerText = formatDate(msg.createdAt);

      messagesEl.appendChild(bubble);
      messagesEl.appendChild(timeSpan);
    });

    messagesEl.scrollTop = messagesEl.scrollHeight;
  });

  const sendBtn = document.getElementById("btn-send-dm");
  if (sendBtn) {
    sendBtn.onclick = () => {
      sendDmMessage(roomId);
    };
  }

  const inputEl = document.getElementById("dm-message-input");
  if (inputEl) {
    inputEl.onkeydown = (e) => {
      if (e.key === "Enter") {
        sendDmMessage(roomId);
      }
    };
  }
}

// メッセージ書き込み
async function sendDmMessage(roomId) {
  const inputEl = document.getElementById("dm-message-input");
  if (!inputEl || inputEl.value.trim() === "") return;

  const content = inputEl.value.trim();
  inputEl.value = "";

  const messagesRef = ref(db, `dm_messages/${roomId}`);
  const newMsgRef = push(messagesRef);
  const now = Date.now();

  await set(newMsgRef, {
    senderId: currentUserData.uid,
    content: content,
    createdAt: now
  });

  await update(ref(db, `dm_threads/${roomId}`), {
    lastActive: now
  });
}

// 投稿するボタン
const submitPostBtn = document.getElementById("submit-post");
if (submitPostBtn) {
  submitPostBtn.addEventListener("click", () => {
    const input = document.getElementById("post-input");
    if (input && input.value.trim() !== "") {
      if (currentQuotedPost) {
        createPost(input.value, null, currentQuotedPost.id, {
          senderName: currentQuotedPost.senderName,
          senderLoginId: currentQuotedPost.senderLoginId,
          content: currentQuotedPost.content
        });
      } else {
        createPost(input.value);
      }
      input.value = "";
    }
  });
}

// 登録・ログイン表示切替
const toSignup = document.getElementById("to-signup");
if (toSignup) {
  toSignup.onclick = () => {
    setDisplay("login-card", "none");
    setDisplay("signup-card", "block");
  };
}

const toLogin = document.getElementById("to-login");
if (toLogin) {
  toLogin.onclick = () => {
    setDisplay("signup-card", "none");
    setDisplay("login-card", "block");
  };
}
