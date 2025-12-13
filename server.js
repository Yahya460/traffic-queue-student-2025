const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();

// البورت من Render أو 3000 محلياً
const PORT = process.env.PORT || 3000;

// 🔒 كلمة سر المدير (Admin Secret)
const ADMIN_SECRET = '2626';

// ✅ مكان حفظ ملفات البيانات (مهم لـ Render)
const DATA_DIR = process.env.DATA_DIR || __dirname;

// مسارات الملفات
const statsFile = path.join(DATA_DIR, 'stats.json');
const usersFile = path.join(DATA_DIR, 'users.json');

// إعداد Express
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== أدوات مساعدة =====
function ensureFile(file, defaultData) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(defaultData, null, 2), 'utf8');
    }
  } catch (e) {
    console.error('ensureFile error:', file, e.message);
  }
}

function readJSON(file, fallback) {
  try {
    const data = fs.readFileSync(file, 'utf8');
    if (!data) return fallback;
    return JSON.parse(data);
  } catch (err) {
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function isAdmin(req) {
  const secret = (req.query && req.query.adminSecret) || (req.body && req.body.adminSecret);
  return secret === ADMIN_SECRET;
}

// ✅ تاريخ عمان YYYY-MM-DD
function omanDateKey(d = new Date()) {
  // en-CA يعطي YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Muscat',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

// ===== الإحصائيات =====
function baseStats() {
  return {
    totalCalls: 0,
    perStaff: {},
    perDay: {},
    lastDayKey: '', // لتصفير يومي تلقائي
  };
}

function loadStats() {
  const raw = readJSON(statsFile, baseStats());

  // ترميم/ترقية لو الملف قديم
  raw.totalCalls = raw.totalCalls || 0;
  raw.perStaff = raw.perStaff || {};
  raw.perDay = raw.perDay || {};
  raw.lastDayKey = raw.lastDayKey || '';

  const today = omanDateKey();

  // ✅ تصفير تلقائي يومي (للإجمالي + حسب الموظف) مع الإبقاء على perDay
  if (raw.lastDayKey && raw.lastDayKey !== today) {
    raw.totalCalls = 0;
    raw.perStaff = {};
  }
  raw.lastDayKey = today;

  writeJSON(statsFile, raw);
  return raw;
}

function saveStats(stats) {
  writeJSON(statsFile, stats);
}

// ===== المستخدمين =====
function loadUsers() {
  const data = readJSON(usersFile, []);
  return Array.isArray(data) ? data : [];
}

function saveUsers(users) {
  writeJSON(usersFile, users);
}

// ===== تأكد من وجود الملفات =====
ensureFile(statsFile, baseStats());
ensureFile(usersFile, []);

// ===== حالة الدور في الذاكرة =====
let currentNumber = 0;
let currentGender = ''; // men / women
let history = [];       // آخر 15 رقم
let historyMen = [];
let historyWomen = [];
let noteText = '';      // ملاحظة عامة
let lastNoteStaff = ''; // صاحب آخر ملاحظة عامة
let staffNotes = {};    // ملاحظات المدير الخاصة لكل موظف (بالذاكرة)

// ===== صفحات =====
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ===== API: حالة الدور =====
app.get('/api/state', (req, res) => {
  res.json({
    currentNumber,
    currentGender,
    history,
    historyMen,
    historyWomen,
    noteText,
    lastNoteStaff,
  });
});

// ===== API: نداء تلميذ جديد =====
app.post('/api/next', (req, res) => {
  const { staffName, studentNumber, gender } = req.body;

  if (!studentNumber) return res.status(400).json({ message: 'رقم التلميذ مطلوب' });

  const parsedNumber = Number(studentNumber);
  if (Number.isNaN(parsedNumber)) return res.status(400).json({ message: 'رقم التلميذ غير صالح' });

  // أضف الرقم الحالي للتاريخ قبل التحديث
  if (currentNumber > 0) {
    history.unshift(currentNumber);
    if (history.length > 15) history.pop();

    if (currentGender === 'men') {
      historyMen.unshift(currentNumber);
      if (historyMen.length > 15) historyMen.pop();
    } else if (currentGender === 'women') {
      historyWomen.unshift(currentNumber);
      if (historyWomen.length > 15) historyWomen.pop();
    }
  }

  currentNumber = parsedNumber;
  currentGender = gender || '';

  // تحديث الإحصائيات
  const stats = loadStats();
  stats.totalCalls += 1;
  if (staffName) stats.perStaff[staffName] = (stats.perStaff[staffName] || 0) + 1;

  const today = omanDateKey();
  stats.perDay[today] = (stats.perDay[today] || 0) + 1;

  saveStats(stats);

  res.json({ success: true });
});

// ===== API: إعادة نداء التلميذ الحالي =====
app.post('/api/repeat', (req, res) => {
  res.json({ success: true });
});

// ===== API: تصفير الدور =====
app.post('/api/reset', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ message: 'غير مصرح' });

  currentNumber = 0;
  currentGender = '';
  history = [];
  historyMen = [];
  historyWomen = [];

  res.json({ message: 'تم تصفير الدور بالكامل.' });
});

