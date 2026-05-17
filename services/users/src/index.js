const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const employeeSchema = new mongoose.Schema({
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String, default: "" },
    avatar: { type: String, default: "" },

    position: { type: String, required: true },
    department: {
        type: String, required: true, enum: [
            "Engineering", "HR", "Finance", "Marketing", "Operations", "Legal", "Sales"
        ]
    },
    employeeId: { type: String, unique: true },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },

    hireDate: { type: Date, default: Date.now },
    contractType: { type: String, enum: ["CDI", "CDD", "Stage", "Alternance"], default: "CDI" },
    salary: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "inactive", "onLeave"], default: "active" },

    address: {
        street: { type: String, default: "" },
        city: { type: String, default: "" },
        country: { type: String, default: "France" },
    },

    skills: [{ type: String }],

    leaveBalance: {
        paid: { type: Number, default: 25 },
        rtt: { type: Number, default: 10 },
        sick: { type: Number, default: 0 },
    },
}, { timestamps: true });

employeeSchema.pre("save", async function (next) {
    if (!this.employeeId) {
        const count = await mongoose.model("Employee").countDocuments();
        this.employeeId = `EMP-${String(count + 1).padStart(4, "0")}`;
    }
    next();
});

const Employee = mongoose.model("Employee", employeeSchema);

function validate(req, res, next) {
    const { firstName, lastName, email, position, department } = req.body;
    const errors = [];
    if (!firstName?.trim()) errors.push("firstName requis");
    if (!lastName?.trim()) errors.push("lastName requis");
    if (!email?.includes("@")) errors.push("email invalide");
    if (!position?.trim()) errors.push("position requise");
    if (!department) errors.push("department requis");
    if (errors.length) return res.status(400).json({ errors });
    next();
}

app.get("/health", (req, res) =>
    res.json({ status: "ok", service: "employees", pod: process.env.HOSTNAME })
);

