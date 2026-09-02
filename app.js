(function () {
  "use strict";

  const root = document.getElementById("screen-root");
  const QUESTION_COUNT = 10;
  const MATCH_PAIRS = 8;

  const state = {
    mode: null,
    questions: [],
    index: 0,
    correct: 0,
    review: [],
    match: null,
  };

  // ---------------- utilities ----------------
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function sample(arr, n) {
    return shuffle(arr).slice(0, n);
  }

  function normalize(str) {
    return str
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function acceptedAnswers(entry) {
    const set = new Set([normalize(entry.capital)]);
    (entry.alt || []).forEach((a) => set.add(normalize(a)));
    return set;
  }

  function bestScoreKey(mode) {
    return `wcq-best-${mode}`;
  }

  function getBest(mode) {
    return localStorage.getItem(bestScoreKey(mode));
  }

  function setBest(mode, value, total) {
    const key = bestScoreKey(mode);
    const current = getBest(mode);
    if (!current || value > parseInt(current, 10)) {
      localStorage.setItem(key, String(value));
    }
    localStorage.setItem(`${key}-total`, String(total));
  }

  function el(html) {
    const div = document.createElement("div");
    div.innerHTML = html.trim();
    return div.firstElementChild;
  }

  function noteChipHtml(entry) {
    const text = entry.changed || entry.watch || entry.note;
    if (!text) return "";
    const icon = entry.changed ? "&#9679;" : entry.watch ? "&#9650;" : "&#9432;";
    return `<div class="info-chip"><span class="info-chip__icon">${icon}</span><span>${text}</span></div>`;
  }

  // ---------------- screens ----------------
  function renderLanding() {
    state.mode = null;
    root.innerHTML = "";
    root.appendChild(
      el(`
      <section class="screen landing">
        <p class="landing__kicker">World Capitals</p>
        <h1 class="landing__title">How well do you know<br/><em>the world's capitals?</em></h1>
        <p class="landing__subtitle">${COUNTRIES.length} countries, current as of 2026 — including the capitals that have moved, split, or are still in transition. Choose how you'd like to be tested.</p>

        <div class="mode-grid">
          <button class="mode-card" data-mode="mcq">
            <span class="mode-card__num">01</span>
            <span class="mode-card__title">Multiple Choice</span>
            <span class="mode-card__desc">See a country, choose its capital from four options. The quickest way to test your instincts.</span>
            <span class="mode-card__cta">Begin &rarr;</span>
          </button>
          <button class="mode-card" data-mode="fill">
            <span class="mode-card__num">02</span>
            <span class="mode-card__title">Fill in the Blank</span>
            <span class="mode-card__desc">Type the capital from memory — no options, no hints. The purest test of recall.</span>
            <span class="mode-card__cta">Begin &rarr;</span>
          </button>
          <button class="mode-card" data-mode="match">
            <span class="mode-card__num">03</span>
            <span class="mode-card__title">Match the Pairs</span>
            <span class="mode-card__desc">Eight countries, eight capitals, shuffled. Click to connect each city to its country.</span>
            <span class="mode-card__cta">Begin &rarr;</span>
          </button>
        </div>
        <p class="landing__footnote">Data reflects official capitals as of August 2026, verified against current sources.</p>
      </section>
    `)
    );
    root.querySelectorAll(".mode-card").forEach((btn) => {
      btn.addEventListener("click", () => startQuiz(btn.dataset.mode));
    });
  }

  function quizHeaderHtml(modeLabel) {
    return `
      <div class="quiz-header">
        <div class="quiz-header__left">
          <span class="quiz-mode-label">${modeLabel}</span>
          <span class="quiz-progress-text" id="progress-text"></span>
        </div>
        <button class="exit-link" id="exit-btn">End Round</button>
      </div>
      <div class="progress-track"><div class="progress-fill" id="progress-fill"></div></div>
    `;
  }

  function bindExit() {
    const btn = document.getElementById("exit-btn");
    if (btn) btn.addEventListener("click", renderLanding);
  }

  function updateProgress(current, total) {
    const text = document.getElementById("progress-text");
    const fill = document.getElementById("progress-fill");
    if (text) text.textContent = `Question ${current} of ${total}`;
    if (fill) fill.style.width = `${((current - 1) / total) * 100}%`;
  }

  // ---------------- mode: multiple choice ----------------
  function startQuiz(mode) {
    state.mode = mode;
    state.index = 0;
    state.correct = 0;
    state.review = [];

    if (mode === "match") {
      startMatch();
      return;
    }

    state.questions = sample(COUNTRIES, QUESTION_COUNT);
    if (mode === "mcq") renderMCQ();
    else renderFill();
  }

  function renderMCQ() {
    const entry = state.questions[state.index];
    const distractors = sample(
      COUNTRIES.filter((c) => c.capital !== entry.capital),
      3
    ).map((c) => c.capital);
    const options = shuffle([entry.capital, ...distractors]);

    root.innerHTML = "";
    const wrap = el(`
      <section class="screen">
        ${quizHeaderHtml("Multiple Choice")}
        <div class="question-block">
          <p class="question-eyebrow">What is the capital of</p>
          <h2 class="question-title"><span class="flag">${flagEmoji(entry.cc)}</span>${entry.country}</h2>
          <div class="options-grid" id="options"></div>
          <div id="chip-holder"></div>
        </div>
      </section>
    `);
    root.appendChild(wrap);
    bindExit();
    updateProgress(state.index + 1, state.questions.length);

    const optionsEl = wrap.querySelector("#options");
    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "option-btn";
      btn.textContent = opt;
      btn.addEventListener("click", () => handleMCQAnswer(btn, opt, entry, optionsEl));
      optionsEl.appendChild(btn);
    });
  }

  function handleMCQAnswer(btn, chosen, entry, optionsEl) {
    const correct = chosen === entry.capital;
    optionsEl.querySelectorAll(".option-btn").forEach((b) => {
      b.disabled = true;
      if (b.textContent === entry.capital) b.classList.add("correct");
      else if (b === btn && !correct) b.classList.add("incorrect");
    });

    if (correct) state.correct++;
    else state.review.push({ country: entry.country, capital: entry.capital, wrong: chosen });

    const chipHolder = document.getElementById("chip-holder");
    const chip = noteChipHtml(entry);
    if (chip) chipHolder.innerHTML = chip;

    setTimeout(() => advance(), chip ? 2200 : 900);
  }

  // ---------------- mode: fill in the blank ----------------
  function renderFill() {
    const entry = state.questions[state.index];
    root.innerHTML = "";
    const wrap = el(`
      <section class="screen">
        ${quizHeaderHtml("Fill in the Blank")}
        <div class="question-block">
          <p class="question-eyebrow">Type the capital of</p>
          <h2 class="question-title"><span class="flag">${flagEmoji(entry.cc)}</span>${entry.country}</h2>
          <form class="fill-form" id="fill-form" autocomplete="off">
            <input class="fill-input" id="fill-input" type="text" placeholder="Your answer" autofocus />
            <p class="fill-feedback" id="fill-feedback"></p>
            <button class="primary-btn" type="submit" id="fill-submit">Submit</button>
          </form>
          <div id="chip-holder"></div>
        </div>
      </section>
    `);
    root.appendChild(wrap);
    bindExit();
    updateProgress(state.index + 1, state.questions.length);

    const form = wrap.querySelector("#fill-form");
    const input = wrap.querySelector("#fill-input");
    let answered = false;

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (answered) {
        advance();
        return;
      }
      answered = true;
      const accepted = acceptedAnswers(entry);
      const userVal = input.value;
      const correct = accepted.has(normalize(userVal));
      input.disabled = true;
      input.classList.add(correct ? "correct" : "incorrect");

      const feedback = wrap.querySelector("#fill-feedback");
      if (correct) {
        state.correct++;
        feedback.innerHTML = `Correct.`;
      } else {
        state.review.push({ country: entry.country, capital: entry.capital, wrong: userVal || "(blank)" });
        feedback.innerHTML = `The capital is <span class="answer">${entry.capital}</span>.`;
      }

      const chipHolder = wrap.querySelector("#chip-holder");
      const chip = noteChipHtml(entry);
      if (chip) chipHolder.innerHTML = chip;

      wrap.querySelector("#fill-submit").textContent =
        state.index + 1 < state.questions.length ? "Next" : "See Results";
    });
  }

  function advance() {
    state.index++;
    if (state.index >= state.questions.length) {
      showResults();
    } else if (state.mode === "mcq") {
      renderMCQ();
    } else {
      renderFill();
    }
  }

  // ---------------- mode: match ----------------
  function startMatch() {
    const picks = sample(COUNTRIES, MATCH_PAIRS);
    state.match = {
      countries: shuffle(picks),
      capitals: shuffle(picks),
      matched: new Set(),
      selectedCountry: null,
      selectedCapital: null,
      mistakes: 0,
    };
    renderMatch();
  }

  function renderMatch() {
    const m = state.match;
    root.innerHTML = "";
    const wrap = el(`
      <section class="screen">
        ${quizHeaderHtml("Match the Pairs")}
        <p class="match-instructions">Select a country, then select its capital. Matched pairs lock in place.</p>
        <div class="match-grid">
          <div>
            <p class="match-col-label">Country</p>
            <div class="match-list" id="country-list"></div>
          </div>
          <div>
            <p class="match-col-label">Capital</p>
            <div class="match-list" id="capital-list"></div>
          </div>
        </div>
      </section>
    `);
    root.appendChild(wrap);
    bindExit();

    const progressText = document.getElementById("progress-text");
    const progressFill = document.getElementById("progress-fill");
    progressText.textContent = `${m.matched.size} of ${MATCH_PAIRS} matched`;
    progressFill.style.width = `${(m.matched.size / MATCH_PAIRS) * 100}%`;

    const countryList = wrap.querySelector("#country-list");
    const capitalList = wrap.querySelector("#capital-list");

    m.countries.forEach((entry) => {
      const item = document.createElement("div");
      item.className = "match-item";
      item.textContent = `${flagEmoji(entry.cc)} ${entry.country}`;
      item.dataset.key = entry.country;
      if (m.matched.has(entry.country)) item.classList.add("matched");
      item.addEventListener("click", () => selectMatch("country", entry, item));
      countryList.appendChild(item);
    });

    m.capitals.forEach((entry) => {
      const item = document.createElement("div");
      item.className = "match-item";
      item.textContent = entry.capital;
      item.dataset.key = entry.country;
      if (m.matched.has(entry.country)) item.classList.add("matched");
      item.addEventListener("click", () => selectMatch("capital", entry, item));
      capitalList.appendChild(item);
    });
  }

  function selectMatch(side, entry, itemEl) {
    const m = state.match;
    if (m.matched.has(entry.country)) return;

    if (side === "country") {
      if (m.selectedCountry) m.selectedCountry.el.classList.remove("selected");
      m.selectedCountry = { entry, el: itemEl };
      itemEl.classList.add("selected");
    } else {
      if (m.selectedCapital) m.selectedCapital.el.classList.remove("selected");
      m.selectedCapital = { entry, el: itemEl };
      itemEl.classList.add("selected");
    }

    if (m.selectedCountry && m.selectedCapital) {
      const isMatch = m.selectedCountry.entry.country === m.selectedCapital.entry.country;
      if (isMatch) {
        m.matched.add(m.selectedCountry.entry.country);
        m.selectedCountry.el.classList.remove("selected");
        m.selectedCapital.el.classList.remove("selected");
        m.selectedCountry.el.classList.add("matched");
        m.selectedCapital.el.classList.add("matched");
        m.selectedCountry = null;
        m.selectedCapital = null;

        const progressText = document.getElementById("progress-text");
        const progressFill = document.getElementById("progress-fill");
        progressText.textContent = `${m.matched.size} of ${MATCH_PAIRS} matched`;
        progressFill.style.width = `${(m.matched.size / MATCH_PAIRS) * 100}%`;

        if (m.matched.size === MATCH_PAIRS) {
          state.correct = MATCH_PAIRS;
          setTimeout(() => showResults(), 500);
        }
      } else {
        m.mistakes++;
        const cEl = m.selectedCountry.el;
        const kEl = m.selectedCapital.el;
        cEl.classList.add("wrong-flash");
        kEl.classList.add("wrong-flash");
        setTimeout(() => {
          cEl.classList.remove("wrong-flash", "selected");
          kEl.classList.remove("wrong-flash", "selected");
        }, 450);
        m.selectedCountry = null;
        m.selectedCapital = null;
      }
    }
  }

  // ---------------- results ----------------
  function showResults() {
    const total = state.mode === "match" ? MATCH_PAIRS : state.questions.length;
    const correct = state.mode === "match" ? MATCH_PAIRS : state.correct;
    const modeLabels = { mcq: "Multiple Choice", fill: "Fill in the Blank", match: "Match the Pairs" };

    setBest(state.mode, correct, total);
    const bestVal = getBest(state.mode);
    const bestTotal = localStorage.getItem(`${bestScoreKey(state.mode)}-total`) || total;

    let extra = "";
    if (state.mode === "match") {
      extra = `<p class="results__best">${state.match.mistakes} mistake${state.match.mistakes === 1 ? "" : "s"} along the way</p>`;
    } else if (bestVal) {
      extra = `<p class="results__best">Best round: ${bestVal} / ${bestTotal}</p>`;
    }

    root.innerHTML = "";
    const wrap = el(`
      <section class="screen results">
        <p class="results__kicker">${modeLabels[state.mode]} — Complete</p>
        <div class="results__score">${correct}<span>/${total}</span></div>
        <p class="results__label">${scoreLabel(correct, total)}</p>
        ${extra}
        <div class="results__actions">
          <button class="primary-btn" id="again-btn">Play Again</button>
          <button class="ghost-btn" id="switch-btn">Choose Another Mode</button>
        </div>
        ${state.review.length ? reviewHtml() : ""}
      </section>
    `);
    root.appendChild(wrap);

    wrap.querySelector("#again-btn").addEventListener("click", () => startQuiz(state.mode));
    wrap.querySelector("#switch-btn").addEventListener("click", renderLanding);
  }

  function scoreLabel(correct, total) {
    const pct = correct / total;
    if (pct === 1) return "Flawless round.";
    if (pct >= 0.8) return "Excellent grasp of the map.";
    if (pct >= 0.6) return "Solid — a few gaps to close.";
    if (pct >= 0.4) return "Getting there.";
    return "Time to study the atlas.";
  }

  function reviewHtml() {
    const items = state.review
      .map(
        (r) => `
        <div class="review-item">
          <span class="country">${r.country}</span>
          <span><span class="wrong">${r.wrong}</span><span class="capital">${r.capital}</span></span>
        </div>`
      )
      .join("");
    return `<div class="review-list"><p class="review-title">Review</p>${items}</div>`;
  }

  // ---------------- news banner ----------------
  function initNewsBanner() {
    const flagEl = document.getElementById("banner-flag");
    const textEl = document.getElementById("banner-text");
    const barFill = document.getElementById("banner-bar-fill");
    if (!flagEl || !textEl) return;

    let order = shuffle(FACTS);
    let i = 0;

    function show(fact) {
      textEl.classList.add("fade");
      setTimeout(() => {
        flagEl.textContent = flagEmoji(fact.cc);
        textEl.innerHTML = `<span class="country">${fact.country}.</span> ${fact.text}`;
        textEl.classList.remove("fade");
      }, 260);

      if (barFill) {
        barFill.classList.remove("animate");
        void barFill.offsetWidth;
        barFill.classList.add("animate");
      }
    }

    show(order[i]);

    setInterval(() => {
      i++;
      if (i >= order.length) {
        order = shuffle(FACTS);
        i = 0;
      }
      show(order[i]);
    }, 15000);
  }

  // ---------------- footer: last verified + changelog ----------------
  function initFooter() {
    const verifiedEl = document.getElementById("last-verified");
    const toggle = document.getElementById("changelog-toggle");
    const panel = document.getElementById("changelog-panel");
    if (!verifiedEl || !toggle || !panel) return;

    const verifiedDate = new Date(LAST_VERIFIED + "T00:00:00");
    verifiedEl.textContent = verifiedDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    panel.innerHTML = CHANGELOG.slice()
      .reverse()
      .map((entry) => {
        const d = new Date(entry.date + "T00:00:00").toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        return `<div class="changelog-item"><span class="date">${d}</span><span class="text">${entry.text}</span></div>`;
      })
      .join("");

    toggle.addEventListener("click", () => {
      const isHidden = panel.classList.contains("hidden");
      panel.classList.toggle("hidden");
      toggle.textContent = isHidden ? "Hide changelog" : "View changelog";
    });
  }

  // ---------------- boot ----------------
  document.addEventListener("DOMContentLoaded", () => {
    initNewsBanner();
    initFooter();
    renderLanding();
  });
})();
