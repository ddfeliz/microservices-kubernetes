const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const notifSchema = new mongoose.Schema({
    message: String,
    type: { type: String, default: "info" }, // info | warning | error
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
});

const Notif = mongoose.model("Notif", notifSchema);

app.get("/health", (req, res) => res.json({ status: "ok", service: "notify" }));

app.get("/notifications", async (req, res) => {
    const notifs = await Notif.find().sort({ createdAt: -1 }).limit(20);
    res.json(notifs);
});

app.post("/notifications", async (req, res) => {
    const notif = new Notif(req.body);
    await notif.save();
    res.status(201).json(notif);
});

app.patch("/notifications/:id/read", async (req, res) => {
    const notif = await Notif.findByIdAndUpdate(
        req.params.id,
        { read: true },
        { new: true }
    );
    res.json(notif);
});

mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
        console.log("MongoDB connecté");
        app.listen(process.env.PORT, () =>
            console.log(`service-notify sur port ${process.env.PORT}`)
        );
    })
    .catch((err) => console.error("Erreur MongoDB:", err));