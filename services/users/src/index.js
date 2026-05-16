const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    role: { type: String, default: "user" },
    createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", userSchema);

app.get("/health", (req, res) => res.json({ status: "ok", service: "users" }));

app.get("/users", async (req, res) => {
    const users = await User.find();
    res.json(users);
});

app.post("/users", async (req, res) => {
    const user = new User(req.body);
    await user.save();
    res.status(201).json(user);
});

app.delete("/users/:id", async (req, res) => {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "deleted" });
});

mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
        console.log("MongoDB connecté");
        app.listen(process.env.PORT, () =>
            console.log(`service-users sur port ${process.env.PORT}`)
        );
    })
    .catch((err) => console.error("Erreur MongoDB:", err));