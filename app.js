// v2.0.0 - Migrated to Firebase Firestore
// Firebase initialized in firebase-config.js
// Access via: firebase.auth(), firebase.firestore()

// Helper to check if Firebase is available
const isFirebaseReady = () => window.firebase && typeof firebase.auth === 'function';

// Helper to get Firestore instance
const getDB = () => window.firebaseFirestore || (typeof firebase !== 'undefined' && typeof firebase.firestore === 'function' ? firebase.firestore() : null);

let userSession = null;
let financeChart = null;
let monthlyChartObj = null;
let savingsChartObj = null;
let transactions = [];
let reminders = [];
let currentDrawerTab = 'alerts';

// Load profile from localStorage as fallback
const savedProfile = localStorage.getItem('ft_profile');
let userProfile = savedProfile ? JSON.parse(savedProfile) : {
    full_name: 'Admin User',
    email: 'admin@example.com',
    currency_symbol: '₹',
    monthly_savings_goal: 15000
};

// Load credentials from localStorage
const savedCreds = localStorage.getItem('ft_credentials');
let userCredentials = savedCreds ? JSON.parse(savedCreds) : {
    login_id: 'Ahir5151',
    password: '85515151'
};

// --- UTILS ---

function animateNumber(id, endValue) {
    const el = document.getElementById(id);
    if (!el) return;
    const symbol = userProfile ? userProfile.currency_symbol : '₹';
    // Parse previous value, preserving sign
    const prevText = el.innerText.replace(symbol, '').replace(/,/g, '').trim();
    const startValue = parseFloat(prevText) || 0;
    const duration = 900;
    let startTime = null;

    // Color the element based on positive/negative
    el.style.color = endValue < 0 ? '#f87171' : '';

    function step(timestamp) {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(eased * (endValue - startValue) + startValue);
        const sign = current < 0 ? '-' : '';
        el.innerText = `${sign}${symbol} ${Math.abs(current).toLocaleString()}`;
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    }
    window.requestAnimationFrame(step);
}

// --- AUTH ---

// Tab Switching
function switchAuthTab(tab) {
    const signinContent = document.getElementById('signin-content');
    const signupContent = document.getElementById('signup-content');
    const tabSignin = document.getElementById('tab-signin');
    const tabSignup = document.getElementById('tab-signup');
    const err = document.getElementById('authError');
    if (err) err.innerText = '';

    if (tab === 'signin') {
        signinContent.style.display = 'block';
        signupContent.style.display = 'none';
        tabSignin.classList.add('active');
        tabSignup.classList.remove('active');
    } else {
        signinContent.style.display = 'none';
        signupContent.style.display = 'block';
        tabSignup.classList.add('active');
        tabSignin.classList.remove('active');
    }
}

// Single listener for Auth State
if (isFirebaseReady()) {
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            userSession = {
                firebaseUser: user,
                id: user.uid,
                email: user.email,
                name: user.displayName || userProfile.full_name
            };
            // Ensure UI stays logged in
            const loginWrapper = document.getElementById("login-wrapper");
            const dashboardContainer = document.getElementById("dashboard-container");
            if (loginWrapper) loginWrapper.style.display = "none";
            if (dashboardContainer) dashboardContainer.style.display = "block";
            loadDashboard();
        } else {
            userSession = null;
            const loginWrapper = document.getElementById("login-wrapper");
            const dashboardContainer = document.getElementById("dashboard-container");
            if (loginWrapper) loginWrapper.style.display = "flex";
            if (dashboardContainer) dashboardContainer.style.display = "none";
        }
    });
}

async function firebaseSignup() {
    const email = document.getElementById("signupEmail").value.trim();
    const loginId = document.getElementById("signupLoginId").value.trim();
    const pass = document.getElementById("signupPass").value;
    const confirm = document.getElementById("signupPassConfirm").value;
    const err = document.getElementById("authError");

    if (!loginId) { err.innerText = "❌ Login ID is required!"; return; }
    if (pass !== confirm) { err.innerText = "❌ Passwords do not match!"; return; }

    err.innerText = "Creating account...";
    try {
        const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, pass);
        const user = userCredential.user;
        const fdb = getDB();
        if (fdb) {
            await fdb.collection('profiles').doc(user.uid).set({
                user_id: user.uid, login_id: loginId, full_name: 'New User',
                email: email, currency_symbol: '₹', monthly_savings_goal: 5000
            });
            await fdb.collection('loginIds').doc(loginId).set({ email: email, uid: user.uid });
        }
        userCredentials.login_id = loginId;
        localStorage.setItem('ft_credentials', JSON.stringify(userCredentials));
        err.innerText = "";
    } catch (error) {
        err.innerText = "❌ " + error.message;
    }
}

