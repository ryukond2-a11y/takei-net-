import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
// 【Realtime Database用のモジュール（database）をインポートするよ】
import { 
  getDatabase, ref, push, set, onValue, update 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { 
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, 
  onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Firebase Config（URLを追加したよ！）
const firebaseConfig = {
  apiKey: "AIzaSyBdT1yWLsKQ8hyktm0TgCtkc3jLKlOVllY",
  authDomain: "takei-netplus.firebaseapp.com",
  projectId: "takei-netplus",
  databaseURL: "https://takei-netplus-default-rtdb.asia-southeast1.firebasedatabase.app", // ←ここ！
  storageBucket: "takei-netplus.appspot.com",
  messagingSenderId: "180284787102",
  appId: "1:180284787102:web:4c9880b6930f323a94ee8f"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app); // getFirestore から getDatabase に変更！
const auth = getAuth(app);

// ログイン中のユーザー情報を保持するオブジェクト
let currentUserData = null;
let selectedEmoji = "🧪"; // デフォルトアバター

// --- UIの表示切り替え関数 ---
function showApp(user, docData) {
  currentUserData = docData;
  document.getElementById("auth-gateway").style.display = "none";
  document.getElementById("app-container").style.display = "flex";
  document.getElementById("current-user-avatar").innerText = docData.photoURL || "🧪";
  loadTimeline();
}

function showAuth() {
  currentUserData = null;
  document.getElementById("auth-gateway").style.display = "flex";
  document.getElementById("app-container").style.display = "none";
}

// --- ユーザーログイン状態の監視 ---
onAuthStateChanged(auth, (user) => {
  if (user) {
    // ログイン中の場合、Realtime Databaseから追加プロフィール情報を取得
    const userRef = ref(db, `users/${user.uid}`);
    onValue(userRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        showApp(user, data);
      } else {
        showAuth();
      }
    }, {
      onlyOnce: true // 1回だけ取得
    });
  } else {
    showAuth();
  }
});

// --- アバター（絵文字）選択ロジック ---
document.querySelectorAll(".avatar-option").forEach(opt => {
  opt.addEventListener("click", (e) => {
    document.querySelectorAll(".avatar-option").forEach(o => o.classList.remove("selected"));
    e.target.classList.add("selected");
    selectedEmoji = e.target.getAttribute("data-emoji");
  });
});

// --- アカウントIDの自動生成（名前のローマ字 ＋ 4桁ランダム数字） ---
function generateUserId(romanName) {
  const cleanName = romanName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const randomNumber = Math.floor(1000 + Math.random() * 9000);
  return `${cleanName}${randomNumber}`;
}

// --- 新規登録処理 ---
document.getElementById("btn-signup").addEventListener("click", async () => {
  const name = document.getElementById("signup-name").value.trim();
  const romanName = document.getElementById("signup-name-roman").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;

  if (!name || !romanName || !email || !password) {
    alert("すべての項目を入力してね！");
    return;
  }

  try {
    // 1. Firebase Authでアカウント作成
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 2. IDを自動生成
    const generatedId = generateUserId(romanName);

    // 3. Realtime Databaseの "users" パスにプロフィールデータを保存
    const userData = {
      uid: user.uid,
      email: email,
      displayName: name,
      userLoginId: generatedId,
      photoURL: selectedEmoji,
      role: "user",
      createdAt: Date.now() // Firebaseのサーバータイムスタンプの代わりにミリ秒を使用
    };

    await set(ref(db, `users/${user.uid}`), userData);
    alert(`登録完了！君のIDは @${generatedId} に決定したよ！`);
  } catch (error) {
    console.error("登録エラー:", error);
    alert("登録に失敗しちゃった: " + error.message);
  }
});

// --- ログイン処理 ---
document.getElementById("btn-login").addEventListener("click", async () => {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  if (!email || !password) {
    alert("メールアドレスとパスワードを入力してね！");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    console.error("ログインエラー:", error);
    alert("ログインに失敗したよ。パスワードが違うかも？");
  }
});

