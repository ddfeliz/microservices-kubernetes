import express, { Request, Response, NextFunction } from "express";
import mongoose, { Schema, Document } from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ── Types ────────────────────────────────────────
type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
type LeaveType =
  | "Congé Payé"
  | "RTT"
  | "Maladie"
  | "Maternité"
  | "Paternité"
  | "Sans Solde"
  | "Exceptionnel";

interface ILeave extends Document {
  employeeId: string;
  employeeName: string;
  department: string;
  type: LeaveType;
  startDate: Date;
  endDate: Date;
  days: number;
  status: LeaveStatus;
  reason: string;
  comment: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  attachments: Array<{ name: string; url: string }>;
  createdAt: Date;
  updatedAt: Date;
}

interface LeaveQuery {
  status?: string;
  employeeId?: string;
  type?: string;
}

interface StatusUpdateBody {
  status: LeaveStatus;
  comment?: string;
  approvedBy?: string;
}

// ── Schéma ───────────────────────────────────────
const leaveSchema = new Schema<ILeave>(
  {
    employeeId: { type: String, required: true },
    employeeName: { type: String, required: true },
    department: { type: String, default: "" },
    type: {
      type: String,
      required: true,
      enum: [
        "Congé Payé",
        "RTT",
        "Maladie",
        "Maternité",
        "Paternité",
        "Sans Solde",
        "Exceptionnel",
      ],
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    days: { type: Number, required: true, min: 0.5 },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
    },
    reason: { type: String, default: "" },
    comment: { type: String, default: "" },
    approvedBy: { type: String, default: null },
    approvedAt: { type: Date, default: null },
    attachments: [{ name: String, url: String }],
  },
  { timestamps: true },
);

const Leave = mongoose.model<ILeave>("Leave", leaveSchema);

// ── Validation ───────────────────────────────────
function validate(req: Request, res: Response, next: NextFunction): void {
  const { employeeId, employeeName, type, startDate, endDate, days } =
    req.body as Partial<ILeave>;
  const errors: string[] = [];
  if (!employeeId) errors.push("employeeId requis");
  if (!employeeName) errors.push("employeeName requis");
  if (!type) errors.push("type requis");
  if (!startDate) errors.push("startDate requis");
  if (!endDate) errors.push("endDate requis");
  if (!days || days < 0.5) errors.push("days doit être >= 0.5");
  if (startDate && endDate && new Date(startDate) > new Date(endDate))
    errors.push("startDate doit être avant endDate");
  if (errors.length) {
    res.status(400).json({ errors });
    return;
  }
  next();
}

// ── Routes ───────────────────────────────────────
app.get("/health", (_req: Request, res: Response) =>
  res.json({ status: "ok", service: "leaves", pod: process.env.HOSTNAME }),
);

