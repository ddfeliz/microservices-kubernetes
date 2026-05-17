const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// ── Schéma ───────────────────────────────────────
const notificationSchema = new mongoose.Schema({
    employeeId: { type: String, default: "all" }, // "all" = broadcast
    employeeName: { type: String, default: "Tous" },

    title: { type: String, required: true },
    message: { type: String, required: true },

    type: {
        type: String,
        enum: ["info", "success", "warning", "error"],
        default: "info"
    },
    category: {
        type: String,
        enum: ["conge", "paie", "rh", "systeme", "anniversaire", "contrat"],
        default: "rh"
    },
    priority: {
        type: String,
        enum: ["low", "medium", "high", "urgent"],
        default: "medium"
    },

    read: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
    actionUrl: { type: String, default: "" }, // lien vers la ressource
    actionLabel: { type: String, default: "" },

    // Qui a émis la notif
    sentBy: { type: String, default: "system" },
}, { timestamps: true });

const Notification = mongoose.model("Notification", notificationSchema);

// ── Routes ───────────────────────────────────────
app.get("/health", (req, res) =>
    res.json({ status: "ok", service: "notify", pod: process.env.HOSTNAME })
);

// GET toutes les notifications
app.get("/notifications", async (req, res) => {
    try {
        const { employeeId, read, category, priority, page = 1, limit = 20 } = req.query;
        const filter = {};
        if (employeeId) filter.$or = [{ employeeId }, { employeeId: "all" }];
        if (read !== undefined) filter.read = read === "true";
        if (category) filter.category = category;
        if (priority) filter.priority = priority;

        const total = await Notification.countDocuments(filter);
        const unread = await Notification.countDocuments({ ...filter, read: false });
        const notifications = await Notification.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));

        res.json({ data: notifications, total, unread, page: Number(page), limit: Number(limit) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET stats
app.get("/notifications/stats", async (req, res) => {
    try {
        const byCategory = await Notification.aggregate([
            {
                $group: {
                    _id: "$category", count: { $sum: 1 }, unread: {
                        $sum: { $cond: [{ $eq: ["$read", false] }, 1, 0] }
                    }
                }
            }
        ]);
        const byPriority = await Notification.aggregate([
            { $group: { _id: "$priority", count: { $sum: 1 } } }
        ]);
        const total = await Notification.countDocuments();
        const unread = await Notification.countDocuments({ read: false });

        res.json({ byCategory, byPriority, total, unread });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST créer
app.post("/notifications", async (req, res) => {
    try {
        const { title, message } = req.body;
        if (!title?.trim()) return res.status(400).json({ error: "title requis" });
        if (!message?.trim()) return res.status(400).json({ error: "message requis" });
        const notif = new Notification(req.body);
        await notif.save();
        res.status(201).json(notif);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH marquer comme lu
app.patch("/notifications/:id/read", async (req, res) => {
    try {
        const notif = await Notification.findByIdAndUpdate(
            req.params.id,
            { read: true, readAt: new Date() },
            { new: true }
        );
        if (!notif) return res.status(404).json({ error: "Notification non trouvée" });
        res.json(notif);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH marquer toutes comme lues
app.patch("/notifications/read-all", async (req, res) => {
    try {
        const { employeeId } = req.body;
        const filter = employeeId
            ? { $or: [{ employeeId }, { employeeId: "all" }], read: false }
            : { read: false };
        const result = await Notification.updateMany(filter, { read: true, readAt: new Date() });
        res.json({ updated: result.modifiedCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE
app.delete("/notifications/:id", async (req, res) => {
    try {
        await Notification.findByIdAndDelete(req.params.id);
        res.json({ message: "Supprimée" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST seed
app.post("/notifications/seed", async (req, res) => {
    try {
        await Notification.deleteMany({});
        const notifs = [
            { employeeId: "all", employeeName: "Tous", title: "Mise à jour politique télétravail", message: "La nouvelle charte télétravail entre en vigueur le 1er juin 2026. Consultez le document RH.", type: "info", category: "rh", priority: "high", sentBy: "DRH" },
            { employeeId: "EMP-0006", employeeName: "Antoine Leroy", title: "Demande de congé en attente", message: "Votre demande de congé du 14 au 25 juillet est en cours d'examen.", type: "warning", category: "conge", priority: "medium", actionLabel: "Voir la demande" },
            { employeeId: "EMP-0007", employeeName: "Julie Moreau", title: "Congé maternité approuvé ✓", message: "Votre congé maternité du 15 juin au 15 septembre a été approuvé.", type: "success", category: "conge", priority: "high", sentBy: "Sophie Martin" },
            { employeeId: "all", employeeName: "Tous", title: "Fiches de paie Mai 2026 disponibles", message: "Les bulletins de salaire de mai sont disponibles dans votre espace personnel.", type: "info", category: "paie", priority: "medium", sentBy: "Finance" },
            { employeeId: "EMP-0002", employeeName: "Lucas Bernard", title: "Entretien annuel planifié", message: "Votre entretien annuel est fixé au 28 mai 2026 à 14h avec Sophie Martin.", type: "info", category: "rh", priority: "medium", sentBy: "RH" },
            { employeeId: "EMP-0008", employeeName: "Nicolas Simon", title: "Demande de congé refusée", message: "Votre demande de congé sans solde du 1er au 15 août a été refusée. Motif : période haute.", type: "error", category: "conge", priority: "high", sentBy: "Direction" },
            { employeeId: "all", employeeName: "Tous", title: "🎂 Anniversaire - Emma Dubois", message: "Souhaitons un joyeux anniversaire à Emma Dubois (Engineering) !", type: "info", category: "anniversaire", priority: "low", sentBy: "system" },
            { employeeId: "EMP-0009", employeeName: "Laura Michel", title: "Fin de contrat - Alternance", message: "Votre contrat d'alternance se termine le 31 août 2026. Pensez à contacter les RH.", type: "warning", category: "contrat", priority: "urgent", sentBy: "system" },
        ];
        const created = await Notification.insertMany(notifs);
        res.json({ message: `${created.length} notifications créées`, count: created.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("MongoDB connecté");
        app.listen(process.env.PORT, () =>
            console.log(`service-notify sur port ${process.env.PORT}`)
        );
    })
    .catch(err => console.error("Erreur MongoDB:", err));