// --- ログアウト処理 ---
document.getElementById("btn-logout").addEventListener("click", () => {
  signOut(auth);
});

// --- 新規投稿の作成 ---
async function createPost(content) {
  if (!currentUserData) return;
  try {
    const postsRef = ref(db, "posts");
    const newPostRef = push(postsRef); // 自動でユニークなキーを生成
    await set(newPostRef, {
      content: content,
      createdAt: Date.now(),
      senderId: currentUserData.uid,
      senderName: currentUserData.displayName,
      senderLoginId: currentUserData.userLoginId,
      senderIcon: currentUserData.photoURL,
      likes: {}, // RTDBではオブジェクトで管理するのが楽
      replyTo: null,
      quotedPostId: null,
      quotedData: null,
      isMigrated: false
    });
  } catch (error) {
    console.error("投稿エラー:", error);
  }
}

// --- タイムライン読み込み ---
function loadTimeline() {
  const postsRef = ref(db, "posts");

  onValue(postsRef, (snapshot) => {
    const timelineEl = document.getElementById("timeline");
    timelineEl.innerHTML = "";

    const postsData = snapshot.val();
    if (!postsData) return;

    // キーと値のペアを配列にして、作成日時（createdAt）の降順（新しい順）で並び替える
    const postsList = Object.keys(postsData).map(key => ({
      id: key,
      ...postsData[key]
    })).sort((a, b) => b.createdAt - a.createdAt);

    postsList.forEach((post) => {
      const postId = post.id;
      const dispName = post.isMigrated ? "旧 takei.net のみんな" : post.senderName;
      const loginId = post.isMigrated ? "archive" : post.senderLoginId;
      const avatarIcon = post.senderIcon || "🧪";

      // いいね件数の計算（オブジェクトのキー数をカウント）
      const likesObj = post.likes || {};
      const likeCount = Object.keys(likesObj).length;
      const hasLiked = likesObj[currentUserData.uid] === true;
      const likeColor = hasLiked ? "color: #f4212e;" : "";

      let postHTML = `
        <div class="post" id="post-${postId}">
          <div class="avatar">${avatarIcon}</div>
          <div class="post-body">
            <div class="post-header">
              <span class="display-name">${dispName}</span>
              <span class="user-id">@${loginId}</span>
            </div>
            <div class="post-content">${post.content}</div>
            <div class="post-actions">
              <div class="action-btn" style="${likeColor}" id="like-btn-${postId}">
                ❤️ <span>${likeCount}</span>
              </div>
            </div>
          </div>
        </div>
      `;

      timelineEl.innerHTML += postHTML;

      // いいね処理の登録
      setTimeout(() => {
        const btn = document.getElementById(`like-btn-${postId}`);
        if (btn) {
          btn.onclick = () => toggleLike(postId, likesObj);
        }
      }, 0);
    });
  });
}

// --- いいねの切り替え ---
async function toggleLike(postId, currentLikes) {
  if (!currentUserData) return;
  const likeRef = ref(db, `posts/${postId}/likes/${currentUserData.uid}`);
  
  if (currentLikes[currentUserData.uid]) {
    // すでにいいねしてたら消す（nullを設定）
    await set(likeRef, null);
  } else {
    // いいねしてなければtrueを書き込む
    await set(likeRef, true);
  }
}

// 投稿ボタンクリック
document.getElementById("submit-post").addEventListener("click", () => {
  const input = document.getElementById("post-input");
  if (input.value.trim() !== "") {
    createPost(input.value);
    input.value = "";
  }
});

// ログイン・新規登録フォームの切り替え
document.getElementById("to-signup").onclick = () => {
  document.getElementById("login-card").style.display = "none";
  document.getElementById("signup-card").style.display = "block";
};
document.getElementById("to-login").onclick = () => {
  document.getElementById("signup-card").style.display = "none";
  document.getElementById("login-card").style.display = "block";
};
