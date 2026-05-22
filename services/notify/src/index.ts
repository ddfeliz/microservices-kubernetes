import express, { Request, Response } from "express";
import mongoose, { Schema, Document, QueryFilter } from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

type NotifType = "info" | "success" | "warning" | "error";
type NotifCategory =
  | "consultation"
  | "resultat"
  | "urgence"
  | "rappel"
  | "ordonnance"
  | "hospitalisation";
type NotifPriority = "low" | "medium" | "high" | "urgent";

interface INotification extends Document {
  patientId: string;
  patientName: string;
  title: string;
  message: string;
  type: NotifType;
  category: NotifCategory;
  priority: NotifPriority;
  read: boolean;
  readAt: Date | null;
  actionUrl: string;
  actionLabel: string;
  sentBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface NotifQuery {
  $or?: Array<Record<string, string>>;
  read?: boolean;
  category?: string;
  priority?: string;
}

const notificationSchema = new Schema<INotification>(
  {
    patientId: { type: String, default: "all" },
    patientName: { type: String, default: "Tous les patients" },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: ["info", "success", "warning", "error"],
      default: "info",
    },
    category: {
      type: String,
      enum: ["consultation", "resultat", "urgence", "rappel", "ordonnance", "hospitalisation"],
      default: "consultation",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    read: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
    actionUrl: { type: String, default: "" },
    actionLabel: { type: String, default: "" },
    sentBy: { type: String, default: "system" },
  },
  { timestamps: true },
);

const Notification = mongoose.model<INotification>(
  "Notification",
  notificationSchema,
);

app.get("/health", (_req: Request, res: Response) =>
  res.json({ status: "ok", service: "medical-alerts", pod: process.env.HOSTNAME }),
);

app.get(
  "/alerts",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        patientId,
        read,
        category,
        priority,
        page = "1",
        limit = "20",
      } = req.query as Record<string, string>;
      const filter: QueryFilter<INotification> = {};
      if (patientId) filter.$or = [{ patientId }, { patientId: "all" }];
      if (read !== undefined) filter.read = read === "true";
      if (category) filter.category = category as NotifCategory;
      if (priority) filter.priority = priority as NotifPriority;

      const [total, unread, alerts] = await Promise.all([
        Notification.countDocuments(filter),
        Notification.countDocuments({ ...filter, read: false }),
        Notification.find(filter)
          .sort({ createdAt: -1 })
          .skip((parseInt(page) - 1) * parseInt(limit))
          .limit(parseInt(limit)),
      ]);

