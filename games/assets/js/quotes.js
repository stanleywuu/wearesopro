document.addEventListener("DOMContentLoaded", () => {
  // Load user's pool if provided
  const pool = (Array.isArray(window.QUOTES_POOL) && window.QUOTES_POOL.length)
    ? window.QUOTES_POOL
    : [
        // minimal fallback sample
        { text: "Sample quote — replace with your data in quotes.data.js.", char: "stanley" },
        { text: "It went five-hole again?", char: "mark" },
        { text: "That’s at least two PIMs I didn’t deserve.", char: "joe" },
        { text: "Good effort team!", char: "everyone" },
        { text: "We skate, we hydrate.", char: "percy" },
        { text: "Coach said it's fine.", char: "coach" }
      ];

  // Characters derived from data
  const all = [...new Set(pool.map(q => q.char))];
  const hasEveryone = all.includes("everyone");
  const characters = all.filter(c => c !== "everyone");

  // DOM refs
  const leftCol = document.getElementById("gw-choices-left");
  const rightCol = document.getElementById("gw-choices-right");
  const textEl = document.getElementById("gw-text");
  const resultEl = document.getElementById("gw-result");
  const messageEl = document.getElementById("gw-message");
  const streakEl = document.getElementById("gw-streak");
  const btnNext = document.getElementById("gw-next");
  const everyoneWrap = document.querySelector(".gw-everyone-wrap");
  const btnEveryone = document.getElementById("gw-everyone");
  const controls = document.querySelector(".gw-controls");
  const contentSection = document.querySelector(".content");

  function showNextCTA() {
  btnNext.disabled = false;
  controls.classList.add("show");
  contentSection && contentSection.classList.add("cta-active");

  // Focus Next for keyboard users
  try { btnNext.focus(); } catch {}

  // If not sticky (desktop) and Next is off-screen, scroll it into view
  const isMobile = window.matchMedia("(max-width: 900px)").matches;
  if (!isMobile) {
    const r = controls.getBoundingClientRect();
    const withinView = r.top >= 0 && r.bottom <= (window.innerHeight || document.documentElement.clientHeight);
    if (!withinView) controls.scrollIntoView({ behavior: "smooth", block: "end" });
  }
}

function hideNextCTA() {
  controls.classList.remove("show");
  contentSection && contentSection.classList.remove("cta-active");
  btnNext.disabled = true;
}



  // State
  let roundBag = [];
  let roundPos = -1;
  let current = null;
  let streak = 0;
  let mobileGrid = null;

  function uc(s){ return s ? s[0].toUpperCase() + s.slice(1) : s; }
  function setStreak(v){ streak = Math.max(0,v); streakEl.textContent = String(streak); }

  // Build columns for desktop; build grid for mobile dynamically
  function renderChoices(){
    leftCol.innerHTML = ""; rightCol.innerHTML = "";
    const half = Math.ceil(characters.length / 2);
    const leftChars = characters.slice(0, half);
    const rightChars = characters.slice(half);

    const mkBtn = (name, idx) => {
      const b = document.createElement("button");
      b.className = "choice-btn";
      b.dataset.char = name;
      b.textContent = uc(name);
      b.setAttribute("aria-keyshortcuts", String((idx % 9) + 1)); // 1..9 hints
      b.addEventListener("click", () => choose(name));
      return b;
    };

    leftChars.forEach((n,i) => leftCol.appendChild(mkBtn(n,i)));
    rightChars.forEach((n,i) => rightCol.appendChild(mkBtn(n, i+leftChars.length)));

    // Everyone special
    if (hasEveryone) {
      everyoneWrap.classList.remove("hidden");
      btnEveryone.onclick = () => choose("everyone");
    } else {
      everyoneWrap.classList.add("hidden");
    }

    // Handle mobile: inject a single grid below the quote when in stacked mode
    const isMobile = window.matchMedia("(max-width: 900px)").matches;
    if (isMobile){
      if (!mobileGrid){
        mobileGrid = document.createElement("div");
        mobileGrid.className = "gw-choices-grid";
        // Insert after the quote figure
        const figure = document.querySelector(".gw-quote");
        figure.insertAdjacentElement("afterend", mobileGrid);
      }
      mobileGrid.innerHTML = "";
      characters.forEach((n,i)=> mobileGrid.appendChild(mkBtn(n,i)));
    } else if (mobileGrid){
      mobileGrid.remove();
      mobileGrid = null;
    }
  }

  function startRound(){
    const idx = pool.map((_,i)=>i).sort(()=>Math.random()-0.5);
    roundBag = idx.slice(0, Math.min(5, idx.length));
    roundPos = -1;
    setStreak(0);
    nextQuote();
  }

  function nextQuote(){
    roundPos += 1;
    // End of round -> reset with Play Again
    if (roundPos >= roundBag.length){
      textEl.textContent = "Round complete.";
      resultEl.textContent = "";
      messageEl.textContent = "";
      btnNext.textContent = "Play Again";
      btnNext.disabled = false;
      btnNext.onclick = () => { btnNext.textContent = "Next"; startRound(); };
      controls.classList.add("show");

      contentSection && contentSection.classList.add("cta-active");
      btnNext.textContent = "Play Again";
      btnNext.disabled = false;
      btnNext.onclick = () => { btnNext.textContent = "Next"; startRound(); };

      return;
    }

    hideNextCTA();        // hide bar until an answer is chosen
    btnNext.disabled = true;

    const idx = roundBag[roundPos];
    current = pool[idx];
    textEl.textContent = `“${current.text}”`;
    messageEl.textContent = current.message ? current.message : "";
    resultEl.textContent = "";
    clearMarks();
    btnNext.disabled = true;
    // Focus the first visible choice
    const firstBtn = document.querySelector(".choice-btn");
    (firstBtn).focus();


     // 👇 NEW: scroll back and focus stage
    const stage = document.getElementById("gw-stage");
    if (stage) {
      stage.scrollIntoView({ behavior: "smooth", block: "start" });
      // Give the browser a beat, then focus the quote
      setTimeout(() => {
        textEl.focus({ preventScroll: true });
      }, 400);
    }
  }

  function clearMarks(){
    [...document.querySelectorAll(".choice-btn")].forEach(b => b.classList.remove("correct","wrong"));
    if (btnEveryone) btnEveryone.classList.remove("correct","wrong");
  }

  function markCorrectWrong(choice){
    const correctChar = current.char;
    const mark = (btn, ok) => btn && btn.classList.add(ok ? "correct" : "wrong");

    if (correctChar === "everyone"){
      document.querySelectorAll(".choice-btn").forEach(b => mark(b, false));
      mark(btnEveryone, true);
    } else {
      const clicked = document.querySelector(`[data-char="${choice}"]`);
      const correctBtn = document.querySelector(`[data-char="${correctChar}"]`);
      if (choice === "everyone") mark(btnEveryone, false);
      mark(clicked, clicked && clicked.dataset.char === correctChar);
      mark(correctBtn, true);
    }
  }

  function choose(char){
    if (!current) return;
    const correct = char === current.char;
    markCorrectWrong(char);
    if (correct){
      setStreak(streak + 1);
      resultEl.textContent = `✅ Correct. ${current.message ?? ""} Click Next button to see the next quote`;
    } else {
      setStreak(0);
      resultEl.textContent = `❌ Nope, but maybe in the future?`;
    }
    btnNext.disabled = false;
    btnNext.focus();
    showNextCTA();
  }

  function reveal(){
    if (!current) return;
    markCorrectWrong("__reveal__");
    resultEl.textContent = `👉 Reveal: ${uc(current.char)}.`;
    setStreak(0);
    btnNext.disabled = false;
  }

  // Events
  btnNext.addEventListener("click", nextQuote);
  window.addEventListener("resize", renderChoices);

  // Keyboard: 1..9 map to visible order (left-to-right), 0 = Everyone, N = Next, R = Reveal
  document.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "0" && hasEveryone) return choose("everyone");
    const n = parseInt(k, 10);
    if (!Number.isNaN(n) && n >= 1){
      const list = [...document.querySelectorAll(".choice-btn")];
      const btn = list[n-1];
      if (btn) return choose(btn.dataset.char);
    }
    if (k === "n") return nextQuote();
    if (k === "r") return reveal();
  });

  // Initial render + auto-start
  renderChoices();
  startRound();
});