async function firebaseResetPassword() {
    const email = document.getElementById("loginEmail").value.trim();
    const err = document.getElementById("authError");

    if (!email || !email.includes('@')) {
        err.innerText = "❌ Please enter your Email first to reset passowrd.";
        return;
    }

    try {
        await firebase.auth().sendPasswordResetEmail(email);
        alert("📩 Reset link sent to your email!");
    } catch (error) {
        err.innerText = "❌ " + error.message;
    }
}
async function firebaseLogin() {
    let identifier = document.getElementById("loginEmail").value.trim();
    const pass = document.getElementById("loginPass").value;
    const err = document.getElementById("authError");

    if (!identifier || !pass) { err.innerText = "❌ Please enter your identifier and password."; return; }
    err.innerText = "Authenticating...";

    try {
        const isEmail = identifier.includes('@');
        let email = identifier;

        if (!isEmail) {
            const fdb = getDB();

            // If Firestore not available, try resolving from localStorage immediately
            if (!fdb) {
                const localCreds = userCredentials || JSON.parse(localStorage.getItem('ft_credentials') || '{}');
                const profile = userProfile || JSON.parse(localStorage.getItem('ft_profile') || '{}');
                if (localCreds.login_id === identifier) {
                    const fallbackEmail = profile.email || localCreds.email;
                    if (fallbackEmail) {
                        try {
                            await firebase.auth().signInWithEmailAndPassword(fallbackEmail, pass);
                            err.innerText = '';
                            return;
                        } catch (e2) {
                            const e2msg = (e2 && e2.message) ? e2.message : '';
                            err.innerText = (e2msg.includes('invalid-credential') || e2msg.includes('INVALID_PASSWORD')) ? '❌ Incorrect Login ID or Password.' : '❌ ' + e2msg;
                            return;
                        }
                    }
                }
                err.innerText = '❌ Database not ready. Please use your Email Address.';
                return;
            }

            const doc = await fdb.collection('loginIds').doc(identifier).get();
            if (!doc.exists || !doc.data().email) throw new Error('LOGIN_ID_NOT_FOUND');
            email = doc.data().email;
        }

        await firebase.auth().signInWithEmailAndPassword(email, pass);
        err.innerText = "";
    } catch (error) {
        console.error('Login error:', error);
        // Handle permission errors with a local fallback for Login ID resolution
        const errMsg = (error && error.message) ? error.message : '';
        const errCode = (error && error.code) ? error.code : '';

        // If Firestore permission error or missing mapping, try resolving login ID from local profile/credentials
        if (!identifier.includes('@') && (errMsg.toLowerCase().includes('permission') || errCode === 'permission-denied' || errMsg.includes('LOGIN_ID_NOT_FOUND') || errMsg.includes('Database not ready'))) {
            const localCreds = userCredentials || JSON.parse(localStorage.getItem('ft_credentials') || '{}');
            const profile = userProfile || JSON.parse(localStorage.getItem('ft_profile') || '{}');
            if (localCreds.login_id === identifier) {
                const fallbackEmail = profile.email || localCreds.email;
                if (fallbackEmail) {
                    try {
                        await firebase.auth().signInWithEmailAndPassword(fallbackEmail, pass);
                        err.innerText = "";
                        return;
                    } catch (e2) {
                        console.error('Fallback sign-in failed:', e2);
                        err.innerText = "❌ Incorrect Email/Login ID or Password.";
                        return;
                    }
                }
            }
        }

        let msg = errMsg;
        if (msg.includes("LOGIN_ID_NOT_FOUND")) msg = "Login ID not found. Please use your Email Address.";
        else if (msg.includes("auth/invalid-credential") || msg.includes("auth/invalid-login-credentials") || msg.includes('INVALID_PASSWORD')) msg = "Incorrect Email/Login ID or Password.";
        else if (errMsg.toLowerCase().includes('permission')) msg = "Missing or insufficient permissions to lookup Login ID. Use Email or configure Firestore rules.";
        err.innerText = "❌ " + msg;
    }
}
// Export to window
window.login = firebaseLogin;

// Firebase Google Sign-In
async function signInWithGoogle() {
    const err = document.getElementById("authError");
    err.innerText = "Signing in with Google...";

    try {
        if (!window.firebase || typeof firebase.auth !== 'function') {
            throw new Error('Firebase authentication is not available right now.');
        }

        if (!window.googleProvider) {
            throw new Error('Google sign-in provider is not configured.');
        }

        const result = await firebase.auth().signInWithPopup(window.googleProvider);
        const user = result.user;
        
        // Update profile with Google user info
        userProfile.full_name = user.displayName || 'Google User';
        userProfile.email = user.email;
        localStorage.setItem('ft_profile', JSON.stringify(userProfile));
        
        err.innerText = "";
    } catch (error) {
        console.error('Google sign-in error:', error);
        err.innerText = "❌ Google sign-in failed: " + error.message;
    }
}

function logout() {
    firebase.auth().signOut().then(() => {
        userSession = null;
        document.getElementById("login-wrapper").style.display = "flex";
        document.getElementById("dashboard-container").style.display = "none";
        document.getElementById("loginEmail").value = "";
        document.getElementById("loginPass").value = "";
        document.getElementById("signupEmail").value = "";
        document.getElementById("signupPass").value = "";
        document.getElementById("signupPassConfirm").value = "";
    });
}

function togglePassword(inputId) {
    const passInput = document.getElementById(inputId);
    // Find the toggle button inside the same wrapper
    const toggleBtn = passInput.nextElementSibling;
    if (passInput.type === "password") {
        passInput.type = "text";
        if (toggleBtn) toggleBtn.innerText = "Hide";
    } else {
        passInput.type = "password";
        if (toggleBtn) toggleBtn.innerText = "Show";
    }
}

// --- DASHBOARD LOGIC ---

async function loadDashboard() {
    if (!userSession) return;
    const fdb = getDB();
    if (!fdb) return;

    const overlay = document.getElementById("loading-overlay");
    if (overlay) overlay.style.display = "flex";

    try {
        const snap = await fdb.collection('transactions')
            .where('user_id', '==', userSession.id)
            .get();

        transactions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => {
                const ta = a.created_at && a.created_at.toMillis ? a.created_at.toMillis() : 0;
                const tb = b.created_at && b.created_at.toMillis ? b.created_at.toMillis() : 0;
                return tb - ta;
            });

        // Sync and load user reminders
        try {
            const snapRem = await fdb.collection('reminders')
                .where('user_id', '==', userSession.id)
                .get();
            reminders = snapRem.docs.map(doc => ({ id: doc.id, ...doc.data() }))
                .sort((a, b) => (parseInt(a.date) || 0) - (parseInt(b.date) || 0));
        } catch (remErr) {
            console.error("Error loading reminders, falling back to empty:", remErr);
            reminders = [];
        }

        renderDashboard();
        await loadProfile();
    } catch (error) {
        console.error("Dashboard Load Error:", error);
        alert("Error loading data: " + error.message);
    } finally {
        if (overlay) overlay.style.display = "none";
    }
}

// --- PROFILE ---

async function loadProfile() {
    if (!userSession) return;
    const fdb = getDB();
    if (!fdb) return;
    try {
        const doc = await fdb.collection('profiles').doc(userSession.id).get();
        if (doc.exists) {
            userProfile = { id: doc.id, ...doc.data() };
            localStorage.setItem('ft_profile', JSON.stringify(userProfile));
        } else {
            const profileData = {
                user_id: userSession.id,
                full_name: userProfile.full_name || 'Finance User',
                email: userProfile.email || userSession.email,
                currency_symbol: userProfile.currency_symbol || '₹',
                monthly_savings_goal: userProfile.monthly_savings_goal || 5000
            };
            await fdb.collection('profiles').doc(userSession.id).set(profileData);
            userProfile = { id: userSession.id, ...profileData };
            localStorage.setItem('ft_profile', JSON.stringify(userProfile));
        }
    } catch (e) {
        console.warn('Profile sync failed.', e);
    }
    updateProfileUI();
}

