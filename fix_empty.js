const fs = require('fs');
let code = fs.readFileSync('panel.js', 'utf8');

const targetMethod = 'function renderBody() {';
const newMethod = unction renderBody() {
    const tbody = document.getElementById('tbody');
    tbody.textContent = '';
    const rows = state.filteredRows;

    if (rows.length === 0 && !state.paused) {
      if (document.getElementById('tableWrap')) {
        const wrap = document.getElementById('tableWrap');
        let emptyState = document.getElementById('empty-state-msg');
        if (!emptyState) {
          emptyState = document.createElement('div');
          emptyState.id = 'empty-state-msg';
          emptyState.className = 'empty-state';
          emptyState.innerHTML = '<div class=\'icon\'>📡</div><div>Recording network activity...</div><div style=\'font-size: 0.8em; margin-top: 10px;\'>Perform a request or reload the page to see activity.</div>';
          wrap.appendChild(emptyState);
        }
        emptyState.style.display = 'flex';
      }
    } else {
      const emptyState = document.getElementById('empty-state-msg');
      if (emptyState) emptyState.style.display = 'none';
    };

code = code.replace(  function renderBody() {
    const tbody = #tbody;
    tbody.textContent = '';
    const rows = state.filteredRows;, newMethod.replace(document.getElementById('tbody'), $('#tbody')));

fs.writeFileSync('panel.js', code);

