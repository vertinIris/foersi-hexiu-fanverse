// 数据存储层：JSON 文件持久化 + 种子数据。零依赖。
// 关键约束：本模块是 data/db.json 的唯一写入口，外部不得直接操作文件。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { hashPassword } = require('./lib/auth');
const logger = require('./lib/logger');

const DATA_DIR = path.join(__dirname, 'data');
// 测试隔离：置 FH_TEST_DB=1 时读写 db.test.json，避免污染生产数据
const DB_FILE = process.env.FH_TEST_DB
  ? path.join(DATA_DIR, 'db.test.json')
  : path.join(DATA_DIR, 'db.json');

const TOKEN_TTL = 7 * 24 * 60 * 60 * 1000; // Token 7 天滑动过期
const NOTIFY_KEEP = 300;                    // 每用户通知保留上限

function genId(p) {
  return p + '_' + crypto.randomBytes(8).toString('hex');
}
function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function countWords(s) {
  return (s || '').replace(/\s/g, '').length;
}

function defaultDB() {
  const now = Date.now();
  const db = {
    users: [],
    works: [],
    chapters: [],
    comments: [],
    favorites: [],
    sessions: {},
    sessionsMeta: {},
    categories: [
      { id: 'foxiu', name: '佛休', desc: '佛尔思×休 同人主站分类', isMain: true },
      { id: 'novel', name: '小说', desc: '长篇 / 中篇同人创作' },
      { id: 'short', name: '短篇', desc: '短文、诗歌、随笔与脑洞' },
      { id: 'setting', name: '设定', desc: '世界观与人物设定资料' }
    ],
    kudos: [],
    notifications: [],
    follows: [],
    sitePages: [],
    media: [],
    meta: { seededAt: now }
  };

  const demo = {
    id: 'u_demo',
    username: '休之笔',
    password: hashPassword('demo1234'),
    email: 'demo@foxhe.xu',
    bio: '佛尔思和休世界的常住居民，偏爱温柔向日常。',
    role: 'admin', // 站点页面（角色志/关于）由管理员维护
    createdAt: now - 86400000 * 30
  };
  db.users.push(demo);

  function addWork(o) {
    const wid = genId('w');
    const base = now - 86400000 * Math.floor(Math.random() * 20);
    const work = {
      id: wid,
      title: o.title,
      authorId: demo.id,
      authorName: demo.username,
      category: 'foxiu',
      type: o.type || 'novel',
      rating: o.rating || 'G',
      summary: o.summary,
      tags: o.tags,
      status: o.status || 'ongoing',
      chaptersCount: 0,
      wordsCount: 0,
      views: Math.floor(Math.random() * 800) + 60,
      favoritesCount: 0,
      kudosCount: 0,
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
    work.wordsCount = db.chapters
      .filter((c) => c.workId === wid)
      .reduce((s, c) => s + c.wordsCount, 0);
    (o.comments || []).forEach((cm, i) => {
      db.comments.push({
        id: genId('cm'),
        workId: wid,
        userId: demo.id,
        userName: demo.username,
        content: cm,
        createdAt: now - i * 86400000
      });
    });
    work.commentsCount = (o.comments || []).length;
    for (let i = 0; i < (o.favorites || 0); i++) {
      db.favorites.push({ userId: genId('u'), workId: wid, createdAt: now });
    }
    work.favoritesCount = o.favorites || 0;
    return work;
  }

  addWork({
    title: '风过林梢时',
    type: 'novel',
    status: 'ongoing',
    tags: ['日常', '治愈', '温柔', '慢生活'],
    summary:
      '休在异乡的林边小镇遇见了总是在黄昏出现的佛尔思。一段关于陪伴、旧信与慢生活的故事，从一杯热茶开始。',
    chapters: [
      {
        title: '第一章 黄昏的来客',
        content:
          '林梢的风把最后一点暑气吹散时，休推开了木门。\n\n镇上的人都说他搬来得太晚，错过了夏天最好的日子。可休不这么觉得——黄昏的巷口站着一个人，披着旧披风，正低头看一封被折了又折的信。\n\n“你也在等信吗？”休问。\n\n那人抬起头，眼里有比晚霞更安静的光。“我在等一个愿意听故事的人。”'
      },
      {
        title: '第二章 茶与旧信',
        content:
          '佛尔思的屋里永远飘着茶香。\n\n休发现自己每天都来，从借一盏灯，到留下来吃一碗粥。旧信一封封被拆开，故事也一段段被讲完。\n\n“你为什么总在黄昏出现？”休终于问。\n\n佛尔思笑了笑，把最旧的那封信推到他面前：“因为有些话，要在天快要黑的时候才说得出口。”'
      }
    ],
    comments: ['第一次看这个配对，太好磕了！', '作者的文笔好温柔，像被晚风吹了一下。', '催更催更，第二章看得我鼻子发酸。'],
    favorites: 42
  });

  addWork({
    title: '云上书简',
    type: 'short',
    status: 'completed',
    tags: ['诗歌', '思念', '书信'],
    summary: '以书信体写就的短诗，寄给远方的佛尔思。',
    chapters: [
      { title: '其一', content: '我把黄昏折进信封，\n写上你的名字，\n风却说我地址不全——\n它只认得，那片你站过的林梢。' },
      { title: '其二', content: '你走后，茶凉得很慢，\n像一句没说完的晚安。\n我学着你的样子添柴，\n火光里全是你的侧脸。' },
      { title: '其三', content: '若有一天你回来，\n请不要 knocked 门，\n窗一直开着，\n粥一直温着，\n故事，一直讲到天亮。' }
    ],
    comments: ['读哭了，太会写了。', '其三最后一句我反复看了好几遍。'],
    favorites: 18
  });

  addWork({
    title: '关于佛尔思的二十个设定',
    type: 'setting',
    status: 'completed',
    tags: ['设定', '人物', '资料'],
    summary: '整理佛尔思的人物设定、外貌、习惯与小秘密，供同好参考与二创。',
    chapters: [
      {
        title: '外貌与衣着',
        content:
          '佛尔思：身形偏瘦，常披一件洗得发白的旧披风。发色近于暮色，瞳孔在黄昏时会显得更浅。\n\n偏好素色与宽松的衣物，身上总带着淡淡的茶味与松木气息。'
      },
      {
        title: '习惯与喜好',
        content:
          '喜欢在黄昏散步，习惯把重要的事写进信里。\n\n不擅长说早安，却总记得给晚归的人留一盏灯。讨厌被突然叫醒，但愿意为真正在意的人破例。'
      }
    ],
    comments: ['设定好有爱，立刻拿去写同人了！'],
    favorites: 9
  });

  // 站点页面：由创作者维护，内容可在「作家后台 → 站点内容」中编辑
  db.sitePages.push({
    key: 'characters',
    title: '角色志',
    subtitle: '创作者共同维护的设定索引与标签入口',
    content: [
      '本页为「佛休」二创的**标签索引**，供创作者与读者快速检索。内容由拥有编辑权限的创作者共同维护，可随时修订、补充或删除。',
      '',
      '## 常用标签',
      '',
      '点击下方任一标签即可检索对应作品：',
      '',
      '@tags:佛尔思,休,日常,治愈,原著向,现代AU,桃色之梦,血月守夜,男装,骑士梦,卷烟,慢生活',
      '',
      '## 角色设定资料',
      '',
      '如需查阅详细的服饰、性格与设定资料，可前往书库按「设定」类型筛选。',
      '',
      '![书库设定资料](/browse.html?type=setting)',
      '',
      '## 参与编辑',
      '',
      '拥有编辑权限的创作者可在「作家后台 → 站点内容」修改本页，支持插入图片与视频。'
    ].join('\n'),
    updatedAt: now,
    updatedBy: demo.id
  });

  db.sitePages.push({
    key: 'about',
    title: '关于本站',
    subtitle: '',
    content: [
      '本站是《诡秘之主》同人二创作品的**收藏与展示平台**，由同好自发搭建，非官方、非商业，与原著版权方无隶属关系。',
      '',
      '## 收录范围',
      '',
      '以「佛休」为主分类，收录小说、短篇、设定资料三类作品，支持标签检索与内容分级筛选。',
      '',
      '## 署名与权益',
      '',
      '每部作品均保留原作者署名与主页入口，作者可随时编辑或下架自己的作品。完整条款见《版权与非官方声明》。',
      '',
      '## 内容分级',
      '',
      '作品分为全年龄（G）、青少年（T）、成熟（M）、限制级（E）四级。M / E 内容默认不展示，需读者确认年龄后方可查看。',
      '',
      '## 参与创作',
      '',
      '注册即可成为作者，发布并管理自己的作品与章节，支持在正文中插入图片与视频。'
    ].join('\n'),
    updatedAt: now,
    updatedBy: demo.id
  });

  return db;
}

let db = null;

function load() {
  ensureDir();
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
      // 关键：损坏时保留现场，绝不静默丢弃
      const bad = DB_FILE + '.corrupt-' + Date.now();
      try {
        fs.renameSync(DB_FILE, bad);
      } catch (e2) {
        logger.error('坏数据库文件另存失败', e2);
      }
      logger.error(`db.json 解析失败，已另存为 ${bad}，回退种子数据`, e);
      console.error('[FATAL] db.json 损坏，已另存为 ' + bad);
      db = defaultDB();
      save();
    }
  } else {
    db = defaultDB();
    save();
  }
  // 补齐后加的表，兼容旧数据
  if (!db.sessionsMeta) db.sessionsMeta = {};
  if (!db.kudos) db.kudos = [];
  if (!db.notifications) db.notifications = [];
  if (!db.follows) db.follows = [];
  if (!db.media) db.media = [];
  if (!db.sitePages) db.sitePages = [];
  // R1 修复：旧库用户 role 全为 author（早于 admin 种子生成），强制将演示账号
  // u_demo 提升为 admin，使后台「站点内容」编辑器可见可用。不覆盖其他真实 admin。
  const demoUser = (db.users || []).find((u) => u.id === 'u_demo');
  if (demoUser && demoUser.role !== 'admin') {
    demoUser.role = 'admin';
    logger.info('迁移：u_demo 角色已提升为 admin（R1 修复）');
    save();
  }
  // 旧库升级：注入默认站点页面（角色志 / 关于），后续由管理员在后台编辑
  if (!db.sitePages.length) {
    const uid = (db.users[0] && db.users[0].id) || 'u_demo';
    const t = Date.now();
    db.sitePages.push(
      {
        key: 'characters',
        title: '角色志',
        subtitle: '创作者共同维护的设定索引与标签入口',
        content: [
          '本页为「佛休」二创的**标签索引**，供创作者与读者快速检索。内容由拥有编辑权限的创作者共同维护，可随时修订、补充或删除。',
          '',
          '## 常用标签',
          '',
          '@tags:佛尔思,休,日常,治愈,原著向,现代AU,桃色之梦,血月守夜,男装,骑士梦,卷烟,慢生活',
          '',
          '## 参与编辑',
          '',
          '拥有编辑权限的创作者可在「作家后台 → 站点内容」修改本页，支持插入图片与视频。'
        ].join('\n'),
        updatedAt: t,
        updatedBy: uid
      },
      {
        key: 'about',
        title: '关于本站',
        subtitle: '',
        content: [
          '本站是《诡秘之主》同人二创作品的**收藏与展示平台**，由同好自发搭建，非官方、非商业，与原著版权方无隶属关系。',
          '',
          '## 收录范围',
          '',
          '以「佛休」为主分类，收录小说、短篇、设定资料三类作品，支持标签检索与内容分级筛选。',
          '',
          '## 署名与权益',
          '',
          '每部作品均保留原作者署名与主页入口，作者可随时编辑或下架自己的作品。完整条款见《版权与非官方声明》。',
          '',
          '## 内容分级',
          '',
          '作品分为全年龄（G）、青少年（T）、成熟（M）、限制级（E）四级。M / E 内容默认不展示，需读者确认年龄后方可查看。'
        ].join('\n'),
        updatedAt: t,
        updatedBy: uid
      }
    );
    save();
  }
  return db;
}

