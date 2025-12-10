const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
// البورت من Render أو 3000 محلياً
const PORT = process.env.PORT || 3000;

// مسارات الملفات
const statsFile = path.join(__dirname, 'stats.json');
const usersFile = path.join(__dirname, 'users.json');

// كلمة سر المدير (Admin Secret)
const ADMIN_SECRET = '2626';

// إعداد Express
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== دوال مساعدة عامة =====
function readJSON(file) {
  try {
    const data = fs.readFileSync(file, 'utf8');
    return JSON.parse(data || '{}');
  } catch (err) {
    console.error('Error reading JSON file:', file, err.message);
    return {};
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// ===== دوال الإحصائيات =====
function baseStats() {
  return {
    totalCalls: 0,
    perStaff: {},
    perDay: {}
  };
}

function loadStats() {
  const raw = readJSON(statsFile);
  return {
    totalCalls: raw.totalCalls || 0,
    perStaff: raw.perStaff || {},
    perDay: raw.perDay || {}
  };
}

function saveStats(stats) {
  writeJSON(statsFile, stats);
}

// ===== دوال المستخدمين =====
function loadUsers() {
  const data = readJSON(usersFile);
  if (Array.isArray(data)) return data;
  return [];
}

function saveUsers(users) {
  writeJSON(usersFile, users);
}

// ===== دوال صلاحيات المدير =====
function isAdmin(req) {
  const secret = (req.query && req.query.adminSecret) ||
                 (req.body && req.body.adminSecret);
  return secret === ADMIN_SECRET;
}

// ===== حالة الدور في الذاكرة =====
let currentNumber = 0;     // رقم التلميذ الحالي
let currentGender = '';    // men / women
let history = [];          // آخر أرقام بشكل عام (حتى 15)
let historyMen = [];       // آخر أرقام للرجال
let historyWomen = [];     // آخر أرقام للنساء
let noteText = '';         // آخر ملاحظة عامة تظهر على شاشة العرض
let lastNoteStaff = '';    // اسم الموظف صاحب آخر ملاحظة عامة

// ملاحظات خاصة من المدير لكل موظف
let staffNotes = {};       // { staffName: note }

// ===== API عرض الصفحة الرئيسية (اختياري) =====
app.get('/', (req, res) => {
  // نوجه لأي صفحة تحبها، مثلاً صفحة تسجيل الدخول:
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ===== API حالة الدور (لشاشة العرض ولوحة الموظف) =====
app.get('/api/state', (req, res) => {
  res.json({
    currentNumber,
    currentGender,
    history,
    historyMen,
    historyWomen,
    noteText,
    lastNoteStaff
  });
});

// ===== API نداء تلميذ جديد =====
app.post('/api/next', (req, res) => {
  const { staffName, studentNumber, gender } = req.body;

  if (!studentNumber) {
    return res.status(400).json({ message: 'رقم التلميذ مطلوب' });
  }

  const parsedNumber = Number(studentNumber);
  if (Number.isNaN(parsedNumber)) {
    return res.status(400).json({ message: 'رقم التلميذ غير صالح' });
  }

  // لو في رقم حالي، نضيفه للتاريخ قبل التحديث
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

  // تحديث الرقم الحالي
  currentNumber = parsedNumber;
  currentGender = gender || '';

  // تحديث الإحصائيات
  const stats = loadStats();
  stats.totalCalls += 1;

  if (staffName) {
    stats.perStaff[staffName] = (stats.perStaff[staffName] || 0) + 1;
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  stats.perDay[today] = (stats.perDay[today] || 0) + 1;

  saveStats(stats);

  res.json({
    currentNumber,
    currentGender,
    history,
    historyMen,
    historyWomen
  });
});

// ===== API إعادة نداء التلميذ الحالي (بدون تغيير الرقم) =====
app.post('/api/repeat', (req, res) => {
  res.json({
    currentNumber,
    currentGender,
    history,
    historyMen,
    historyWomen
  });
});

// ===== API تصفير الدور (الرقم الحالي والتواريخ فقط) =====
app.post('/api/reset', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ message: 'غير مصرح' });
  }

  currentNumber = 0;
  currentGender = '';
  history = [];
  historyMen = [];
  historyWomen = [];

  res.json({ message: 'تم تصفير الدور بالكامل.' });
});

// ===== API الملاحظة العامة التي تظهر على شاشة العرض =====
app.post('/api/note', (req, res) => {
  const { note, staffName } = req.body;
  noteText = note || '';
  lastNoteStaff = staffName || '';
  res.json({ noteText, lastNoteStaff });
});

// ===== تسجيل الدخول للموظفين (لوحة الموظف) =====
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = loadUsers();

  const user = users.find(
    (u) => u.username === username && u.password === password
  );

  if (!user) {
    return res.status(401).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }

  res.json({
    success: true,
    username: user.username,
    role: user.role
  });
});

