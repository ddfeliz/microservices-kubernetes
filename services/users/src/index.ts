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

interface IMedicalHistory {
  antecedents: string[];
  allergies: string[];
  traitements: string[];
  groupeSanguin?: string;
}

interface IPatientBalance {
  consultations: number;
  examens: number;
  hospitalisations: number;
}

interface IPatient extends Document {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  avatar: string;
  position: string;
  department: string;
  patientId: string;
  referringDoctorId: Types.ObjectId | null;
  admissionDate: Date;
  contractType: string;
  salary: number;
  status: string;
  address: IAddress;
  medicalHistory: IMedicalHistory;
  skills: string[];
  patientBalance: IPatientBalance;
  createdAt: Date;
  updatedAt: Date;
}

interface PatientQuery {
  department?: string;
  status?: string;
  $or?: Record<string, unknown>[];
}

type PatientStatus = "active" | "inactive" | "onLeave";

// Définition des enums validés
const VALID_DEPARTMENTS = [
  "Cardiologie",
  "Pédiatrie",
  "Neurologie",
  "Dermatologie",
  "Urgences",
  "Chirurgie",
  "Radiologie",
];

const VALID_CONTRACT_TYPES = [
  "Hospitalisation",
  "Consultation externe",
  "Urgence",
  "Soins de suite",
];

const patientSchema = new Schema<IPatient>(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String, default: "" },
    avatar: { type: String, default: "" },
    position: { type: String, required: true, default: "Médecin traitant" },
    department: {
      type: String,
      required: true,
      enum: VALID_DEPARTMENTS,
    },
    patientId: { type: String, unique: true },
    referringDoctorId: { type: Schema.Types.ObjectId, ref: "Patient", default: null },
    admissionDate: { type: Date, default: Date.now },
    contractType: {
      type: String,
      enum: VALID_CONTRACT_TYPES,
      default: "Consultation externe",
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
    medicalHistory: {
      antecedents: [{ type: String }],
      allergies: [{ type: String }],
      traitements: [{ type: String }],
      groupeSanguin: { type: String, default: "" },
    },
    skills: [{ type: String }],
    patientBalance: {
      consultations: { type: Number, default: 0 },
      examens: { type: Number, default: 0 },
      hospitalisations: { type: Number, default: 0 },
    },
  },
  { 
    timestamps: true,
    strict: false // Permet de gérer les anciennes données temporairement
  }
);

patientSchema.pre("save", async function () {
  if (!this.patientId) {
    const count = await Patient.countDocuments();
    this.patientId = `PAT-${String(count + 1).padStart(4, "0")}`;
  }
});

const Patient = mongoose.model<IPatient>("Patient", patientSchema);

function validate(req: Request, res: Response, next: NextFunction): void {
  const { firstName, lastName, email, position, department, contractType } =
    req.body as Partial<IPatient>;
  const errors: string[] = [];
  if (!firstName?.trim()) errors.push("firstName requis");
  if (!lastName?.trim()) errors.push("lastName requis");
  if (!email?.includes("@")) errors.push("email invalide");
  if (!position?.trim()) errors.push("médecin traitant requis");
  if (!department) errors.push("service médical requis");
  if (department && !VALID_DEPARTMENTS.includes(department)) {
    errors.push(`department invalide. Valeurs acceptées: ${VALID_DEPARTMENTS.join(", ")}`);
  }
  if (contractType && !VALID_CONTRACT_TYPES.includes(contractType)) {
    errors.push(`contractType invalide. Valeurs acceptées: ${VALID_CONTRACT_TYPES.join(", ")}`);
  }
  if (errors.length) {
    res.status(400).json({ errors });
    return;
  }
  next();
}

app.get("/health", (_req: Request, res: Response) =>
  res.json({ status: "ok", service: "patients", pod: process.env.HOSTNAME }),
);

