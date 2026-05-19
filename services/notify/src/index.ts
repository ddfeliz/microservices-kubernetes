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
  | "conge"
  | "paie"
  | "rh"
  | "systeme"
  | "anniversaire"
  | "contrat";
type NotifPriority = "low" | "medium" | "high" | "urgent";

interface INotification extends Document {
  employeeId: string;
  employeeName: string;
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
    employeeId: { type: String, default: "all" },
    employeeName: { type: String, default: "Tous" },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: ["info", "success", "warning", "error"],
      default: "info",
    },
    category: {
      type: String,
      enum: ["conge", "paie", "rh", "systeme", "anniversaire", "contrat"],
      default: "rh",
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
  res.json({ status: "ok", service: "notify", pod: process.env.HOSTNAME }),
);

app.get(
  "/notifications",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        employeeId,
        read,
        category,
        priority,
        page = "1",
        limit = "20",
      } = req.query as Record<string, string>;
      const filter: QueryFilter<INotification> = {};
      if (employeeId) filter.$or = [{ employeeId }, { employeeId: "all" }];
      if (read !== undefined) filter.read = read === "true";
      if (category) filter.category = category as NotifCategory;
      if (priority) filter.priority = priority as NotifPriority;

      const [total, unread, notifications] = await Promise.all([
        Notification.countDocuments(filter),
        Notification.countDocuments({ ...filter, read: false }),
        Notification.find(filter)
          .sort({ createdAt: -1 })
          .skip((parseInt(page) - 1) * parseInt(limit))
          .limit(parseInt(limit)),
      ]);

      res.json({
        data: notifications,
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
  "/notifications/stats",
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
  "/notifications",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { title, message } = req.body as Partial<INotification>;
      if (!title?.trim()) {
        res.status(400).json({ error: "title requis" });
        return;
      }
      if (!message?.trim()) {
        res.status(400).json({ error: "message requis" });
        return;
      }
      const notif = new Notification(req.body as Partial<INotification>);
      await notif.save();
      res.status(201).json(notif);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.patch(
  "/notifications/:id/read",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const notif = await Notification.findByIdAndUpdate(
        req.params.id,
        { read: true, readAt: new Date() },
        { new: true },
      );
      if (!notif) {
        res.status(404).json({ error: "Notification non trouvée" });
        return;
      }
      res.json(notif);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.patch(
  "/notifications/read-all",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { employeeId } = req.body as { employeeId?: string };
      const filter = employeeId
        ? { $or: [{ employeeId }, { employeeId: "all" }], read: false }
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
  "/notifications/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      await Notification.findByIdAndDelete(req.params.id);
      res.json({ message: "Supprimée" });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.post(
  "/notifications/seed",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      await Notification.deleteMany({});
      const notifs: Partial<INotification>[] = [
        {
          employeeId: "all",
          employeeName: "Tous",
          title: "Mise à jour politique télétravail",
          message:
            "La nouvelle charte télétravail entre en vigueur le 1er juin 2026.",
          type: "info",
          category: "rh",
          priority: "high",
          sentBy: "DRH",
        },
        {
          employeeId: "EMP-0006",
          employeeName: "Antoine Leroy",
          title: "Demande de congé en attente",
          message:
            "Votre demande de congé du 14 au 25 juillet est en cours d'examen.",
          type: "warning",
          category: "conge",
          priority: "medium",
          sentBy: "system",
        },
        {
          employeeId: "EMP-0007",
          employeeName: "Julie Moreau",
          title: "Congé maternité approuvé ✓",
          message:
            "Votre congé maternité du 15 juin au 15 septembre a été approuvé.",
          type: "success",
          category: "conge",
          priority: "high",
          sentBy: "Sophie Martin",
        },
        {
          employeeId: "all",
          employeeName: "Tous",
          title: "Fiches de paie Mai 2026 disponibles",
          message:
            "Les bulletins de salaire de mai sont disponibles dans votre espace.",
          type: "info",
          category: "paie",
          priority: "medium",
          sentBy: "Finance",
        },
        {
          employeeId: "EMP-0002",
          employeeName: "Lucas Bernard",
          title: "Entretien annuel planifié",
          message: "Votre entretien annuel est fixé au 28 mai 2026 à 14h.",
          type: "info",
          category: "rh",
          priority: "medium",
          sentBy: "RH",
        },
        {
          employeeId: "EMP-0008",
          employeeName: "Nicolas Simon",
          title: "Demande de congé refusée",
          message:
            "Votre demande de congé sans solde du 1er au 15 août a été refusée.",
          type: "error",
          category: "conge",
          priority: "high",
          sentBy: "Direction",
        },
        {
          employeeId: "all",
          employeeName: "Tous",
          title: "🎂 Anniversaire - Emma Dubois",
          message:
            "Souhaitons un joyeux anniversaire à Emma Dubois (Engineering) !",
          type: "info",
          category: "anniversaire",
          priority: "low",
          sentBy: "system",
        },
        {
          employeeId: "EMP-0009",
          employeeName: "Laura Michel",
          title: "Fin de contrat - Alternance",
          message: "Votre contrat d'alternance se termine le 31 août 2026.",
          type: "warning",
          category: "contrat",
          priority: "urgent",
          sentBy: "system",
        },
      ];
      const created = await Notification.insertMany(notifs);
      res.json({
        message: `${created.length} notifications créées`,
        count: created.length,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

mongoose
  .connect(process.env.MONGO_URI || "mongodb://mongo:27017/notifydb")
  .then(() => {
    const PORT = parseInt(process.env.PORT || "5003");
    app.listen(PORT, () => console.log(`service-notify sur port ${PORT}`));
  })
  .catch((err) => console.error("Erreur MongoDB:", err));
