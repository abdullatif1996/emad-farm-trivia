// الصفحة الرئيسية — كشف مخفي لدخول الهوست
// النقر 5 مرات متتالية على العنوان (خلال ثانيتين من كل نقرة للي بعدها) يظهر
// رابط "الهوست". لا أثر بصري ولا عداد ظاهر بأي شكل — العداد بمتغيرات JS فقط.

const TAP_WINDOW_MS = 2000;
const TAPS_REQUIRED = 5;

let tapCount = 0;
let lastTapTime = 0;
let panelRevealed = false;

document.getElementById("secretTitle").addEventListener("click", () => {
  const now = Date.now();
  if (now - lastTapTime > TAP_WINDOW_MS) {
    tapCount = 0;
  }
  lastTapTime = now;
  tapCount += 1;

  if (tapCount >= TAPS_REQUIRED) {
    revealHostPanel();
  }
});

function revealHostPanel() {
  if (panelRevealed) return;
  panelRevealed = true;

  const panel = document.getElementById("hostRevealPanel");
  panel.classList.remove("hidden");
  panel.classList.add("reveal-init");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => panel.classList.add("is-visible"));
  });
}
