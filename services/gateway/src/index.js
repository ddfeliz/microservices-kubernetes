const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// URLs des services (depuis .env)
const SERVICES = {
    tasks: process.env.TASKS_URL,
    users: process.env.USERS_URL,
    notify: process.env.NOTIFY_URL,
    compute: process.env.COMPUTE_URL,
};


app.get("/health", (req, res) =>
    res.json({ status: "ok", service: "gateway", services: SERVICES })
);

// Proxy corrigé
async function proxyRequest(req, res, targetUrl) {
    try {
        const query = req.url.includes("?") ? "?" + req.url.split("?")[1] : "";
        const subPath = req.path === "/" ? "" : req.path;
        const url = `${targetUrl}${subPath}${query}`;   // ← path correctement reconstruit

        const options = {
            method: req.method,
            headers: { "Content-Type": "application/json" },
        };
        if (["POST", "PUT", "PATCH"].includes(req.method)) {
            options.body = JSON.stringify(req.body);
        }

        const response = await fetch(url, options);     // ← options bien passées
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        res.status(502).json({ error: "Service indisponible", detail: err.message });
    }
}

// Routes — on inclut le path cible dans l'URL de base
app.use("/api/tasks", (req, res) => proxyRequest(req, res, `${SERVICES.tasks}/tasks`));
app.use("/api/users", (req, res) => proxyRequest(req, res, `${SERVICES.users}/users`));
app.use("/api/notify", (req, res) => proxyRequest(req, res, `${SERVICES.notify}/notifications`));
app.use("/api/compute", (req, res) => proxyRequest(req, res, `${SERVICES.compute}/compute`));


app.listen(process.env.PORT, () =>
    console.log(`service-gateway sur port ${process.env.PORT}`)
);