// ===== API: الملاحظة العامة =====
app.post('/api/note', (req, res) => {
  const { note, staffName } = req.body;
  noteText = note || '';
  lastNoteStaff = staffName || '';
  res.json({ success: true });
});

// ===== API: تسجيل الدخول =====
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = loadUsers();
  const user = users.find((u) => u.username === username && u.password === password);

  if (!user) return res.status(401).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });

  res.json({ success: true, username: user.username, role: user.role });
});

// ===== API: إدارة المستخدمين (Admin) =====
app.get('/api/users', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ message: 'غير مصرح' });
  res.json(loadUsers());
});

app.post('/api/users', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ message: 'غير مصرح' });

  const { username, password, role } = req.body;
  if (!username || !password || !role) return res.status(400).json({ message: 'بيانات ناقصة' });

  const users = loadUsers();
  if (users.find((u) => u.username === username)) {
    return res.status(400).json({ message: 'اسم المستخدم مستخدم مسبقًا' });
  }

  users.push({ username, password, role });
  saveUsers(users);
  res.json({ message: 'تم إضافة المستخدم بنجاح' });
});

app.put('/api/users/:username/password', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ message: 'غير مصرح' });

  const username = req.params.username;
  const { newPassword } = req.body;
  if (!newPassword) return res.status(400).json({ message: 'أدخل كلمة مرور جديدة' });

  const users = loadUsers();
  const user = users.find((u) => u.username === username);
  if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

  user.password = newPassword;
  saveUsers(users);
  res.json({ message: 'تم تحديث كلمة المرور' });
});

app.delete('/api/users/:username', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ message: 'غير مصرح' });

  const username = req.params.username;
  const users = loadUsers();
  const filtered = users.filter((u) => u.username !== username);

  if (filtered.length === users.length) return res.status(404).json({ message: 'المستخدم غير موجود' });

  saveUsers(filtered);
  res.json({ message: 'تم حذف المستخدم' });
});

// ===== API: الإحصائيات (Admin) =====
app.get('/api/stats', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ message: 'غير مصرح' });
  res.json(loadStats());
});

app.post('/api/reset-stats', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'غير مصرح' });

  const stats = baseStats();
  stats.lastDayKey = omanDateKey();
  saveStats(stats);

  res.json({ success: true, message: 'تم تصفير الإحصائيات بنجاح.' });
});

// ===== ملاحظات المدير الخاصة لكل موظف =====
app.post('/api/staff-note', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ message: 'غير مصرح' });

  const { staffName, note } = req.body;
  if (!staffName) return res.status(400).json({ message: 'اسم الموظف مطلوب' });

  staffNotes[staffName] = note || '';
  res.json({ message: 'تم حفظ الملاحظة', staffName, note: staffNotes[staffName] });
});

app.get('/api/staff-note', (req, res) => {
  const staffName = req.query.staffName;
  if (!staffName) return res.status(400).json({ message: 'اسم الموظف مطلوب' });
  res.json({ staffName, note: staffNotes[staffName] || '' });
});

// ===== تشغيل السيرفر =====
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