function updateProfileUI() {
    const nameEl = document.getElementById("profFullName");
    const emailEl = document.getElementById("profEmail");
    const goalEl = document.getElementById("profGoalVal");
    const currEl = document.getElementById("profCurrencyVal");
    const loginIdEl = document.getElementById("profLoginId");

    if (nameEl) nameEl.innerText = userProfile.full_name || 'Admin User';
    if (emailEl) emailEl.innerText = userProfile.email || 'No email set';
    if (goalEl) goalEl.innerText = `${userProfile.currency_symbol} ${Number(userProfile.monthly_savings_goal || 0).toLocaleString()}`;
    if (currEl) currEl.innerText = userProfile.currency_symbol;
    
    // Use login_id from profile if available, else fallback to credentials
    if (loginIdEl) loginIdEl.innerText = userProfile.login_id || userCredentials.login_id;
}

// --- CREDENTIAL MANAGEMENT ---

function toggleCredentialForm() {
    const form = document.getElementById("credential-form");
    if (!form) return;
    const isHidden = form.style.display === "none" || form.style.display === "";
    form.style.display = isHidden ? "block" : "none";
    if (isHidden) {
        // Pre-fill current ID so user can see it
        const newLoginId = document.getElementById("newLoginId");
        const currentPassVerify = document.getElementById("currentPassVerify");
        const newPassword = document.getElementById("newPassword");
        const confirmPassword = document.getElementById("confirmPassword");
        const credError = document.getElementById("credError");

        if (newLoginId) newLoginId.value = userCredentials.login_id;
        if (currentPassVerify) currentPassVerify.value = "";
        if (newPassword) newPassword.value = "";
        if (confirmPassword) confirmPassword.value = "";
        if (credError) credError.innerText = "";
    }
}

function toggleCredPass(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === "password") {
        input.type = "text";
        btn.innerText = "Hide";
    } else {
        input.type = "password";
        btn.innerText = "Show";
    }
}

function saveCredentials() {
    const newId = document.getElementById("newLoginId").value.trim();
    const currentPass = document.getElementById("currentPassVerify").value;
    const newPass = document.getElementById("newPassword").value;
    const confirmPass = document.getElementById("confirmPassword").value;
    const errEl = document.getElementById("credError");
    errEl.innerText = "";

    if (currentPass !== userCredentials.password) { errEl.innerText = "❌ Current password is incorrect."; return; }
    if (!newId) { errEl.innerText = "❌ User ID cannot be empty."; return; }
    if (newPass && newPass !== confirmPass) { errEl.innerText = "❌ New passwords do not match."; return; }
    if (newPass && newPass.length < 6) { errEl.innerText = "❌ Password must be at least 6 characters."; return; }

    const oldId = userCredentials.login_id;
    userCredentials.login_id = newId;
    if (newPass) userCredentials.password = newPass;
    localStorage.setItem('ft_credentials', JSON.stringify(userCredentials));

    // Update Firestore loginIds mapping if login_id changed
    const fdb = getDB();
    if (fdb && userSession && newId !== oldId) {
        fdb.collection('loginIds').doc(newId).set({ email: userSession.email, uid: userSession.id })
            .then(() => fdb.collection('loginIds').doc(oldId).delete())
            .then(() => fdb.collection('profiles').doc(userSession.id).update({ login_id: newId }))
            .catch(e => console.warn('Could not update login ID in Firestore', e));
    }

    updateProfileUI();
    toggleCredentialForm();
    alert(`✅ Credentials updated!\n\nNew Login ID: ${userCredentials.login_id}\n\nUse these next time you log in.`);
}

function getDaysUntil(targetDayStr) {
    const targetDay = parseInt(targetDayStr);
    if (isNaN(targetDay) || targetDay < 1 || targetDay > 31) return 999;

    const now = new Date();
    const today = now.getDate();
    
    if (targetDay >= today) {
        return targetDay - today;
    } else {
        const year = now.getFullYear();
        const month = now.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        return (daysInMonth - today) + targetDay;
    }
}

function getEmiStatus(t) {
    const emiDay = parseInt(t.date);
    const pending = parseInt(t.pending_count || 0);
    if (pending <= 0) return { status: 'completed', message: 'Paid off', badgeCount: 0 };

    const now = new Date();
    const today = now.getDate();

    if (today > emiDay) {
        const diff = today - emiDay;
        return { status: 'overdue', message: `Overdue by ${diff} day${diff !== 1 ? 's' : ''}`, badgeCount: 1 };
    } else {
        const diff = emiDay - today;
        if (diff === 0) {
            return { status: 'due-today', message: 'Due today', badgeCount: 1 };
        } else if (diff <= 5) {
            return { status: 'due-soon', message: `Due in ${diff} day${diff !== 1 ? 's' : ''}`, badgeCount: 1 };
        } else {
            return { status: 'later', message: `Due in ${diff} days`, badgeCount: 0 };
        }
    }
}

function getReminderStatus(remDateStr, lastCompletedMonth) {
    const remDate = parseInt(remDateStr);
    if (isNaN(remDate)) return { status: 'none', message: '', badgeCount: 0 };

    const now = new Date();
    const today = now.getDate();
    const curYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const isCompleted = lastCompletedMonth === curYearMonth;

    if (isCompleted) {
        return { status: 'completed', message: 'Completed', badgeCount: 0 };
    }

    if (today > remDate) {
        const diff = today - remDate;
        return { status: 'overdue', message: `Overdue by ${diff} day${diff !== 1 ? 's' : ''}`, badgeCount: 1 };
    } else {
        const diff = remDate - today;
        if (diff === 0) {
            return { status: 'due-today', message: 'Due today', badgeCount: 1 };
        } else if (diff <= 5) {
            return { status: 'due-soon', message: `Due in ${diff} day${diff !== 1 ? 's' : ''}`, badgeCount: 1 };
        } else {
            return { status: 'later', message: `Due in ${diff} days`, badgeCount: 0 };
        }
    }
}

