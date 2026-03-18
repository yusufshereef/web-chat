const firebaseConfig = {
  apiKey: "AIzaSyCCebvEorqcv1h_6e-tJQlo4MPG9WXiIf0",
  authDomain: "web-chat-93bab.firebaseapp.com",
  projectId: "web-chat-93bab",
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const userLabel = document.getElementById("userLabel");
const chat = document.getElementById("chat");
const composerForm = document.getElementById("composerForm");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const messageCount = document.getElementById("messageCount");
const searchInput = document.getElementById("searchInput");
const charCount = document.getElementById("charCount");
const themeToggle = document.getElementById("themeToggle");
const manageUsersBtn = document.getElementById("manageUsersBtn");
const clearAllBtn = document.getElementById("clearAllBtn");
const changeUserBtn = document.getElementById("changeUserBtn");

const usersModal = document.getElementById("usersModal");
const usersInfo = document.getElementById("usersInfo");
const usersList = document.getElementById("usersList");
const refreshUsersBtn = document.getElementById("refreshUsersBtn");
const closeUsersModalBtn = document.getElementById("closeUsersModalBtn");

const authModal = document.getElementById("authModal");
const authUsername = document.getElementById("authUsername");
const authPassword = document.getElementById("authPassword");
const authError = document.getElementById("authError");
const signInBtn = document.getElementById("signInBtn");
const createAccountBtn = document.getElementById("createAccountBtn");

let allMessages = [];
let currentUser = null;
let isComposerEnabled = false;
let isSending = false;
let isAuthBusy = false;
let isUsersBusy = false;

const usernamePattern = /^[a-zA-Z0-9_]{3,30}$/;
const minPasswordLength = 4;

function isAdminCredentials(userId, password) {
  return userId === "admin" && password === "6969";
}

function normalizeUsername(username) {
  return username.trim().toLowerCase();
}

function setComposerEnabled(enabled) {
  isComposerEnabled = enabled;
  msgInput.disabled = !enabled;
  sendBtn.disabled = !enabled || isSending;
  msgInput.placeholder = enabled
    ? "Type message..."
    : "Sign in to send messages";
}

function setCurrentUser(user) {
  currentUser = user;
  userLabel.textContent = user
    ? user.name + (user.isAdmin ? " (Admin)" : "")
    : "Guest";
  changeUserBtn.title = user
    ? "Signed in as " + user.name + ". Click to switch user."
    : "Not signed in";

  const canClearAll = Boolean(user && user.isAdmin);
  const canManageUsers = Boolean(user);

  manageUsersBtn.classList.toggle("hidden-control", !canManageUsers);
  manageUsersBtn.disabled = !canManageUsers;

  clearAllBtn.classList.toggle("hidden-control", !canClearAll);
  clearAllBtn.disabled = !canClearAll;
}

function openAuthModal() {
  authModal.classList.remove("hidden");
  authError.textContent = "";
  authPassword.value = "";
  authUsername.focus();
}

function closeAuthModal() {
  authModal.classList.add("hidden");
  authError.textContent = "";
}

function openUsersModal() {
  if (!currentUser) {
    alert("Please sign in to view registered users.");
    return;
  }

  usersModal.classList.remove("hidden");
  loadRegisteredUsers();
}

function closeUsersModal() {
  usersModal.classList.add("hidden");
}

function setAuthBusy(isBusy) {
  isAuthBusy = isBusy;
  authUsername.disabled = isBusy;
  authPassword.disabled = isBusy;
  signInBtn.disabled = isBusy;
  createAccountBtn.disabled = isBusy;
}

function showAuthError(message) {
  authError.textContent = message;
}

function setUsersBusy(isBusy) {
  isUsersBusy = isBusy;
  refreshUsersBtn.disabled = isBusy;
}

function renderUsersList(users) {
  usersList.innerHTML = "";

  if (users.length === 0) {
    const empty = document.createElement("p");
    empty.className = "users-empty";
    empty.textContent = "No registered users found.";
    usersList.appendChild(empty);
    return;
  }

  users.forEach((user) => {
    const row = document.createElement("div");
    row.className = "user-row";

    const name = document.createElement("div");
    name.className = "user-name";
    name.textContent = user.username;

    if (user.id === "admin") {
      const role = document.createElement("span");
      role.className = "user-role";
      role.textContent = "Admin";
      name.appendChild(role);
    }

    const actionBtn = document.createElement("button");
    actionBtn.type = "button";
    actionBtn.className = "delete-user-btn";
    actionBtn.textContent = "Delete";
    actionBtn.dataset.userId = user.id;
    actionBtn.dataset.username = user.username;

    if (user.id === "admin") {
      actionBtn.disabled = true;
      actionBtn.title = "Admin account cannot be deleted.";
    }

    row.appendChild(name);
    row.appendChild(actionBtn);
    usersList.appendChild(row);
  });
}

async function loadRegisteredUsers() {
  if (!currentUser) {
    return;
  }

  setUsersBusy(true);
  usersInfo.textContent = "Loading users...";

  try {
    const snapshot = await db.collection("users").get();

    const users = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          username: data.username || doc.id,
        };
      })
      .sort((a, b) => a.username.localeCompare(b.username));

    usersInfo.textContent = users.length + " account(s) registered.";
    renderUsersList(users);
  } catch (error) {
    console.error("Failed to load users:", error);
    usersInfo.textContent = "Could not load users.";
    usersList.innerHTML = "";
  } finally {
    setUsersBusy(false);
  }
}

