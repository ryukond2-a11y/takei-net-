// Firebase SDK のインポート
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, collection, addDoc, serverTimestamp, 
  query, orderBy, onSnapshot, updateDoc, doc, arrayUnion, arrayRemove 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// 【takei-netplus 用の設定に書き換えたよ！】
const firebaseConfig = {
  apiKey: "AIzaSyBdT1yWLsKQ8hyktm0TgCtkc3jLKlOVllY",
  authDomain: "takei-netplus.firebaseapp.com",
  projectId: "takei-netplus",
  storageBucket: "takei-netplus.appspot.com", // 通常デフォルトはこの形式です
  messagingSenderId: "180284787102",
  appId: "1:180284787102:web:4c9880b6930f323a94ee8f"
};

// Firebaseの初期化
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- グローバル状態（ログイン中のテストユーザー） ---
let currentUser = {
  uid: "test_user_123",
  displayName: "りゅうしゅん",
  userLoginId: "ryushun5821",
  photoURL: "https://via.placeholder.com/48"
};

// --- 1. 新規投稿の作成 ---
async function createPost(content, replyToId = null, quotedPostId = null, quotedData = null) {
  try {
    const postData = {
      content: content,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      senderId: currentUser.uid,
      senderName: currentUser.displayName,
      senderLoginId: currentUser.userLoginId,
      senderIcon: currentUser.photoURL,
      likes: [], 
      replyTo: replyToId, 
      quotedPostId: quotedPostId, 
      quotedData: quotedData, 
      isMigrated: false
    };

    const docRef = await addDoc(collection(db, "posts"), postData);
    console.log("投稿成功！ ドキュメントID:", docRef.id);
  } catch (error) {
    console.error("投稿エラー:", error);
  }
}

// --- 2. タイムラインのリアルタイム読み込み ＆ 描画 ---
function loadTimeline() {
  const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));

  onSnapshot(q, (snapshot) => {
    const timelineEl = document.getElementById("timeline");
    timelineEl.innerHTML = ""; 

    snapshot.forEach((docSnap) => {
      const post = docSnap.data();
      const postId = docSnap.id;

      const dispName = post.isMigrated ? "旧 takei.net のみんな" : post.senderName;
      const loginId = post.isMigrated ? "archive" : post.senderLoginId;
      const avatarUrl = post.senderIcon || "https://via.placeholder.com/48";

      let postHTML = `
        <div class="post" id="post-${postId}">
          <img src="${avatarUrl}" class="avatar" alt="アバター">
          <div class="post-body">
            <div class="post-header">
              <span class="display-name">${dispName}</span>
              <span class="user-id">@${loginId}</span>
            </div>
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

      const likeCount = post.likes ? post.likes.length : 0;
      const hasLiked = post.likes && post.likes.includes(currentUser.uid);
      const likeColor = hasLiked ? "color: #f4212e;" : ""; 

      postHTML += `
            <div class="post-actions">
              <div class="action-btn" onclick="handleReply('${postId}')">💬 返信</div>
              <div class="action-btn" style="${likeColor}" id="like-btn-${postId}">
                ❤️ <span class="like-count">${likeCount}</span>
              </div>
              <div class="action-btn" onclick="handleQuote('${postId}')">🔁 引用</div>
            </div>
          </div>
        </div>
      `;

      timelineEl.innerHTML += postHTML;

      setTimeout(() => {
        const btn = document.getElementById(`like-btn-${postId}`);
        if (btn) {
          btn.onclick = () => toggleLike(postId, post.likes || []);
        }
      }, 0);
    });
  });
}

// --- 3. いいねのトグル（ON/OFF）処理 ---
async function toggleLike(postId, currentLikes) {
  const postRef = doc(db, "posts", postId);
  if (currentLikes.includes(currentUser.uid)) {
    await updateDoc(postRef, {
      likes: arrayRemove(currentUser.uid)
    });
  } else {
    await updateDoc(postRef, {
      likes: arrayUnion(currentUser.uid)
    });
  }
}

// --- イベント監視 ---
document.getElementById("submit-post").addEventListener("click", () => {
  const input = document.getElementById("post-input");
  if (input.value.trim() !== "") {
    createPost(input.value);
    input.value = "";
  }
});

loadTimeline();
