import express, { Request, Response, NextFunction } from "express";
import mongoose, { Schema, Document, Types } from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

interface IAddress {
  street: string;
  city: string;
  country: string;
}

interface ILeaveBalance {
  paid: number;
  rtt: number;
  sick: number;
}

interface IEmployee extends Document {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  avatar: string;
  position: string;
  department: string;
  employeeId: string;
  managerId: Types.ObjectId | null;
  hireDate: Date;
  contractType: string;
  salary: number;
  status: string;
  address: IAddress;
  skills: string[];
  leaveBalance: ILeaveBalance;
  createdAt: Date;
  updatedAt: Date;
}

interface EmployeeQuery {
  department?: string;
  status?: string;
  $or?: Record<string, unknown>[];
}

type EmployeeStatus = "active" | "inactive" | "onLeave";

const employeeSchema = new Schema<IEmployee>(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String, default: "" },
    avatar: { type: String, default: "" },
    position: { type: String, required: true },
    department: {
      type: String,
      required: true,
      enum: [
        "Engineering",
        "HR",
        "Finance",
        "Marketing",
        "Operations",
        "Legal",
        "Sales",
      ],
    },
    employeeId: { type: String, unique: true },
    managerId: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    hireDate: { type: Date, default: Date.now },
    contractType: {
      type: String,
      enum: ["CDI", "CDD", "Stage", "Alternance"],
      default: "CDI",
    },
    salary: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["active", "inactive", "onLeave"],
      default: "active",
    },
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
  },
  { timestamps: true },
);

employeeSchema.pre("save", async function () {
  if (!this.employeeId) {
    const count = await Employee.countDocuments();
    this.employeeId = `EMP-${String(count + 1).padStart(4, "0")}`;
  }
});

const Employee = mongoose.model<IEmployee>("Employee", employeeSchema);

function validate(req: Request, res: Response, next: NextFunction): void {
  const { firstName, lastName, email, position, department } =
    req.body as Partial<IEmployee>;
  const errors: string[] = [];
  if (!firstName?.trim()) errors.push("firstName requis");
  if (!lastName?.trim()) errors.push("lastName requis");
  if (!email?.includes("@")) errors.push("email invalide");
  if (!position?.trim()) errors.push("position requise");
  if (!department) errors.push("department requis");
  if (errors.length) {
    res.status(400).json({ errors });
    return;
  }
  next();
}

app.get("/health", (_req: Request, res: Response) =>
  res.json({ status: "ok", service: "employees", pod: process.env.HOSTNAME }),
);

