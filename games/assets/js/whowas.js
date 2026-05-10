document.addEventListener("DOMContentLoaded", () => {
  const QUESTIONS = [
    {
      text: "Finished reading the whole book after playing two games in the evening",
      choices: ["Tommy the Goalie", "Stephanie", "Karen", "Dale"],
      answer: 0,
      win_text: "Tommy the Goalie had another game the next day, yet he stayed up until 4AM reading the book. Those crazy goalies!"
    },
    {
      text: "Did not like their anonymized name",
      choices: ["Don", "Tommy the Goalie", "Karen", "Rob"],
      answer: 2,
      win_text: "Karen actually didn't understand it at first. It was her family who pointed it out. So now I call her Karen every once in a while just for fun."
    },
    {
      text: "Has taken over finances",
      choices: ["Stephanie", "Brent", "Dale", "Mike"],
      answer: 1,
      win_text: "Brent had taken over the finances. Of course, if there was anyone I won't feel guilty about dumping a lot of work on, it'd be Brent."
    },
    {
      text: "Counted the number of mentions each character got",
      choices: ["Tommy the Goalie", "Dale", "Mike", "Stephanie"],
      answer: 1,
      win_text: "Of course it was Dale. Would anyone else do such a tedious task?"
    },
    {
      text: "Became the leading scorer in my league",
      choices: ["Pete", "Don", "Ricky", "Aiden", "Jack"],
      answer: 4,
      win_text: "Technically I don't really know if anyone else became the leading scorer, but Jack was called the \"Sniper\" in the book, so I paid attention."
    }
  ];

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const ROUND_SIZE = 5;
  const WRONG_MSGS = ["❌ No, it was another person.", "❌ No, try picking another person."];
  let wrongIndex = 0;
  let pool = [];
  let index = 0;
  let current = null;

  const questionEl = document.getElementById("whowas-question");
  const choicesEl  = document.getElementById("whowas-choices");
  const resultEl   = document.getElementById("whowas-result");
  const nextBtn    = document.getElementById("whowas-next");

  function startRound() {
    pool  = shuffle(QUESTIONS).slice(0, ROUND_SIZE);
    index = 0;
    showQuestion();
  }

  function showQuestion() {
    current = pool[index];
    questionEl.textContent = current.text;
    resultEl.textContent   = "";
    resultEl.classList.add("hidden");
    nextBtn.classList.add("hidden");
    wrongIndex = 0;

    choicesEl.innerHTML = "";
    current.choices.forEach((choice, i) => {
      const btn = document.createElement("button");
      btn.className   = "button";
      btn.textContent = choice;
      btn.addEventListener("click", () => checkAnswer(i, btn));
      choicesEl.appendChild(btn);
    });

    choicesEl.querySelector("button").focus();
  }

  function checkAnswer(i, btn) {
    if (i === current.answer) {
      resultEl.textContent = "✅ " + current.win_text;
      resultEl.classList.remove("hidden");
      choicesEl.querySelectorAll("button").forEach(b => { b.disabled = true; });
      index++;
      nextBtn.textContent = index >= pool.length ? "Play Again" : "Next Question";
      nextBtn.classList.remove("hidden");
      nextBtn.focus();
    } else {
      resultEl.textContent = WRONG_MSGS[wrongIndex % WRONG_MSGS.length];
      wrongIndex++;
      resultEl.classList.remove("hidden");
      btn.disabled = true;
    }
  }

  nextBtn.addEventListener("click", () => {
    if (index >= pool.length) {
      startRound();
    } else {
      showQuestion();
    }
  });

  startRound();
});