async function deleteMessagesByUserId(userId) {
  while (true) {
    const snapshot = await db
      .collection("messages")
      .where("userId", "==", userId)
      .limit(300)
      .get();

    if (snapshot.empty) {
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    if (snapshot.size < 300) {
      break;
    }
  }
}

async function deleteUserAccount(userId, username) {
  if (!currentUser || !currentUser.isAdmin) {
    alert("Only admin can delete users.");
    return;
  }

  if (!userId || userId === "admin") {
    alert("Admin account cannot be deleted.");
    return;
  }

  const confirmed = confirm(
    "Delete account '" + username + "' and all of this user's messages?",
  );
  if (!confirmed) {
    return;
  }

  try {
    await db.collection("users").doc(userId).delete();
    await deleteMessagesByUserId(userId);
    await loadRegisteredUsers();
  } catch (error) {
    console.error("Delete user failed:", error);
    alert("Could not delete this user. Please try again.");
  }
}

function getAuthInput() {
  const username = authUsername.value.trim();
  const password = authPassword.value;

  if (!usernamePattern.test(username)) {
    showAuthError(
      "Username must be 3-30 chars and use only letters, numbers, or underscore.",
    );
    return null;
  }

  if (password.length < minPasswordLength) {
    showAuthError(
      "Password must be at least " + minPasswordLength + " characters.",
    );
    return null;
  }

  return {
    username,
    userId: normalizeUsername(username),
    password,
  };
}

async function hashPassword(password) {
  const encoded = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function completeLogin(userId, displayName, isAdmin) {
  setCurrentUser({ id: userId, name: displayName, isAdmin: Boolean(isAdmin) });
  setComposerEnabled(true);
  closeAuthModal();
  msgInput.focus();
  renderMessages(false);
}

async function createNewAccount() {
  if (isAuthBusy) return;
  showAuthError("");

  const input = getAuthInput();
  if (!input) return;

  if (input.userId === "admin" && input.password !== "admin") {
    showAuthError("For admin account, password must be exactly: admin");
    return;
  }

  setAuthBusy(true);

  try {
    const userRef = db.collection("users").doc(input.userId);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      showAuthError("Username already exists. Please sign in.");
      return;
    }

    const passwordHash = await hashPassword(input.password);

    await userRef.set({
      username: input.username,
      passwordHash,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    completeLogin(
      input.userId,
      input.username,
      isAdminCredentials(input.userId, input.password),
    );
  } catch (error) {
    console.error("Create account failed:", error);
    showAuthError("Could not create account. Please try again.");
  } finally {
    setAuthBusy(false);
  }
}

async function signInUser() {
  if (isAuthBusy) return;
  showAuthError("");

  const input = getAuthInput();
  if (!input) return;

  if (input.userId === "admin" && input.password !== "admin") {
    showAuthError("For admin account, password must be exactly: admin");
    return;
  }

  setAuthBusy(true);

  try {
    const userRef = db.collection("users").doc(input.userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      showAuthError("Account not found. Please sign up first.");
      return;
    }

    const data = userDoc.data();
    const passwordHash = await hashPassword(input.password);

    if (data.passwordHash !== passwordHash) {
      showAuthError("Incorrect password.");
      return;
    }

    completeLogin(
      input.userId,
      data.username || input.username,
      isAdminCredentials(input.userId, input.password),
    );
  } catch (error) {
    console.error("Sign in failed:", error);
    showAuthError("Could not sign in. Please try again.");
  } finally {
    setAuthBusy(false);
  }
}

async function clearAllMessages() {
  if (!currentUser || !currentUser.isAdmin) {
    alert("Only admin can clear all messages.");
    return;
  }

  const confirmed = confirm(
    "This will delete ALL chat messages for everyone. Continue?",
  );
  if (!confirmed) return;

  clearAllBtn.disabled = true;

  try {
    while (true) {
      const snapshot = await db.collection("messages").limit(400).get();
      if (snapshot.empty) break;

      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      if (snapshot.size < 400) {
        break;
      }
    }
  } catch (error) {
    console.error("Clear all messages failed:", error);
    alert("Could not clear all messages. Please try again.");
  } finally {
    clearAllBtn.disabled = false;
  }
}

function logoutAndSwitchUser() {
  closeUsersModal();
  setCurrentUser(null);
  setComposerEnabled(false);
  msgInput.value = "";
  updateCharCount();
  openAuthModal();
  renderMessages(false);
}

function setTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem("chatTheme", theme);
  themeToggle.textContent = theme === "dark" ? "☀️ Light" : "🌙 Dark";
}

function toggleTheme() {
  const currentTheme = document.body.getAttribute("data-theme") || "light";
  const nextTheme = currentTheme === "dark" ? "light" : "dark";
  setTheme(nextTheme);
}

function updateCharCount() {
  charCount.textContent = msgInput.value.length + "/500";
}

function updateMessageCount(visibleCount, totalCount) {
  if (totalCount === 0) {
    messageCount.textContent = "0 messages";
    return;
  }

  if (visibleCount === totalCount) {
    messageCount.textContent = totalCount + " messages";
    return;
  }
  messageCount.textContent = visibleCount + " of " + totalCount + " shown";
}

function formatTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function sendMsg() {
  if (!currentUser) {
    openAuthModal();
    return;
  }

  const text = msgInput.value.trim();
  if (!text) return;

  isSending = true;
  sendBtn.disabled = true;

  try {
    await db.collection("messages").add({
      name: currentUser.name,
      userId: currentUser.id,
      message: text,
      time: Date.now(),
    });
    msgInput.value = "";
    updateCharCount();
    msgInput.focus();
  } catch (error) {
    console.error("Send failed:", error);
    alert("Could not send the message. Please try again.");
  } finally {
    isSending = false;
    sendBtn.disabled = !isComposerEnabled;
  }
}

async function deleteMsg(messageId, ownerId, ownerName) {
  if (!messageId) return;

  if (!currentUser) {
    openAuthModal();
    return;
  }

  const normalizedOwnerId = ownerId || normalizeUsername(ownerName || "");
  if (normalizedOwnerId !== currentUser.id) {
    alert("You can only delete your own messages.");
    return;
  }

  const confirmed = confirm("Delete this message?");
  if (!confirmed) return;

  try {
    await db.collection("messages").doc(messageId).delete();
  } catch (error) {
    console.error("Delete failed:", error);
    alert("Could not delete the message. Please try again.");
  }
}

function createMessageElement(doc) {
  const data = doc.data();
  const ownerId = data.userId || normalizeUsername(data.name || "");
  const isMine = currentUser && ownerId === currentUser.id;

  const row = document.createElement("div");
  row.className = isMine ? "message-row mine" : "message-row";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  const head = document.createElement("div");
  head.className = "message-head";

  const sender = document.createElement("strong");
  sender.className = "sender";
  sender.textContent = data.name || "Unknown";

  const meta = document.createElement("div");
  meta.className = "meta";

  const time = document.createElement("span");
  time.className = "time";
  time.textContent = formatTime(data.time);
  meta.appendChild(time);

  if (isMine) {
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "delete-btn";
    deleteBtn.dataset.id = doc.id;
    deleteBtn.dataset.ownerId = ownerId;
    deleteBtn.dataset.ownerName = data.name || "";
    deleteBtn.textContent = "Delete";
    meta.appendChild(deleteBtn);
  }

  const text = document.createElement("p");
  text.className = "message-text";
  text.textContent = data.message || "";

  head.appendChild(sender);
  head.appendChild(meta);
  bubble.appendChild(head);
  bubble.appendChild(text);
  row.appendChild(bubble);

  return row;
}

function renderMessages(shouldScrollToBottom) {
  chat.innerHTML = "";

  const query = searchInput.value.trim().toLowerCase();
  const filteredMessages = allMessages.filter((doc) => {
    if (!query) return true;
    const data = doc.data();
    const name = (data.name || "").toLowerCase();
    const message = (data.message || "").toLowerCase();
    return name.includes(query) || message.includes(query);
  });

  if (filteredMessages.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = query
      ? "No messages match your search."
      : "No messages yet. Start the conversation!";
    chat.appendChild(emptyState);
    updateMessageCount(0, allMessages.length);
    return;
  }

  filteredMessages.forEach((doc) => {
    chat.appendChild(createMessageElement(doc));
  });

  updateMessageCount(filteredMessages.length, allMessages.length);

  if (shouldScrollToBottom) {
    chat.scrollTop = chat.scrollHeight;
  }
}

composerForm.addEventListener("submit", function (event) {
  event.preventDefault();
  sendMsg();
});

msgInput.addEventListener("input", updateCharCount);

searchInput.addEventListener("input", function () {
  renderMessages(false);
});

themeToggle.addEventListener("click", toggleTheme);

changeUserBtn.addEventListener("click", function () {
  logoutAndSwitchUser();
});

manageUsersBtn.addEventListener("click", function () {
  openUsersModal();
});

clearAllBtn.addEventListener("click", function () {
  clearAllMessages();
});

refreshUsersBtn.addEventListener("click", function () {
  loadRegisteredUsers();
});

closeUsersModalBtn.addEventListener("click", function () {
  closeUsersModal();
});

usersModal.addEventListener("click", function (event) {
  if (event.target === usersModal) {
    closeUsersModal();
  }
});

signInBtn.addEventListener("click", function () {
  signInUser();
});

createAccountBtn.addEventListener("click", function () {
  createNewAccount();
});

authPassword.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    event.preventDefault();
    signInUser();
  }
});

chat.addEventListener("click", function (event) {
  const deleteButton = event.target.closest(".delete-btn");
  if (!deleteButton) return;
  deleteMsg(
    deleteButton.dataset.id,
    deleteButton.dataset.ownerId,
    deleteButton.dataset.ownerName,
  );
});

usersList.addEventListener("click", function (event) {
  const deleteButton = event.target.closest(".delete-user-btn");
  if (!deleteButton || deleteButton.disabled) return;

  deleteUserAccount(deleteButton.dataset.userId, deleteButton.dataset.username);
});

db.collection("messages")
  .orderBy("time")
  .onSnapshot((snapshot) => {
    allMessages = snapshot.docs;
    const hasSearch = searchInput.value.trim() !== "";
    renderMessages(!hasSearch);
  });

const savedTheme = localStorage.getItem("chatTheme") || "light";
setTheme(savedTheme);

setCurrentUser(null);
setComposerEnabled(false);
openAuthModal();
updateCharCount();
