import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

interface Services {
  patients: string;
  appointments: string;
  alerts: string;
  billing: string;
}

const SERVICES: Services = {
  patients: process.env.PATIENTS_URL || "http://service-patients:5001",
  appointments: process.env.APPOINTMENTS_URL || "http://service-appointments:5002",
  alerts: process.env.ALERTS_URL || "http://service-alerts:5003",
  billing: process.env.BILLING_URL || "http://service-billing:5004",
};

async function proxyRequest(
  req: Request,
  res: Response,
  targetUrl: string,
): Promise<void> {
  try {
    const query = req.url.includes("?") ? "?" + req.url.split("?")[1] : "";
    const subPath = req.path === "/" ? "" : req.path;
    const url = `${targetUrl}${subPath}${query}`;

    const options: RequestInit = {
      method: req.method,
      headers: { "Content-Type": "application/json" },
    };

    if (["POST", "PUT", "PATCH"].includes(req.method)) {
      options.body = JSON.stringify(req.body);
    }

    const response = await fetch(url, options);
    const data = (await response.json()) as Record<string, unknown>;
    res.status(response.status).json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    res.status(502).json({ error: "Service médical indisponible", detail: message });
  }
}

app.get("/health", (_req: Request, res: Response) =>
  res.json({ status: "ok", service: "medical-gateway", services: SERVICES }),
);

app.use("/api/employees", (req: Request, res: Response) =>
  proxyRequest(req, res, `${SERVICES.patients}/patients`),
);
app.use("/api/leaves", (req: Request, res: Response) =>
  proxyRequest(req, res, `${SERVICES.appointments}/appointments`),
);
app.use("/api/notify", (req: Request, res: Response) =>
  proxyRequest(req, res, `${SERVICES.alerts}/alerts`),
);
app.use("/api/payroll", (req: Request, res: Response) =>
  proxyRequest(req, res, `${SERVICES.billing}/billing`),
);
app.use("/api/compute", (req: Request, res: Response) =>
  proxyRequest(req, res, `${SERVICES.billing}/compute`),
);

const PORT = parseInt(process.env.PORT || "4000");
app.listen(PORT, () => console.log(`service-gateway-medical sur port ${PORT}`));