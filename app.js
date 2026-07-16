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
let currentViewMode = "home"; 
let currentThreadPostId = null; 

// --- 【追加】ミリ秒を「MM/DD HH:MM」の読みやすい形式に変換する関数 ---
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

// --- UI表示切り替え ---
function showApp(user, docData) {
  currentUserData = docData;
  document.getElementById("auth-gateway").style.display = "none";
  document.getElementById("app-container").style.display = "flex";
  
  // アバター表示
  const avatarEl = document.getElementById("current-user-avatar");
  if (docData.photoURL && docData.photoURL.startsWith("data:image")) {
    avatarEl.innerText = "";
    avatarEl.style.backgroundImage = `url(${docData.photoURL})`;
  } else {
    avatarEl.innerText = docData.photoURL || "🧪";
    avatarEl.style.backgroundImage = "none";
  }

  // 管理者権限（君のメインアドレスに設定したよ！）
  const normalizedEmail = (docData.email || "").toLowerCase().trim();
  if (docData.role === "admin" || normalizedEmail === "ryukond2@gmail.com") {
    document.getElementById("nav-admin").style.display = "flex";
  } else {
    document.getElementById("nav-admin").style.display = "none";
  }

  loadTimeline();
}

function showAuth() {
  currentUserData = null;
  document.getElementById("auth-gateway").style.display = "flex";
  document.getElementById("app-container").style.display = "none";
}

