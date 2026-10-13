// =============================================================
// 数学计算练习逻辑 (Level 动态加载 + 单题分页 + 错题本 + Excel 导出)
// =============================================================

const SUPABASE_URL = 'https://whqpuzxfheqwaniuqbbz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_8eE1_U1jpk5G_tHcVtAjFg_Pz7lG9Q_';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let displayProblems = [];
let isWrongView = false;
let currentProblemIndex = 0;

// 状态映射
const stateMap = new Map(); // key -> { userAnswer, status: 0/1/2 }

// DOM 元素
const levelSelect = document.getElementById('levelSelect');
const problemsContainer = document.getElementById('problemsContainer');
const wrongProblemsBtn = document.getElementById('wrongProblemsBtn');
const statusMsg = document.getElementById('statusMsg');

// =============================================================
// 1. 根据 Level 动态加载题目
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
    updateStatusMessage('正在加载题目...');
    console.log('正在请求 Level:', level);
    
    // 直接查询测试
    const { data, error } = await supabaseClient
      .from('math_problems')
      .select('*')
      .eq('level', level); // 尝试直接匹配（兼容文本或数字）

    console.log('Supabase 返回结果:', { data, error });

    if (error) throw error;

    if (!data || data.length === 0) {
      problemsContainer.innerHTML = `<div class="empty-state">数据库中未找到 Level ${level} 的题目</div>`;
      updateStatusMessage('');
      return;
    }

    displayProblems = data.map((row, idx) => ({
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
    console.error('加载题目失败详情:', err);
    updateStatusMessage('❌ 加载题目失败，请查看控制台 (F12)');
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

    displayProblems = allWrong.map((row, idx) => ({
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
    // 自动判定对错
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

  // 点击对错图标可以手动循环切换状态
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

  // 翻页导航栏（点击下一个自动同步到数据库）
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

  // 附加操作按钮（导出 Excel、提交进度、清空判定）
  const actionBtns = document.createElement('div');
  actionBtns.className = 'action-buttons';
  actionBtns.innerHTML = `
    <button class="btn btn-primary" id="downloadExcelBtn">📥 导出 Excel</button>
    <button class="btn btn-success" id="submitAllBtn">🚀 提交进度</button>
    <button class="btn" id="clearBtn">🧹 清空当前</button>
  `;
  groupEl.appendChild(actionBtns);

  // 绑定按钮事件
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
// 5. 导出数学练习 Excel 报表
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