app.get("/employees", async (req, res) => {
    try {
        const { department, status, search, page = 1, limit = 20 } = req.query;
        const filter = {};
        if (department) filter.department = department;
        if (status) filter.status = status;
        if (search) filter.$or = [
            { firstName: new RegExp(search, "i") },
            { lastName: new RegExp(search, "i") },
            { email: new RegExp(search, "i") },
            { employeeId: new RegExp(search, "i") },
        ];

        const total = await Employee.countDocuments(filter);
        const employees = await Employee.find(filter)
            .populate("managerId", "firstName lastName employeeId")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));

        res.json({ data: employees, total, page: Number(page), limit: Number(limit) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/employees/stats", async (req, res) => {
    try {
        const byDepartment = await Employee.aggregate([
            { $group: { _id: "$department", count: { $sum: 1 }, avgSalary: { $avg: "$salary" } } },
            { $sort: { count: -1 } }
        ]);
        const byStatus = await Employee.aggregate([
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);
        const byContract = await Employee.aggregate([
            { $group: { _id: "$contractType", count: { $sum: 1 } } }
        ]);
        const total = await Employee.countDocuments();
        const avgSalary = await Employee.aggregate([
            { $group: { _id: null, avg: { $avg: "$salary" } } }
        ]);

        res.json({
            total, byDepartment, byStatus, byContract,
            avgSalary: Math.round(avgSalary[0]?.avg || 0)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/employees/:id", async (req, res) => {
    try {
        const emp = await Employee.findById(req.params.id)
            .populate("managerId", "firstName lastName employeeId position");
        if (!emp) return res.status(404).json({ error: "Employé non trouvé" });
        res.json(emp);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/employees", validate, async (req, res) => {
    try {
        const emp = new Employee(req.body);
        await emp.save();
        res.status(201).json(emp);
    } catch (err) {
        if (err.code === 11000) return res.status(409).json({ error: "Email déjà utilisé" });
        res.status(500).json({ error: err.message });
    }
});

app.patch("/employees/:id", async (req, res) => {
    try {
        const emp = await Employee.findByIdAndUpdate(
            req.params.id, req.body, { new: true, runValidators: true }
        );
        if (!emp) return res.status(404).json({ error: "Employé non trouvé" });
        res.json(emp);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/employees/:id", async (req, res) => {
    try {
        const emp = await Employee.findByIdAndDelete(req.params.id);
        if (!emp) return res.status(404).json({ error: "Employé non trouvé" });
        res.json({ message: "Employé supprimé", id: req.params.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/employees/seed", async (req, res) => {
    try {
        await Employee.deleteMany({});
        const demoEmployees = [
            { firstName: "Sophie", lastName: "Martin", email: "s.martin@rh.com", phone: "06 12 34 56 78", position: "DRH", department: "HR", contractType: "CDI", salary: 75000, skills: ["Recrutement", "GPEC", "Droit du travail"], address: { city: "Paris" } },
            { firstName: "Lucas", lastName: "Bernard", email: "l.bernard@rh.com", phone: "06 23 45 67 89", position: "Lead Developer", department: "Engineering", contractType: "CDI", salary: 68000, skills: ["Node.js", "React", "Kubernetes", "Docker"], address: { city: "Lyon" } },
            { firstName: "Emma", lastName: "Dubois", email: "e.dubois@rh.com", phone: "06 34 56 78 90", position: "DevOps Engineer", department: "Engineering", contractType: "CDI", salary: 65000, skills: ["GKE", "Terraform", "CI/CD"], address: { city: "Bordeaux" } },
            { firstName: "Thomas", lastName: "Petit", email: "t.petit@rh.com", phone: "06 45 67 89 01", position: "CFO", department: "Finance", contractType: "CDI", salary: 90000, skills: ["Comptabilité", "Audit", "Excel"], address: { city: "Paris" } },
            { firstName: "Camille", lastName: "Robert", email: "c.robert@rh.com", phone: "06 56 78 90 12", position: "Marketing Manager", department: "Marketing", contractType: "CDI", salary: 58000, skills: ["SEO", "Content", "Analytics"], address: { city: "Nantes" } },
            { firstName: "Antoine", lastName: "Leroy", email: "a.leroy@rh.com", phone: "06 67 89 01 23", position: "Backend Developer", department: "Engineering", contractType: "CDI", salary: 55000, skills: ["Python", "MongoDB", "REST API"], address: { city: "Toulouse" } },
            { firstName: "Julie", lastName: "Moreau", email: "j.moreau@rh.com", phone: "06 78 90 12 34", position: "RH Chargée", department: "HR", contractType: "CDI", salary: 42000, skills: ["Recrutement", "Formation"], address: { city: "Lille" } },
            { firstName: "Nicolas", lastName: "Simon", email: "n.simon@rh.com", phone: "06 89 01 23 45", position: "Sales Manager", department: "Sales", contractType: "CDI", salary: 62000, skills: ["Prospection", "CRM", "Négociation"], address: { city: "Marseille" } },
            { firstName: "Laura", lastName: "Michel", email: "l.michel@rh.com", position: "Alternante Dev", department: "Engineering", contractType: "Alternance", salary: 18000, skills: ["JavaScript", "React"], address: { city: "Lyon" } },
            { firstName: "Maxime", lastName: "Garcia", email: "m.garcia@rh.com", position: "Stagiaire Marketing", department: "Marketing", contractType: "Stage", salary: 12000, skills: ["Canva", "Réseaux sociaux"], address: { city: "Paris" }, status: "inactive" },
        ];
        const created = await Employee.insertMany(demoEmployees);
        res.json({ message: `${created.length} employés créés`, count: created.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("MongoDB connecté");
        app.listen(process.env.PORT, () =>
            console.log(`service-employees sur port ${process.env.PORT}`)
        );
    })
    .catch(err => console.error("Erreur MongoDB:", err));