// 日志模块：按天切分，零依赖。Token 等敏感值调用前须先截断。
const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.FH_LOG_DIR || path.join(__dirname, '..', 'logs');

function ensureDir() {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (e) {}
}

function day() {
  return new Date().toISOString().slice(0, 10);
}

function write(kind, level, msg) {
  try {
    ensureDir();
    const line = `${new Date().toISOString()} ${String(level).padEnd(5)} ${msg}\n`;
    fs.appendFileSync(path.join(LOG_DIR, `${kind}-${day()}.log`), line);
  } catch (e) {
    // 日志本身失败不得影响主流程
  }
}

module.exports = {
  LOG_DIR,
  /** 访问日志：Token 只记前 8 位 */
  access(ip, method, pathname, status, ms, token) {
    const t = token ? String(token).slice(0, 8) : '-';
    write('access', 'INFO', `[access] ${ip} ${method} ${pathname} ${status} ${ms}ms tok=${t}`);
  },
  error(msg, err) {
    const stack = err && err.stack ? ' | ' + err.stack.split('\n').slice(0, 3).join(' / ') : '';
    write('error', 'ERROR', `[api] ${msg}${stack}`);
  },
  warn(msg) {
    write('error', 'WARN', `[warn] ${msg}`);
  },
  info(msg) {
    write('access', 'INFO', `[info] ${msg}`);
  }
};
