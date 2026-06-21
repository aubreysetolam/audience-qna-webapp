/* ─── AskUp — Frontend App ───────────────────────────────────── */

const API_BASE = '/api';

/* ─── Voter fingerprint ──────────────────────────────────────── */
// A lightweight, privacy-safe device fingerprint stored in sessionStorage
// so the same tab session can track which questions they've upvoted.
function getFingerprint() {
  const KEY = 'askup_fp';
  let fp = sessionStorage.getItem(KEY);
  if (!fp) {
    fp = 'fp_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(KEY, fp);
  }
  return fp;
}

/* ─── Utilities ──────────────────────────────────────────────── */
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function showEl(el) { el.hidden = false; }
function hideEl(el) { el.hidden = true; }

/* ══════════════════════════════════════════════════════════════
   SUBMIT PAGE
══════════════════════════════════════════════════════════════ */
if (document.getElementById('questionForm')) {
  const form       = document.getElementById('questionForm');
  const textArea   = document.getElementById('questionText');
  const charCount  = document.getElementById('charCount');
  const topicSel   = document.getElementById('topicSelect');
  const authorIn   = document.getElementById('authorName');
  const submitBtn  = document.getElementById('submitBtn');
  const formError  = document.getElementById('formError');
  const formCard   = document.querySelector('.form-card');
  const successCard = document.getElementById('successCard');
  const anotherBtn = document.getElementById('submitAnother');

  // Live char counter
  textArea.addEventListener('input', () => {
    const len = textArea.value.length;
    charCount.textContent = len;
    charCount.style.color = len > 450
      ? (len >= 500 ? '#ff8080' : '#f0a500')
      : 'var(--text-3)';
  });

  function showError(msg) {
    formError.textContent = msg;
    showEl(formError);
  }
  function clearError() { hideEl(formError); }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    const text   = textArea.value.trim();
    const topic  = topicSel.value;
    const author = authorIn.value.trim() || null;

    if (!text) return showError('Please enter your question.');
    if (!topic) return showError('Please select a topic.');

    submitBtn.disabled = true;
    submitBtn.querySelector('.btn-text').textContent = 'Submitting…';

    try {
      const res = await fetch(`${API_BASE}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, topic, author })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Submission failed');
      }

      // Show success
      hideEl(formCard);
      showEl(successCard);
    } catch (err) {
      showError(err.message || 'Something went wrong. Please try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.querySelector('.btn-text').textContent = 'Submit question';
    }
  });

  anotherBtn?.addEventListener('click', () => {
    form.reset();
    charCount.textContent = '0';
    clearError();
    hideEl(successCard);
    showEl(formCard);
    textArea.focus();
  });
}

/* ══════════════════════════════════════════════════════════════
   FEED PAGE
══════════════════════════════════════════════════════════════ */
if (document.getElementById('questionsList')) {
  const listEl        = document.getElementById('questionsList');
  const emptyEl       = document.getElementById('emptyState');
  const countEl       = document.getElementById('questionCount');
  const topicFilter   = document.getElementById('topicFilter');
  const sortTabs      = document.querySelectorAll('.sort-tab');
  const template      = document.getElementById('questionTemplate');

  const fingerprint   = getFingerprint();
  let questions       = [];
  let votedIds        = new Set();
  let currentSort     = 'votes';
  let currentTopic    = '';
  let pollingTimer    = null;

  /* ── Fetch voted IDs ──────────────────────────────────────── */
  async function loadMyVotes() {
    try {
      const res = await fetch(`${API_BASE}/votes/my-votes?fingerprint=${fingerprint}`);
      if (res.ok) {
        const data = await res.json();
        votedIds = new Set(data.votedQuestionIds);
      }
    } catch (_) { /* non-critical */ }
  }

  /* ── Fetch & populate topics dropdown ─────────────────────── */
  async function loadTopics() {
    try {
      const res = await fetch(`${API_BASE}/questions/topics`);
      if (!res.ok) return;
      const { topics } = await res.json();

      // Keep existing selection
      const current = topicFilter.value;

      // Clear all except "All topics"
      while (topicFilter.options.length > 1) topicFilter.remove(1);

      topics.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        topicFilter.appendChild(opt);
      });

      if (current) topicFilter.value = current;
    } catch (_) {}
  }

  /* ── Fetch questions ───────────────────────────────────────── */
  async function loadQuestions() {
    const params = new URLSearchParams({ sort: currentSort });
    if (currentTopic) params.set('topic', currentTopic);

    try {
      const res = await fetch(`${API_BASE}/questions?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      questions = data.questions || [];
      renderQuestions();
    } catch (_) {}
  }

  /* ── Render ────────────────────────────────────────────────── */
  function renderQuestions() {
    listEl.innerHTML = '';

    if (questions.length === 0) {
      countEl.textContent = '0 questions';
      hideEl(listEl);
      showEl(emptyEl);
      return;
    }

    showEl(listEl);
    hideEl(emptyEl);
    countEl.textContent = `${questions.length} question${questions.length !== 1 ? 's' : ''}`;

    questions.forEach((q, i) => {
      const node = template.content.cloneNode(true);
      const card = node.querySelector('.question-card');

      card.dataset.id = q.id;
      card.style.animationDelay = `${i * 30}ms`;

      const voteBtn   = card.querySelector('.vote-btn');
      const voteCount = card.querySelector('.vote-count');
      const qText     = card.querySelector('.question-text');
      const qTopic    = card.querySelector('.question-topic');
      const qAuthor   = card.querySelector('.question-author');
      const qTime     = card.querySelector('.question-time');

      qText.textContent   = q.text;
      qTopic.textContent  = q.topic;
      qAuthor.textContent = q.author || 'Anonymous';
      qTime.textContent   = timeAgo(q.created_at);
      voteCount.textContent = q.vote_count;

      if (votedIds.has(q.id)) {
        voteBtn.classList.add('voted');
        voteBtn.setAttribute('aria-label', 'Remove upvote');
      }

      voteBtn.addEventListener('click', () => handleVote(q.id, voteBtn, voteCount));

      listEl.appendChild(node);
    });
  }

  /* ── Vote handler ─────────────────────────────────────────── */
  async function handleVote(questionId, btn, countEl) {
    const hasVoted = votedIds.has(questionId);
    const action   = hasVoted ? 'remove' : 'upvote';
    const delta    = hasVoted ? -1 : 1;

    // Optimistic update
    const current = parseInt(countEl.textContent, 10);
    countEl.textContent = Math.max(0, current + delta);
    if (hasVoted) {
      votedIds.delete(questionId);
      btn.classList.remove('voted');
      btn.setAttribute('aria-label', 'Upvote');
    } else {
      votedIds.add(questionId);
      btn.classList.add('voted');
      btn.setAttribute('aria-label', 'Remove upvote');
    }

    btn.disabled = true;

    try {
      const res = await fetch(`${API_BASE}/votes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, fingerprint, action })
      });

      if (!res.ok) {
        // Revert on failure
        countEl.textContent = current;
        if (hasVoted) {
          votedIds.add(questionId);
          btn.classList.add('voted');
        } else {
          votedIds.delete(questionId);
          btn.classList.remove('voted');
        }
      } else {
        // Update the in-memory question list too
        const q = questions.find(q => q.id === questionId);
        if (q) q.vote_count = Math.max(0, q.vote_count + delta);

        // Re-sort if in votes mode (soft update — just reorder)
        if (currentSort === 'votes') {
          setTimeout(() => loadQuestions(), 800);
        }
      }
    } catch (_) {
      // Revert
      countEl.textContent = current;
    } finally {
      btn.disabled = false;
    }
  }

  /* ── Sort tabs ─────────────────────────────────────────────── */
  sortTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      sortTabs.forEach(t => t.classList.remove('sort-tab--active'));
      tab.classList.add('sort-tab--active');
      currentSort = tab.dataset.sort;
      loadQuestions();
    });
  });

  /* ── Topic filter ──────────────────────────────────────────── */
  topicFilter.addEventListener('change', () => {
    currentTopic = topicFilter.value;
    loadQuestions();
  });

  /* ── Auto-refresh every 10s ────────────────────────────────── */
  function startPolling() {
    pollingTimer = setInterval(async () => {
      await loadTopics();
      await loadQuestions();
    }, 10000);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInterval(pollingTimer);
    } else {
      loadTopics();
      loadQuestions();
      startPolling();
    }
  });

  /* ── Boot ──────────────────────────────────────────────────── */
  (async () => {
    await loadMyVotes();
    await loadTopics();
    await loadQuestions();
    startPolling();
  })();
}
