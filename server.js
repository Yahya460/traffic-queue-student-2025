const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const statsFile = path.join(__dirname, 'stats.json');
const usersFile = path.join(__dirname, 'users.json');

// قراءة البيانات من ملف JSON
function readJSON(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// حفظ البيانات إلى ملف JSON
function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// API — طلب رقم جديد
app.post('/api/next', (req, res) => {
    const stats = readJSON(statsFile);
    stats.last++;
    stats.history.push(stats.last);

    if (stats.history.length > 50) {
        stats.history.shift();
    }

    writeJSON(statsFile, stats);
    res.json({ number: stats.last });
});

// API — الحصول على الحالة
app.get('/api/stats', (req, res) => {
    res.json(readJSON(statsFile));
});

// تسجيل الدخول
app.post('/api/login', (req, res) => {
    const users = readJSON(usersFile);
    const { username, password } = req.body;

    const user = users.find(
        (u) => u.username === username && u.password === password
    );

    if (user) {
        res.json({ success: true, role: user.role });
    } else {
        res.json({ success: false });
    }
});

// 🚀 أهم شيء — البورت الذي يعطيه Render
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
