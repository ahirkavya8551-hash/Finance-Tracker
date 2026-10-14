// Transactions Page Logic for Finance Tracker

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

// Current State
let activeNavDate = new Date();
let currentTxMonthIndex = activeNavDate.getMonth(); // 0 - 11
let currentTxYear = activeNavDate.getFullYear();

// Helper to get formatted date string strictly in DD/MM/YYYY format
function getFormattedTxDate(t) {
    let day = null, month = null, year = null;

    // 1. Try extracting from created_at timestamp
    let dt = null;
    if (t.created_at && typeof t.created_at.toDate === 'function') {
        dt = t.created_at.toDate();
    } else if (t.created_at && !isNaN(Date.parse(t.created_at))) {
        dt = new Date(t.created_at);
    }

    if (dt) {
        day = String(dt.getDate()).padStart(2, '0');
        month = String(dt.getMonth() + 1).padStart(2, '0');
        year = String(dt.getFullYear());
    }

    // 2. Check t.date field if present
    if (t.date && typeof t.date === 'string') {
        const raw = t.date.trim();
        // Case: YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            const parts = raw.split('-');
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        // Case: DD/MM/YYYY
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
            return raw;
        }
        // Case: Numeric day e.g. "9" or "09"
        if (/^\d{1,2}$/.test(raw)) {
            day = String(parseInt(raw)).padStart(2, '0');
        }
    }

    // Fallback values if missing
    if (!day) day = '01';
    if (!month) month = String(currentTxMonthIndex + 1).padStart(2, '0');
    if (!year) year = String(currentTxYear);

    return `${day}/${month}/${year}`;
}

// Helper to extract JS Date object from transaction
function getTxDateObj(t) {
    if (t.created_at && typeof t.created_at.toDate === 'function') {
        return t.created_at.toDate();
    } else if (t.created_at && !isNaN(Date.parse(t.created_at))) {
        return new Date(t.created_at);
    }
    if (t.date && typeof t.date === 'string') {
        const raw = t.date.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(raw);
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
            const parts = raw.split('/');
            return new Date(parts[2], parseInt(parts[1]) - 1, parts[0]);
        }
    }
    const day = parseInt(t.date) || 1;
    return new Date(currentTxYear, currentTxMonthIndex, day);
}

// Inline Month Navigation (Previous ← / Next → Arrow Buttons)
function prevMonth() {
    currentTxMonthIndex--;
    if (currentTxMonthIndex < 0) {
        currentTxMonthIndex = 11; // December
        currentTxYear--;          // Boundary transition e.g., Jan 2027 -> Dec 2026
    }
    syncYearAndMonthUI();
    renderTransactionsPage();
}

function nextMonth() {
    currentTxMonthIndex++;
    if (currentTxMonthIndex > 11) {
        currentTxMonthIndex = 0;  // January
        currentTxYear++;          // Boundary transition e.g., Dec 2026 -> Jan 2027
    }
    syncYearAndMonthUI();
    renderTransactionsPage();
}

function onYearChange() {
    const yearSelect = document.getElementById("txFilterYear");
    if (yearSelect && yearSelect.value) {
        currentTxYear = parseInt(yearSelect.value);
    }
    renderTransactionsPage();
}

function syncYearAndMonthUI() {
    const monthDisplayEl = document.getElementById("currentMonthDisplay");
    if (monthDisplayEl) {
        monthDisplayEl.innerText = MONTH_NAMES[currentTxMonthIndex];
    }
    const yearSelectEl = document.getElementById("txFilterYear");
    if (yearSelectEl) {
        let optionExists = Array.from(yearSelectEl.options).some(opt => opt.value == currentTxYear);
        if (!optionExists) {
            const opt = document.createElement("option");
            opt.value = currentTxYear;
            opt.textContent = currentTxYear;
            yearSelectEl.appendChild(opt);
        }
        yearSelectEl.value = String(currentTxYear);
    }
}

function resetTxFilters() {
    const dateEl = document.getElementById("txFilterDate");
    const typeEl = document.getElementById("txFilterType");
    
    if (dateEl) dateEl.value = "";
    if (typeEl) typeEl.value = "";

    activeNavDate = new Date();
    currentTxMonthIndex = activeNavDate.getMonth();
    currentTxYear = activeNavDate.getFullYear();

    syncYearAndMonthUI();
    renderTransactionsPage();
}

