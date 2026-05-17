import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ── Types ────────────────────────────────────────
interface EmployeePayrollInput {
  name: string;
  salary: number;
  department: string;
  contractType: string;
  seniority?: number;
}

interface PayslipResult {
  employee: string;
  department: string;
  contractType: string;
  gross: number;
  employeeContributions: number;
  employerContributions: number;
  netBeforeTax: number;
  seniorityBonus: number;
  perfBonus: number;
  mealVouchers: number;
  netTotal: number;
  fibonacciCheck: number;
}

interface HRStats {
  total: number;
  avgSalary: number;
  medianSalary: number;
  minSalary: number;
  maxSalary: number;
  byDept: Record<
    string,
    { count: number; totalSalary: number; avgSalary: number }
  >;
  fibonacciCheck: number;
}

interface BatchResult {
  count: number;
  payslips: PayslipResult[];
  totalPayroll: number;
  durationMs: number;
  pod: string | undefined;
}

// ── Calculs CPU intensifs ─────────────────────────
function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

function bubbleSort(arr: number[]): number[] {
  const a = [...arr];
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < a.length - i - 1; j++)
      if (a[j] > a[j + 1]) [a[j], a[j + 1]] = [a[j + 1], a[j]];
  return a;
}

function calculatePayslip(employee: EmployeePayrollInput): PayslipResult {
  const { name, salary, department, contractType, seniority = 0 } = employee;
  const monthly = salary / 12;
  const employerContributions = monthly * 0.45;
  const employeeContributions = monthly * 0.22;
  const netBeforeTax = monthly - employeeContributions;
  const seniorityBonus = Math.min(seniority * 0.02, 0.2) * monthly;
  const perfBonus = ["Engineering", "Sales"].includes(department)
    ? monthly * 0.05
    : 0;
  const mealVouchers = 20 * 9 * 0.6;
  const netTotal = netBeforeTax + seniorityBonus + perfBonus + mealVouchers;

  const fib = fibonacci(36);
  const arr = Array.from({ length: 8000 }, () => Math.random() * 100000);
  bubbleSort(arr);

  return {
    employee: name,
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

function computeHRStats(employees: EmployeePayrollInput[]): HRStats {
  const fib = fibonacci(38);
  const salaries = employees.map((e) => e.salary);
  const sorted = bubbleSort(salaries);
  const total = employees.length;

  const byDept = employees.reduce<
    Record<string, { count: number; totalSalary: number; avgSalary: number }>
  >((acc, e) => {
    if (!acc[e.department])
      acc[e.department] = { count: 0, totalSalary: 0, avgSalary: 0 };
    acc[e.department].count++;
    acc[e.department].totalSalary += e.salary;
    return acc;
  }, {});
  Object.keys(byDept).forEach((d) => {
    byDept[d].avgSalary = Math.round(byDept[d].totalSalary / byDept[d].count);
  });

  return {
    total,
    avgSalary:
      total > 0 ? Math.round(salaries.reduce((a, b) => a + b, 0) / total) : 0,
    medianSalary: sorted[Math.floor(total / 2)] ?? 0,
    minSalary: sorted[0] ?? 0,
    maxSalary: sorted[total - 1] ?? 0,
    byDept,
    fibonacciCheck: fib,
  };
}

// ── Routes ───────────────────────────────────────
app.get("/health", (_req: Request, res: Response) =>
  res.json({ status: "ok", service: "payroll", pod: process.env.HOSTNAME }),
);

app.post("/payroll/calculate", (req: Request, res: Response): void => {
  try {
    const {
      name = "Employé",
      salary = 40000,
      department = "Engineering",
      contractType = "CDI",
      seniority = 0,
    } = req.body as Partial<EmployeePayrollInput>;
    const start = Date.now();
    const payslip = calculatePayslip({
      name,
      salary,
      department,
      contractType,
      seniority,
    });
    res.json({
      ...payslip,
      durationMs: Date.now() - start,
      pod: process.env.HOSTNAME,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/payroll/stats", (req: Request, res: Response): void => {
  try {
    const { employees = [] } = req.body as {
      employees: EmployeePayrollInput[];
    };
    if (!employees.length) {
      res.status(400).json({ error: "Liste d'employés requise" });
      return;
    }
    const start = Date.now();
    const stats = computeHRStats(employees);
    res.json({
      ...stats,
      durationMs: Date.now() - start,
      pod: process.env.HOSTNAME,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/payroll/batch", (req: Request, res: Response): void => {
  try {
    const { employees = [] } = req.body as {
      employees: EmployeePayrollInput[];
    };
    if (!employees.length) {
      res.status(400).json({ error: "Liste d'employés requise" });
      return;
    }
    const start = Date.now();
    const payslips = employees.map((e) => calculatePayslip(e));
    const result: BatchResult = {
      count: payslips.length,
      payslips,
      totalPayroll: Math.round(payslips.reduce((s, p) => s + p.gross, 0)),
      durationMs: Date.now() - start,
      pod: process.env.HOSTNAME,
    };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/compute", (req: Request, res: Response): void => {
  const n = parseInt((req.query.n as string) || "38");
  const start = Date.now();
  const fib = fibonacci(n);
  const arr = Array.from({ length: 5000 }, () => Math.random() * 10000);
  bubbleSort(arr);
  res.json({
    input: n,
    fibonacci: fib,
    sortedElements: 5000,
    durationMs: Date.now() - start,
    pod: process.env.HOSTNAME,
  });
});

const PORT = parseInt(process.env.PORT || "5004");
app.listen(PORT, () => console.log(`service-payroll sur port ${PORT}`));