function getDB() {
  if (!db) load();
  return db;
}

/**
 * 原子写入：先写 .tmp 再 rename 覆盖。
 * 避免写入过程中崩溃/磁盘满导致 db.json 截断损坏。
 * 异常向上抛出，由调用方决定是否降级为 503。
 */
function save() {
  ensureDir();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

/** 清理：过期会话 + 无主元数据 + 超限通知。启动时调用一次。 */
function cleanup() {
  const now = Date.now();
  let expired = 0;
  let adopted = 0;
  let orphaned = 0;
  if (db) {
    if (!db.sessionsMeta) db.sessionsMeta = {};

    // 历史遗留会话（无 meta）：补记当前时间以纳入 7 天过期管理，不强制用户登出
    for (const t of Object.keys(db.sessions || {})) {
      if (!db.sessionsMeta[t]) {
        db.sessionsMeta[t] = { createdAt: now, lastSeen: now, adopted: true };
        adopted++;
      }
    }

    // 清理已过期会话
    for (const [t, m] of Object.entries(db.sessionsMeta)) {
      if (!m) continue;
      if (now - (m.lastSeen || 0) > TOKEN_TTL) {
        delete db.sessions[t];
        delete db.sessionsMeta[t];
        expired++;
      }
    }

    // 清理孤儿 meta（对应会话已不存在）
    for (const t of Object.keys(db.sessionsMeta)) {
      if (!db.sessions[t]) {
        delete db.sessionsMeta[t];
        orphaned++;
      }
    }
    // 每用户通知保留最近 NOTIFY_KEEP 条
    if (Array.isArray(db.notifications) && db.notifications.length > NOTIFY_KEEP * 5) {
      const byUser = {};
      for (const n of db.notifications) {
        (byUser[n.userId] = byUser[n.userId] || []).push(n);
      }
      const kept = [];
      for (const list of Object.values(byUser)) {
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        kept.push(...list.slice(0, NOTIFY_KEEP));
      }
      db.notifications = kept;
    }
  }
  if (expired || adopted || orphaned) {
    logger.info(`会话清理：过期 ${expired} / 补记 ${adopted} / 孤儿 ${orphaned}`);
  }
  return { expired, adopted, orphaned };
}

module.exports = { getDB, save, genId, countWords, cleanup, DB_FILE, TOKEN_TTL };
