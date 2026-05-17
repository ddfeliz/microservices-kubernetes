const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const leaveSchema = new mongoose.Schema({
    employeeId: { type: String, required: true },
    employeeName: { type: String, required: true },
    department: { type: String, default: "" },

    type: {
        type: String, required: true, enum: [
            "Congé Payé", "RTT", "Maladie", "Maternité",
            "Paternité", "Sans Solde", "Exceptionnel"
        ]
    },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    days: { type: Number, required: true, min: 0.5 },

    status: {
        type: String,
        enum: ["pending", "approved", "rejected", "cancelled"],
        default: "pending"
    },

    reason: { type: String, default: "" },
    comment: { type: String, default: "" },
    approvedBy: { type: String, default: null },
    approvedAt: { type: Date, default: null },

    attachments: [{ name: String, url: String }],
}, { timestamps: true });

const Leave = mongoose.model("Leave", leaveSchema);

function validate(req, res, next) {
    const { employeeId, employeeName, type, startDate, endDate, days } = req.body;
    const errors = [];
    if (!employeeId) errors.push("employeeId requis");
    if (!employeeName) errors.push("employeeName requis");
    if (!type) errors.push("type requis");
    if (!startDate) errors.push("startDate requis");
    if (!endDate) errors.push("endDate requis");
    if (!days || days < 0.5) errors.push("days doit être >= 0.5");
    if (new Date(startDate) > new Date(endDate))
        errors.push("startDate doit être avant endDate");
    if (errors.length) return res.status(400).json({ errors });
    next();
}

app.get("/health", (req, res) =>
    res.json({ status: "ok", service: "leaves", pod: process.env.HOSTNAME })
);

app.get("/leaves", async (req, res) => {
    try {
        const { status, employeeId, type, page = 1, limit = 20 } = req.query;
        const filter = {};
        if (status) filter.status = status;
        if (employeeId) filter.employeeId = employeeId;
        if (type) filter.type = type;

        const total = await Leave.countDocuments(filter);
        const leaves = await Leave.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));

        res.json({ data: leaves, total, page: Number(page), limit: Number(limit) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/leaves/stats", async (req, res) => {
    try {
        const byStatus = await Leave.aggregate([
            { $group: { _id: "$status", count: { $sum: 1 }, totalDays: { $sum: "$days" } } }
        ]);
        const byType = await Leave.aggregate([
            { $group: { _id: "$type", count: { $sum: 1 }, totalDays: { $sum: "$days" } } },
            { $sort: { count: -1 } }
        ]);
        const byDepartment = await Leave.aggregate([
            { $match: { status: "approved" } },
            { $group: { _id: "$department", totalDays: { $sum: "$days" } } },
            { $sort: { totalDays: -1 } }
        ]);
        const pending = await Leave.countDocuments({ status: "pending" });

        res.json({ byStatus, byType, byDepartment, pending });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/leaves/:id", async (req, res) => {
    try {
        const leave = await Leave.findById(req.params.id);
        if (!leave) return res.status(404).json({ error: "Demande non trouvée" });
        res.json(leave);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/leaves", validate, async (req, res) => {
    try {
        const leave = new Leave(req.body);
        await leave.save();
        res.status(201).json(leave);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch("/leaves/:id/status", async (req, res) => {
    try {
        const { status, comment, approvedBy } = req.body;
        if (!["approved", "rejected", "cancelled"].includes(status))
            return res.status(400).json({ error: "Statut invalide" });

        const leave = await Leave.findByIdAndUpdate(
            req.params.id,
            { status, comment, approvedBy, approvedAt: new Date() },
            { new: true }
        );
        if (!leave) return res.status(404).json({ error: "Demande non trouvée" });
        res.json(leave);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/leaves/:id", async (req, res) => {
    try {
        const leave = await Leave.findByIdAndDelete(req.params.id);
        if (!leave) return res.status(404).json({ error: "Demande non trouvée" });
        res.json({ message: "Demande supprimée" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/leaves/seed", async (req, res) => {
    try {
        await Leave.deleteMany({});
        const leaves = [
            { employeeId: "EMP-0001", employeeName: "Sophie Martin", department: "HR", type: "Congé Payé", startDate: "2026-06-01", endDate: "2026-06-14", days: 10, status: "approved", reason: "Vacances d'été", approvedBy: "EMP-0004" },
            { employeeId: "EMP-0002", employeeName: "Lucas Bernard", department: "Engineering", type: "RTT", startDate: "2026-05-20", endDate: "2026-05-20", days: 1, status: "approved", reason: "Récupération" },
            { employeeId: "EMP-0003", employeeName: "Emma Dubois", department: "Engineering", type: "Maladie", startDate: "2026-05-10", endDate: "2026-05-12", days: 3, status: "approved", reason: "Certificat médical fourni" },
            { employeeId: "EMP-0006", employeeName: "Antoine Leroy", department: "Engineering", type: "Congé Payé", startDate: "2026-07-14", endDate: "2026-07-25", days: 8, status: "pending", reason: "Voyage familial" },
            { employeeId: "EMP-0005", employeeName: "Camille Robert", department: "Marketing", type: "RTT", startDate: "2026-05-23", endDate: "2026-05-23", days: 1, status: "pending", reason: "Pont de l'Ascension" },
            { employeeId: "EMP-0007", employeeName: "Julie Moreau", department: "HR", type: "Maternité", startDate: "2026-06-15", endDate: "2026-09-15", days: 90, status: "approved", reason: "Congé maternité légal" },
            { employeeId: "EMP-0008", employeeName: "Nicolas Simon", department: "Sales", type: "Sans Solde", startDate: "2026-08-01", endDate: "2026-08-15", days: 11, status: "rejected", reason: "Projet personnel", comment: "Période haute pour les ventes" },
        ];
        const created = await Leave.insertMany(leaves);
        res.json({ message: `${created.length} demandes créées`, count: created.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("MongoDB connecté");
        app.listen(process.env.PORT, () =>
            console.log(`service-leaves sur port ${process.env.PORT}`)
        );
    })
    .catch(err => console.error("Erreur MongoDB:", err));