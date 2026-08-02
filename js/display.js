// منطق شاشة العرض — تحديث فوري من game/current

const currentRef = db.ref("game/current");
const scoresRef = db.ref("game/scores");
const turnTeamRef = db.ref("game/turnTeam");
const teamNamesRef = db.ref("game/teamNames");

const DEFAULT_TEAM_NAMES = { team1: "الفريق الأول", team2: "الفريق الثاني" };

let previousRevealed = []; // لمعرفة أي إجابة اكتُشفت حديثًا لعرض الأنيميشن والصوت
let currentScores = { team1: 0, team2: 0 };
let currentTurnTeam = 1;
let currentTeamNames = { ...DEFAULT_TEAM_NAMES };

// ---------- مؤثرات صوتية (Web Audio API، بدون ملف خارجي) ----------
// AudioContext واحد مشترك للصفحة كلها — يُنشأ (أو يُفعّل) مرة وحدة بضغطة المستخدم
// على بوابة "اضغط لتفعيل الصوت"، لأن متصفحات الجوال تمنع الصوت بدون تفاعل مباشر.
let audioCtx = null;

function ensureAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

document.getElementById("btnUnlockAudio").addEventListener("click", () => {
  ensureAudioContext();
  document.getElementById("audioUnlockOverlay").classList.add("hidden");
});

function playCorrectSound() {
  try {
    const ctx = ensureAudioContext();
    function tone(freq, start, dur, vol = 0.08) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.value = vol;
      o.connect(g);
      g.connect(ctx.destination);
      o.start(ctx.currentTime + start);
      g.gain.setValueAtTime(vol, ctx.currentTime + start + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      o.stop(ctx.currentTime + start + dur + 0.02);
    }
    tone(523, 0, 0.12);
    tone(659, 0.1, 0.12);
    tone(880, 0.2, 0.3);
  } catch (e) {
    // تجاهل أي فشل بتشغيل الصوت (مثلاً منع المتصفح للتشغيل التلقائي)
  }
}

function playWrongSound() {
  try {
    const ctx = ensureAudioContext();
    function tone(freq, start, dur, vol = 0.05) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.value = freq;
      g.gain.value = vol;
      o.connect(g);
      g.connect(ctx.destination);
      o.start(ctx.currentTime + start);
      g.gain.setValueAtTime(vol, ctx.currentTime + start + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      o.stop(ctx.currentTime + start + dur + 0.02);
    }
    tone(220, 0, 0.12);
    tone(180, 0.14, 0.16);
  } catch (e) {
    // تجاهل أي فشل بتشغيل الصوت (مثلاً منع المتصفح للتشغيل التلقائي)
  }
}

// ---------- مؤشر بصري للإجابة الخاطئة ----------
// ملاحظة: نراقب wrongFlashAt من داخل نفس مستمع game/current الرئيسي (بدل ref منفصل)
// عشان نضمن استخدام نفس القناة اللي أثبتت شغلها مع بقية الحقول (العنوان، الفئة، النقاط...)
// نفس الآلية تُستخدم بلعبة "أسرع واحد يضغط" (game2) عبر متتبّع مستقل خاص فيها.
function showWrongFlash(text) {
  const el = document.getElementById("wrongFlash");
  el.querySelector(".wrong-flash-text").textContent = text || "إجابة خاطئة";
  el.classList.remove("is-active");
  void el.offsetWidth; // إعادة تشغيل الأنيميشن لو صار الحدث أكثر من مرة بسرعة
  el.classList.add("is-active");
}

function makeWrongFlashTracker() {
  let last = 0;
  let initialized = false;
  return function (value, text) {
    if (!initialized) {
      last = typeof value === "number" ? value : 0;
      initialized = true;
      return;
    }
    if (typeof value === "number" && value > last) {
      last = value;
      playWrongSound();
      showWrongFlash(text);
    }
  };
}

const checkWrongFlash = makeWrongFlashTracker();
const checkWrongFlashGame2 = makeWrongFlashTracker();

// ---------- نقاط الفريقين والدور (للقراءة فقط) ----------
let animatedScores = { team1: 0, team2: 0 };
let scoreAnimFrames = { team1: null, team2: null };
let scoresInitialized = false;

function renderTeamNamesAndTurn() {
  [1, 2].forEach((teamNum) => {
    const key = `team${teamNum}`;
    document.getElementById(`team${teamNum}NameText`).textContent = currentTeamNames[key];
    document
      .getElementById(`team${teamNum}Card`)
      .classList.toggle("is-turn", currentTurnTeam === teamNum);
  });
}

