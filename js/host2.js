// منطق لوحة تحكم اللعبة الثانية — "أسرع واحد يضغط"
// ملاحظة: هذه حماية بسيطة على مستوى الواجهة فقط، وليست حماية أمنية حقيقية.
const HOST2_PASSWORD = "112212";

function showHostPanel() {
  document.getElementById("loginGate").classList.add("hidden");
  document.getElementById("hostPanel").classList.remove("hidden");
}

if (sessionStorage.getItem("host2Authed") === "1") {
  showHostPanel();
}

document.getElementById("btnLogin").addEventListener("click", attemptLogin);
document.getElementById("passwordInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") attemptLogin();
});

function attemptLogin() {
  const value = document.getElementById("passwordInput").value;
  const errorEl = document.getElementById("loginError");
  if (value === HOST2_PASSWORD) {
    sessionStorage.setItem("host2Authed", "1");
    errorEl.classList.add("hidden");
    showHostPanel();
  } else {
    errorEl.classList.remove("hidden");
  }
}

const CHAR_DELAY_MS = 90; // نفس القيمة المستخدمة بـ display.js و player.js

const questions2Ref = db.ref("questions2");
const questions2ArchiveRef = db.ref("questions2Archive");
const currentRef = db.ref("game2/current");
const playersRef = db.ref("game2/players");

let flatQuestions = []; // [{category, id, question, answer}]
let currentGameState = null; // آخر نسخة من game2/current
let currentAnswer = ""; // الإجابة الصحيحة للسؤال الحالي — تُحفظ محليًا فقط، ما تُكتب لقاعدة البيانات

// السؤال التالي بعد أرشفة السؤال الحالي — نحسبه وقت الأرشفة (قبل الحذف من
// القائمة النشطة) لأن الحذف يكسر البحث بالفهرس لاحقًا بزر "السؤال التالي"
let archivedNextEntry = null; // {category, questionId, nextEntry}

let pickerVisible = true;
let visibilityInitialized = false;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

// ---------- قائمة اللاعبين ----------
playersRef.on("value", (snapshot) => {
  const data = snapshot.val() || {};
  const listEl = document.getElementById("playersList");
  const names = Object.keys(data);

  if (names.length === 0) {
    listEl.innerHTML = '<p class="empty-note">ما انضم أي لاعب بعد.</p>';
    return;
  }

  names.sort((a, b) => (data[b].score || 0) - (data[a].score || 0));

  listEl.innerHTML = "";
  names.forEach((name) => {
    const row = document.createElement("div");
    row.className = "admin-question-item";
    row.innerHTML = `
      <div class="aq-title">${escapeHtml(name)}</div>
      <div class="aq-meta">${data[name].score || 0} نقطة</div>
    `;
    listEl.appendChild(row);
  });
});

document.getElementById("btnResetGame").addEventListener("click", () => {
  if (!confirm("إعادة تعيين اللعبة سيمسح كل اللاعبين ونقاطهم والسؤال الحالي. متابعة؟")) return;
  playersRef.remove();
  currentRef.remove();
});

// ---------- أرشيف الأسئلة المُجابة ----------
let archiveExpanded = false;

document.getElementById("btnToggleArchive").addEventListener("click", () => {
  archiveExpanded = !archiveExpanded;
  document.getElementById("archiveList").classList.toggle("hidden", !archiveExpanded);
  document.getElementById("archiveCaret").classList.toggle("is-open", archiveExpanded);
});

questions2ArchiveRef.on("value", (snapshot) => {
  const data = snapshot.val() || {};
  const listEl = document.getElementById("archiveList");
  const categories = Object.keys(data);

  let total = 0;
  categories.forEach((category) => {
    total += Object.keys(data[category] || {}).length;
  });
  document.getElementById("archiveCount").textContent = total;

  if (categories.length === 0) {
    listEl.innerHTML = '<p class="empty-note">ولا سؤال أُرشف بعد.</p>';
    return;
  }

  listEl.innerHTML = "";
  categories.forEach((category) => {
    const questionsInCat = data[category] || {};
    const groupDiv = document.createElement("div");
    groupDiv.className = "category-group";

    const heading = document.createElement("h3");
    heading.textContent = category;
    groupDiv.appendChild(heading);

    Object.keys(questionsInCat).forEach((qId) => {
      const q = questionsInCat[qId];
      const row = document.createElement("div");
      row.className = "archive-item";
      row.innerHTML = `
        <span class="archive-item-q">${escapeHtml(q.question || "")}</span>
        <span class="archive-item-a">${escapeHtml(q.answer || "")}</span>
      `;
      groupDiv.appendChild(row);
    });

    listEl.appendChild(groupDiv);
  });
});