// Primary Render function for Transactions Page
function renderTransactionsPage() {
    const tableBody = document.getElementById("txMasterTableBody");
    if (!tableBody) return; // Not on transactions page

    const filterDateInput = document.getElementById("txFilterDate") ? document.getElementById("txFilterDate").value : "";
    const filterTypeSelect = document.getElementById("txFilterType") ? document.getElementById("txFilterType").value : "";

    const sym = (typeof userProfile !== 'undefined' && userProfile.currency_symbol) ? userProfile.currency_symbol : '₹';

    tableBody.innerHTML = "";

    let filtered = transactions.filter(t => {
        const txDateObj = getTxDateObj(t);
        const txMonth = txDateObj.getMonth();
        const txYear = txDateObj.getFullYear();

        // 1. Month Filter
        if (txMonth !== currentTxMonthIndex) return false;

        // 2. Year Filter
        if (txYear !== currentTxYear) return false;

        // 3. Date Filter (if specific date selected)
        if (filterDateInput) {
            const selectedDate = new Date(filterDateInput);
            if (!isNaN(selectedDate.getTime())) {
                if (txDateObj.getDate() !== selectedDate.getDate() ||
                    txDateObj.getMonth() !== selectedDate.getMonth() ||
                    txDateObj.getFullYear() !== selectedDate.getFullYear()) {
                    return false;
                }
            }
        }

        // 4. Type Filter ("Income", "Deposits" / "Deposit", "EMI", "Expense")
        if (filterTypeSelect) {
            let targetType = filterTypeSelect;
            if (targetType === "Deposits") targetType = "Deposit";
            if (t.type !== targetType && t.type !== filterTypeSelect) return false;
        }

        return true;
    });

    // Compute monthly summary
    let mIncome = 0, mDeposits = 0, mEmi = 0, mExpense = 0;

    filtered.forEach(t => {
        const amt = parseFloat(t.amount) || 0;
        if (t.type === 'Income') mIncome += amt;
        else if (t.type === 'Deposit') mDeposits += amt;
        else if (t.type === 'EMI') mEmi += amt;
        else if (t.type === 'Expense') mExpense += amt;
    });

    const mOutflow = mEmi + mExpense;
    const mNet = (mIncome + mDeposits) - mOutflow;

    const elInc = document.getElementById("txMonthIncome");
    const elDep = document.getElementById("txMonthDeposits");
    const elOut = document.getElementById("txMonthOutflow");
    const elNet = document.getElementById("txMonthNet");
    const elBadge = document.getElementById("txCountBadge");

    if (elInc) elInc.innerText = `${sym} ${mIncome.toLocaleString()}`;
    if (elDep) elDep.innerText = `${sym} ${mDeposits.toLocaleString()}`;
    if (elOut) elOut.innerText = `${sym} ${mOutflow.toLocaleString()}`;
    if (elNet) {
        elNet.innerText = `${mNet < 0 ? '-' : ''}${sym} ${Math.abs(mNet).toLocaleString()}`;
        elNet.style.color = mNet < 0 ? '#f87171' : '';
    }
    if (elBadge) elBadge.innerText = `${filtered.length} record${filtered.length !== 1 ? 's' : ''}`;

    if (filtered.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="empty-row">No transactions found for ${MONTH_NAMES[currentTxMonthIndex]} ${currentTxYear}.</td></tr>`;
        return;
    }

    filtered.forEach(t => {
        const tr = document.createElement("tr");
        const formattedDate = getFormattedTxDate(t);
        
        let typeBadgeClass = 'badge-type-income';
        let amtClass = 'amt-income';
        let displayType = t.type;

        if (t.type === 'Deposit') {
            typeBadgeClass = 'badge-type-deposit';
            amtClass = 'amt-deposit';
            displayType = 'Deposit';
        } else if (t.type === 'EMI') {
            typeBadgeClass = 'badge-type-emi';
            amtClass = 'amt-emi';
        } else if (t.type === 'Expense') {
            typeBadgeClass = 'badge-type-expense';
            amtClass = 'amt-expense';
        }

        const actionBtns = `
            <button class="btn-edit" onclick="editTx('${t.id}')">Edit</button>
            <button class="btn-delete" onclick="deleteTx('${t.id}')">Delete</button>
        `;

        tr.innerHTML = `
            <td><strong>${formattedDate}</strong></td>
            <td><strong>${t.name}</strong></td>
            <td><span class="badge ${typeBadgeClass}">${displayType}</span></td>
            <td><span class="badge badge-method">${t.payment_method || 'Bank'}</span></td>
            <td>${t.reason || '-'}</td>
            <td class="${amtClass}">${sym} ${Number(t.amount).toLocaleString()}</td>
            <td>${actionBtns}</td>
        `;

        tableBody.appendChild(tr);
    });
}

// Robust PDF Export Function for Currently Selected Month & Year
function generateMonthlyPDF() {
    try {
        let JSClass = null;
        if (window.jspdf && window.jspdf.jsPDF) {
            JSClass = window.jspdf.jsPDF;
        } else if (window.jsPDF) {
            JSClass = window.jsPDF;
        } else {
            alert("PDF generation library is loading. Please refresh the page or try again in a few seconds.");
            return;
        }

        const doc = new JSClass({ orientation: 'p', unit: 'mm', format: 'a4' });

        const selectedMonthName = MONTH_NAMES[currentTxMonthIndex];
        const selectedYear = currentTxYear;
        const sym = (typeof userProfile !== 'undefined' && userProfile.currency_symbol) ? userProfile.currency_symbol : '₹';
        const pdfSym = sym === '₹' ? 'Rs.' : sym;

        const filterTypeSelect = document.getElementById("txFilterType") ? document.getElementById("txFilterType").value : "";
        const filterDateInput = document.getElementById("txFilterDate") ? document.getElementById("txFilterDate").value : "";
        
        let monthTxList = transactions.filter(t => {
            const txDateObj = getTxDateObj(t);
            if (txDateObj.getMonth() !== currentTxMonthIndex) return false;
            if (txDateObj.getFullYear() !== currentTxYear) return false;

            if (filterDateInput) {
                const selectedDate = new Date(filterDateInput);
                if (!isNaN(selectedDate.getTime())) {
                    if (txDateObj.getDate() !== selectedDate.getDate() ||
                        txDateObj.getMonth() !== selectedDate.getMonth() ||
                        txDateObj.getFullYear() !== selectedDate.getFullYear()) {
                        return false;
                    }
                }
            }

            if (filterTypeSelect) {
                let targetType = filterTypeSelect;
                if (targetType === "Deposits") targetType = "Deposit";
                if (t.type !== targetType && t.type !== filterTypeSelect) return false;
            }
            return true;
        });

        // 1. PDF Header Banner
        doc.setFillColor(15, 23, 42); // Dark slate header
        doc.rect(0, 0, 210, 36, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(20);
        doc.text("Finance Tracker", 14, 18);

        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        doc.text(`Monthly Transaction Statement`, 14, 27);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text(`${selectedMonthName} ${selectedYear}`, 196, 22, { align: 'right' });

        // 2. Compute Monthly Totals
        let totIncome = 0, totDeposits = 0, totEmi = 0, totExpense = 0;
        monthTxList.forEach(t => {
            const amt = parseFloat(t.amount) || 0;
            if (t.type === 'Income') totIncome += amt;
            else if (t.type === 'Deposit') totDeposits += amt;
            else if (t.type === 'EMI') totEmi += amt;
            else if (t.type === 'Expense') totExpense += amt;
        });
        const totOutflow = totEmi + totExpense;
        const netBal = (totIncome + totDeposits) - totOutflow;

        // 3. Summary Bar in PDF
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(14, 42, 182, 26, 3, 3, 'F');

        doc.setTextColor(30, 41, 59);
        doc.setFontSize(8.5);
        doc.setFont("helvetica", "bold");

        const summaryColumns = [18, 63, 108, 153];
        const summaryLabels = ['Total Income', 'Total Deposits', 'Total Outflow', 'Net Balance'];
        const summaryValues = [totIncome, totDeposits, totOutflow, netBal];
        summaryLabels.forEach((label, index) => {
            doc.text(label, summaryColumns[index], 49);
            const value = summaryValues[index];
            const formattedValue = `${value < 0 ? '-' : ''}${pdfSym} ${Math.abs(value).toLocaleString()}`;
            doc.text(formattedValue, summaryColumns[index], 55);
        });

        doc.setFontSize(8.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')} | Total Transactions: ${monthTxList.length}`, 18, 64);

        // 4. Table Data with strict DD/MM/YYYY formatting
        const headers = [['#', 'Date (DD/MM/YYYY)', 'Type', 'Transaction Name', 'Method', 'Reason / Note', 'Amount']];
        let rows = [];

        if (monthTxList.length > 0) {
            rows = monthTxList.map((t, idx) => [
                idx + 1,
                getFormattedTxDate(t),
                t.type,
                t.name || '-',
                t.payment_method || 'Bank',
                t.reason || '-',
                `${pdfSym} ${Number(t.amount).toLocaleString()}`
            ]);
        } else {
            rows = [
                ['-', '-', '-', `No transactions found for ${selectedMonthName} ${selectedYear}`, '-', '-', '-']
            ];
        }

        // Render Table using autoTable if available, or manual rendering fallback
        const renderAutoTable = (typeof doc.autoTable === 'function') ? doc.autoTable.bind(doc) :
                                 (typeof window.jspdf?.jsPDF?.API?.autoTable === 'function') ? window.jspdf.jsPDF.API.autoTable.bind(doc) :
                                 (typeof window.jsPDF?.API?.autoTable === 'function') ? window.jsPDF.API.autoTable.bind(doc) : null;

        if (renderAutoTable) {
            renderAutoTable({
                startY: 74,
                head: headers,
                body: rows,
                theme: 'grid',
                headStyles: {
                    fillColor: [6, 182, 212], // Cyan header
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    fontSize: 9
                },
                bodyStyles: {
                    fontSize: 8.5,
                    textColor: [30, 41, 59]
                },
                alternateRowStyles: {
                    fillColor: [248, 250, 252]
                },
                columnStyles: {
                    0: { cellWidth: 8, halign: 'center' },
                    1: { cellWidth: 28, halign: 'center' },
                    2: { cellWidth: 19, fontStyle: 'bold' },
                    3: { cellWidth: 40 },
                    4: { cellWidth: 21 },
                    5: { cellWidth: 31 },
                    6: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
                },
                margin: { left: 14, right: 14 }
            });
        } else {
            // Manual Table Fallback
            let startY = 72;
            doc.setFillColor(6, 182, 212);
            doc.rect(14, startY, 182, 8, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            doc.text("#", 16, startY + 5.5);
            doc.text("Date (DD/MM/YYYY)", 24, startY + 5.5);
            doc.text("Type", 60, startY + 5.5);
            doc.text("Name", 82, startY + 5.5);
            doc.text("Method", 130, startY + 5.5);
            doc.text("Reason", 152, startY + 5.5);
            doc.text("Amount", 182, startY + 5.5);

            startY += 10;
            doc.setTextColor(30, 41, 59);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8.5);

            if (monthTxList.length > 0) {
                monthTxList.forEach((t, idx) => {
                    doc.text(String(idx + 1), 16, startY);
                    doc.text(getFormattedTxDate(t), 24, startY);
                    doc.text(String(t.type), 60, startY);
                    doc.text(String(t.name || '-'), 82, startY);
                    doc.text(String(t.payment_method || 'Bank'), 130, startY);
                    doc.text(String(t.reason || '-'), 152, startY);
                    doc.text(`${pdfSym} ${Number(t.amount).toLocaleString()}`, 194, startY, { align: 'right' });
                    startY += 7;
                });
            } else {
                doc.text(`No transactions found for ${selectedMonthName} ${selectedYear}`, 24, startY);
            }
        }

        // 5. Trigger download with explicit .pdf extension & application/pdf MIME type
        const fileName = `Finance_Report_${selectedMonthName}_${selectedYear}.pdf`;
        
        // Output raw ArrayBuffer / Blob from jsPDF
        const pdfArrayBuffer = doc.output('arraybuffer');
        const pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(pdfBlob);

        // Create download link element with explicit .pdf filename
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        link.setAttribute('type', 'application/pdf');
        document.body.appendChild(link);
        link.click();

        // Also open in new browser window/tab if supported so user can view directly
        try {
            window.open(blobUrl, '_blank');
        } catch (e) {
            console.log("Could not auto-open tab:", e);
        }

        // Clean up URL object after 30 seconds
        setTimeout(() => {
            if (document.body.contains(link)) document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);
        }, 30000);

    } catch (err) {
        console.error("Error generating PDF:", err);
        alert("Failed to generate PDF: " + err.message);
    }
}

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
    syncYearAndMonthUI();
});

// Patch loadDashboard to also refresh Transactions page if loaded
const originalLoadDashboard = window.loadDashboard;
window.loadDashboard = async function() {
    if (typeof originalLoadDashboard === 'function') {
        await originalLoadDashboard();
    }
    syncYearAndMonthUI();
    renderTransactionsPage();
};