function updateAlertsAndBadge() {
    const alertsListEl = document.getElementById("alerts-list");
    const alertsBannerEl = document.getElementById("alerts");
    const badgeEl = document.getElementById("notiBadge");
    
    if (!alertsListEl || !alertsBannerEl) return;
    
    alertsListEl.innerHTML = "";
    let activeAlerts = [];
    let badgeCount = 0;
    
    // Check EMIs
    transactions.forEach(t => {
        if (t.type === "EMI") {
            const statusInfo = getEmiStatus(t);
            if (statusInfo.badgeCount > 0) {
                badgeCount += statusInfo.badgeCount;
                activeAlerts.push({
                    id: t.id,
                    type: 'EMI',
                    name: t.name,
                    amount: t.amount,
                    message: statusInfo.message,
                    statusClassName: statusInfo.status,
                    rawStatus: statusInfo.status,
                    date: t.date
                });
            }
        }
    });
    
    // Check Reminders
    reminders.forEach(rem => {
        const statusInfo = getReminderStatus(rem.date, rem.last_completed_month);
        if (statusInfo.badgeCount > 0) {
            badgeCount += statusInfo.badgeCount;
            activeAlerts.push({
                id: rem.id,
                type: 'Reminder',
                text: rem.text,
                message: statusInfo.message,
                statusClassName: statusInfo.status,
                rawStatus: statusInfo.status,
                date: rem.date
            });
        }
    });

    if (activeAlerts.length > 0) {
        alertsBannerEl.style.display = "flex";
        activeAlerts.forEach(alert => {
            const li = document.createElement("li");
            li.style.marginBottom = "4px";
            if (alert.type === "EMI") {
                li.innerHTML = `<strong>EMI:</strong> ${alert.name} (₹${Number(alert.amount).toLocaleString()}) is <span class="status-${alert.rawStatus}" style="font-weight:600; text-transform:lowercase;">${alert.message}</span> (due Day ${alert.date})`;
            } else {
                li.innerHTML = `<strong>Reminder:</strong> ${alert.text} is <span class="status-${alert.rawStatus}" style="font-weight:600; text-transform:lowercase;">${alert.message}</span> (due Day ${alert.date})`;
            }
            alertsListEl.appendChild(li);
        });
    } else {
        alertsBannerEl.style.display = "none";
    }
    
    if (badgeEl) {
        if (badgeCount > 0) {
            badgeEl.innerText = badgeCount;
            badgeEl.style.display = "flex";
        } else {
            badgeEl.style.display = "none";
        }
    }
}

function renderDashboard() {
    let tIncome = 0, tEmi = 0, tPending = 0, tDeposit = 0, tExpense = 0;

    transactions.forEach(t => {
        const amt = parseFloat(t.amount);
        const pending = parseInt(t.pending_count || 0);

        if (t.type === "Income") {
            tIncome += amt;
        } else if (t.type === "Deposit") {
            tDeposit += amt;
        } else if (t.type === "EMI") {
            tEmi += amt;
            tPending += (amt * pending);
        } else if (t.type === "Expense") {
            tExpense += amt;
        }
    });

    // Available Balance = all income sources - all outgoing
    const totalAvailable = (tIncome + tDeposit) - (tEmi + tExpense);
    // Net Savings = what you save from income after EMI & expenses (deposits not counted)
    const netSavings = tIncome - tEmi - tExpense;

    animateNumber("availableBalance", totalAvailable);
    animateNumber("totalIncome", tIncome);
    animateNumber("totalEmi", tEmi);
    animateNumber("totalExpense", tExpense);
    animateNumber("totalSavings", netSavings);
    animateNumber("totalPending", tPending);

    updateChart(tIncome, tEmi, tDeposit, tExpense);

    updateAlertsAndBadge();

    updateQuickStats(tIncome, tDeposit, tEmi, tExpense, netSavings);

    const drawer = document.getElementById("noti-drawer");
    if (drawer && drawer.style.display === "flex") {
        renderDrawerTabsContent();
    }

    renderTable();
}

function updateQuickStats(income, deposit, emi, expense, savings) {
    const sym = userProfile ? userProfile.currency_symbol : '₹';
    const fmt = (v) => `${sym} ${Math.abs(Math.round(v)).toLocaleString()}`;

    const qsIncome  = document.getElementById('qsIncome');
    const qsDeposit = document.getElementById('qsDeposit');
    const qsEmi     = document.getElementById('qsEmi');
    const qsExpense = document.getElementById('qsExpense');
    const qsSavings = document.getElementById('qsSavings');
    const qsCount   = document.getElementById('qsCount');

    if (qsIncome)  qsIncome.textContent  = fmt(income);
    if (qsDeposit) qsDeposit.textContent = fmt(deposit);
    if (qsEmi)     qsEmi.textContent     = fmt(emi);
    if (qsExpense) qsExpense.textContent = fmt(expense);
    if (qsSavings) {
        qsSavings.textContent = (savings < 0 ? '-' : '') + fmt(savings);
        qsSavings.style.color = savings < 0 ? '#f87171' : '';
    }
    if (qsCount) qsCount.textContent = transactions.length;
}

// --- PROFILE TOGGLE ---

function toggleProfile() {
    const prof = document.getElementById("profile-section");
    const dash = document.getElementById("main-dashboard-content");
    const btn = document.querySelector(".btn-profile");

    if (prof.style.display === "none" || prof.style.display === "") {
        prof.style.display = "block";
        prof.style.animation = "none";
        // Force reflow so animation restarts
        void prof.offsetHeight;
        prof.style.animation = "slideDown 0.4s ease-out";
        dash.style.opacity = "0.5";
        dash.style.pointerEvents = "none";
        btn.innerText = "✖ Close Profile";
    } else {
        prof.style.display = "none";
        dash.style.opacity = "1";
        dash.style.pointerEvents = "auto";
        btn.innerText = "👤 Profile";
        disableProfileEdit();
    }
}