app.get("/employees", async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      department,
      status,
      search,
      page = "1",
      limit = "20",
    } = req.query as Record<string, string>;
    const filter: EmployeeQuery = {};
    if (department) filter.department = department;
    if (status) filter.status = status;
    if (search)
      filter.$or = [
        { firstName: new RegExp(search, "i") },
        { lastName: new RegExp(search, "i") },
        { email: new RegExp(search, "i") },
        { employeeId: new RegExp(search, "i") },
      ];

    const total = await Employee.countDocuments(filter);
    const employees = await Employee.find(filter)
      .populate("managerId", "firstName lastName employeeId")
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.json({
      data: employees,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get(
  "/employees/stats",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const [byDepartment, byStatus, byContract, total, avgSalaryResult] =
        await Promise.all([
          Employee.aggregate<{ _id: string; count: number; avgSalary: number }>(
            [
              {
                $group: {
                  _id: "$department",
                  count: { $sum: 1 },
                  avgSalary: { $avg: "$salary" },
                },
              },
              { $sort: { count: -1 } },
            ],
          ),
          Employee.aggregate<{ _id: string; count: number }>([
            { $group: { _id: "$status", count: { $sum: 1 } } },
          ]),
          Employee.aggregate<{ _id: string; count: number }>([
            { $group: { _id: "$contractType", count: { $sum: 1 } } },
          ]),
          Employee.countDocuments(),
          Employee.aggregate<{ _id: null; avg: number }>([
            { $group: { _id: null, avg: { $avg: "$salary" } } },
          ]),
        ]);

      res.json({
        total,
        byDepartment,
        byStatus,
        byContract,
        avgSalary: Math.round(avgSalaryResult[0]?.avg ?? 0),
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.get(
  "/employees/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const emp = await Employee.findById(req.params.id).populate(
        "managerId",
        "firstName lastName employeeId position",
      );
      if (!emp) {
        res.status(404).json({ error: "Employé non trouvé" });
        return;
      }
      res.json(emp);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.post(
  "/employees",
  validate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const emp = new Employee(req.body as Partial<IEmployee>);
      await emp.save();
      res.status(201).json(emp);
    } catch (err) {
      const mongoErr = err as { code?: number; message: string };
      if (mongoErr.code === 11000) {
        res.status(409).json({ error: "Email déjà utilisé" });
        return;
      }
      res.status(500).json({ error: mongoErr.message });
    }
  },
);

app.patch(
  "/employees/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const emp = await Employee.findByIdAndUpdate(
        req.params.id,
        req.body as Partial<IEmployee>,
        { new: true, runValidators: true },
      );
      if (!emp) {
        res.status(404).json({ error: "Employé non trouvé" });
        return;
      }
      res.json(emp);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.delete(
  "/employees/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const emp = await Employee.findByIdAndDelete(req.params.id);
      if (!emp) {
        res.status(404).json({ error: "Employé non trouvé" });
        return;
      }
      res.json({ message: "Employé supprimé", id: req.params.id });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.post(
  "/employees/seed",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      await Employee.deleteMany({});
      const demoEmployees: Partial<IEmployee>[] = [
        {
          firstName: "Sophie",
          lastName: "Martin",
          email: "s.martin@rh.com",
          phone: "06 12 34 56 78",
          position: "DRH",
          department: "HR",
          contractType: "CDI",
          salary: 75000,
          skills: ["Recrutement", "GPEC", "Droit du travail"],
          address: { street: "", city: "Paris", country: "France" },
        },
        {
          firstName: "Lucas",
          lastName: "Bernard",
          email: "l.bernard@rh.com",
          phone: "06 23 45 67 89",
          position: "Lead Developer",
          department: "Engineering",
          contractType: "CDI",
          salary: 68000,
          skills: ["Node.js", "React", "Kubernetes", "Docker"],
          address: { street: "", city: "Lyon", country: "France" },
        },
        {
          firstName: "Emma",
          lastName: "Dubois",
          email: "e.dubois@rh.com",
          phone: "06 34 56 78 90",
          position: "DevOps Engineer",
          department: "Engineering",
          contractType: "CDI",
          salary: 65000,
          skills: ["GKE", "Terraform", "CI/CD"],
          address: { street: "", city: "Bordeaux", country: "France" },
        },
        {
          firstName: "Thomas",
          lastName: "Petit",
          email: "t.petit@rh.com",
          phone: "06 45 67 89 01",
          position: "CFO",
          department: "Finance",
          contractType: "CDI",
          salary: 90000,
          skills: ["Comptabilité", "Audit", "Excel"],
          address: { street: "", city: "Paris", country: "France" },
        },
        {
          firstName: "Camille",
          lastName: "Robert",
          email: "c.robert@rh.com",
          phone: "06 56 78 90 12",
          position: "Marketing Manager",
          department: "Marketing",
          contractType: "CDI",
          salary: 58000,
          skills: ["SEO", "Content", "Analytics"],
          address: { street: "", city: "Nantes", country: "France" },
        },
        {
          firstName: "Antoine",
          lastName: "Leroy",
          email: "a.leroy@rh.com",
          phone: "06 67 89 01 23",
          position: "Backend Developer",
          department: "Engineering",
          contractType: "CDI",
          salary: 55000,
          skills: ["Python", "MongoDB", "REST API"],
          address: { street: "", city: "Toulouse", country: "France" },
        },
        {
          firstName: "Julie",
          lastName: "Moreau",
          email: "j.moreau@rh.com",
          phone: "06 78 90 12 34",
          position: "RH Chargée",
          department: "HR",
          contractType: "CDI",
          salary: 42000,
          skills: ["Recrutement", "Formation"],
          address: { street: "", city: "Lille", country: "France" },
        },
        {
          firstName: "Nicolas",
          lastName: "Simon",
          email: "n.simon@rh.com",
          phone: "06 89 01 23 45",
          position: "Sales Manager",
          department: "Sales",
          contractType: "CDI",
          salary: 62000,
          skills: ["Prospection", "CRM", "Négociation"],
          address: { street: "", city: "Marseille", country: "France" },
        },
        {
          firstName: "Laura",
          lastName: "Michel",
          email: "l.michel@rh.com",
          phone: "",
          position: "Alternante Dev",
          department: "Engineering",
          contractType: "Alternance",
          salary: 18000,
          skills: ["JavaScript", "React"],
          address: { street: "", city: "Lyon", country: "France" },
        },
        {
          firstName: "Maxime",
          lastName: "Garcia",
          email: "m.garcia@rh.com",
          phone: "",
          position: "Stagiaire Marketing",
          department: "Marketing",
          contractType: "Stage",
          salary: 12000,
          skills: ["Canva", "Réseaux sociaux"],
          status: "inactive" as EmployeeStatus,
          address: { street: "", city: "Paris", country: "France" },
        },
      ];

      const created: IEmployee[] = [];
      for (const emp of demoEmployees) {
        const e = await Employee.create(emp);
        created.push(e);
      }

      res.json({
        message: `${created.length} employés créés`,
        count: created.length,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

mongoose
  .connect(process.env.MONGO_URI || "mongodb://mongo:27017/employeesdb")
  .then(() => {
    const PORT = parseInt(process.env.PORT || "5002");
    app.listen(PORT, () => console.log(`service-employees sur port ${PORT}`));
  })
  .catch((err) => console.error("Erreur MongoDB:", err));
