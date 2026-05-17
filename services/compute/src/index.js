const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

function fibonacci(n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

function bubbleSort(arr) {
    const a = [...arr];
    for (let i = 0; i < a.length; i++)
        for (let j = 0; j < a.length - i - 1; j++)
            if (a[j] > a[j + 1]) [a[j], a[j + 1]] = [a[j + 1], a[j]];
    return a;
}

function calculatePayslip(employee) {
    const { salary, contractType, department, seniority = 0 } = employee;
    const monthly = salary / 12;

    const employerContributions = monthly * 0.45;

    const employeeContributions = monthly * 0.22;

    const netBeforeTax = monthly - employeeContributions;

    const seniorityBonus = Math.min(seniority * 0.02, 0.20) * monthly;

    const perfBonus = ["Engineering", "Sales"].includes(department)
        ? monthly * 0.05 : 0;

    const mealVouchers = 20 * 9 * 0.6;

    const netTotal = netBeforeTax + seniorityBonus + perfBonus + mealVouchers;

    const fib = fibonacci(36);
    const arr = Array.from({ length: 8000 }, () => Math.random() * 100000);
    bubbleSort(arr);

    return {
        employee: employee.name,
        department,
        contractType,
        gross: Math.round(monthly),
        employeeContributions: Math.round(employeeContributions),
        employerContributions: Math.round(employerContributions),
        netBeforeTax: Math.round(netBeforeTax),
        seniorityBonus: Math.round(seniorityBonus),
        perfBonus: Math.round(perfBonus),
        mealVouchers: Math.round(mealVouchers),
        netTotal: Math.round(netTotal),
        fibonacciCheck: fib,
    };
}

function computeHRStats(employees) {
    const fib = fibonacci(38);
    const salaries = employees.map(e => e.salary);
    const sorted = bubbleSort(salaries);

    const total = employees.length;
    const avgSalary = Math.round(salaries.reduce((a, b) => a + b, 0) / total);
    const medianSalary = sorted[Math.floor(total / 2)] || 0;
    const minSalary = sorted[0] || 0;
    const maxSalary = sorted[total - 1] || 0;

    const byDept = employees.reduce((acc, e) => {
        if (!acc[e.department]) acc[e.department] = { count: 0, totalSalary: 0 };
        acc[e.department].count++;
        acc[e.department].totalSalary += e.salary;
        return acc;
    }, {});

    Object.keys(byDept).forEach(d => {
        byDept[d].avgSalary = Math.round(byDept[d].totalSalary / byDept[d].count);
    });

    return { total, avgSalary, medianSalary, minSalary, maxSalary, byDept, fibonacciCheck: fib };
}

app.get("/health", (req, res) =>
    res.json({ status: "ok", service: "payroll", pod: process.env.HOSTNAME })
);

app.post("/payroll/calculate", (req, res) => {
    try {
        const { name = "Employé", salary = 40000, department = "Engineering",
            contractType = "CDI", seniority = 0 } = req.body;

        const start = Date.now();
        const payslip = calculatePayslip({ name, salary, department, contractType, seniority });
        const durationMs = Date.now() - start;

        res.json({ ...payslip, durationMs, pod: process.env.HOSTNAME });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/payroll/stats", (req, res) => {
    try {
        const { employees = [] } = req.body;
        if (!employees.length)
            return res.status(400).json({ error: "Liste d'employés requise" });

        const start = Date.now();
        const stats = computeHRStats(employees);
        const durationMs = Date.now() - start;

        res.json({ ...stats, durationMs, pod: process.env.HOSTNAME });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/payroll/batch", (req, res) => {
    try {
        const { employees = [] } = req.body;
        if (!employees.length)
            return res.status(400).json({ error: "Liste d'employés requise" });

        const start = Date.now();
        const payslips = employees.map(e => calculatePayslip(e));
        const durationMs = Date.now() - start;

        res.json({
            count: payslips.length,
            payslips,
            totalPayroll: Math.round(payslips.reduce((s, p) => s + p.gross, 0)),
            durationMs,
            pod: process.env.HOSTNAME,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/compute", (req, res) => {
    const n = parseInt(req.query.n) || 38;
    const start = Date.now();
    const fibResult = fibonacci(n);
    const arr = Array.from({ length: 5000 }, () => Math.random() * 10000);
    bubbleSort(arr);
    const durationMs = Date.now() - start;
    res.json({ input: n, fibonacci: fibResult, sortedElements: 5000, durationMs, pod: process.env.HOSTNAME });
});

app.listen(process.env.PORT, () =>
    console.log(`service-payroll sur port ${process.env.PORT}`)
);