// بوابة الهوست الموحدة — كلمة سر واحدة تؤدي لشاشة اختيار اللعبة
// نفس كلمة السر المستخدمة سابقًا بـ host.js و host2.js
const HOST_GATE_PASSWORD = "112212";

const loginGate = document.getElementById("loginGate");
const chooserGate = document.getElementById("chooserGate");

function showChooser() {
  loginGate.classList.add("hidden");
  chooserGate.classList.remove("hidden");
}

if (
  sessionStorage.getItem("hostAuthed") === "1" ||
  sessionStorage.getItem("host2Authed") === "1"
) {
  showChooser();
}

document.getElementById("btnLogin").addEventListener("click", attemptLogin);
document.getElementById("passwordInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") attemptLogin();
});

function attemptLogin() {
  const value = document.getElementById("passwordInput").value;
  const errorEl = document.getElementById("loginError");
  if (value === HOST_GATE_PASSWORD) {
    // تفعيل جلستي اللوحتين معًا عشان اختيار أي لعبة من الشاشة التالية
    // ما يطلب كلمة السر مرة ثانية
    sessionStorage.setItem("hostAuthed", "1");
    sessionStorage.setItem("host2Authed", "1");
    errorEl.classList.add("hidden");
    showChooser();
  } else {
    errorEl.classList.remove("hidden");
  }
}