function animateScoreTo(teamNum, newValue) {
  const key = `team${teamNum}`;
  const el = document.getElementById(`team${teamNum}ScoreText`);
  const startValue = animatedScores[key];

  if (startValue === newValue) {
    el.textContent = newValue;
    return;
  }

  if (scoreAnimFrames[key]) {
    cancelAnimationFrame(scoreAnimFrames[key]);
  }

  el.classList.remove("score-pulse");
  void el.offsetWidth; // إعادة تشغيل أنيميشن النبضة
  el.classList.add("score-pulse");

  const duration = 500;
  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const value = Math.round(startValue + (newValue - startValue) * eased);
    el.textContent = value;

    if (t < 1) {
      scoreAnimFrames[key] = requestAnimationFrame(step);
    } else {
      el.textContent = newValue;
      animatedScores[key] = newValue;
      scoreAnimFrames[key] = null;
    }
  }

  scoreAnimFrames[key] = requestAnimationFrame(step);
}

scoresRef.on("value", (snapshot) => {
  currentScores = snapshot.val() || { team1: 0, team2: 0 };

  if (!scoresInitialized) {
    [1, 2].forEach((teamNum) => {
      const key = `team${teamNum}`;
      animatedScores[key] = currentScores[key] || 0;
      document.getElementById(`team${teamNum}ScoreText`).textContent = animatedScores[key];
    });
    scoresInitialized = true;
    return;
  }

  [1, 2].forEach((teamNum) => {
    const key = `team${teamNum}`;
    animateScoreTo(teamNum, currentScores[key] || 0);
  });
});

turnTeamRef.on("value", (snapshot) => {
  currentTurnTeam = snapshot.val() || 1;
  renderTeamNamesAndTurn();
});

teamNamesRef.on("value", (snapshot) => {
  currentTeamNames = { ...DEFAULT_TEAM_NAMES, ...(snapshot.val() || {}) };
  renderTeamNamesAndTurn();
});

// ---------- حساب حجم صفوف الإجابات من المساحة الفعلية المتوفرة ----------
// بدل الاعتماد بس على عدد الإجابات (اللي ما يتغيّر بين الوضع العمودي
// والأفقي)، نقيس هنا الارتفاع الحقيقي المتاح لقائمة الإجابات بعد كل
// العناصر الثابتة فوقها (شريط الفريقين، العنوان، الخط، العداد) ونحسب حجم
// الخط والمسافات على أساسه — هذا يضمن عدم التكدس بأي نسبة عرض-لارتفاع
// (خصوصًا الوضع الأفقي اللي يكون فيه ارتفاع الشاشة قصير جدًا).
let lastAnswerCount = 0;

function updateRowSizing(rowCount) {
  const answersEl = document.getElementById("dAnswers");
  if (!answersEl || rowCount <= 0) return;

  const availableHeight = answersEl.clientHeight;
  if (availableHeight <= 0) return;

  const roughPerRow = availableHeight / rowCount;
  const gapPx = Math.max(2, Math.min(8, roughPerRow * 0.12));
  const totalGap = gapPx * Math.max(0, rowCount - 1);

  const rowPaddingBlock = Math.max(1, Math.min(4, roughPerRow * 0.08));
  const contentPerRow = (availableHeight - totalGap) / rowCount - rowPaddingBlock * 2;

  const pointsBoxOverhead = 6; // حدود + حشوة صندوق النقاط تقريبًا (1px*2 + 2px*2)
  const lineHeight = 1.6;

  let fontSize = (contentPerRow - pointsBoxOverhead) / lineHeight;
  fontSize = Math.max(12, Math.min(27, fontSize));

  const root = document.documentElement.style;
  root.setProperty("--row-font-size", fontSize.toFixed(1) + "px");
  root.setProperty("--row-gap", gapPx.toFixed(1) + "px");
  root.setProperty("--row-padding-block", rowPaddingBlock.toFixed(1) + "px");
}

// لو المستخدم دوّر الجوال (عمودي ↔ أفقي) وسط اللعبة، نعيد حساب الأحجام
// فورًا بدل ما ننتظر تحديث جديد من قاعدة البيانات
let resizeDebounce = null;
window.addEventListener("resize", () => {
  if (resizeDebounce) clearTimeout(resizeDebounce);
  resizeDebounce = setTimeout(() => {
    if (lastAnswerCount > 0) updateRowSizing(lastAnswerCount);
  }, 120);
});