// ===== إدارة المستخدمين (المدير فقط) =====

// عرض جميع المستخدمين
app.get('/api/users', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ message: 'غير مصرح' });
  }
  const users = loadUsers();
  res.json(users);
});

// إضافة مستخدم
app.post('/api/users', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ message: 'غير مصرح' });
  }

  const { username, password, role } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ message: 'بيانات ناقصة' });
  }

  const users = loadUsers();
  if (users.find((u) => u.username === username)) {
    return res.status(400).json({ message: 'اسم المستخدم مستخدم مسبقًا' });
  }

  users.push({ username, password, role });
  saveUsers(users);

  res.json({ message: 'تم إضافة المستخدم بنجاح' });
});

// تغيير كلمة مرور مستخدم
app.put('/api/users/:username/password', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ message: 'غير مصرح' });
  }

  const username = req.params.username;
  const { newPassword } = req.body;

  if (!newPassword) {
    return res.status(400).json({ message: 'أدخل كلمة مرور جديدة' });
  }

  const users = loadUsers();
  const user = users.find((u) => u.username === username);
  if (!user) {
    return res.status(404).json({ message: 'المستخدم غير موجود' });
  }

  user.password = newPassword;
  saveUsers(users);

  res.json({ message: 'تم تحديث كلمة المرور' });
});

// حذف مستخدم
app.delete('/api/users/:username', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ message: 'غير مصرح' });
  }

  const username = req.params.username;
  let users = loadUsers();
  const before = users.length;

  users = users.filter((u) => u.username !== username);

  if (users.length === before) {
    return res.status(404).json({ message: 'المستخدم غير موجود' });
  }

  saveUsers(users);
  res.json({ message: 'تم حذف المستخدم' });
});

// ===== الإحصائيات (المدير فقط) =====
app.get('/api/stats', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ message: 'غير مصرح' });
  }
  const stats = loadStats();
  res.json(stats);
});

// تصفير الإحصائيات فقط (بدون لمس الدور)
app.post('/api/reset-stats', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ success: false, message: 'غير مصرح' });
  }

  const stats = baseStats();
  saveStats(stats);

  res.json({ success: true, message: 'تم تصفير الإحصائيات بنجاح.' });
});

// ===== ملاحظات المدير الخاصة لكل موظف =====

// حفظ / تحديث ملاحظة لموظف معين
app.post('/api/staff-note', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ message: 'غير مصرح' });
  }

  const { staffName, note } = req.body;
  if (!staffName) {
    return res.status(400).json({ message: 'اسم الموظف مطلوب' });
  }

  staffNotes[staffName] = note || '';
  res.json({
    message: 'تم حفظ الملاحظة',
    staffName,
    note: staffNotes[staffName]
  });
});

// جلب ملاحظة موظف معين (تظهر في لوحة الموظف)
app.get('/api/staff-note', (req, res) => {
  const staffName = req.query.staffName;
  if (!staffName) {
    return res.status(400).json({ message: 'اسم الموظف مطلوب' });
  }

  res.json({
    staffName,
    note: staffNotes[staffName] || ''
  });
});

// ===== تشغيل السيرفر =====
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
