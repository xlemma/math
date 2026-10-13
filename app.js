// =============================================================
// 数学口算闪算练习逻辑 (点击下一题时自动静默同步到数据库)
// =============================================================

const SUPABASE_URL = 'https://whqpuzxfheqwaniuqbbz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_8eE1_U1jpk5G_tHcVtAjFg_Pz7lG9Q_';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let displayProblems = [];
let isWrongView = false;
let currentProblemIndex = 0;

// 状态映射: key -> { isCorrect: null/true/false, isUnder2s: false }
const stateMap = new Map();

// 计时器变量
let timerInterval = null;
let timeLeft = 0;
let isPaused = false;

// DOM 元素
const levelSelect = document.getElementById('levelSelect');
const problemsContainer = document.getElementById('problemsContainer');
const wrongProblemsBtn = document.getElementById('wrongProblemsBtn');
const statusMsg = document.getElementById('statusMsg');

const customMinutesInput = document.getElementById('customMinutesInput');
const startTimerBtn = document.getElementById('startTimerBtn');
const pauseTimerBtn = document.getElementById('pauseTimerBtn');
const stopTimerBtn = document.getElementById('stopTimerBtn');
const timerBadge = document.getElementById('timerBadge');
const timeUpModal = document.getElementById('timeUpModal');
const closeModalBtn = document.getElementById('closeModalBtn');

// =============================================================
// 计时器控制
// =============================================================
function startTimer() {
  if (!customMinutesInput) return;
  if (isPaused && timeLeft > 0) {
    isPaused = false;
    pauseTimerBtn.textContent = '暂停';
    timerInterval = setInterval(ticker, 1000);
    return;
  }
  const minutes = Number(customMinutesInput.value) || 3;
  if (timerInterval) clearInterval(timerInterval);
  
  timeLeft = minutes * 60;
  isPaused = false;
  pauseTimerBtn.disabled = false;
  pauseTimerBtn.textContent = '暂停';
  updateTimerBadge();
  timerInterval = setInterval(ticker, 1000);
}

function ticker() {
  timeLeft--;
  updateTimerBadge();
  if (timeLeft <= 0) {
    clearInterval(timerInterval);
    timerInterval = null;
    pauseTimerBtn.disabled = true;
    if (timeUpModal) timeUpModal.style.display = 'flex';
  }
}

function pauseTimer() {
  if (!timerInterval && !isPaused) return;
  if (!isPaused) {
    clearInterval(timerInterval);
    timerInterval = null;
    isPaused = true;
    pauseTimerBtn.textContent = '继续';
  } else {
    startTimer();
  }
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  timeLeft = 0;
  isPaused = false;
  pauseTimerBtn.disabled = true;
  pauseTimerBtn.textContent = '暂停';
  updateTimerBadge();
}

