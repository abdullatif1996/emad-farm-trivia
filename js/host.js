// منطق لوحة تحكم الهوست
// ملاحظة: هذه حماية بسيطة على مستوى الواجهة فقط، وليست حماية أمنية حقيقية.
const HOST_PASSWORD = "112212";

function showHostPanel() {
  document.getElementById("loginGate").classList.add("hidden");
  document.getElementById("hostPanel").classList.remove("hidden");
}

if (sessionStorage.getItem("hostAuthed") === "1") {
  showHostPanel();
}

document.getElementById("btnLogin").addEventListener("click", attemptLogin);
document.getElementById("passwordInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") attemptLogin();
});

function attemptLogin() {
  const value = document.getElementById("passwordInput").value;
  const errorEl = document.getElementById("loginError");
  if (value === HOST_PASSWORD) {
    sessionStorage.setItem("hostAuthed", "1");
    errorEl.classList.add("hidden");
    showHostPanel();
    // فتح لوحة الهوست الأولى يحوّل شاشة العرض تلقائيًا لوضع اللعبة الأولى
    db.ref("game2/activeGame").set("game1");
  } else {
    errorEl.classList.remove("hidden");
  }
}

const questionsRef = db.ref("questions");
const currentRef = db.ref("game/current");
const scoresRef = db.ref("game/scores");
const turnTeamRef = db.ref("game/turnTeam");
const teamNamesRef = db.ref("game/teamNames");

const DEFAULT_TEAM_NAMES = { team1: "الفريق الأول", team2: "الفريق الثاني" };

let flatQuestions = []; // [{category, id, title, hint, answers}] بترتيب العرض
let currentGameState = null; // آخر نسخة من game/current
let currentScores = { team1: 0, team2: 0 };
let currentTurnTeam = 1;
let currentTeamNames = { ...DEFAULT_TEAM_NAMES };

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

// ---------- تهيئة قيم افتراضية لأول مرة فقط (لا تكتب فوق قيم موجودة) ----------
scoresRef.once("value").then((snap) => {
  if (!snap.exists()) scoresRef.set({ team1: 0, team2: 0 });
});
turnTeamRef.once("value").then((snap) => {
  if (!snap.exists()) turnTeamRef.set(1);
});
teamNamesRef.once("value").then((snap) => {
  if (!snap.exists()) teamNamesRef.set(DEFAULT_TEAM_NAMES);
});

// ---------- الاستماع لنقاط الفريقين والدور والأسماء ----------
scoresRef.on("value", (snapshot) => {
  currentScores = snapshot.val() || { team1: 0, team2: 0 };
  renderScoreboard();
});

turnTeamRef.on("value", (snapshot) => {
  currentTurnTeam = snapshot.val() || 1;
  renderScoreboard();
});

teamNamesRef.on("value", (snapshot) => {
  currentTeamNames = { ...DEFAULT_TEAM_NAMES, ...(snapshot.val() || {}) };
  renderScoreboard();
});

function renderScoreboard() {
  [1, 2].forEach((teamNum) => {
    const key = `team${teamNum}`;
    document.getElementById(`team${teamNum}NameText`).textContent = currentTeamNames[key];
    document.getElementById(`team${teamNum}ScoreText`).textContent = currentScores[key] || 0;
    document
      .getElementById(`team${teamNum}Card`)
      .classList.toggle("is-turn", currentTurnTeam === teamNum);
  });
}

function setTurnTeam(teamNum) {
  turnTeamRef.set(teamNum);
}

function renameTeam(teamNum) {
  const key = `team${teamNum}`;
  const newName = prompt("اسم الفريق الجديد:", currentTeamNames[key]);
  if (newName && newName.trim()) {
    teamNamesRef.child(key).set(newName.trim());
  }
}

// تحكم يدوي بالنقاط — مستقل عن كشف الإجابات، لا يمس turnTeam أو حالة السؤال الحالي
function adjustScore(teamNum, delta) {
  const key = `team${teamNum}`;
  const newScore = Math.max(0, (currentScores[key] || 0) + delta);
  scoresRef.child(key).set(newScore);
}

[1, 2].forEach((teamNum) => {
  const card = document.getElementById(`team${teamNum}Card`);
  card.addEventListener("click", () => setTurnTeam(teamNum));
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setTurnTeam(teamNum);
    }
  });

  const editBtn = document.getElementById(`team${teamNum}EditBtn`);
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    renameTeam(teamNum);
  });

  const plusBtn = document.getElementById(`team${teamNum}PlusBtn`);
  plusBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    adjustScore(teamNum, 1);
  });

  const minusBtn = document.getElementById(`team${teamNum}MinusBtn`);
  minusBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    adjustScore(teamNum, -1);
  });
});

document.getElementById("btnNewGame").addEventListener("click", () => {
  if (!confirm("بدء لعبة جديدة سيصفّر نقاط الفريقين. متابعة؟")) return;
  db.ref("game").update({
    scores: { team1: 0, team2: 0 },
    turnTeam: 1,
  });
});

document.getElementById("btnWrongAnswer").addEventListener("click", () => {
  setTurnTeam(currentTurnTeam === 1 ? 2 : 1);
  currentRef.child("wrongFlashAt").set(Date.now());
});

