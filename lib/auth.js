// 鉴权工具：密码哈希（scrypt）+ 会话令牌。零依赖，使用 Node 内置 crypto。
const crypto = require('crypto');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return salt + ':' + hash;
}

function verifyPassword(pw, stored) {
  if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const h = crypto.scryptSync(pw, salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(hash, 'hex'));
  } catch (e) {
    return false;
  }
}

function genToken() {
  return crypto.randomBytes(24).toString('hex');
}

module.exports = { hashPassword, verifyPassword, genToken };