currentRef.on("value", (snapshot) => {
  const data = snapshot.val();
  const emptyState = document.getElementById("emptyState");
  const preparingState = document.getElementById("preparingState");
  const questionView = document.getElementById("questionView");
  const categoryBadge = document.getElementById("categoryBadge");

  if (!data || !Array.isArray(data.answers) || data.answers.length === 0) {
    emptyState.classList.remove("hidden");
    preparingState.classList.add("hidden");
    questionView.classList.add("hidden");
    categoryBadge.classList.add("hidden");
    previousRevealed = [];
    return;
  }

  categoryBadge.textContent = data.category || "";
  categoryBadge.classList.toggle("hidden", !data.category);

  checkWrongFlash(data.wrongFlashAt);

  if (!data.questionVisible) {
    emptyState.classList.add("hidden");
    preparingState.classList.remove("hidden");
    questionView.classList.add("hidden");
    previousRevealed = [];
    return;
  }

  emptyState.classList.add("hidden");
  preparingState.classList.add("hidden");
  questionView.classList.remove("hidden");

  document.getElementById("dTitle").textContent = data.title || "";
  const hintEl = document.getElementById("dHint");
  hintEl.textContent = data.hint || "";
  hintEl.style.display = data.hint ? "block" : "none";

  const total = data.answers.length;
  const revealedCount = data.answers.filter((a) => a.revealed).length;
  document.getElementById("dCounter").innerHTML =
    `تم اكتشاف <span class="counter-highlight">${revealedCount}</span> من ${total}`;

  // يقود حساب حجم عنوان السؤال (clamp/calc حسب --answer-count، مع حد أعلى
  // بالـ vh عشان ينكمش بالوضع الأفقي أيضًا)
  document.documentElement.style.setProperty("--answer-count", total);
  lastAnswerCount = total;
  updateRowSizing(total);

  // نحدّث كل صف بمكانه بدل ما نهدم القائمة كاملة ونعيد بناءها بكل تحديث —
  // هدم/بناء متكرر (خصوصًا مع كشف عدة إجابات بسرعة) يقدر يعطّل حساب ارتفاع
  // الصفوف (flex:1 المتداخل) بمتصفحات الجوال ويخلي الصفوف تتكدس فوق بعض.
  // كل صف يُنشأ مرة وحدة فقط، وبعدين نعدّل محتواه وحالته بمكانه.
  const answersEl = document.getElementById("dAnswers");
  let anyJustRevealed = false;

  data.answers.forEach((answer, index) => {
    const wasRevealed = previousRevealed[index] === true;
    const isRevealed = !!answer.revealed;
    const justRevealed = isRevealed && !wasRevealed;
    if (justRevealed) anyJustRevealed = true;

    let row = answersEl.children[index];
    if (!row) {
      row = document.createElement("div");
      row.innerHTML = `
        <span class="d-index"></span>
        <span class="d-text"></span>
        <span class="d-points"></span>
      `;
      answersEl.appendChild(row);
    }

    row.className = "display-answer" + (isRevealed ? " is-revealed" : "") + (justRevealed ? " just-revealed" : "");
    row.querySelector(".d-index").textContent = index + 1;
    row.querySelector(".d-text").textContent = isRevealed ? answer.text : "?????";
    row.querySelector(".d-points").textContent = isRevealed ? answer.points + " نقطة" : "";
  });

  // احذف أي صفوف زايدة لو السؤال الجديد فيه إجابات أقل من السابق
  while (answersEl.children.length > data.answers.length) {
    answersEl.removeChild(answersEl.lastChild);
  }

  if (anyJustRevealed) {
    playCorrectSound();
  }

  previousRevealed = data.answers.map((a) => !!a.revealed);
});

// ============================================================
// لعبة "أسرع واحد يضغط" (game2) — منطق مستقل تمامًا عن اللعبة الأولى
// ============================================================

const activeGameRef = db.ref("game2/activeGame");
const current2Ref = db.ref("game2/current");
const players2Ref = db.ref("game2/players");

const CHAR_DELAY_MS = 90; // نفس القيمة المستخدمة بـ host2.js و player.js

