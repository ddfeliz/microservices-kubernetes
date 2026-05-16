const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Schéma MongoDB
const taskSchema = new mongoose.Schema({
    title: String,
    status: { type: String, default: "pending" },
    priority: { type: String, default: "medium" },
    createdAt: { type: Date, default: Date.now },
});

const Task = mongoose.model("Task", taskSchema);

// Routes
app.get("/health", (req, res) => res.json({ status: "ok", service: "tasks" }));

app.get("/tasks", async (req, res) => {
    const tasks = await Task.find();
    res.json(tasks);
});

app.post("/tasks", async (req, res) => {
    const task = new Task(req.body);
    await task.save();
    res.status(201).json(task);
});

app.delete("/tasks/:id", async (req, res) => {
    await Task.findByIdAndDelete(req.params.id);
    res.json({ message: "deleted" });
});

// Connexion MongoDB + démarrage
mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
        console.log("MongoDB connecté");
        app.listen(process.env.PORT, () =>
            console.log(`service-tasks sur port ${process.env.PORT}`)
        );
    })
    .catch((err) => console.error("Erreur MongoDB:", err));