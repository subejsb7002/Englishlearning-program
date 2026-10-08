const sentenceInput = document.getElementById('sentenceInput');
const highlightedText = document.getElementById('highlightedText');
const checkBtn = document.getElementById('checkBtn');
const optimizeBtn = document.getElementById('optimizeBtn');
const editBtn = document.getElementById('editBtn');
const resultPanel = document.getElementById('resultPanel');
const statsEl = document.getElementById('stats');

let currentErrors = [];
let currentText = '';

const TYPE_NAMES = {
  grammar: '语法错误',
  spelling: '拼写错误',
  usage: '用法不当',
};

// ==================== 检查语法 ====================
checkBtn.addEventListener('click', async () => {
  const text = sentenceInput.value;
  if (!text.trim()) return;

  currentText = text;
  checkBtn.disabled = true;
  optimizeBtn.disabled = true;
  checkBtn.textContent = '分析中...';
  resultPanel.innerHTML = '<div class="empty-state"><p>🧠 AI 正在分析...</p></div>';

  try {
    const res = await fetch('/api/check-grammar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    currentErrors = data.errors || [];
    renderHighlighted();
    renderStats();
    switchToViewMode();

    if (currentErrors.length === 0) {
      resultPanel.innerHTML = `
        <div class="empty-state">
          <p style="color:#27ae60;font-size:36px;">✅</p>
          <p style="color:#27ae60;font-size:16px;">未发现任何错误，写得很好！</p>
        </div>`;
    } else {
      resultPanel.innerHTML = `
        <div class="empty-state">
          <p>共发现 <strong style="color:#4a90d9;">${currentErrors.length}</strong> 处问题</p>
          <p class="hint">点击左侧任意高亮色块查看详细分析</p>
        </div>`;
    }
  } catch (err) {
    resultPanel.innerHTML = `<div class="empty-state"><p style="color:#e74c3c;">请求失败：${err.message}</p></div>`;
  } finally {
    checkBtn.disabled = false;
    optimizeBtn.disabled = false;
    checkBtn.textContent = '🔍 检查语法';
  }
});

// ==================== 优化表达 ====================
optimizeBtn.addEventListener('click', async () => {
  const text = sentenceInput.value;
  if (!text.trim()) return;

  currentText = text;
  optimizeBtn.disabled = true;
  checkBtn.disabled = true;
  optimizeBtn.textContent = '优化中...';
  resultPanel.innerHTML = '<div class="empty-state"><p>✨ AI 正在润色...</p></div>';

  try {
    const res = await fetch('/api/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    switchToViewMode();
    highlightedText.innerHTML = escapeHtml(currentText);
    statsEl.innerHTML = '';
    renderOptimizeResult(data);
  } catch (err) {
    resultPanel.innerHTML = `<div class="empty-state"><p style="color:#e74c3c;">优化失败：${err.message}</p></div>`;
  } finally {
    optimizeBtn.disabled = false;
    checkBtn.disabled = false;
    optimizeBtn.textContent = '✨ 优化表达';
  }
});

// ==================== 重新编辑 ====================
editBtn.addEventListener('click', () => {
  highlightedText.style.display = 'none';
  sentenceInput.style.display = 'block';
  checkBtn.style.display = 'block';
  optimizeBtn.style.display = 'block';
  editBtn.style.display = 'none';
  statsEl.innerHTML = '';
  resultPanel.innerHTML = `
    <div class="empty-state">
      <p>点击左侧按钮后，结果将显示在这里</p>
      <p class="hint">检查后点击高亮色块查看详情；优化后查看高级版本</p>
    </div>`;
});

function switchToViewMode() {
  sentenceInput.style.display = 'none';
  highlightedText.style.display = 'block';
  checkBtn.style.display = 'none';
  optimizeBtn.style.display = 'none';
  editBtn.style.display = 'block';
}

// ==================== 渲染高亮 ====================
function renderHighlighted() {
  const errors = [...currentErrors].sort((a, b) => a.start - b.start);
  let html = '';
  let cursor = 0;
  for (let i = 0; i < errors.length; i++) {
    const err = errors[i];
    if (err.start < cursor) continue;
    html += escapeHtml(currentText.slice(cursor, err.start));
    html += `<span class="hl hl-${err.type}" data-idx="${i}">${escapeHtml(currentText.slice(err.start, err.end))}</span>`;
    cursor = err.end;
  }
  html += escapeHtml(currentText.slice(cursor));
  highlightedText.innerHTML = html;
}

// ==================== 点击高亮看详情 ====================
highlightedText.addEventListener('click', (e) => {
  const span = e.target.closest('.hl');
  if (!span) return;
  highlightedText.querySelectorAll('.hl.active').forEach(el => el.classList.remove('active'));
  span.classList.add('active');
  const idx = parseInt(span.dataset.idx, 10);
  const err = currentErrors[idx];
  if (!err) return;
  showDetail(err);
});

function showDetail(err) {
  const typeName = TYPE_NAMES[err.type] || err.type;
  resultPanel.innerHTML = `
    <div class="detail-card type-${err.type}">
      <div class="detail-type">${typeName}</div>
      <div class="detail-section">
        <div class="detail-label">原文</div>
        <div class="detail-original">${escapeHtml(err.original_text)}</div>
      </div>
      ${err.suggestion ? `
      <div class="detail-section">
        <div class="detail-label">建议修改为</div>
        <div class="detail-suggestion">${escapeHtml(err.suggestion)}</div>
      </div>` : ''}
      ${err.explanation ? `
      <div class="detail-section">
        <div class="detail-label">原因说明</div>
        <div class="detail-explanation">${escapeHtml(err.explanation)}</div>
      </div>` : ''}
    </div>`;
}

// ==================== 统计条 ====================
function renderStats() {
  const counts = { grammar: 0, spelling: 0, usage: 0 };
  currentErrors.forEach(e => { if (counts[e.type] !== undefined) counts[e.type]++; });
  const parts = [];
  if (counts.grammar)  parts.push(`<span><span class="dot grammar"></span>${counts.grammar} 处语法</span>`);
  if (counts.spelling) parts.push(`<span><span class="dot spelling"></span>${counts.spelling} 处拼写</span>`);
  if (counts.usage)    parts.push(`<span><span class="dot usage"></span>${counts.usage} 处用法</span>`);
  statsEl.innerHTML = parts.join('');
}

// ==================== 渲染优化结果 ====================
function renderOptimizeResult(data) {
  const { optimized, changes, truncated } = data;
  let html = '';

  if (truncated) {
    html += `<div class="warn-banner">⚠️ 文本过长，仅对前 6000 个字符进行了优化。</div>`;
  }

  html += `
    <div class="optimized-card">
      <div class="optimized-header">
        <div class="optimized-title">✨ 优化后</div>
        <button class="copy-btn" id="copyOptimizedBtn">📋 复制</button>
      </div>
      <div class="optimized-text">${escapeHtml(optimized)}</div>
    </div>`;

  if (changes && changes.length > 0) {
    html += `<div class="changes-title">共 ${changes.length} 处优化</div>`;
    changes.forEach((c) => {
      html += `
        <div class="change-card">
          <div class="change-row">
            <span class="change-tag from">原文</span>
            <span>${escapeHtml(c.original)}</span>
          </div>
          <div class="change-row">
            <span class="change-tag to">优化</span>
            <span>${escapeHtml(c.optimized)}</span>
          </div>
          ${c.reason ? `<div class="change-reason">${escapeHtml(c.reason)}</div>` : ''}
        </div>`;
    });
  } else {
    html += `<div class="changes-title" style="text-align:center;color:#999;">原文表达已足够地道，未做改动</div>`;
  }

  resultPanel.innerHTML = html;

  const copyBtn = document.getElementById('copyOptimizedBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(optimized).then(() => {
        copyBtn.textContent = '✅ 已复制';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.textContent = '📋 复制';
          copyBtn.classList.remove('copied');
        }, 1500);
      }).catch(() => {
        copyBtn.textContent = '复制失败';
      });
    });
  }
}

// ==================== HTML 转义 ====================
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}