function updateTimerBadge() {
  if (!timerBadge) return;
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  timerBadge.textContent = `⏱️ ${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

if (closeModalBtn) closeModalBtn.addEventListener('click', () => { if (timeUpModal) timeUpModal.style.display = 'none'; });
if (startTimerBtn) startTimerBtn.addEventListener('click', startTimer);
if (pauseTimerBtn) pauseTimerBtn.addEventListener('click', pauseTimer);
if (stopTimerBtn) stopTimerBtn.addEventListener('click', stopTimer);

// =============================================================
// Fisher-Yates 随机洗牌算法 (Random Pick)
// =============================================================
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// =============================================================
// 1. 加载题目：优先 test_time 少，内部随机洗牌
// =============================================================
async function loadProblemsByLevel() {
  if (!levelSelect) return;
  const level = levelSelect.value;
  if (!level) {
    problemsContainer.innerHTML = '<div class="empty-state">请先选择训练级别</div>';
    return;
  }

  isWrongView = false;
  currentProblemIndex = 0;

  try {
    updateStatusMessage('正在随机抽取口算题...');
    let allRows = [];
    let page = 0;
    let pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabaseClient
        .from('math_problems')
        .select('*')
        .eq('level', Number(level))
        .order('test_time', { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;
      if (data && data.length > 0) {
        allRows = allRows.concat(data);
        if (data.length < pageSize) hasMore = false;
        else page++;
      } else {
        hasMore = false;
      }
    }

    if (allRows.length === 0) {
      problemsContainer.innerHTML = `<div class="empty-state">该级别暂无题目</div>`;
      updateStatusMessage('');
      return;
    }

    const grouped = {};
    allRows.forEach(row => {
      const t = row.test_time || 0;
      if (!grouped[t]) grouped[t] = [];
      grouped[t].push(row);
    });

    let sortedAndRandomized = [];
    Object.keys(grouped).map(Number).sort((a, b) => a - b).forEach(t => {
      sortedAndRandomized = sortedAndRandomized.concat(shuffleArray([...grouped[t]]));
    });

    displayProblems = sortedAndRandomized.map((row, idx) => ({
      id: row.id,
      level: row.level,
      category: row.category,
      expression: row.expression,
      answer: row.answer,
      problemIndex: idx
    }));

    stateMap.clear();
    displayProblems.forEach(p => {
      stateMap.set(p.id, { isCorrect: null, isUnder2s: false });
    });

    renderProblem();
    updateStatusMessage('');
    startTimer();
  } catch (err) {
    console.error('加载题目失败:', err);
    updateStatusMessage('❌ 加载题目失败');
  }
}

// =============================================================
// 2. 错题本视图
// =============================================================
async function showWrongProblemsList() {
  try {
    updateStatusMessage('正在加载错题本...');
    isWrongView = true;
    currentProblemIndex = 0;

    let allWrong = [];
    let page = 0;
    let pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabaseClient
        .from('math_problems')
        .select('*')
        .gt('test_time', 0)
        .order('id', { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;
      if (data && data.length > 0) {
        const wrongs = data.filter(row => (row.correct_time || 0) < (row.test_time || 0));
        allWrong = allWrong.concat(wrongs);
        if (data.length < pageSize) hasMore = false;
        else page++;
      } else {
        hasMore = false;
      }
    }

    updateStatusMessage('');
    if (allWrong.length === 0) {
      problemsContainer.innerHTML = '<div class="empty-state">🎉 太棒了！目前没有数学错题记录。</div>';
      return;
    }

    displayProblems = shuffleArray([...allWrong]).map((row, idx) => ({
      id: row.id,
      level: row.level,
      category: row.category,
      expression: row.expression,
      answer: row.answer,
      problemIndex: idx
    }));

    stateMap.clear();
    displayProblems.forEach(p => {
      stateMap.set(p.id, { isCorrect: null, isUnder2s: false });
    });

    renderProblem();
  } catch (err) {
    console.error('获取错题失败:', err);
    updateStatusMessage('❌ 获取错题失败');
  }
}

// =============================================================
// 3. 单题分页渲染（纯算式 + 双 Checkbox）
// =============================================================
function renderProblem() {
  if (!problemsContainer) return;
  if (displayProblems.length === 0) {
    problemsContainer.innerHTML = '<div class="empty-state">当前没有题目</div>';
    return;
  }

  if (currentProblemIndex >= displayProblems.length) currentProblemIndex = displayProblems.length - 1;
  if (currentProblemIndex < 0) currentProblemIndex = 0;

  const item = displayProblems[currentProblemIndex];
  const state = stateMap.get(item.id) || { isCorrect: null, isUnder2s: false };

  problemsContainer.innerHTML = '';
  const groupEl = document.createElement('div');

  const header = document.createElement('div');
  header.className = 'group-header';
  const title = document.createElement('span');
  title.className = 'group-title';
  title.textContent = isWrongView ? '⚠️ 错题闪算特训' : `${item.category}`;
  const progress = document.createElement('span');
  progress.className = 'group-progress';
  progress.textContent = `第 ${currentProblemIndex + 1} / ${displayProblems.length} 题`;

  header.appendChild(title);
  header.appendChild(progress);
  groupEl.appendChild(header);

  // 题目展示卡片
  const card = document.createElement('div');
  card.className = 'problem-card';
  if (state.isCorrect === true) card.classList.add('correct');
  if (state.isCorrect === false) card.classList.add('incorrect');

  const exprDiv = document.createElement('div');
  exprDiv.className = 'problem-expression';
  exprDiv.textContent = `${item.expression} = ?`;

  const hintDiv = document.createElement('div');
  hintDiv.className = 'answer-hint';
  hintDiv.textContent = `💡 正确答案: ${item.answer}`;

  // 两个 Checkbox 选项区
  const checksContainer = document.createElement('div');
  checksContainer.className = 'checks-container';

  // Checkbox 1: 对错判定
  const labelCorrect = document.createElement('label');
  labelCorrect.className = 'check-item';
  const cbCorrect = document.createElement('input');
  cbCorrect.type = 'checkbox';
  cbCorrect.checked = (state.isCorrect === true);
  
  cbCorrect.addEventListener('change', (e) => {
    state.isCorrect = e.target.checked ? true : false;
    card.classList.remove('correct', 'incorrect');
    if (state.isCorrect) card.classList.add('correct');
    else card.classList.add('incorrect');
  });
  labelCorrect.appendChild(cbCorrect);
  labelCorrect.appendChild(document.createTextNode(' ✓ 回答正确'));

  // Checkbox 2: 是否在两秒内完成
  const labelUnder2s = document.createElement('label');
  labelUnder2s.className = 'check-item';
  const cbUnder2s = document.createElement('input');
  cbUnder2s.type = 'checkbox';
  cbUnder2s.checked = state.isUnder2s;
  
  cbUnder2s.addEventListener('change', (e) => {
    state.isUnder2s = e.target.checked;
  });
  labelUnder2s.appendChild(cbUnder2s);
  labelUnder2s.appendChild(document.createTextNode(' ⚡ 2秒内完成'));

  checksContainer.appendChild(labelCorrect);
  checksContainer.appendChild(labelUnder2s);

  card.appendChild(exprDiv);
  card.appendChild(hintDiv);
  card.appendChild(checksContainer);
  groupEl.appendChild(card);

  // 翻页导航栏（点击“下一题”时自动在后台静默同步当前题数据）
  const navContainer = document.createElement('div');
  navContainer.style.cssText = 'display: flex; gap: 10px; margin-top: 10px; width: 100%;';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'btn';
  prevBtn.textContent = '⬅️ 上一题';
  prevBtn.disabled = currentProblemIndex === 0;
  prevBtn.style.opacity = currentProblemIndex === 0 ? '0.5' : '1';
  prevBtn.addEventListener('click', async () => {
    if (currentProblemIndex > 0) {
      await submitSingleProblemToSupabase(item.id, state);
      currentProblemIndex--;
      renderProblem();
    }
  });

  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn btn-primary';
  nextBtn.textContent = '下一题 ➡️';
  nextBtn.disabled = currentProblemIndex === displayProblems.length - 1;
  nextBtn.style.opacity = currentProblemIndex === displayProblems.length - 1 ? '0.5' : '1';
  nextBtn.addEventListener('click', async () => {
    if (currentProblemIndex < displayProblems.length - 1) {
      await submitSingleProblemToSupabase(item.id, state);
      currentProblemIndex++;
      renderProblem();
    }
  });

  prevBtn.style.flex = '1';
  nextBtn.style.flex = '1';
  navContainer.appendChild(prevBtn);
  navContainer.appendChild(nextBtn);
  groupEl.appendChild(navContainer);

  // 底部操作按钮（保留导出 Excel 和清空勾选）
  const actionBtns = document.createElement('div');
  actionBtns.className = 'action-buttons';
  actionBtns.innerHTML = `
    <button class="btn btn-primary" id="downloadExcelBtn">📥 导出 Excel</button>
    <button class="btn" id="clearBtn">🧹 清空勾选</button>
  `;
  groupEl.appendChild(actionBtns);

  actionBtns.querySelector('#downloadExcelBtn').addEventListener('click', downloadMathResults);
  actionBtns.querySelector('#clearBtn').addEventListener('click', () => {
    state.isCorrect = null;
    state.isUnder2s = false;
    card.classList.remove('correct', 'incorrect');
    renderProblem();
    updateStatusMessage('已清空当前题状态');
    setTimeout(() => updateStatusMessage(''), 1500);
  });

  problemsContainer.appendChild(groupEl);
}

// =============================================================
// 4. 单题静默同步函数（每次切换题目时自动调用）
// =============================================================
async function submitSingleProblemToSupabase(id, state) {
  if (state.isCorrect === null) return; // 未勾选对错则不提交

  const testedIds = [id];
  const correctIds = state.isCorrect === true ? [id] : [];
  const under2sIds = state.isUnder2s === true ? [id] : [];

  try {
    const { error } = await supabaseClient.rpc('update_math_stats', {
      p_tested_ids: testedIds,
      p_correct_ids: correctIds,
      p_under_2s_ids: under2sIds
    });
    if (error) throw error;
  } catch (err) {
    console.error('❌ 静默同步统计失败:', err);
  }
}

// =============================================================
// 5. 导出 Excel 统计报表
// =============================================================
async function downloadMathResults() {
  try {
    updateStatusMessage('正在导出 Excel...');
    let allTested = [];
    let page = 0;
    let pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabaseClient
        .from('math_problems')
        .select('*')
        .gt('test_time', 0)
        .order('id', { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;
      if (data && data.length > 0) {
        allTested = allTested.concat(data);
        if (data.length < pageSize) hasMore = false;
        else page++;
      } else {
        hasMore = false;
      }
    }

    updateStatusMessage('');
    if (allTested.length === 0) {
      updateStatusMessage('暂无练习记录可导出');
      setTimeout(() => updateStatusMessage(''), 2500);
      return;
    }

    const excelData = allTested.map((item, index) => {
      const testTime = item.test_time || 0;
      const correctTime = item.correct_time || 0;
      const under2sCount = item.under_2s_count || 0;
      const accuracy = testTime > 0 ? ((correctTime / testTime) * 100).toFixed(1) + '%' : '0%';
      const under2sRate = testTime > 0 ? ((under2sCount / testTime) * 100).toFixed(1) + '%' : '0%';

      return {
        "序号": index + 1,
        "级别": `Level ${item.level}`,
        "分类": item.category,
        "算式": item.expression,
        "正确答案": item.answer,
        "测试次数": testTime,
        "正确次数": correctTime,
        "正确率": accuracy,
        "2秒内完成次数": under2sCount,
        "闪算达标率": under2sRate
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "口算闪算统计");

    worksheet['!cols'] = [
      {wch: 6}, {wch: 10}, {wch: 22}, {wch: 15}, {wch: 10}, 
      {wch: 10}, {wch: 10}, {wch: 10}, {wch: 14}, {wch: 12}
    ];
    XLSX.writeFile(workbook, `数学口算闪算报告_${new Date().toISOString().slice(0, 10)}.xlsx`);

    updateStatusMessage('📥 Excel 下载成功！');
    setTimeout(() => updateStatusMessage(''), 2500);
  } catch (err) {
    console.error('导出失败:', err);
    updateStatusMessage('❌ 导出 Excel 失败');
  }
}

// =============================================================
// 事件绑定
// =============================================================
if (levelSelect) levelSelect.addEventListener('change', loadProblemsByLevel);
if (wrongProblemsBtn) wrongProblemsBtn.addEventListener('click', showWrongProblemsList);

function updateStatusMessage(msg) {
  if (statusMsg) statusMsg.textContent = msg || '';
}

// 默认初始化加载 Level 1
if (levelSelect) {
  levelSelect.value = "1";
  loadProblemsByLevel();
}