app.get("/patients", async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      department,
      status,
      search,
      page = "1",
      limit = "20",
    } = req.query as Record<string, string>;
    const filter: PatientQuery = {};
    if (department) filter.department = department;
    if (status) filter.status = status;
    if (search)
      filter.$or = [
        { firstName: new RegExp(search, "i") },
        { lastName: new RegExp(search, "i") },
        { email: new RegExp(search, "i") },
        { patientId: new RegExp(search, "i") },
      ];

    const total = await Patient.countDocuments(filter);
    const patients = await Patient.find(filter)
      .populate("referringDoctorId", "firstName lastName patientId position")
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.json({
      data: patients,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get(
  "/patients/stats",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const [byDepartment, byStatus, byContract, total, avgCostResult] =
        await Promise.all([
          Patient.aggregate<{ _id: string; count: number; avgCost: number }>(
            [
              {
                $group: {
                  _id: "$department",
                  count: { $sum: 1 },
                  avgCost: { $avg: "$salary" },
                },
              },
              { $sort: { count: -1 } },
            ],
          ),
          Patient.aggregate<{ _id: string; count: number }>([
            { $group: { _id: "$status", count: { $sum: 1 } } },
          ]),
          Patient.aggregate<{ _id: string; count: number }>([
            { $group: { _id: "$contractType", count: { $sum: 1 } } },
          ]),
          Patient.countDocuments(),
          Patient.aggregate<{ _id: null; avg: number }>([
            { $group: { _id: null, avg: { $avg: "$salary" } } },
          ]),
        ]);

      res.json({
        total,
        byDepartment,
        byStatus,
        byContract,
        avgCost: Math.round(avgCostResult[0]?.avg ?? 0),
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.get(
  "/patients/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const patient = await Patient.findById(req.params.id).populate(
        "referringDoctorId",
        "firstName lastName patientId position department",
      );
      if (!patient) {
        res.status(404).json({ error: "Patient non trouvé" });
        return;
      }
      res.json(patient);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.post(
  "/patients",
  validate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const patient = new Patient(req.body as Partial<IPatient>);
      await patient.save();
      res.status(201).json(patient);
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
  "/patients/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const patient = await Patient.findByIdAndUpdate(
        req.params.id,
        req.body as Partial<IPatient>,
        { new: true, runValidators: true },
      );
      if (!patient) {
        res.status(404).json({ error: "Patient non trouvé" });
        return;
      }
      res.json(patient);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.delete(
  "/patients/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const patient = await Patient.findByIdAndDelete(req.params.id);
      if (!patient) {
        res.status(404).json({ error: "Patient non trouvé" });
        return;
      }
      res.json({ message: "Patient supprimé", id: req.params.id });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.post(
  "/patients/seed",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      // Supprimer l'ancienne collection pour recréer avec le nouveau schéma
      await Patient.deleteMany({});
      
      const demoPatients: Partial<IPatient>[] = [
        {
          firstName: "Sophie",
          lastName: "Martin",
          email: "s.martin@medical.fr",
          phone: "06 12 34 56 78",
          position: "Dr. Dupont",
          department: "Cardiologie",
          contractType: "Hospitalisation",
          salary: 75000,
          medicalHistory: {
            antecedents: ["Hypertension", "Diabète type 2"],
            allergies: ["Pénicilline"],
            traitements: ["Metformine", "Lisinopril"],
            groupeSanguin: "A+",
          },
          address: { street: "", city: "Paris", country: "France" },
        },
        {
          firstName: "Lucas",
          lastName: "Bernard",
          email: "l.bernard@medical.fr",
          phone: "06 23 45 67 89",
          position: "Dr. Martin",
          department: "Pédiatrie",
          contractType: "Consultation externe",
          salary: 50000,
          medicalHistory: {
            antecedents: ["Asthme"],
            allergies: ["Acariens"],
            traitements: ["Ventoline"],
            groupeSanguin: "O+",
          },
          address: { street: "", city: "Lyon", country: "France" },
        },
        {
          firstName: "Emma",
          lastName: "Dubois",
          email: "e.dubois@medical.fr",
          phone: "06 34 56 78 90",
          position: "Dr. Laurent",
          department: "Neurologie",
          contractType: "Hospitalisation",
          salary: 65000,
          medicalHistory: {
            antecedents: ["Migraines chroniques"],
            allergies: [],
            traitements: ["Triptans"],
            groupeSanguin: "B-",
          },
          address: { street: "", city: "Bordeaux", country: "France" },
        },
        {
          firstName: "Thomas",
          lastName: "Petit",
          email: "t.petit@medical.fr",
          phone: "06 45 67 89 01",
          position: "Dr. Rousseau",
          department: "Urgences",
          contractType: "Urgence",
          salary: 60000,
          medicalHistory: {
            antecedents: ["Fracture tibia 2020"],
            allergies: ["Codéine"],
            traitements: [],
            groupeSanguin: "AB+",
          },
          address: { street: "", city: "Paris", country: "France" },
        },
        {
          firstName: "Camille",
          lastName: "Robert",
          email: "c.robert@medical.fr",
          phone: "06 56 78 90 12",
          position: "Dr. Lefebvre",
          department: "Dermatologie",
          contractType: "Consultation externe",
          salary: 48000,
          medicalHistory: {
            antecedents: ["Eczéma", "Allergies saisonnières"],
            allergies: ["Pollens"],
            traitements: ["Antihistaminiques"],
            groupeSanguin: "A-",
          },
          address: { street: "", city: "Nantes", country: "France" },
        },
        {
          firstName: "Antoine",
          lastName: "Leroy",
          email: "a.leroy@medical.fr",
          phone: "06 67 89 01 23",
          position: "Dr. Moreau",
          department: "Radiologie",
          contractType: "Consultation externe",
          salary: 55000,
          medicalHistory: {
            antecedents: ["Lombalgies chroniques"],
            allergies: [],
            traitements: ["Anti-inflammatoires"],
            groupeSanguin: "O-",
          },
          address: { street: "", city: "Toulouse", country: "France" },
        },
        {
          firstName: "Julie",
          lastName: "Moreau",
          email: "j.moreau@medical.fr",
          phone: "06 78 90 12 34",
          position: "Dr. Bernard",
          department: "Chirurgie",
          contractType: "Hospitalisation",
          salary: 82000,
          medicalHistory: {
            antecedents: ["Appendicectomie 2019"],
            allergies: ["Latex"],
            traitements: [],
            groupeSanguin: "B+",
          },
          address: { street: "", city: "Lille", country: "France" },
        },
        {
          firstName: "Nicolas",
          lastName: "Simon",
          email: "n.simon@medical.fr",
          phone: "06 89 01 23 45",
          position: "Dr. Dubois",
          department: "Cardiologie",
          contractType: "Urgence",
          salary: 62000,
          medicalHistory: {
            antecedents: ["Infarctus 2022"],
            allergies: ["Aspirine"],
            traitements: ["Clopidogrel", "Atorvastatine"],
            groupeSanguin: "A+",
          },
          address: { street: "", city: "Marseille", country: "France" },
        },
        {
          firstName: "Laura",
          lastName: "Michel",
          email: "l.michel@medical.fr",
          phone: "",
          position: "Dr. Petit",
          department: "Pédiatrie",
          contractType: "Soins de suite",
          salary: 38000,
          medicalHistory: {
            antecedents: ["Prématurité"],
            allergies: ["Lactose"],
            traitements: ["Lait sans lactose"],
            groupeSanguin: "AB-",
          },
          address: { street: "", city: "Lyon", country: "France" },
        },
        {
          firstName: "Maxime",
          lastName: "Garcia",
          email: "m.garcia@medical.fr",
          phone: "",
          position: "Dr. Lefevre",
          department: "Dermatologie",
          contractType: "Consultation externe",
          salary: 42000,
          medicalHistory: {
            antecedents: ["Acné sévère"],
            allergies: [],
            traitements: ["Roaccutane"],
            groupeSanguin: "O+",
          },
          status: "inactive" as PatientStatus,
          address: { street: "", city: "Paris", country: "France" },
        },
      ];

      const created: IPatient[] = [];
      for (const patient of demoPatients) {
        const p = await Patient.create(patient);
        created.push(p);
      }

      res.json({
        message: `${created.length} patients créés`,
        count: created.length,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// Fonction pour nettoyer l'ancienne collection
app.post(
  "/patients/migrate",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      // Supprimer tous les documents existants
      const deletedCount = await Patient.deleteMany({});
      res.json({ 
        message: "Base patients nettoyée", 
        deletedCount: deletedCount.deletedCount 
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

mongoose
  .connect(process.env.MONGO_URI || "mongodb://mongo:27017/patientsdb")
  .then(async () => {
    console.log("Connecté à MongoDB");
    
    // Optionnel: Nettoyer l'ancienne collection au démarrage
    // await Patient.deleteMany({});
    // console.log("Anciennes données nettoyées");
    
    const PORT = parseInt(process.env.PORT || "5001");
    app.listen(PORT, () => console.log(`service-patients sur port ${PORT}`));
  })
  .catch((err) => console.error("Erreur MongoDB:", err));