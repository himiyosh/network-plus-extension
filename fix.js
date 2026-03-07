const fs = require('fs');
let code = fs.readFileSync('panel.js', 'utf8');
code = code.replace(/const contentNodeRes = document\.createElement\('div'\);(\r?\n)\s*if \(text\.length > TRUNCATE_LIMIT\) \{/, 
\const contentNodeRes = document.createElement('div');\            let isJson = false;\            try {\              const jsonObj = JSON.parse(text);\              const pre = document.createElement('pre');\              pre.style.margin = '0';\              pre.textContent = JSON.stringify(jsonObj, null, 2);\              contentNodeRes.appendChild(pre);\              isJson = true;\            } catch (_e) {}\\            if (!isJson) {\              if (text.length > TRUNCATE_LIMIT) {\);
code = code.replace(/\} else \{(\r?\n)\s*contentNodeRes.textContent = text;(\r?\n)\s*\}/, 
} else {              contentNodeRes.textContent = text;            }            });
fs.writeFileSync('panel.js', code);