// --- ユーザー認証状態の監視 ---
onAuthStateChanged(auth, (user) => {
  if (user) {
    const userRef = ref(db, `users/${user.uid}`);
    onValue(userRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        showApp(user, data);
      } else {
        // もしAuthにはいるけどDBにユーザーデータがない場合
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
document.getElementById("btn-signup").addEventListener("click", async () => {
  const name = document.getElementById("signup-name").value.trim();
  const romanName = document.getElementById("signup-name-roman").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const avatarFile = document.getElementById("signup-avatar-file").files[0];

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

// --- ログイン・ログアウト ---
document.getElementById("btn-login").addEventListener("click", async () => {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  if (!email || !password) return alert("入力してね");
  try { await signInWithEmailAndPassword(auth, email, password); } catch (e) { alert(e.message); }
});

document.getElementById("btn-logout").addEventListener("click", () => { signOut(auth); });

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

// --- タイムライン描画 ---
function loadTimeline() {
  const postsRef = ref(db, "posts");

  onValue(postsRef, (snapshot) => {
    if (currentViewMode === "admin") return; 

    const timelineEl = document.getElementById("timeline");
    timelineEl.innerHTML = "";
    const postsData = snapshot.val() || {};

    const postsList = Object.keys(postsData).map(key => ({
      id: key,
      ...postsData[key]
    })).sort((a, b) => b.createdAt - a.createdAt);

    let filteredPosts = postsList;
    if (currentViewMode === "home") {
      filteredPosts = postsList.filter(p => !p.replyTo);
      document.getElementById("page-title").innerText = "ホーム";
      document.getElementById("back-to-home-btn").style.display = "none";
      document.getElementById("global-tweet-box").style.display = "flex";
    } else if (currentViewMode === "replies" && currentThreadPostId) {
      const parentPost = postsList.find(p => p.id === currentThreadPostId);
      const replies = postsList.filter(p => p.replyTo === currentThreadPostId).reverse(); 
      filteredPosts = parentPost ? [parentPost, ...replies] : replies;
      
      document.getElementById("page-title").innerText = "会話";
      document.getElementById("back-to-home-btn").style.display = "block";
      document.getElementById("global-tweet-box").style.display = "none"; 
    }

    filteredPosts.forEach((post, index) => {
      const postId = post.id;
      const dispName = post.isMigrated ? "旧 takei.net のみんな" : post.senderName;
      const loginId = post.isMigrated ? "archive" : post.senderLoginId;

      const likesObj = post.likes || {};
      const likeCount = Object.keys(likesObj).length;
      const hasLiked = likesObj[currentUserData.uid] === true;
      const likeColor = hasLiked ? "color: #f4212e;" : "";

      // 時間表示を取得
      const timeHTML = `<span class="post-time" style="color: #71767b; font-size: 13px; margin-left: auto;">${formatDate(post.createdAt)}</span>`;

      // アバター画像の決定
      let avatarHTML = `<div class="avatar">🧪</div>`;
      if (post.senderIcon && post.senderIcon.startsWith("data:image")) {
        avatarHTML = `<div class="avatar" style="background-image: url(${post.senderIcon})"></div>`;
      } else if (post.senderIcon) {
        avatarHTML = `<div class="avatar">${post.senderIcon}</div>`;
      }

      const isParentInThread = currentViewMode === "replies" && index === 0 && filteredPosts.length > 1;
      const threadLineHTML = isParentInThread ? `<div class="thread-line"></div>` : "";

      let postHTML = `
        <div class="thread-line-container">
          ${threadLineHTML}
          <div class="post" id="post-${postId}">
            ${avatarHTML}
            <div class="post-body" onclick="viewThread('${postId}')" style="cursor: pointer;">
              <div class="post-header" style="display: flex; align-items: center; width: 100%;">
                <span class="display-name" style="font-weight: bold; font-size: 15px; margin-right: 4px;">${dispName}</span>
                <span class="user-id">@${loginId}</span>
                ${timeHTML} </div>
              <div class="post-content">${post.content}</div>
      `;

      if (post.quotedPostId && post.quotedData) {
        postHTML += `
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

      postHTML += `
              <div class="post-actions" onclick="event.stopPropagation();">
                <div class="action-btn" id="reply-btn-${postId}">💬 返信</div>
                <div class="action-btn" style="${likeColor}" id="like-btn-${postId}">
                  ❤️ <span>${likeCount}</span>
                </div>
                <div class="action-btn" id="quote-btn-${postId}">🔁 引用</div>
              </div>
            </div>
          </div>
        </div>
      `;

      timelineEl.innerHTML += postHTML;

      setTimeout(() => {
        const likeBtn = document.getElementById(`like-btn-${postId}`);
        if (likeBtn) likeBtn.onclick = () => toggleLike(postId, likesObj);

        const replyBtn = document.getElementById(`reply-btn-${postId}`);
        if (replyBtn) replyBtn.onclick = () => openReplyModal(postId, post);

        const quoteBtn = document.getElementById(`quote-btn-${postId}`);
        if (quoteBtn) quoteBtn.onclick = () => setQuoteTarget(post);
      }, 0);
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
  document.getElementById("reply-target-post-content").innerText = `@${post.senderLoginId}: ${post.content}`;
  document.getElementById("reply-modal").style.display = "flex";
}

document.getElementById("close-reply-modal").onclick = () => {
  document.getElementById("reply-modal").style.display = "none";
};

document.getElementById("submit-reply").onclick = () => {
  const replyInput = document.getElementById("reply-input");
  if (replyInput.value.trim() !== "") {
    createPost(replyInput.value, currentReplyToId);
    replyInput.value = "";
    document.getElementById("reply-modal").style.display = "none";
  }
};

function setQuoteTarget(post) {
  currentQuotedPost = post;
  const preview = document.getElementById("quote-preview");
  const previewContent = document.getElementById("quote-preview-content");
  previewContent.innerText = `引用元: @${post.senderLoginId} "${post.content.substring(0, 30)}..."`;
  preview.style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeQuotePreview() {
  currentQuotedPost = null;
  document.getElementById("quote-preview").style.display = "none";
}
document.getElementById("close-quote-preview").onclick = closeQuotePreview;

window.viewThread = function(postId) {
  currentViewMode = "replies";
  currentThreadPostId = postId;
  loadTimeline();
};

document.getElementById("back-to-home-btn").onclick = () => {
  currentViewMode = "home";
  currentThreadPostId = null;
  loadTimeline();
};

// --- 管理者パネル ---
document.getElementById("nav-admin").onclick = () => {
  currentViewMode = "admin";
  document.getElementById("main-content").style.display = "none";
  document.getElementById("admin-panel").style.display = "flex";
  loadAdminUsers();
};

document.getElementById("nav-home").onclick = () => {
  currentViewMode = "home";
  document.getElementById("main-content").style.display = "block";
  document.getElementById("admin-panel").style.display = "none";
  loadTimeline();
};

function loadAdminUsers() {
  const usersRef = ref(db, "users");
  onValue(usersRef, (snapshot) => {
    const usersContainer = document.getElementById("admin-user-list");
    usersContainer.innerHTML = "";
    const users = snapshot.val() || {};

    Object.keys(users).forEach(uid => {
      const user = users[uid];
      const row = document.createElement("div");
      row.className = "admin-user-row";
      row.innerHTML = `
        <div>
          <strong>${user.displayName}</strong> (@${user.userLoginId}) - ${user.email} 
          <span style="color: #f4212e; font-weight: bold;">[${user.role || "user"}]</span>
        </div>
        <div>
          ${user.uid !== auth.currentUser.uid ? `<button class="danger-btn" onclick="deleteUserAccount('${uid}')">強制BAN</button>` : "（あなた）"}
        </div>
      `;
      usersContainer.appendChild(row);
    });
  });
}

window.deleteUserAccount = async function(uid) {
  if (confirm("本当にこのアカウントを強制BANしますか？")) {
    await remove(ref(db, `users/${uid}`));
    alert("削除完了しました。");
  }
};

// 投稿するボタン
document.getElementById("submit-post").addEventListener("click", () => {
  const input = document.getElementById("post-input");
  if (input.value.trim() !== "") {
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

document.getElementById("to-signup").onclick = () => {
  document.getElementById("login-card").style.display = "none";
  document.getElementById("signup-card").style.display = "block";
};
document.getElementById("to-login").onclick = () => {
  document.getElementById("signup-card").style.display = "none";
  document.getElementById("login-card").style.display = "block";
};