      res.json({
        data: alerts,
        total,
        unread,
        page: parseInt(page),
        limit: parseInt(limit),
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.get(
  "/alerts/stats",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const [byCategory, byPriority, total, unread] = await Promise.all([
        Notification.aggregate<{ _id: string; count: number; unread: number }>([
          {
            $group: {
              _id: "$category",
              count: { $sum: 1 },
              unread: { $sum: { $cond: [{ $eq: ["$read", false] }, 1, 0] } },
            },
          },
        ]),
        Notification.aggregate<{ _id: string; count: number }>([
          { $group: { _id: "$priority", count: { $sum: 1 } } },
        ]),
        Notification.countDocuments(),
        Notification.countDocuments({ read: false }),
      ]);
      res.json({ byCategory, byPriority, total, unread });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.post(
  "/alerts",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { title, message } = req.body as Partial<INotification>;
      if (!title?.trim()) {
        res.status(400).json({ error: "titre requis" });
        return;
      }
      if (!message?.trim()) {
        res.status(400).json({ error: "message requis" });
        return;
      }
      const alert = new Notification(req.body as Partial<INotification>);
      await alert.save();
      res.status(201).json(alert);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.patch(
  "/alerts/:id/read",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const alert = await Notification.findByIdAndUpdate(
        req.params.id,
        { read: true, readAt: new Date() },
        { new: true },
      );
      if (!alert) {
        res.status(404).json({ error: "Alerte médicale non trouvée" });
        return;
      }
      res.json(alert);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.patch(
  "/alerts/read-all",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { patientId } = req.body as { patientId?: string };
      const filter = patientId
        ? { $or: [{ patientId }, { patientId: "all" }], read: false }
        : { read: false };
      const result = await Notification.updateMany(filter, {
        read: true,
        readAt: new Date(),
      });
      res.json({ updated: result.modifiedCount });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.delete(
  "/alerts/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      await Notification.findByIdAndDelete(req.params.id);
      res.json({ message: "Alerte supprimée" });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.post(
  "/alerts/seed",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      await Notification.deleteMany({});
      const alerts: Partial<INotification>[] = [
        {
          patientId: "all",
          patientName: "Tous les patients",
          title: "Campagne de vaccination annuelle",
          message: "La campagne de vaccination antigrippale commence le 1er octobre 2026.",
          type: "info",
          category: "rappel",
          priority: "high",
          sentBy: "Service Prévention",
        },
        {
          patientId: "PAT-0006",
          patientName: "Antoine Leroy",
          title: "Résultat d'analyse disponible",
          message: "Vos résultats d'analyse sanguine sont disponibles sur votre espace patient.",
          type: "warning",
          category: "resultat",
          priority: "medium",
          sentBy: "Laboratoire",
        },
        {
          patientId: "PAT-0007",
          patientName: "Julie Moreau",
          title: "Consultation confirmée ✓",
          message: "Votre consultation du 15 juin avec le Dr. Dubois a été confirmée.",
          type: "success",
          category: "consultation",
          priority: "high",
          sentBy: "Secrétariat",
        },
        {
          patientId: "all",
          patientName: "Tous les patients",
          title: "Nouveau service de téléconsultation",
          message: "Découvrez notre nouveau service de téléconsultation disponible 24h/24.",
          type: "info",
          category: "consultation",
          priority: "medium",
          sentBy: "Direction médicale",
        },
        {
          patientId: "PAT-0002",
          patientName: "Lucas Bernard",
          title: "Rappel de contrôle annuel",
          message: "Votre contrôle annuel est programmé pour le 28 mai 2026.",
          type: "info",
          category: "rappel",
          priority: "medium",
          sentBy: "Service Prévention",
        },
        {
          patientId: "PAT-0008",
          patientName: "Nicolas Simon",
          title: "Rendez-vous reporté",
          message: "Votre rendez-vous du 1er août a été reporté au 15 août pour cause d'urgence.",
          type: "error",
          category: "urgence",
          priority: "high",
          sentBy: "Secrétariat",
        },
        {
          patientId: "all",
          patientName: "Tous les patients",
          title: "🏥 Nouveau service - Cardiologie",
          message: "Le service de cardiologie s'enrichit d'un nouveau plateau technique.",
          type: "info",
          category: "hospitalisation",
          priority: "low",
          sentBy: "Direction médicale",
        },
        {
          patientId: "PAT-0009",
          patientName: "Laura Michel",
          title: "Fin de traitement - Soins de suite",
          message: "Votre traitement de soins de suite se termine le 31 août 2026.",
          type: "warning",
          category: "hospitalisation",
          priority: "urgent",
          sentBy: "Service Soins",
        },
        {
          patientId: "PAT-0010",
          patientName: "Sophie Martinez",
          title: "Ordonnance disponible",
          message: "Votre nouvelle ordonnance est disponible en téléchargement.",
          type: "info",
          category: "ordonnance",
          priority: "medium",
          sentBy: "Dr. Martin",
        },
        {
          patientId: "PAT-0011",
          patientName: "Thomas Petit",
          title: "Urgence - Résultats IRM",
          message: "Vos résultats IRM montrent des anomalies. Contactez rapidement votre médecin.",
          type: "error",
          category: "urgence",
          priority: "urgent",
          sentBy: "Radiologie",
        },
      ];
      const created = await Notification.insertMany(alerts);
      res.json({
        message: `${created.length} alertes médicales créées`,
        count: created.length,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

mongoose
  .connect(process.env.MONGO_URI || "mongodb://mongo:27017/alertsdb")
  .then(() => {
    const PORT = parseInt(process.env.PORT || "5003");
    app.listen(PORT, () => console.log(`service-medical-alerts sur port ${PORT}`));
  })
  .catch((err) => console.error("Erreur MongoDB:", err));