// =============================================================
// 数学计算练习逻辑 (支持 Timer 暂停/继续 + 优先少练 + 随机抽题)
// =============================================================

const SUPABASE_URL = 'https://whqpuzxfheqwaniuqbbz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_8eE1_U1jpk5G_tHcVtAjFg_Pz7lG9Q_';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let displayProblems = [];
let isWrongView = false;
let currentProblemIndex = 0;

// 状态映射
const stateMap = new Map(); // key -> { userAnswer, status: 0/1/2 }

// 计时器相关变量
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
// 计时器控制逻辑（含开始、暂停/继续、停止）
// =============================================================
function startTimer() {
  if (!customMinutesInput) return;

  // 如果是从暂停状态恢复
  if (isPaused && timeLeft > 0) {
    isPaused = false;
    pauseTimerBtn.textContent = '暂停';
    pauseTimerBtn.style.background = '#fef3c7';
    pauseTimerBtn.style.color = '#b45309';

    timerInterval = setInterval(ticker, 1000);
    updateStatusMessage('⏱️ 计时已继续...');
    setTimeout(() => updateStatusMessage(''), 1500);
    return;
  }

  // 全新开始计时
  const minutes = Number(customMinutesInput.value) || 3;
  if (timerInterval) clearInterval(timerInterval);
  
  timeLeft = minutes * 60; // 转换为秒
  isPaused = false;
  pauseTimerBtn.disabled = false;
  pauseTimerBtn.textContent = '暂停';
  pauseTimerBtn.style.background = '#fef3c7';
  pauseTimerBtn.style.color = '#b45309';

  updateTimerBadge();
  timerInterval = setInterval(ticker, 1000);

  updateStatusMessage(`⏱️ 计时开始：${minutes}分钟倒计时中...`);
  setTimeout(() => updateStatusMessage(''), 2000);
}

function ticker() {
  timeLeft--;
  updateTimerBadge();

  if (timeLeft <= 0) {
    clearInterval(timerInterval);
    timerInterval = null;
    pauseTimerBtn.disabled = true;
    showTimeUpModal();
  }
}

function pauseTimer() {
  if (!timerInterval && !isPaused) return;

  if (!isPaused) {
    // 暂停
    clearInterval(timerInterval);
    timerInterval = null;
    isPaused = true;
    pauseTimerBtn.textContent = '继续';
    pauseTimerBtn.style.background = '#d1fae5';
    pauseTimerBtn.style.color = '#065f46';
    updateStatusMessage('⏱️ 计时已暂停');
    setTimeout(() => updateStatusMessage(''), 1500);
  } else {
    // 继续
    startTimer();
  }
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timeLeft = 0;
  isPaused = false;
  pauseTimerBtn.disabled = true;
  pauseTimerBtn.textContent = '暂停';
  pauseTimerBtn.style.background = '#fef3c7';
  pauseTimerBtn.style.color = '#b45309';

  updateTimerBadge();
  updateStatusMessage('⏱️ 计时已停止');
  setTimeout(() => updateStatusMessage(''), 2000);
}

