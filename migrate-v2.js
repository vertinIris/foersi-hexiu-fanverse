// 数据迁移：佛休主分类 + 佛尔思中心化 + 互动功能数据表
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data', 'db.json');
const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

// 1. 分类改造：佛休为主分类，原 category 下沉为 type
const oldCats = db.categories || [];
const catMap = {};
oldCats.forEach((c) => (catMap[c.id] = c));

const typeLabels = {
  novel: '同人小说',
  short: '短篇随笔',
  poetry: '诗歌散文',
  script: '剧本脚本',
  setting: '设定资料',
  fanart: '同人图',
  doujin: '同人本',
  essay: '评论随笔'
};

// 分类表只保留一个主分类：佛休
if (!db.categories.find((c) => c.id === 'foxiu')) {
  db.categories.unshift({ id: 'foxiu', name: '佛休', desc: '佛尔思×休 同人主站分类', isMain: true });
}

// 2. 作品增加 type 字段，category 统一为 foxiu
(db.works || []).forEach((w) => {
  if (!w.type || w.type === 'foxiu') {
    w.type = w.category && w.category !== 'foxiu' ? w.category : 'novel';
  }
  w.category = 'foxiu';
  w.rating = w.rating || 'G';
  w.kudosCount = w.kudosCount || 0;
  w.authorName = w.authorName || '佚名';
  // 保证作者署名稳定：如果 authorId 存在但 users 里没有，补一个占位
});

// 3. 新增互动表
if (!db.kudos) db.kudos = [];
if (!db.notifications) db.notifications = [];
if (!db.follows) db.follows = [];

// 4. 给所有已存在作品补齐 kudosCount（如果表为空则不处理，这里只保证字段存在）

// 5. 初始化用户通知偏好
(db.users || []).forEach((u) => {
  if (!u.notifyOn) u.notifyOn = { comment: true, favorite: true, kudos: true, follow: true };
});

fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
console.log('Migration done. Works:', db.works.length, '| Categories:', db.categories.map((c) => c.id).join(','));