app.get("/leaves", async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      status,
      employeeId,
      type,
      page = "1",
      limit = "20",
    } = req.query as Record<string, string>;
    const filter: LeaveQuery = {};
    if (status) filter.status = status;
    if (employeeId) filter.employeeId = employeeId;
    if (type) filter.type = type;

    const total = await Leave.countDocuments(filter);
    const leaves = await Leave.find(filter)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.json({
      data: leaves,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get(
  "/leaves/stats",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const [byStatus, byType, byDepartment, pending] = await Promise.all([
        Leave.aggregate<{ _id: string; count: number; totalDays: number }>([
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
              totalDays: { $sum: "$days" },
            },
          },
        ]),
        Leave.aggregate<{ _id: string; count: number; totalDays: number }>([
          {
            $group: {
              _id: "$type",
              count: { $sum: 1 },
              totalDays: { $sum: "$days" },
            },
          },
          { $sort: { count: -1 } },
        ]),
        Leave.aggregate<{ _id: string; totalDays: number }>([
          { $match: { status: "approved" } },
          { $group: { _id: "$department", totalDays: { $sum: "$days" } } },
          { $sort: { totalDays: -1 } },
        ]),
        Leave.countDocuments({ status: "pending" }),
      ]);
      res.json({ byStatus, byType, byDepartment, pending });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.get("/leaves/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const leave = await Leave.findById(req.params.id);
    if (!leave) {
      res.status(404).json({ error: "Demande non trouvée" });
      return;
    }
    res.json(leave);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post(
  "/leaves",
  validate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const leave = new Leave(req.body as Partial<ILeave>);
      await leave.save();
      res.status(201).json(leave);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.patch(
  "/leaves/:id/status",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { status, comment, approvedBy } = req.body as StatusUpdateBody;
      const validStatuses: LeaveStatus[] = [
        "approved",
        "rejected",
        "cancelled",
      ];
      if (!validStatuses.includes(status)) {
        res.status(400).json({ error: "Statut invalide" });
        return;
      }
      const leave = await Leave.findByIdAndUpdate(
        req.params.id,
        { status, comment, approvedBy, approvedAt: new Date() },
        { new: true },
      );
      if (!leave) {
        res.status(404).json({ error: "Demande non trouvée" });
        return;
      }
      res.json(leave);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.delete(
  "/leaves/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const leave = await Leave.findByIdAndDelete(req.params.id);
      if (!leave) {
        res.status(404).json({ error: "Demande non trouvée" });
        return;
      }
      res.json({ message: "Demande supprimée" });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.post(
  "/leaves/seed",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      await Leave.deleteMany({});
      const leaves: Partial<ILeave>[] = [
        {
          employeeId: "EMP-0001",
          employeeName: "Sophie Martin",
          department: "HR",
          type: "Congé Payé",
          startDate: new Date("2026-06-01"),
          endDate: new Date("2026-06-14"),
          days: 10,
          status: "approved",
          reason: "Vacances d'été",
          approvedBy: "EMP-0004",
        },
        {
          employeeId: "EMP-0002",
          employeeName: "Lucas Bernard",
          department: "Engineering",
          type: "RTT",
          startDate: new Date("2026-05-20"),
          endDate: new Date("2026-05-20"),
          days: 1,
          status: "approved",
          reason: "Récupération",
        },
        {
          employeeId: "EMP-0003",
          employeeName: "Emma Dubois",
          department: "Engineering",
          type: "Maladie",
          startDate: new Date("2026-05-10"),
          endDate: new Date("2026-05-12"),
          days: 3,
          status: "approved",
          reason: "Certificat médical fourni",
        },
        {
          employeeId: "EMP-0006",
          employeeName: "Antoine Leroy",
          department: "Engineering",
          type: "Congé Payé",
          startDate: new Date("2026-07-14"),
          endDate: new Date("2026-07-25"),
          days: 8,
          status: "pending",
          reason: "Voyage familial",
        },
        {
          employeeId: "EMP-0005",
          employeeName: "Camille Robert",
          department: "Marketing",
          type: "RTT",
          startDate: new Date("2026-05-23"),
          endDate: new Date("2026-05-23"),
          days: 1,
          status: "pending",
          reason: "Pont de l'Ascension",
        },
        {
          employeeId: "EMP-0007",
          employeeName: "Julie Moreau",
          department: "HR",
          type: "Maternité",
          startDate: new Date("2026-06-15"),
          endDate: new Date("2026-09-15"),
          days: 90,
          status: "approved",
          reason: "Congé maternité légal",
        },
        {
          employeeId: "EMP-0008",
          employeeName: "Nicolas Simon",
          department: "Sales",
          type: "Sans Solde",
          startDate: new Date("2026-08-01"),
          endDate: new Date("2026-08-15"),
          days: 11,
          status: "rejected",
          reason: "Projet personnel",
          comment: "Période haute pour les ventes",
        },
      ];
      const created = await Leave.insertMany(leaves);
      res.json({
        message: `${created.length} demandes créées`,
        count: created.length,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

mongoose
  .connect(process.env.MONGO_URI || "mongodb://mongo:27017/leavesdb")
  .then(() => {
    const PORT = parseInt(process.env.PORT || "5001");
    app.listen(PORT, () => console.log(`service-leaves sur port ${PORT}`));
  })
  .catch((err) => console.error("Erreur MongoDB:", err));