// ---------- تحميل قائمة الأسئلة وبناء قائمة الاختيار ----------
questionsRef.on("value", (snapshot) => {
  const data = snapshot.val() || {};
  flatQuestions = [];
  const listEl = document.getElementById("questionPickList");
  listEl.innerHTML = "";

  const categories = Object.keys(data);
  if (categories.length === 0) {
    listEl.innerHTML = '<p class="empty-note">لا توجد أسئلة بعد. أضف أسئلة من صفحة "إدارة الأسئلة".</p>';
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
        title: q.title || "",
        hint: q.hint || "",
        answers: Array.isArray(q.answers) ? q.answers : Object.values(q.answers || {}),
      };
      flatQuestions.push(entry);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "question-pick-btn";
      btn.textContent = entry.title || "(بدون عنوان)";
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

// ---------- تحميل سؤال إلى game/current ----------
let pickerVisible = true; // تحكم محلي (واجهة فقط) بين قائمة الاختيار وعرض السؤال الحالي
let visibilityInitialized = false;

function loadQuestion(entry) {
  const answers = entry.answers.map((a) => ({
    text: a.text,
    points: a.points,
    revealed: false,
  }));

  const newState = {
    category: entry.category,
    questionId: entry.id,
    title: entry.title,
    hint: entry.hint,
    answers,
    questionVisible: false,
  };

  // تحديث محلي فوري (متفائل) عشان الواجهة تنتقل مباشرة بدون انتظار الشبكة
  currentGameState = newState;
  pickerVisible = false;
  visibilityInitialized = true;
  renderCurrentQuestion();
  updatePanelVisibility();
  highlightActivePick();

  currentRef.set(newState);
}

document.getElementById("btnChangeQuestion").addEventListener("click", () => {
  pickerVisible = true;
  updatePanelVisibility();
});

// ---------- الاستماع للسؤال الحالي وعرضه للهوست ----------
currentRef.on("value", (snapshot) => {
  currentGameState = snapshot.val();

  if (!visibilityInitialized) {
    const hasQuestion = currentGameState && Array.isArray(currentGameState.answers) && currentGameState.answers.length > 0;
    pickerVisible = !hasQuestion;
    visibilityInitialized = true;
  }

  renderCurrentQuestion();
  updatePanelVisibility();
  highlightActivePick();
});

function updatePanelVisibility() {
  const hasQuestion = currentGameState && Array.isArray(currentGameState.answers) && currentGameState.answers.length > 0;
  const pickerPanel = document.getElementById("questionPickerPanel");
  const currentPanel = document.getElementById("currentQuestionPanel");
  const emptyPanel = document.getElementById("noQuestionPanel");

  pickerPanel.style.display = pickerVisible ? "block" : "none";
  currentPanel.style.display = !pickerVisible && hasQuestion ? "block" : "none";
  emptyPanel.style.display = !pickerVisible && !hasQuestion ? "block" : "none";
}

function renderCurrentQuestion() {
  if (!currentGameState || !Array.isArray(currentGameState.answers)) {
    return;
  }

  document.getElementById("cqTitle").textContent = currentGameState.title || "";
  const hintEl = document.getElementById("cqHint");
  hintEl.textContent = currentGameState.hint || "";
  hintEl.style.display = currentGameState.hint ? "block" : "none";

  const showBtn = document.getElementById("btnShowQuestion");
  showBtn.disabled = !!currentGameState.questionVisible;
  showBtn.textContent = currentGameState.questionVisible ? "السؤال ظاهر بالعرض" : "اعرض السؤال";

  const answersEl = document.getElementById("cqAnswers");
  answersEl.innerHTML = "";

  currentGameState.answers.forEach((answer, index) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "answer-reveal-btn";
    row.disabled = !!answer.revealed;

    row.innerHTML = `
      <span class="answer-index">${index + 1}</span>
      <span class="answer-text">${escapeHtml(answer.text)}</span>
      <span class="answer-points">${answer.points} نقطة</span>
    `;

    if (!answer.revealed) {
      row.addEventListener("click", () => revealAnswer(index));
    }

    answersEl.appendChild(row);
  });
}

function revealAnswer(index) {
  if (!currentGameState || !Array.isArray(currentGameState.answers)) return;
  const answer = currentGameState.answers[index];
  if (!answer || answer.revealed) return;

  const teamKey = `team${currentTurnTeam}`;
  const newScore = (currentScores[teamKey] || 0) + Number(answer.points);
  const nextTurnTeam = currentTurnTeam === 1 ? 2 : 1;

  const updates = {};
  updates[`current/answers/${index}/revealed`] = true;
  updates[`scores/${teamKey}`] = newScore;
  updates["turnTeam"] = nextTurnTeam;

  db.ref("game").update(updates);
}

// ---------- أزرار التحكم ----------
document.getElementById("btnShowQuestion").addEventListener("click", () => {
  currentRef.child("questionVisible").set(true);
});

document.getElementById("btnRevealAll").addEventListener("click", () => {
  if (!currentGameState || !Array.isArray(currentGameState.answers)) return;
  const updates = {};
  currentGameState.answers.forEach((_, index) => {
    updates[`answers/${index}/revealed`] = true;
  });
  currentRef.update(updates);
});

document.getElementById("btnReset").addEventListener("click", () => {
  if (!currentGameState || !Array.isArray(currentGameState.answers)) return;
  const updates = {};
  currentGameState.answers.forEach((_, index) => {
    updates[`answers/${index}/revealed`] = false;
  });
  updates["questionVisible"] = false;
  currentRef.update(updates);
});

document.getElementById("btnNext").addEventListener("click", () => {
  if (!currentGameState || flatQuestions.length === 0) return;

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