// ---------- التبديل بين وضعي اللعبة ----------
activeGameRef.on("value", (snapshot) => {
  const mode = snapshot.val() === "game2" ? "game2" : "game1";
  document.getElementById("game1Mode").classList.toggle("hidden", mode !== "game1");
  document.getElementById("game2Mode").classList.toggle("hidden", mode !== "game2");
});

// ---------- لوحة نقاط اللاعبين ----------
function escapeHtml2(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

players2Ref.on("value", (snapshot) => {
  const data = snapshot.val() || {};
  const bar = document.getElementById("playersBar");
  const names = Object.keys(data);

  if (names.length === 0) {
    bar.innerHTML = "";
    return;
  }

  names.sort((a, b) => (data[b].score || 0) - (data[a].score || 0));

  bar.innerHTML = names
    .map(
      (name) => `
        <div class="player-pill">
          <span class="player-pill-name">${escapeHtml2(name)}</span>
          <span class="player-pill-score">${data[name].score || 0}</span>
        </div>
      `
    )
    .join("");
});

// ---------- الكتابة التدريجية + حالة الضغط ----------
let game2Data = null;
let typingFrame = null;

function renderGame2() {
  const emptyState = document.getElementById("g2EmptyState");
  const questionView = document.getElementById("g2QuestionView");
  const data = game2Data;

  if (typingFrame) {
    cancelAnimationFrame(typingFrame);
    typingFrame = null;
  }

  if (!data || !data.question) {
    emptyState.classList.remove("hidden");
    questionView.classList.add("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  questionView.classList.remove("hidden");

  const textEl = document.getElementById("g2QuestionText");
  const caretEl = document.getElementById("g2Caret");
  const bannerEl = document.getElementById("g2BuzzBanner");

  function step() {
    const questionText = data.question || "";
    let shown;

    if (data.typingActive && data.typingStartedAt) {
      const elapsed = Date.now() - data.typingStartedAt;
      shown = Math.min(
        questionText.length,
        (data.revealedCharsAtPause || 0) + Math.floor(elapsed / CHAR_DELAY_MS)
      );
    } else {
      shown = Math.min(questionText.length, data.revealedCharsAtPause || 0);
    }

    textEl.textContent = questionText.slice(0, shown);

    const fullyShown = shown >= questionText.length;
    caretEl.classList.toggle("hidden", !!data.buzzedBy || fullyShown);

    // بانر الحالة: ضغط لاعب، أو فرصة مفتوحة بعد إجابة خاطئة (بعدّاد تنازلي حي)
    const inGrace = !data.buzzedBy && typeof data.graceUntil === "number" && Date.now() < data.graceUntil;

    if (data.buzzedBy) {
      bannerEl.classList.remove("hidden");
      bannerEl.classList.remove("is-grace");
      bannerEl.textContent =
        data.judgement === "correct" ? `✓ ${data.buzzedBy} أجاب صح!` : `${data.buzzedBy} يجاوب...`;
      bannerEl.classList.toggle("is-correct", data.judgement === "correct");
    } else if (inGrace) {
      const secondsLeft = Math.max(0, Math.ceil((data.graceUntil - Date.now()) / 1000));
      bannerEl.classList.remove("hidden");
      bannerEl.classList.add("is-grace");
      bannerEl.classList.remove("is-correct");
      bannerEl.textContent = `الفرصة مفتوحة... ${secondsLeft}`;
    } else {
      bannerEl.classList.add("hidden");
      bannerEl.classList.remove("is-correct", "is-grace");
    }

    // طبقة موثوقية إضافية لاستئناف الكتابة بعد انتهاء المهلة — مستقلة عن
    // setInterval بـ host2.js وتعتمد على نفس timestamp المحفوظ بقاعدة البيانات
    if (!data.buzzedBy && typeof data.graceUntil === "number" && Date.now() >= data.graceUntil) {
      tryAutoResumeGame2();
    }

    if ((data.typingActive && !fullyShown) || inGrace) {
      typingFrame = requestAnimationFrame(step);
    }
  }

  step();
}

function tryAutoResumeGame2() {
  current2Ref.transaction((data) => {
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

current2Ref.on("value", (snapshot) => {
  game2Data = snapshot.val();
  checkWrongFlashGame2(
    game2Data && game2Data.wrongFlashAt,
    game2Data && game2Data.lastWrongPlayer ? `${game2Data.lastWrongPlayer}: إجابة خاطئة` : undefined
  );
  renderGame2();
});