function enableProfileEdit() {
    document.getElementById("profile-edit-form").style.display = "block";
    document.getElementById("editProfName").value = userProfile.full_name || '';
    document.getElementById("editProfEmail").value = userProfile.email || '';
    document.getElementById("editProfCurrency").value = userProfile.currency_symbol || '₹';
    document.getElementById("editProfGoal").value = userProfile.monthly_savings_goal || 0;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function disableProfileEdit() {
    document.getElementById("profile-edit-form").style.display = "none";
}

async function saveProfile() {
    const updated = {
        full_name: document.getElementById("editProfName").value.trim(),
        email: document.getElementById("editProfEmail").value.trim(),
        currency_symbol: document.getElementById("editProfCurrency").value,
        monthly_savings_goal: parseFloat(document.getElementById("editProfGoal").value || 0),
        updated_at: new Date().toISOString()
    };
    if (!updated.full_name) return alert("Name cannot be empty.");
    userProfile = { ...userProfile, ...updated };
    localStorage.setItem('ft_profile', JSON.stringify(userProfile));
    try {
        const fdb = getDB();
        if (fdb && userSession) {
            await fdb.collection('profiles').doc(userSession.id).set(updated, { merge: true });
        }
    } catch (e) {
        console.warn('Firestore profile save failed, saved locally.', e);
    }
    updateProfileUI();
    disableProfileEdit();
    renderDashboard();
    alert("✅ Profile updated successfully!");
}

// --- CHART ---

function updateChart(income, emi, deposit, expense) {
    const financeEl = document.getElementById('financeChart');
    const monthlyEl = document.getElementById('monthlyChart');
    const savingsEl = document.getElementById('savingsChart');

    if (!financeEl || !monthlyEl || !savingsEl) return;

    const ctx = financeEl.getContext('2d');
    const monthlyCtx = monthlyEl.getContext('2d');
    const savingsCtx = savingsEl.getContext('2d');

    if (financeChart) {
        financeChart.destroy();
    }
    if (monthlyChartObj) {
        monthlyChartObj.destroy();
    }
    if (savingsChartObj) {
        savingsChartObj.destroy();
    }

    financeChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Income', 'Deposits', 'EMIs', 'Expenses'],
            datasets: [{
                data: [income, deposit, emi, expense],
                backgroundColor: ['#4ade80', '#22d3ee', '#f87171', '#fbbf24'],
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94a3b8', font: { family: 'Outfit' } }
                }
            },
            cutout: '70%'
        }
    });

    const dailyData = {};
    transactions.forEach(t => {
        const day = String(t.date || '').trim().replace(/^0+(\d)/, '$1');
        if(!dailyData[day]) dailyData[day] = { in: 0, out: 0};
        const amt = parseFloat(t.amount);
        if (t.type === 'Income' || t.type === 'Deposit') dailyData[day].in += amt;
        else if (t.type === 'EMI' || t.type === 'Expense') dailyData[day].out += amt;
    });

    const sortedDays = Object.keys(dailyData).sort((a, b) => parseInt(a) - parseInt(b));
    const labels = sortedDays.map(d => `Day ${d}`);
    const dataIn = sortedDays.map(d => dailyData[d].in);
    const dataOut = sortedDays.map(d => dailyData[d].out);

    monthlyChartObj = new Chart(monthlyCtx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Money In',
                    data: dataIn,
                    backgroundColor: '#4ade80',
                    borderRadius: 4
                },
                {
                    label: 'Money Out',
                    data: dataOut,
                    backgroundColor: '#f87171',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94a3b8', font: { family: 'Outfit' } }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#94a3b8', font: { family: 'Outfit' } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { family: 'Outfit' } }
                }
            }
        }
    });

    const targetGoal = parseFloat(userProfile.monthly_savings_goal) || 0;
    const currentSavings = income - emi - expense;
    const savedAmt = Math.max(0, currentSavings);
    const remainingGoal = Math.max(0, targetGoal - savedAmt);

    savingsChartObj = new Chart(savingsCtx, {
        type: 'doughnut',
        data: {
            labels: ['Achieved', 'Remaining'],
            datasets: [{
                data: [savedAmt, remainingGoal],
                backgroundColor: ['#22c55e', 'rgba(255, 255, 255, 0.05)'],
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94a3b8', font: { family: 'Outfit' } }
                }
            },
            cutout: '75%'
        }
    });
}

// --- EMI UTILS ---