function updateTimerBadge() {
  if (!timerBadge) return;
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  timerBadge.textContent = `⏱️ ${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

function showTimeUpModal() {
  if (timeUpModal) timeUpModal.style.display = 'flex';
}

if (closeModalBtn) {
  closeModalBtn.addEventListener('click', () => {
    if (timeUpModal) timeUpModal.style.display = 'none';
  });
}

if (startTimerBtn) startTimerBtn.addEventListener('click', startTimer);
if (pauseTimerBtn) pauseTimerBtn.addEventListener('click', pauseTimer);
if (stopTimerBtn) stopTimerBtn.addEventListener('click', stopTimer);

// =============================================================
// 核心工具：Fisher-Yates 随机洗牌算法 (Random Pick / Shuffle)
// =============================================================
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// =============================================================
// 1. 根据 Level 动态加载：优先 test_time 少，内部随机 Random Pick
// =============================================================
async function loadProblemsByLevel() {
  if (!levelSelect) return;
  const level = levelSelect.value;
  if (!level) {
    problemsContainer.innerHTML = '<div class="empty-state">请先选择练习级别</div>';
    return;
  }

  isWrongView = false;
  currentProblemIndex = 0;

  try {
    updateStatusMessage('正在加载并随机抽取题目...');
    
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

    const groupedByTestTime = {};
    allRows.forEach(row => {
      const t = row.test_time || 0;
      if (!groupedByTestTime[t]) groupedByTestTime[t] = [];
      groupedByTestTime[t].push(row);
    });

    let prioritizedAndRandomizedRows = [];
    const sortedTestTimes = Object.keys(groupedByTestTime).map(Number).sort((a, b) => a - b);

    sortedTestTimes.forEach(t => {
      const shuffledGroup = shuffleArray([...groupedByTestTime[t]]);
      prioritizedAndRandomizedRows = prioritizedAndRandomizedRows.concat(shuffledGroup);
    });

    displayProblems = prioritizedAndRandomizedRows.map((row, idx) => ({
      id: row.id,
      level: row.level,
      category: row.category,
      expression: row.expression,
      answer: row.answer,
      problemIndex: idx
    }));

    stateMap.clear();
    displayProblems.forEach(p => {
      stateMap.set(p.id, { userAnswer: '', status: 0 });
    });

    renderProblem();
    updateStatusMessage('');
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
    updateStatusMessage('正在加载数学错题本...');
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

    const shuffledWrongs = shuffleArray([...allWrong]);

    displayProblems = shuffledWrongs.map((row, idx) => ({
      id: row.id,
      level: row.level,
      category: row.category,
      expression: row.expression,
      answer: row.answer,
      problemIndex: idx
    }));

    stateMap.clear();
    displayProblems.forEach(p => {
      stateMap.set(p.id, { userAnswer: '', status: 0 });
    });

    renderProblem();
  } catch (err) {
    console.error('获取错题失败:', err);
    updateStatusMessage('❌ 获取错题失败');
  }
}

// =============================================================
// 3. 单题分页渲染
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
  const state = stateMap.get(item.id) || { userAnswer: '', status: 0 };

  problemsContainer.innerHTML = '';
  const groupEl = document.createElement('div');

  const header = document.createElement('div');
  header.className = 'group-header';
  const title = document.createElement('span');
  title.className = 'group-title';
  title.textContent = isWrongView ? '⚠️ 数学错题本训练' : `${item.category}`;
  const progress = document.createElement('span');
  progress.className = 'group-progress';
  progress.textContent = `第 ${currentProblemIndex + 1} / ${displayProblems.length} 题`;

  header.appendChild(title);
  header.appendChild(progress);
  groupEl.appendChild(header);

  // 题目卡片
  const card = document.createElement('div');
  card.className = 'problem-card';
  if (state.status === 1) card.classList.add('correct');
  if (state.status === 2) card.classList.add('incorrect');

  const exprDiv = document.createElement('div');
  exprDiv.className = 'problem-expression';
  exprDiv.textContent = `${item.expression} = ?`;

  const ansSection = document.createElement('div');
  ansSection.className = 'answer-section';

  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'answer-input';
  input.placeholder = '结果';
  input.value = state.userAnswer;

  input.addEventListener('input', (e) => {
    state.userAnswer = e.target.value;
    const val = Number(e.target.value);
    if (e.target.value !== '' && val === item.answer) {
      state.status = 1; // 正确
      card.classList.add('correct');
      card.classList.remove('incorrect');
      checkBox.textContent = '✓';
    } else if (e.target.value !== '' && val !== item.answer) {
      state.status = 2; // 错误
      card.classList.add('incorrect');
      card.classList.remove('correct');
      checkBox.textContent = '✗';
    } else {
      state.status = 0;
      card.classList.remove('correct', 'incorrect');
      checkBox.textContent = '';
    }
  });

  const checkBox = document.createElement('div');
  checkBox.className = 'check-box';
  if (state.status === 1) checkBox.textContent = '✓';
  else if (state.status === 2) checkBox.textContent = '✗';
  else checkBox.textContent = '';

  checkBox.addEventListener('click', () => {
    state.status = (state.status + 1) % 3;
    card.classList.remove('correct', 'incorrect');
    if (state.status === 1) { card.classList.add('correct'); checkBox.textContent = '✓'; }
    else if (state.status === 2) { card.classList.add('incorrect'); checkBox.textContent = '✗'; }
    else { checkBox.textContent = ''; }
  });

  ansSection.appendChild(input);
  ansSection.appendChild(checkBox);
  card.appendChild(exprDiv);
  card.appendChild(ansSection);
  groupEl.appendChild(card);

  // 翻页导航栏（点击下一题自动同步）
  const navContainer = document.createElement('div');
  navContainer.style.cssText = 'display: flex; gap: 10px; margin-top: 10px; width: 100%;';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'btn';
  prevBtn.textContent = '⬅️ 上一题';
  prevBtn.disabled = currentProblemIndex === 0;
  prevBtn.style.opacity = currentProblemIndex === 0 ? '0.5' : '1';
  prevBtn.addEventListener('click', () => {
    if (currentProblemIndex > 0) {
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
      await submitCurrentToSupabase();
      currentProblemIndex++;
      renderProblem();
    }
  });

  prevBtn.style.flex = '1';
  nextBtn.style.flex = '1';
  navContainer.appendChild(prevBtn);
  navContainer.appendChild(nextBtn);
  groupEl.appendChild(navContainer);

  // 附加操作按钮（导出 Excel、提交进度、清空当前）
  const actionBtns = document.createElement('div');
  actionBtns.className = 'action-buttons';
  actionBtns.innerHTML = `
    <button class="btn btn-primary" id="downloadExcelBtn">📥 导出 Excel</button>
    <button class="btn btn-success" id="submitAllBtn">🚀 提交进度</button>
    <button class="btn" id="clearBtn">🧹 清空当前</button>
  `;
  groupEl.appendChild(actionBtns);

  actionBtns.querySelector('#downloadExcelBtn').addEventListener('click', downloadMathResults);
  actionBtns.querySelector('#submitAllBtn').addEventListener('click', async () => {
    await submitCurrentToSupabase();
    updateStatusMessage('✅ 数学练习进度已成功提交！');
    setTimeout(() => updateStatusMessage(''), 2500);
  });
  actionBtns.querySelector('#clearBtn').addEventListener('click', () => {
    state.userAnswer = '';
    state.status = 0;
    renderProblem();
    updateStatusMessage('已清空当前题');
    setTimeout(() => updateStatusMessage(''), 1500);
  });

  problemsContainer.appendChild(groupEl);
}

// =============================================================
// 4. 数据库原子同步函数
// =============================================================
async function submitCurrentToSupabase() {
  const testedIds = [];
  const correctIds = [];

  stateMap.forEach((val, id) => {
    if (val.status !== 0) {
      testedIds.push(id);
      if (val.status === 1) correctIds.push(id);
    }
  });

  if (testedIds.length === 0) return;

  try {
    const { error } = await supabaseClient.rpc('update_math_stats', {
      p_tested_ids: testedIds,
      p_correct_ids: correctIds
    });
    if (error) throw error;
  } catch (err) {
    console.error('❌ 同步数学统计失败:', err);
  }
}

// =============================================================
// 5. 导出 Excel 报表
// =============================================================
async function downloadMathResults() {
  try {
    updateStatusMessage('正在从数据库获取所有已练数学题数据...');
    
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
      updateStatusMessage('没有找到任何已练习的数学题记录');
      setTimeout(() => updateStatusMessage(''), 2500);
      return;
    }

    const excelData = allTested.map((item, index) => {
      const testTime = item.test_time || 0;
      const correctTime = item.correct_time || 0;
      const wrongTime = testTime - correctTime;
      const accuracy = testTime > 0 ? ((correctTime / testTime) * 100).toFixed(1) + '%' : '0%';

      return {
        "序号": index + 1,
        "级别": `Level ${item.level}`,
        "分类": item.category,
        "算式": item.expression,
        "正确答案": item.answer,
        "练习次数": testTime,
        "正确次数": correctTime,
        "错误次数": wrongTime,
        "正确率": accuracy
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "数学计算统计");

    worksheet['!cols'] = [
      {wch: 6}, {wch: 10}, {wch: 22}, {wch: 15}, {wch: 10}, {wch: 10}, {wch: 10}, {wch: 10}, {wch: 10}
    ];

    const fileName = `数学计算练习报告_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    updateStatusMessage('📥 数学 Excel 表格下载成功！');
    setTimeout(() => updateStatusMessage(''), 2500);

  } catch (err) {
    console.error('导出 Excel 失败:', err);
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

// 初始化默认加载 Level 1
if (levelSelect) {
  levelSelect.value = "1";
  loadProblemsByLevel();
}
