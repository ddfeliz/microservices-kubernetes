import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

interface PatientBillingInput {
  name: string;
  salary: number;        // Coût total des soins
  department: string;    // Service médical
  contractType: string;  // Type de séjour
  seniority?: number;    // Ancienneté patient (patient fidèle)
}

interface BillingResult {
  patient: string;
  department: string;
  contractType: string;
  gross: number;                    // Coût total des soins
  patientContributions: number;     // Part patient (mutuelle + ticket modérateur)
  insuranceContributions: number;   // Prise en charge sécurité sociale / mutuelle
  netBeforeInsurance: number;       // Net avant prise en charge
  seniorityBonus: number;           // Prime patient fidèle
  preventionBonus: number;          // Programme prévention santé
  mealVouchers: number;             // Forfaits hospitaliers
  patientOutOfPocket: number;       // Reste à charge patient
  fibonacciCheck: number;
}

interface MedicalStats {
  total: number;
  avgCost: number;          // Coût moyen des soins
  medianCost: number;
  minCost: number;
  maxCost: number;
  byDept: Record<
    string,
    { count: number; totalCost: number; avgCost: number }
  >;
  fibonacciCheck: number;
}

interface BatchResult {
  count: number;
  billings: BillingResult[];
  totalBilling: number;     // Coût total des soins
  durationMs: number;
  pod: string | undefined;
}

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

function calculateBilling(patient: PatientBillingInput): BillingResult {
  const { name, salary, department, contractType, seniority = 0 } = patient;
  const monthlyCost = salary / 12;
  
  // Part sécurité sociale / mutuelle
  const insuranceContributions = monthlyCost * 0.65;
  // Part patient (ticket modérateur + mutuelle complémentaire)
  const patientContributions = monthlyCost * 0.22;
  const netBeforeInsurance = monthlyCost - patientContributions;
  
  // Prime patient fidèle (ancienneté)
  const seniorityBonus = Math.min(seniority * 0.02, 0.2) * monthlyCost;
  // Programme prévention santé (pour certains services)
  const preventionBonus = ["Cardiologie", "Pédiatrie"].includes(department)
    ? monthlyCost * 0.05
    : 0;
  // Forfaits hospitaliers
  const mealVouchers = 20 * 9 * 0.6;  // 20 jours * 9€ * 60%
  
  // Reste à charge patient après toutes les prises en charge
  const patientOutOfPocket = netBeforeInsurance + seniorityBonus + preventionBonus + mealVouchers;

  const fib = fibonacci(36);
  const arr = Array.from({ length: 8000 }, () => Math.random() * 100000);
  bubbleSort(arr);

  return {
    patient: name,
    department,
    contractType,
    gross: Math.round(monthlyCost),
    patientContributions: Math.round(patientContributions),
    insuranceContributions: Math.round(insuranceContributions),
    netBeforeInsurance: Math.round(netBeforeInsurance),
    seniorityBonus: Math.round(seniorityBonus),
    preventionBonus: Math.round(preventionBonus),
    mealVouchers: Math.round(mealVouchers),
    patientOutOfPocket: Math.round(patientOutOfPocket),
    fibonacciCheck: fib,
  };
}

function computeMedicalStats(patients: PatientBillingInput[]): MedicalStats {
  const fib = fibonacci(38);
  const costs = patients.map((p) => p.salary);
  const sorted = bubbleSort(costs);
  const total = patients.length;

  const byDept = patients.reduce<
    Record<string, { count: number; totalCost: number; avgCost: number }>
  >((acc, p) => {
    if (!acc[p.department])
      acc[p.department] = { count: 0, totalCost: 0, avgCost: 0 };
    acc[p.department].count++;
    acc[p.department].totalCost += p.salary;
    return acc;
  }, {});
  Object.keys(byDept).forEach((d) => {
    byDept[d].avgCost = Math.round(byDept[d].totalCost / byDept[d].count);
  });

  return {
    total,
    avgCost:
      total > 0 ? Math.round(costs.reduce((a, b) => a + b, 0) / total) : 0,
    medianCost: sorted[Math.floor(total / 2)] ?? 0,
    minCost: sorted[0] ?? 0,
    maxCost: sorted[total - 1] ?? 0,
    byDept,
    fibonacciCheck: fib,
  };
}

app.get("/health", (_req: Request, res: Response) =>
  res.json({ status: "ok", service: "medical-billing", pod: process.env.HOSTNAME }),
);

app.post("/billing/calculate", (req: Request, res: Response): void => {
  try {
    const {
      name = "Patient",
      salary = 40000,
      department = "Cardiologie",
      contractType = "Hospitalisation",
      seniority = 0,
    } = req.body as Partial<PatientBillingInput>;
    const start = Date.now();
    const billing = calculateBilling({
      name,
      salary,
      department,
      contractType,
      seniority,
    });
    res.json({
      ...billing,
      durationMs: Date.now() - start,
      pod: process.env.HOSTNAME,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/billing/stats", (req: Request, res: Response): void => {
  try {
    const { patients = [] } = req.body as {
      patients: PatientBillingInput[];
    };
    if (!patients.length) {
      res.status(400).json({ error: "Liste de patients requise" });
      return;
    }
    const start = Date.now();
    const stats = computeMedicalStats(patients);
    res.json({
      ...stats,
      durationMs: Date.now() - start,
      pod: process.env.HOSTNAME,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/billing/batch", (req: Request, res: Response): void => {
  try {
    const { patients = [] } = req.body as {
      patients: PatientBillingInput[];
    };
    if (!patients.length) {
      res.status(400).json({ error: "Liste de patients requise" });
      return;
    }
    const start = Date.now();
    const billings = patients.map((p) => calculateBilling(p));
    const result: BatchResult = {
      count: billings.length,
      billings,
      totalBilling: Math.round(billings.reduce((s, p) => s + p.gross, 0)),
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
app.listen(PORT, () => console.log(`service-medical-billing sur port ${PORT}`));