function calculateLastEmiDate(dayStr, pendingCount) {
    if (!pendingCount || pendingCount <= 0) return '<span class="status-paid">✅ Paid</span>';
    
    const day = parseInt(dayStr);
    if (isNaN(day)) return '-';

    const now = new Date();
    let targetMonth = now.getMonth();
    let targetYear = now.getFullYear();

    // If the EMI day for this month has already passed, the first 'pending' payment is next month
    // Otherwise, this month's payment is the first of the 'pending' ones.
    if (now.getDate() > day) {
        targetMonth += pendingCount;
    } else {
        targetMonth += (pendingCount - 1);
    }

    // JS Date handles overflow of months automatically
    const lastDate = new Date(targetYear, targetMonth, day);
    
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[lastDate.getMonth()]} ${lastDate.getFullYear()}`;
}

// --- TABLE ---

function normalizeDayValue(value) {
    return String(value || '').trim().replace(/^0+(\d)/, '$1');
}

function syncFilterButtons() {
    const filterInput = document.getElementById("filterDate");
    const allBtn = document.getElementById("filterAllBtn");
    const clearBtn = document.getElementById("filterClearBtn");
    const hasFilter = !!(filterInput && filterInput.value.trim());

    if (allBtn) allBtn.classList.toggle("filter-btn-active", !hasFilter);
    if (clearBtn) clearBtn.classList.toggle("filter-btn-active", hasFilter);
}

function setDateFilter(value) {
    const filterInput = document.getElementById("filterDate");
    if (!filterInput) return;
    filterInput.value = value;
    renderTable();
}

function renderTable() {
    const filter = normalizeDayValue(document.getElementById("filterDate") ? document.getElementById("filterDate").value : '');
    const sym = userProfile.currency_symbol;

    const incomeBody    = document.getElementById("incomeTableBody");
    const depositBody   = document.getElementById("depositTableBody");
    const emiBody       = document.getElementById("emiTableBody");
    const expenseBody   = document.getElementById("expenseTableBody");

    if (!incomeBody || !depositBody || !emiBody || !expenseBody) return;

    incomeBody.innerHTML = "";
    depositBody.innerHTML = "";
    emiBody.innerHTML = "";
    expenseBody.innerHTML = "";

    let incomeCount = 0, depositCount = 0, emiCount = 0, expenseCount = 0;

    transactions.forEach((t) => {
        if (filter && normalizeDayValue(t.date) !== filter) return;

        const actionBtns = `
            <button class="btn-edit" onclick="editTx('${t.id}')">Edit</button>
            <button class="btn-delete" onclick="deleteTx('${t.id}')">Delete</button>
        `;

        if (t.type === "Income") {
            incomeCount++;
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${t.date}</td>
                <td><strong>${t.name}</strong></td>
                <td><span class="badge badge-method">${t.payment_method}</span></td>
                <td>${t.reason || '-'}</td>
                <td class="amt-income">${sym} ${Number(t.amount).toLocaleString()}</td>
                <td>${actionBtns}</td>
            `;
            incomeBody.appendChild(tr);

        } else if (t.type === "Deposit") {
            depositCount++;
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${t.date}</td>
                <td><strong>${t.name}</strong></td>
                <td><span class="badge badge-method">${t.payment_method}</span></td>
                <td>${t.reason || '-'}</td>
                <td class="amt-deposit">${sym} ${Number(t.amount).toLocaleString()}</td>
                <td>${actionBtns}</td>
            `;
            depositBody.appendChild(tr);

        } else if (t.type === "EMI") {
            emiCount++;
            const totalPend = Number(t.amount) * Number(t.pending_count || 0);
            const lastEmiDate = calculateLastEmiDate(t.date, t.pending_count);
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${t.date}</td>
                <td><strong>${t.name}</strong></td>
                <td><span class="badge badge-method">${t.payment_method}</span></td>
                <td class="amt-emi">${sym} ${Number(t.amount).toLocaleString()}</td>
                <td><span class="pending-pill">${t.pending_count || 0} months</span></td>
                <td><strong class="amt-emi">${sym} ${Number(totalPend).toLocaleString()}</strong></td>
                <td class="last-emi-date">${lastEmiDate}</td>
                <td>
                    ${(t.pending_count > 0)
                        ? `<button class="btn-pay" onclick="payEmi('${t.id}', event)">Pay One</button>`
                        : '<span class="status-paid">✅ Paid</span>'
                    }
                    ${actionBtns}
                </td>
            `;
            emiBody.appendChild(tr);

        } else if (t.type === "Expense") {
            expenseCount++;
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${t.date}</td>
                <td><strong>${t.name}</strong></td>
                <td><span class="badge badge-method">${t.payment_method}</span></td>
                <td>${t.reason || '-'}</td>
                <td class="amt-expense">${sym} ${Number(t.amount).toLocaleString()}</td>
                <td>${actionBtns}</td>
            `;
            expenseBody.appendChild(tr);
        }
    });

    // Show empty state rows if no data
    if (incomeCount === 0)  incomeBody.innerHTML  = `<tr><td colspan="6" class="empty-row">No income records yet.</td></tr>`;
    if (depositCount === 0) depositBody.innerHTML = `<tr><td colspan="6" class="empty-row">No deposit records yet.</td></tr>`;
    if (emiCount === 0)     emiBody.innerHTML     = `<tr><td colspan="8" class="empty-row">No EMI records yet.</td></tr>`;
    if (expenseCount === 0) expenseBody.innerHTML = `<tr><td colspan="6" class="empty-row">No expense records yet.</td></tr>`;

    // Update record counts in headers
    const ic = document.getElementById("incomeCount");
    const dc = document.getElementById("depositCount");
    const ec = document.getElementById("emiCount");
    const exc = document.getElementById("expenseCount");
    if (ic)  ic.innerText  = `${incomeCount} record${incomeCount !== 1 ? 's' : ''}`;
    if (dc)  dc.innerText  = `${depositCount} record${depositCount !== 1 ? 's' : ''}`;
    if (ec)  ec.innerText  = `${emiCount} record${emiCount !== 1 ? 's' : ''}`;
    if (exc) exc.innerText = `${expenseCount} record${expenseCount !== 1 ? 's' : ''}`;

    syncFilterButtons();
}

// --- MODAL CONTROLS ---

function openAddModal() {
    document.getElementById("add-modal").style.display = "flex";
    togglePendingVisibility('tType', 'tPendingWrapper');
}

function closeAddModal() {
    document.getElementById("add-modal").style.display = "none";
}

function togglePendingVisibility(typeId, wrapperId) {
    const type = document.getElementById(typeId).value;
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;
    wrapper.style.opacity = (type === "EMI") ? "1" : "0.3";
    const input = wrapper.querySelector('input');
    if (input) input.disabled = (type !== "EMI");
}

// Safe event listeners — wrapped to avoid null errors on load
window.addEventListener('DOMContentLoaded', () => {
    // Redundant auth listener removed (already set up at top level)

    // Login button listener removed (using HTML onclick for consistency)

    const tTypeEl = document.getElementById('tType');
    const editTypeEl = document.getElementById('editType');

    if (tTypeEl) tTypeEl.addEventListener('change', () => togglePendingVisibility('tType', 'tPendingWrapper'));

    if (editTypeEl) editTypeEl.addEventListener('change', () => {
        const type = editTypeEl.value;
        const wrapper = document.getElementById('editPending').parentElement;
        if (wrapper) wrapper.style.opacity = (type === "EMI") ? "1" : "0.3";
        const editPending = document.getElementById('editPending');
        if (editPending) editPending.disabled = (type !== "EMI");
    });
});

// --- CRUD OPERATIONS ---

async function addTransaction() {
    const t = {
        type: document.getElementById("tType").value,
        payment_method: document.getElementById("tMethod").value,
        name: document.getElementById("tName").value.trim(),
        amount: parseFloat(document.getElementById("tAmount").value || 0),
        date: document.getElementById("tDate").value.trim(),
        reason: document.getElementById("tReason").value.trim(),
        user_id: userSession.id,
        pending_count: (document.getElementById("tType").value === "EMI")
            ? parseInt(document.getElementById("tPending").value || 0) : 0,
        created_at: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (!t.name || !t.date) return alert("Please fill in Name and Date.");
    const fdb = getDB();
    if (!fdb) return alert("❌ Database not available.");
    try {
        await fdb.collection('transactions').add(t);
    } catch (error) {
        console.error('Error adding:', error);
        return alert("❌ Failed to add transaction: " + error.message);
    }
    document.getElementById("tName").value = "";
    document.getElementById("tAmount").value = "";
    document.getElementById("tDate").value = "";
    document.getElementById("tReason").value = "";
    document.getElementById("tPending").value = "0";
    closeAddModal();
    loadDashboard();
}

function editTx(id) {
    const t = transactions.find(item => item.id === id);
    if (!t) return;

    document.getElementById("editIndex").value = t.id;
    document.getElementById("editType").value = t.type;
    document.getElementById("editMethod").value = t.payment_method;
    document.getElementById("editName").value = t.name;
    document.getElementById("editAmount").value = t.amount;
    document.getElementById("editDate").value = t.date;
    document.getElementById("editReason").value = t.reason;
    document.getElementById("editPending").value = t.pending_count;

    const wrapper = document.getElementById('editPending').parentElement;
    wrapper.style.opacity = (t.type === "EMI") ? "1" : "0.3";
    document.getElementById('editPending').disabled = (t.type !== "EMI");

    document.getElementById("edit-modal").style.display = "flex";
}

function closeEdit() {
    document.getElementById("edit-modal").style.display = "none";
}

async function saveEdit() {
    const id = document.getElementById("editIndex").value;
    const t = {
        type: document.getElementById("editType").value,
        payment_method: document.getElementById("editMethod").value,
        name: document.getElementById("editName").value.trim(),
        amount: parseFloat(document.getElementById("editAmount").value || 0),
        date: document.getElementById("editDate").value.trim(),
        reason: document.getElementById("editReason").value.trim(),
        pending_count: parseInt(document.getElementById("editPending").value || 0)
    };
    const fdb = getDB();
    if (!fdb) return alert("❌ Database not available.");
    try {
        await fdb.collection('transactions').doc(id).update(t);
    } catch (error) {
        console.error('Error updating:', error);
        return alert("❌ Failed to update transaction.");
    }
    closeEdit();
    loadDashboard();
}

async function deleteTx(id) {
    if (!confirm("Are you sure you want to delete this transaction?")) return;
    const fdb = getDB();
    if (!fdb) return alert("❌ Database not available.");
    try {
        await fdb.collection('transactions').doc(id).delete();
    } catch (error) {
        console.error('Error deleting:', error);
        return alert("❌ Failed to delete transaction.");
    }
    loadDashboard();
}

async function payEmi(id, evt) {
    const t = transactions.find(item => item.id === id);
    if (!t || t.pending_count <= 0) return;
    if (evt && evt.target) { evt.target.innerText = "⏳ Processing..."; evt.target.disabled = true; }
    const fdb = getDB();
    if (!fdb) return;
    try {
        await fdb.collection('transactions').doc(id).update({ pending_count: t.pending_count - 1 });
    } catch (error) {
        console.error('Error paying EMI:', error);
        if (evt && evt.target) { evt.target.innerText = "Pay One"; evt.target.disabled = false; }
        return alert("❌ Failed to process payment.");
    }
    setTimeout(() => loadDashboard(), 400);
}

// --- THEME ---

function toggleTheme() {
    const isLightMode = document.body.classList.toggle('light-mode');
    localStorage.setItem('ft_theme', isLightMode ? 'light' : 'dark');
    
    const btn = document.getElementById('themeToggleBtn');
    if (btn) {
        btn.innerText = isLightMode ? '🌙' : '☀️';
        btn.setAttribute('title', isLightMode ? 'Switch to Dark Mode' : 'Switch to Light Mode');
    }
}

// --- NOTIFICATIONS & REMINDERS SYSTEMS ---

function toggleNotifications() {
    const drawer = document.getElementById("noti-drawer");
    const overlay = document.getElementById("noti-drawer-overlay");
    if (!drawer) return;
    
    const isOpen = drawer.classList.contains("open");
    if (isOpen) {
        drawer.classList.remove("open");
        if (overlay) overlay.style.display = "none";
        setTimeout(() => drawer.style.display = "none", 350);
    } else {
        drawer.style.display = "flex";
        if (overlay) overlay.style.display = "block";
        // Force reflow
        void drawer.offsetHeight;
        drawer.classList.add("open");
        renderDrawerTabsContent();
    }
}

function switchDrawerTab(tab) {
    currentDrawerTab = tab;
    
    // Toggle active classes on tab buttons
    document.querySelectorAll(".drawer-tab").forEach(btn => {
        btn.classList.remove("active");
    });
    const activeTabBtn = document.getElementById(`tab-noti-${tab}`);
    if (activeTabBtn) activeTabBtn.classList.add("active");
    
    // Toggle content divs
    const contents = ['alerts', 'reminders', 'logs'];
    contents.forEach(c => {
        const div = document.getElementById(`drawer-${c}-content`);
        if (div) div.style.display = (c === tab) ? "flex" : "none";
    });
    
    renderDrawerTabsContent();
}

function renderDrawerTabsContent() {
    if (currentDrawerTab === 'alerts') {
        renderDrawerAlerts();
    } else if (currentDrawerTab === 'reminders') {
        renderDrawerReminders();
    } else if (currentDrawerTab === 'logs') {
        renderDrawerLogs();
    }
}

function renderDrawerAlerts() {
    const container = document.getElementById("drawer-alerts-content");
    if (!container) return;
    
    container.innerHTML = "";
    let activeAlerts = [];
    
    // Get EMIs
    transactions.forEach(t => {
        if (t.type === "EMI") {
            const statusInfo = getEmiStatus(t);
            if (statusInfo.status !== 'completed' && statusInfo.status !== 'later') {
                activeAlerts.push({
                    id: t.id,
                    type: 'EMI',
                    name: t.name,
                    amount: t.amount,
                    message: statusInfo.message,
                    status: statusInfo.status,
                    date: t.date,
                    pending: t.pending_count
                });
            }
        }
    });
    
    // Get Reminders
    reminders.forEach(rem => {
        const statusInfo = getReminderStatus(rem.date, rem.last_completed_month);
        if (statusInfo.status !== 'completed' && statusInfo.status !== 'later') {
            activeAlerts.push({
                id: rem.id,
                type: 'Reminder',
                text: rem.text,
                message: statusInfo.message,
                status: statusInfo.status,
                date: rem.date
            });
        }
    });
    
    // Sort alerts by severity: overdue -> due-today -> due-soon
    const severityOrder = { 'overdue': 0, 'due-today': 1, 'due-soon': 2 };
    activeAlerts.sort((a, b) => severityOrder[a.status] - severityOrder[b.status]);
    
    if (activeAlerts.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:var(--text-muted); opacity: 0.8; margin-top:40px; font-style:italic;">🎉 You are all caught up! No pending alerts.</div>`;
        return;
    }
    
    const wrapperList = document.createElement("ul");
    wrapperList.className = "drawer-alerts-list";
    
    activeAlerts.forEach(alert => {
        const li = document.createElement("li");
        li.className = `drawer-alert-item ${alert.status === 'overdue' ? 'critical' : ''}`;
        
        const isCriticalSymbol = alert.status === 'overdue' ? '🚨' : '⚠️';
        
        if (alert.type === 'EMI') {
            const sym = userProfile.currency_symbol || '₹';
            li.innerHTML = `
                <div class="drawer-alert-title">
                    <span>${isCriticalSymbol} EMI Due Soon: ${alert.name}</span>
                </div>
                <div class="drawer-alert-desc">
                    Amount: <strong>${sym} ${Number(alert.amount).toLocaleString()}</strong> | ${alert.message} (Day ${alert.date})
                    <br><span style="font-size:0.75rem;">${alert.pending} payments remaining</span>
                </div>
                <div class="drawer-alert-action">
                    <button class="btn-pay" onclick="payEmi('${alert.id}', event)" style="margin: 0;">Pay One Now</button>
                </div>
            `;
        } else {
            li.innerHTML = `
                <div class="drawer-alert-title">
                    <span>${isCriticalSymbol} ${alert.text}</span>
                </div>
                <div class="drawer-alert-desc">
                    ${alert.message} (Day ${alert.date})
                </div>
                <div class="drawer-alert-action">
                    <button class="btn-pay" onclick="completeReminder('${alert.id}', event)" style="margin: 0; background: rgba(16, 185, 129, 0.15); border-color: rgba(16, 185, 129, 0.3); color: #10b981;">Mark Completed</button>
                </div>
            `;
        }
        
        wrapperList.appendChild(li);
    });
    
    container.appendChild(wrapperList);
}