// ---------- تحميل قائمة الأسئلة وبناء قائمة الاختيار ----------
questions2Ref.on("value", (snapshot) => {
  const data = snapshot.val() || {};
  flatQuestions = [];
  const listEl = document.getElementById("questionPickList");
  listEl.innerHTML = "";

  const categories = Object.keys(data);
  if (categories.length === 0) {
    listEl.innerHTML = '<p class="empty-note">لا توجد أسئلة بعد بهذي اللعبة.</p>';
    return;
  }

  categories.forEach((category) => {
    const questionsInCat = data[category] || {};
    const groupDiv = document.createElement("div");
    groupDiv.className = "category-group";

    const heading = document.createElement("h3");
    heading.textContent = category;
    groupDiv.appendChild(heading);

    const listDiv = document.createElement("div");
    listDiv.className = "question-pick-list";

    Object.keys(questionsInCat).forEach((qId) => {
      const q = questionsInCat[qId];
      const entry = {
        category,
        id: qId,
        question: q.question || "",
        answer: q.answer || "",
      };
      flatQuestions.push(entry);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "question-pick-btn";
      btn.textContent = entry.question || "(بدون نص)";
      btn.dataset.category = category;
      btn.dataset.qid = qId;
      btn.addEventListener("click", () => loadQuestion(entry));
      listDiv.appendChild(btn);
    });

    groupDiv.appendChild(listDiv);
    listEl.appendChild(groupDiv);
  });

  highlightActivePick();
});

function highlightActivePick() {
  const buttons = document.querySelectorAll(".question-pick-btn");
  buttons.forEach((btn) => {
    const isActive =
      currentGameState &&
      btn.dataset.category === currentGameState.category &&
      btn.dataset.qid === currentGameState.questionId;
    btn.classList.toggle("is-active", !!isActive);
  });
}

// ---------- تحميل سؤال إلى game2/current ----------
function loadQuestion(entry) {
  const newState = {
    category: entry.category,
    questionId: entry.id,
    question: entry.question,
    typingActive: false,
    typingStartedAt: null,
    revealedCharsAtPause: 0,
    buzzedBy: null,
    judgement: null,
    blockedPlayers: [],
  };

  currentAnswer = entry.answer;
  currentGameState = newState;
  pickerVisible = false;
  visibilityInitialized = true;
  renderCurrentQuestion();
  updatePanelVisibility();
  highlightActivePick();

  // بدء سؤال فعلي من اللعبة الثانية هو اللحظة الوحيدة اللي تحوّل شاشة العرض لوضع اللعبة الثانية
  db.ref("game2/activeGame").set("game2");
  currentRef.set(newState);
}

document.getElementById("btnChangeQuestion2").addEventListener("click", () => {
  pickerVisible = true;
  updatePanelVisibility();
});

// ---------- الاستماع للسؤال الحالي ----------
currentRef.on("value", (snapshot) => {
  currentGameState = snapshot.val();

  if (!visibilityInitialized) {
    const hasQuestion = currentGameState && !!currentGameState.question;
    pickerVisible = !hasQuestion;
    visibilityInitialized = true;
  }

  renderCurrentQuestion();
  updatePanelVisibility();
  highlightActivePick();
  updateTopCategoryBadge();
});

function updateTopCategoryBadge() {
  const badge = document.getElementById("topCategoryBadge");
  if (!badge) return;
  const hasQuestion = currentGameState && !!currentGameState.question;
  const category = hasQuestion ? currentGameState.category || "" : "";
  badge.textContent = category;
  badge.classList.toggle("hidden", !category);
}

function updatePanelVisibility() {
  const hasQuestion = currentGameState && !!currentGameState.question;
  const pickerPanel = document.getElementById("questionPickerPanel");
  const currentPanel = document.getElementById("currentQuestionPanel");
  const emptyPanel = document.getElementById("noQuestionPanel2");

  pickerPanel.style.display = pickerVisible ? "block" : "none";
  currentPanel.style.display = !pickerVisible && hasQuestion ? "block" : "none";
  emptyPanel.style.display = !pickerVisible && !hasQuestion ? "block" : "none";
}

function renderCurrentQuestion() {
  if (!currentGameState || !currentGameState.question) return;

  document.getElementById("cq2Question").textContent = currentGameState.question;
  document.getElementById("cq2Answer").textContent = "الإجابة: " + (currentAnswer || "؟");

  const startBtn = document.getElementById("btnStartTyping");
  const fullyShown =
    !currentGameState.typingActive &&
    (currentGameState.revealedCharsAtPause || 0) >= currentGameState.question.length;
  const inGrace =
    typeof currentGameState.graceUntil === "number" && Date.now() < currentGameState.graceUntil;
  startBtn.disabled = !!currentGameState.typingActive || fullyShown;
  startBtn.textContent = currentGameState.typingActive
    ? "الكتابة شغّالة..."
    : fullyShown
    ? "السؤال ظاهر بالكامل"
    : inGrace
    ? "فترة سماح... (أو ابدأ الآن)"
    : "ابدأ الكتابة";

  // ملاحظة: Firebase يحذف الحقل بدل ما يخزّن null فعليًا، فـ judgement يرجع
  // undefined بعد الحفظ لا null — لازم نتحقق "!== correct" مو "=== null"
  const buzzedPanel = document.getElementById("buzzedPanel");
  if (currentGameState.buzzedBy && currentGameState.judgement !== "correct") {
    buzzedPanel.style.display = "block";
    document.getElementById("buzzedPlayerName").textContent = currentGameState.buzzedBy;
  } else {
    buzzedPanel.style.display = "none";
  }
}

