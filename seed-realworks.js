// 一次性脚本：将桌面「佛休」真实成稿以分级作品形式导入 db.json，并为既有作品补 rating。
// 不删除任何现有数据。运行：node seed-realworks.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_FILE = path.join(__dirname, 'data', 'db.json');
const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

const genId = (p) => p + '_' + crypto.randomBytes(8).toString('hex');
const countWords = (s) => (s || '').replace(/\s/g, '').length;
const now = Date.now();
const demo = db.users[0];

function addWork(o) {
  const wid = genId('w');
  const base = now - 86400000 * Math.floor(Math.random() * 40 + 5);
  const work = {
    id: wid,
    title: o.title,
    authorId: demo.id,
    authorName: demo.username,
    category: 'foxiu',
    type: o.type || o.category || 'novel',
    rating: o.rating || 'G',
    summary: o.summary,
    tags: o.tags,
    status: o.status || 'completed',
    chaptersCount: 0,
    wordsCount: 0,
    views: Math.floor(Math.random() * 1200) + 200,
    favoritesCount: 0,
    commentsCount: 0,
    createdAt: base,
    updatedAt: base
  };
  db.works.push(work);
  o.chapters.forEach((ch, i) => {
    db.chapters.push({
      id: genId('c'),
      workId: wid,
      title: ch.title,
      order: i + 1,
      content: ch.content,
      wordsCount: countWords(ch.content),
      createdAt: base + i * 3600000,
      updatedAt: base + i * 3600000
    });
  });
  work.chaptersCount = o.chapters.length;
  work.wordsCount = db.chapters.filter((c) => c.workId === wid).reduce((s, c) => s + c.wordsCount, 0);
  work.favoritesCount = o.favorites || 0;
  for (let i = 0; i < (o.favorites || 0); i++) {
    db.favorites.push({ userId: genId('u'), workId: wid, createdAt: now });
  }
  return work;
}

// 1) 为既有作品补 rating（默认全年龄 / 青少年）
db.works.forEach((w) => { if (!w.rating) w.rating = (w.category === 'setting') ? 'G' : 'T'; });

// 2) 导入桌面真实成稿（标题/类型/分级来自桌面「佛休」资料库；节选为真实开篇，用于缓解内容脱节）
const imported = [
  {
    title: '佛尔思×休 · 三部曲与剧本对照',
    type: 'novel', rating: 'T', status: 'completed',
    tags: ['三部曲', '原著向', '长篇', '剧本对照'],
    summary: '以「佛尔思 × 休」为主线的三部曲同人长篇，并与剧本结构逐章对照，呈现从相遇、相知到并肩的完整弧光。',
    favorites: 88,
    chapters: [
      { title: '序 · 林梢的黄昏', content: '佛尔思总在黄昏出现，像一封被折了又折、迟迟未寄出的信。休第一次见到她时，并未想到这个慵懒的记录者会成为自己铠甲下唯一的柔软。\n\n（节选自桌面《三部曲与剧本对照》开篇，完整正文见桌面「佛休」资料库。）' },
      { title: '第一章 · 误认', content: '「先生，您的烟灰——」茶铺伙计的话没说完。休压了压帽檐，脊背笔直地走出门，耳根却悄悄红了。她早已习惯被当作少年，只是今日的「先生」叫得比往常更让人心乱。' }
    ]
  },
  {
    title: '作家之眼 · 桃色之梦',
    type: 'novel', rating: 'M', status: 'completed',
    tags: ['桃色之梦', '成熟', '佛尔思', '休'],
    summary: '以「桃色之梦」为母题的成熟向同人，描摹两人在梦境与现实中逐渐越界的亲密。含成人向内容，需年龄确认。',
    favorites: 64,
    chapters: [
      { title: '其一 · 梦的入口', content: '佛尔思的桃色之梦从不说破，只在清晨留下一截未抽完的烟。休捡起它，指腹摩挲着还温的纸边，第一次希望梦不要醒。\n\n（成熟向节选，完整正文见桌面「佛休」资料库；进入前需确认年满 18 岁。）' }
    ]
  },
  {
    title: '现代AU外传 · 邻居',
    type: 'novel', rating: 'T', status: 'ongoing',
    tags: ['现代AU', '邻居', '日常', '治愈'],
    summary: '现代背景下的外传：佛尔思是居家写手，休是对门中性硬朗的邻居。从借Wi-Fi开始，两个世界慢慢交叠。',
    favorites: 53,
    chapters: [
      { title: '第一章 · 借 Wi-Fi', content: '「你好，我是隔壁——我家路由器炸了，能借一下网吗？」佛尔思抱着笔记本站在门口，睡衣外披了件oversized针织衫。休看着这个慵懒的邻居，点了点头，把门让开了一条缝。' }
    ]
  },
  {
    title: '血月守夜',
    type: 'novel', rating: 'M', status: 'completed',
    tags: ['血月', '守夜', '成熟', '黑暗向'],
    summary: '血月之夜，休守在佛尔思床前，对抗某种 creeping 的东西。一场关于守护与恐惧的成熟向长篇。',
    favorites: 41,
    chapters: [
      { title: '第一章 · 血月升起', content: '血月爬上窗棂时，佛尔思的呼吸变得很轻。休握紧了她冰凉的手，骑士的誓言在喉间滚了又滚——这一夜，他哪也不去。\n\n（成熟向节选，完整正文见桌面「佛休」资料库；进入前需确认年满 18 岁。）' }
    ]
  },
  {
    title: '佛尔思×休 · 服饰搭配全典',
    type: 'setting', rating: 'G', status: 'completed',
    tags: ['服饰', '设定', '资料', '男装'],
    summary: '多时间线场景下佛尔思与休的衣橱圣经：从维多利亚蒸汽朋克到现代日常，收录配色、廓形与标志物取用提示。',
    favorites: 37,
    chapters: [
      { title: '佛尔思 · 主色调与标志物', content: '米黄 / 奶油 / 雾蓝为主；标志物为卷烟、卷边笔记本与细框镜。原则：能舒服绝不遭罪，回避束身与繁复社交装。' },
      { title: '休 · 男装铠甲', content: '墨绿 / 深棕 / 炭黑 / 暗金；男装常态，脊背笔直如受阅。对佛尔思才卸下铠甲，换柔软针织与居家服。' }
    ]
  }
];

let added = 0;
imported.forEach((o) => {
  if (!db.works.some((w) => w.title === o.title)) { addWork(o); added++; }
});

fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
console.log('已导入真实成稿 ' + added + ' 篇；现有作品总数 ' + db.works.length + ' 篇。');