function renderDrawerReminders() {
    const listEl = document.getElementById("reminders-list");
    if (!listEl) return;
    
    listEl.innerHTML = "";
    
    if (reminders.length === 0) {
        listEl.innerHTML = `<li style="text-align:center; color:var(--text-muted); padding: 20px; font-style:italic;">No reminders set. Use the form above to add a monthly reminder.</li>`;
        return;
    }
    
    reminders.forEach(rem => {
        const statusInfo = getReminderStatus(rem.date, rem.last_completed_month);
        const isCompleted = statusInfo.status === 'completed';
        
        const li = document.createElement("li");
        li.className = `reminder-item ${isCompleted ? 'completed' : ''}`;
        
        li.innerHTML = `
            <div class="reminder-left-col">
                <div class="reminder-check ${isCompleted ? 'checked' : ''}" onclick="toggleReminderComplete('${rem.id}', ${isCompleted})">
                    ${isCompleted ? '✔' : ''}
                </div>
                <div class="reminder-details">
                    <span class="reminder-text">${rem.text}</span>
                    <span class="reminder-date">📅 Due Day ${rem.date} &bull; <span class="status-${statusInfo.status}" style="font-weight:600;">${statusInfo.message}</span></span>
                </div>
            </div>
            <button class="btn-delete-reminder" onclick="deleteReminder('${rem.id}')" title="Delete">🗑️</button>
        `;
        listEl.appendChild(li);
    });
}