// ---------- بدء الكتابة ----------
document.getElementById("btnStartTyping").addEventListener("click", () => {
  if (!currentGameState || !currentGameState.question) return;
  if (currentGameState.typingActive) return;

  currentRef.update({
    typingActive: true,
    typingStartedAt: Date.now(),
  });
});

// ---------- حكم صح/غلط ----------
document.getElementById("btnJudgeCorrect").addEventListener("click", () => {
  if (!currentGameState || !currentGameState.buzzedBy) return;
  const playerName = currentGameState.buzzedBy;
  const { category, questionId } = currentGameState;

  playersRef.child(playerName).child("score").transaction((score) => (score || 0) + 1);

  currentRef.update({
    typingActive: false,
    typingStartedAt: null,
    revealedCharsAtPause: currentGameState.question.length,
    judgement: "correct",
  });

  // أرشفة السؤال: يُنقل من القائمة النشطة (questions2) إلى الأرشيف
  // (questions2Archive) بنفس اللحظة، عشان ما يتكرر باللعب من جديد
  const idx = flatQuestions.findIndex((q) => q.category === category && q.id === questionId);
  archivedNextEntry = {
    category,
    questionId,
    nextEntry: idx !== -1 ? flatQuestions[idx + 1] || null : null,
  };

  const archiveUpdates = {};
  archiveUpdates[`questions2/${category}/${questionId}`] = null;
  archiveUpdates[`questions2Archive/${category}/${questionId}`] = {
    question: currentGameState.question,
    answer: currentAnswer,
  };
  db.ref().update(archiveUpdates);
});

const GRACE_MS = 4000; // مهلة الفرصة المفتوحة لباقي اللاعبين بعد إجابة خاطئة

document.getElementById("btnJudgeWrong").addEventListener("click", () => {
  if (!currentGameState || !currentGameState.buzzedBy) return;
  const playerName = currentGameState.buzzedBy;
  const blocked = Array.isArray(currentGameState.blockedPlayers)
    ? currentGameState.blockedPlayers.slice()
    : [];
  blocked.push(playerName);

  // السؤال يفضل متوقف بمكانه — ما نكمل الكتابة فورًا، نفتح مهلة 4 ثواني
  // يقدر خلالها أي لاعب ثاني (غير المتعطلين) يضغط، وبعدها تكمل الكتابة تلقائيًا
  currentRef.update({
    buzzedBy: null,
    judgement: null,
    typingActive: false,
    typingStartedAt: null,
    graceUntil: Date.now() + GRACE_MS,
    blockedPlayers: blocked,
    wrongFlashAt: Date.now(),
    lastWrongPlayer: playerName,
  });
});

// ---------- استئناف الكتابة تلقائيًا بعد انتهاء مهلة الفرصة المفتوحة ----------
// نعتمد على timestamp محفوظ بقاعدة البيانات (graceUntil) لا على setTimeout محلي
// بجهاز واحد بس — display.js يشغّل نفس الفحص بشكل مستقل كطبقة موثوقية إضافية،
// وبما إنه transaction فمحاولات متكررة من أكثر من جهاز آمنة تمامًا.
function tryAutoResumeGame2() {
  currentRef.transaction((data) => {
    if (!data) return data;
    if (data.typingActive) return data;
    if (data.buzzedBy) return data;
    if (typeof data.graceUntil !== "number") return data;
    if (Date.now() < data.graceUntil) return data;

    data.typingActive = true;
    data.typingStartedAt = Date.now();
    data.graceUntil = null;
    return data;
  });
}

setInterval(tryAutoResumeGame2, 300);

// ---------- السؤال التالي ----------
document.getElementById("btnNext2").addEventListener("click", () => {
  if (!currentGameState) return;

  // لو السؤال الحالي انأرشف قبل شوي (جواب صح)، استخدم "التالي" المحسوب
  // وقتها بدل البحث بالفهرس — لأنه انحذف من flatQuestions ومو موجود فيها
  if (
    archivedNextEntry &&
    archivedNextEntry.category === currentGameState.category &&
    archivedNextEntry.questionId === currentGameState.questionId
  ) {
    const nextEntry = archivedNextEntry.nextEntry;
    archivedNextEntry = null;
    if (!nextEntry) {
      alert("لا يوجد سؤال تالي — هذا آخر سؤال بالقائمة.");
      return;
    }
    loadQuestion(nextEntry);
    return;
  }

  if (flatQuestions.length === 0) return;

  const currentIndex = flatQuestions.findIndex(
    (q) => q.category === currentGameState.category && q.id === currentGameState.questionId
  );

  const nextEntry = flatQuestions[currentIndex + 1];
  if (!nextEntry) {
    alert("لا يوجد سؤال تالي — هذا آخر سؤال بالقائمة.");
    return;
  }

  loadQuestion(nextEntry);
});
