const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
// مهم لـ Render:
const PORT = process.env.PORT || 3000;

// ===== إعدادات عامة =====
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== حالة الدور (Queue State) في الذاكرة =====
let currentNumber = 0;     // رقم التلميذ الحالي
let currentGender = '';    // تصنيف التلميذ الحالي: men / women
let history = [];          // آخر 15 رقم تلميذ (سجل عام سابق)
let historyMen = [];       // أرقام التلاميذ (رجال) السابقين
let historyWomen = [];     // أرقام التلاميذ (نساء) السابقين
let noteText = '';         // الملاحظة العامة التي تظهر على شاشة العرض
let lastNoteStaff = '';    // اسم الموظف الذي كتب آخر ملاحظة عامة

// ===== ملاحظات خاصة من المدير لكل موظف (لا تظهر على شاشة العرض) =====
let staffNotes = {};       // { staffName: note }

// ===== إعداد مدير النظام =====
const ADMIN_SECRET = 'asm-admin-2025'; // كلمة سر لوحة المدير

// ===== دوال مساعدة للمستخدمين =====
function loadUsers() {
  try {
    const data = fs.readFileSync(path.join(__dirname, 'users.json'), 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error loading users.json', err);
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(
    path.join(__dirname, 'users.json'),
    JSON.stringify(users, null, 2),
    'utf8'
  );
}

// ===== دوال مساعدة للإحصائيات =====
function loadStats() {
  try {
    const data = fs.readFileSync(path.join(__dirname, 'stats.json'), 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error loading stats.json', err);
    return { totalCalls: 0, perStaff: {}, perDay: {} };
  }
}

function saveStats(stats) {
  fs.writeFileSync(
    path.join(__dirname, 'stats.json'),
    JSON.stringify(stats, null, 2),
    'utf8'
  );
}

// ===== دوال مساعدة لصلاحيات المدير =====
function isAdmin(req) {
  const secret = req.query.adminSecret || req.body.adminSecret;
  return secret === ADMIN_SECRET;
}

// ===== واجهات خاصة بالدور (Queue APIs) =====

// إرجاع حالة الدور الحالية لشاشة العرض والموظف
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

// نداء تلميذ - الموظف يختار رقم التلميذ والجنس
app.post('/api/next', (req, res) => {
  const { staffName, studentNumber, gender } = req.body;

  if (!studentNumber) {
    return res.status(400).json({ message: 'رقم التلميذ مطلوب' });
  }

  const parsedNumber = Number(studentNumber);
  if (Number.isNaN(parsedNumber)) {
    return res.status(400).json({ message: 'رقم التلميذ غير صالح' });
  }

  // إدراج التلميذ الحالي (السابق) في السجلات المناسبة قبل التحديث
  if (currentNumber > 0) {
    history.unshift(currentNumber);
    if (history.length > 15) {
      history.pop();
    }

    if (currentGender === 'men') {
      historyMen.unshift(currentNumber);
      if (historyMen.length > 15) historyMen.pop();
    } else if (currentGender === 'women') {
      historyWomen.unshift(currentNumber);
      if (historyWomen.length > 15) historyWomen.pop();
    }
  }

  // تحديث التلميذ الحالي بالجديد
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

// إعادة نداء نفس التلميذ بدون تغيير الرقم
app.post('/api/repeat', (req, res) => {
  res.json({
    currentNumber,
    currentGender,
    history,
    historyMen,
    historyWomen
  });
});

// تصفير الدور (مدير فقط)
app.post('/api/reset', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ message: 'غير مصرح' });
  }
  currentNumber = 0;
  currentGender = '';
  history = [];
  historyMen = [];
  historyWomen = [];
  res.json({ message: 'تم تصفير الدور' });
});

// تحديث الملاحظة العامة التي تظهر على شاشة العرض
app.post('/api/note', (req, res) => {
  const { note, staffName } = req.body;
  noteText = note || '';
  lastNoteStaff = staffName || '';
  res.json({ noteText, lastNoteStaff });
});

// ===== واجهات الدخول وإدارة المستخدمين =====

// تسجيل الدخول (يستخدم لشاشة دخول الموظف)
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
    username: user.username,
    role: user.role
  });
});

// عرض جميع المستخدمين (مدير فقط)
app.get('/api/users', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ message: 'غير مصرح' });
  }
  const users = loadUsers();
  res.json(users);
});

// إضافة مستخدم جديد
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
  const lengthBefore = users.length;
  users = users.filter((u) => u.username !== username);

  if (users.length === lengthBefore) {
    return res.status(404).json({ message: 'المستخدم غير موجود' });
  }

  saveUsers(users);
  res.json({ message: 'تم حذف المستخدم' });
});

// ===== واجهة الإحصائيات للمدير =====
app.get('/api/stats', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ message: 'غير مصرح' });
  }
  const stats = loadStats();
  res.json(stats);
});

// ===== ملاحظات من المدير لموظف معيّن (لا تظهر على شاشة العرض) =====

// حفظ/تحديث ملاحظة لموظف معيّن - مدير فقط
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

// جلب ملاحظة الموظف (يستخدمها شاشة الموظف)
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
