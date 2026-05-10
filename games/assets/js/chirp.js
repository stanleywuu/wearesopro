document.addEventListener("DOMContentLoaded", () => {
  const quotes = [
    { text: "Here, try some smelling salts.", target: "both", message: "If smelling salts wake you up, why not try them for work?" },
    { text: "Flip it over! Flip it over!", target: "mate", message: "I have yet to see someone flipping the puck over the net." },
    { text: "I just bought 3.5 kg of chocolate. Help?", target: "both", message: "I did, it didn't last very long." },
    { text: "Your mother will teach me how to skate.", target: "dog", message: "Yep, I made mom jokes to my ex-boss." },
    { text: "Parkour! Parkour!", target: "mate", message: "Jumping over the boards in style." },
    { text: "I've already spent my weekend on this. Can't back out now.", target: "dog", message: "When the boss booked a two-hour meeting for your birthday special." },
    { text: "Your cousin played in the NHL. Doesn't it make you feel inadequate?", target: "dog" },
    { text: "Try some of my jungle juice.", target: "mate", message: "Makes you skate faster." },
    { text: "Fight! Fight! Fight! Fight!", target: "both", message: "Of course this was both, was there ever any doubt?" },
    { text: "Every hockey session means one less session for the rest of my life.", target: "both", message: "It sounds so profound, yet so pointless." },
  ];

  const textEl = document.getElementById("chirp-text");
  const resultEl = document.getElementById("chirp-result");
  const nextBtn = document.getElementById("chirp-next");
  const btnDog = document.getElementById("chirp-dog");
  const btnMate = document.getElementById("chirp-mate");
  const btnBoth = document.getElementById("chirp-both");

  let current = null;
  let index = 0;

  function newQuote() {
    current = quotes[index]
    textEl.textContent = current.text;
    resultEl.classList.add("hidden");
    nextBtn.classList.add("hidden");
    btnDog.focus();

    index +=1;
    if (index > quotes.length) {
      nextBtn.text = "That's all, folks"
      return;
    }
  }

  function checkAnswer(choice) {
    if (!current) return;
    const ok = choice === current.target;
    resultEl.textContent = ok ? `✅ ${current.message ?? "Correct!"}` : `❌ Nope, try again`;
    resultEl.classList.remove("hidden");
    nextBtn.classList.remove("hidden");
  }

  btnDog.addEventListener("click", () => checkAnswer("dog"));
  btnMate.addEventListener("click", () => checkAnswer("mate"));
  btnBoth.addEventListener("click", () => checkAnswer("both"));
  nextBtn.addEventListener("click", newQuote);

  document.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "d") checkAnswer("dog");
    if (k === "m") checkAnswer("mate");
    if (k === "n" && !nextBtn.classList.contains("hidden")) newQuote();
  });

  newQuote();
});