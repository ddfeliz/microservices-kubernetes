import express, { Request, Response, NextFunction } from "express";
import mongoose, { Schema, Document, QueryFilter } from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

type AppointmentStatus = "pending" | "approved" | "rejected" | "cancelled";
type AppointmentType =
  | "Consultation générale"
  | "Consultation spécialiste"
  | "Urgence"
  | "Téléconsultation"
  | "Chirurgie programmée"
  | "Examen radiologique"
  | "IRM / Scanner"
  | "Analyse biologique";

interface IAppointment extends Document {
  patientId: string;
  patientName: string;
  department: string;
  type: AppointmentType;
  startDate: Date;
  endDate: Date;
  durationHours: number;
  status: AppointmentStatus;
  reason: string;
  comment: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  attachments: Array<{ name: string; url: string }>;
  createdAt: Date;
  updatedAt: Date;
}

interface AppointmentQuery {
  status?: string;
  patientId?: string;
  type?: string;
}

interface StatusUpdateBody {
  status: AppointmentStatus;
  comment?: string;
  approvedBy?: string;
}

const appointmentSchema = new Schema<IAppointment>(
  {
    patientId: { type: String, required: true },
    patientName: { type: String, required: true },
    department: { type: String, default: "" },
    type: {
      type: String,
      required: true,
      enum: [
        "Consultation générale",
        "Consultation spécialiste",
        "Urgence",
        "Téléconsultation",
        "Chirurgie programmée",
        "Examen radiologique",
        "IRM / Scanner",
        "Analyse biologique",
      ],
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    durationHours: { type: Number, required: true, min: 0.5 },
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

const Appointment = mongoose.model<IAppointment>("Appointment", appointmentSchema);

function validate(req: Request, res: Response, next: NextFunction): void {
  const { patientId, patientName, type, startDate, endDate, durationHours } =
    req.body as Partial<IAppointment>;
  const errors: string[] = [];
  if (!patientId) errors.push("patientId requis");
  if (!patientName) errors.push("patientName requis");
  if (!type) errors.push("type de consultation requis");
  if (!startDate) errors.push("startDate requis");
  if (!endDate) errors.push("endDate requis");
  if (!durationHours || durationHours < 0.5) errors.push("durationHours doit être >= 0.5");
  if (startDate && endDate && new Date(startDate) > new Date(endDate))
    errors.push("startDate doit être avant endDate");
  if (errors.length) {
    res.status(400).json({ errors });
    return;
  }
  next();
}

app.get("/health", (_req: Request, res: Response) =>
  res.json({ status: "ok", service: "appointments", pod: process.env.HOSTNAME }),
);

app.get("/appointments", async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      status,
      patientId,
      type,
      page = "1",
      limit = "20",
    } = req.query as Record<string, string>;
    const filter: QueryFilter<IAppointment> = {};
    if (status) filter.status = status as AppointmentStatus;
    if (patientId) filter.patientId = patientId;
    if (type) filter.type = type as AppointmentType;

    const total = await Appointment.countDocuments(filter);
    const appointments = await Appointment.find(filter)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.json({
      data: appointments,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get(
  "/appointments/stats",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const [byStatus, byType, byDepartment, pending] = await Promise.all([
        Appointment.aggregate<{ _id: string; count: number; totalHours: number }>([
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
              totalHours: { $sum: "$durationHours" },
            },
          },
        ]),
        Appointment.aggregate<{ _id: string; count: number; totalHours: number }>([
          {
            $group: {
              _id: "$type",
              count: { $sum: 1 },
              totalHours: { $sum: "$durationHours" },
            },
          },
          { $sort: { count: -1 } },
        ]),
        Appointment.aggregate<{ _id: string; totalHours: number }>([
          { $match: { status: "approved" } },
          { $group: { _id: "$department", totalHours: { $sum: "$durationHours" } } },
          { $sort: { totalHours: -1 } },
        ]),
        Appointment.countDocuments({ status: "pending" }),
      ]);
      res.json({ byStatus, byType, byDepartment, pending });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.get("/appointments/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      res.status(404).json({ error: "Rendez-vous non trouvé" });
      return;
    }
    res.json(appointment);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post(
  "/appointments",
  validate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const appointment = new Appointment(req.body as Partial<IAppointment>);
      await appointment.save();
      res.status(201).json(appointment);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.patch(
  "/appointments/:id/status",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { status, comment, approvedBy } = req.body as StatusUpdateBody;
      const validStatuses: AppointmentStatus[] = [
        "approved",
        "rejected",
        "cancelled",
      ];
      if (!validStatuses.includes(status)) {
        res.status(400).json({ error: "Statut invalide" });
        return;
      }
      const appointment = await Appointment.findByIdAndUpdate(
        req.params.id,
        { status, comment, approvedBy, approvedAt: new Date() },
        { new: true },
      );
      if (!appointment) {
        res.status(404).json({ error: "Rendez-vous non trouvé" });
        return;
      }
      res.json(appointment);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.delete(
  "/appointments/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const appointment = await Appointment.findByIdAndDelete(req.params.id);
      if (!appointment) {
        res.status(404).json({ error: "Rendez-vous non trouvé" });
        return;
      }
      res.json({ message: "Rendez-vous supprimé" });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.post(
  "/appointments/seed",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      await Appointment.deleteMany({});
      const appointments: Partial<IAppointment>[] = [
        {
          patientId: "PAT-0001",
          patientName: "Sophie Martin",
          department: "Cardiologie",
          type: "Consultation spécialiste",
          startDate: new Date("2026-06-01T10:00:00"),
          endDate: new Date("2026-06-01T11:00:00"),
          durationHours: 1,
          status: "approved",
          reason: "Douleurs thoraciques",
          approvedBy: "Dr. Dupont",
        },
        {
          patientId: "PAT-0002",
          patientName: "Lucas Bernard",
          department: "Pédiatrie",
          type: "Consultation générale",
          startDate: new Date("2026-05-20T14:30:00"),
          endDate: new Date("2026-05-20T15:00:00"),
          durationHours: 0.5,
          status: "approved",
          reason: "Contrôle annuel",
        },
        {
          patientId: "PAT-0003",
          patientName: "Emma Dubois",
          department: "Radiologie",
          type: "IRM / Scanner",
          startDate: new Date("2026-05-10T09:00:00"),
          endDate: new Date("2026-05-10T09:45:00"),
          durationHours: 0.75,
          status: "approved",
          reason: "Lombalgies chroniques",
        },
        {
          patientId: "PAT-0006",
          patientName: "Antoine Leroy",
          department: "Neurologie",
          type: "Consultation spécialiste",
          startDate: new Date("2026-07-14T11:00:00"),
          endDate: new Date("2026-07-14T12:00:00"),
          durationHours: 1,
          status: "pending",
          reason: "Maux de tête récurrents",
        },
        {
          patientId: "PAT-0005",
          patientName: "Camille Robert",
          department: "Urgences",
          type: "Urgence",
          startDate: new Date("2026-05-23T08:30:00"),
          endDate: new Date("2026-05-23T10:00:00"),
          durationHours: 1.5,
          status: "pending",
          reason: "Fièvre élevée et douleurs",
        },
        {
          patientId: "PAT-0007",
          patientName: "Julie Moreau",
          department: "Chirurgie",
          type: "Chirurgie programmée",
          startDate: new Date("2026-06-15T08:00:00"),
          endDate: new Date("2026-06-15T12:00:00"),
          durationHours: 4,
          status: "approved",
          reason: "Opération du genou",
          approvedBy: "Dr. Martin",
        },
        {
          patientId: "PAT-0008",
          patientName: "Nicolas Simon",
          department: "Dermatologie",
          type: "Consultation générale",
          startDate: new Date("2026-08-01T13:30:00"),
          endDate: new Date("2026-08-01T14:00:00"),
          durationHours: 0.5,
          status: "rejected",
          reason: "Examen de la peau",
          comment: "Déjà suivi par un autre spécialiste",
        },
        {
          patientId: "PAT-0009",
          patientName: "Laura Michel",
          department: "Laboratoire",
          type: "Analyse biologique",
          startDate: new Date("2026-05-25T07:30:00"),
          endDate: new Date("2026-05-25T08:00:00"),
          durationHours: 0.5,
          status: "approved",
          reason: "Bilan sanguin annuel",
        },
        {
          patientId: "PAT-0010",
          patientName: "Thomas Bernard",
          department: "Téléconsultation",
          type: "Téléconsultation",
          startDate: new Date("2026-05-28T15:00:00"),
          endDate: new Date("2026-05-28T15:30:00"),
          durationHours: 0.5,
          status: "pending",
          reason: "Suivi traitement",
        },
        {
          patientId: "PAT-0011",
          patientName: "Marie Lambert",
          department: "Radiologie",
          type: "Examen radiologique",
          startDate: new Date("2026-06-05T14:00:00"),
          endDate: new Date("2026-06-05T14:20:00"),
          durationHours: 0.33,
          status: "approved",
          reason: "Fracture suspectée",
          approvedBy: "Dr. Petit",
        },
      ];
      const created = await Appointment.insertMany(appointments);
      res.json({
        message: `${created.length} rendez-vous créés`,
        count: created.length,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

mongoose
  .connect(process.env.MONGO_URI || "mongodb://mongo:27017/appointmentsdb")
  .then(() => {
    const PORT = parseInt(process.env.PORT || "5002");
    app.listen(PORT, () => console.log(`service-appointments sur port ${PORT}`));
  })
  .catch((err) => console.error("Erreur MongoDB:", err));