function renderDrawerLogs() {
    const container = document.getElementById("drawer-logs-content");
    if (!container) return;
    
    container.innerHTML = "";
    
    const recentTransactions = [...transactions].slice(0, 10);
    
    if (recentTransactions.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:var(--text-muted); opacity: 0.8; margin-top:40px; font-style:italic;">No recent activity logged.</div>`;
        return;
    }
    
    const listEl = document.createElement("ul");
    listEl.className = "activity-list";
    
    recentTransactions.forEach(t => {
        const li = document.createElement("li");
        li.className = "activity-item";
        
        let borderCol = "#94a3b8"; 
        if (t.type === "Income") borderCol = "#4ade80";
        else if (t.type === "Deposit") borderCol = "#22d3ee";
        else if (t.type === "EMI") borderCol = "#f87171";
        else if (t.type === "Expense") borderCol = "#fbbf24";
        
        li.style.borderLeftColor = borderCol;
        
        let displayDate = "-";
        if (t.created_at) {
            const d = t.created_at.toDate ? t.created_at.toDate() : new Date(t.created_at);
            displayDate = d.toLocaleString();
        }
        
        const sym = userProfile.currency_symbol || '₹';
        const formattedAmount = `${t.type === "Income" || t.type === "Deposit" ? "+" : "-"}${sym}${Number(t.amount).toLocaleString()}`;
        
        li.innerHTML = `
            <div class="activity-item-header">
                <strong>${t.name}</strong>
                <span style="font-weight:700; color:${borderCol};">${formattedAmount}</span>
            </div>
            <div class="activity-desc">
                Type: ${t.type} via ${t.payment_method} ${t.reason ? `(${t.reason})` : ''}
            </div>
            <div class="activity-date">
                🕒 ${displayDate}
            </div>
        `;
        
        listEl.appendChild(li);
    });
    
    const statHeader = document.createElement("h4");
    statHeader.innerText = "Recent Transactions";
    statHeader.style.marginBottom = "14px";
    container.appendChild(statHeader);
    
    container.appendChild(listEl);
}

// Custom Reminders Operations

async function addReminder() {
    const textInput = document.getElementById("remText");
    const dateInput = document.getElementById("remDate");
    const errEl = document.getElementById("remError");
    
    if (!textInput || !dateInput) return;
    
    const text = textInput.value.trim();
    const day = parseInt(dateInput.value);
    
    if (errEl) errEl.innerText = "";
    
    if (!text) {
        if (errEl) errEl.innerText = "❌ Please enter a description.";
        return;
    }
    if (isNaN(day) || day < 1 || day > 31) {
        if (errEl) errEl.innerText = "❌ Due day must be between 1 and 31.";
        return;
    }
    
    const fdb = getDB();
    if (!fdb) return alert("❌ Database not available.");
    
    try {
        await fdb.collection('reminders').add({
            user_id: userSession.id,
            text: text,
            date: day,
            last_completed_month: "",
            created_at: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        textInput.value = "";
        dateInput.value = "";
        
        loadDashboard();
    } catch (err) {
        console.error("Error adding reminder:", err);
        if (errEl) errEl.innerText = "❌ Failed to save reminder.";
    }
}

async function deleteReminder(id) {
    if (!confirm("Are you sure you want to delete this reminder?")) return;
    const fdb = getDB();
    if (!fdb) return alert("❌ Database not available.");
    
    try {
        await fdb.collection('reminders').doc(id).delete();
        loadDashboard();
    } catch (err) {
        console.error("Error deleting reminder:", err);
        alert("❌ Failed to delete reminder.");
    }
}

async function toggleReminderComplete(id, initiallyCompleted) {
    const fdb = getDB();
    if (!fdb) return;
    
    let nextCompletedMonth = "";
    if (!initiallyCompleted) {
        const now = new Date();
        nextCompletedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    
    try {
        await fdb.collection('reminders').doc(id).update({
            last_completed_month: nextCompletedMonth
        });
        loadDashboard();
    } catch (err) {
        console.error("Error toggling reminder status:", err);
        alert("❌ Failed to update reminder status.");
    }
}

async function completeReminder(id, evt) {
    if (evt && evt.target) {
        evt.target.innerText = "⏳ Doing...";
        evt.target.disabled = true;
    }
    await toggleReminderComplete(id, false);
}

Object.assign(window, {
    login,
    signInWithGoogle,
    logout,
    togglePassword,
    toggleProfile,
    enableProfileEdit,
    disableProfileEdit,
    saveProfile,
    toggleCredentialForm,
    toggleCredPass,
    saveCredentials,
    setDateFilter,
    openAddModal,
    closeAddModal,
    addTransaction,
    editTx,
    closeEdit,
    saveEdit,
    deleteTx,
    payEmi,
    toggleTheme,
    toggleNotifications,
    switchDrawerTab,
    addReminder,
    deleteReminder,
    toggleReminderComplete,
    completeReminder
});
