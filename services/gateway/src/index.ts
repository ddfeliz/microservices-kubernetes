import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

interface Services {
  tasks: string;
  users: string;
  notify: string;
  compute: string;
}

const SERVICES: Services = {
  tasks: process.env.TASKS_URL || "http://service-tasks:5001",
  users: process.env.USERS_URL || "http://service-users:5002",
  notify: process.env.NOTIFY_URL || "http://service-notify:5003",
  compute: process.env.COMPUTE_URL || "http://service-compute:5004",
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
    res.status(502).json({ error: "Service indisponible", detail: message });
  }
}

app.get("/health", (_req: Request, res: Response) =>
  res.json({ status: "ok", service: "gateway", services: SERVICES }),
);

app.use("/api/employees", (req: Request, res: Response) =>
  proxyRequest(req, res, `${SERVICES.users}/employees`),
);
app.use("/api/leaves", (req: Request, res: Response) =>
  proxyRequest(req, res, `${SERVICES.tasks}/leaves`),
);
app.use("/api/notify", (req: Request, res: Response) =>
  proxyRequest(req, res, `${SERVICES.notify}/notifications`),
);
app.use("/api/payroll", (req: Request, res: Response) =>
  proxyRequest(req, res, `${SERVICES.compute}/payroll`),
);
app.use("/api/compute", (req: Request, res: Response) =>
  proxyRequest(req, res, `${SERVICES.compute}/compute`),
);

const PORT = parseInt(process.env.PORT || "4000");
app.listen(PORT, () => console.log(`service-gateway sur port ${PORT}`));
