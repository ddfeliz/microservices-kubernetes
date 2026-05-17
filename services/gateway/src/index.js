const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const SERVICES = {
    tasks: process.env.TASKS_URL,
    users: process.env.USERS_URL,
    notify: process.env.NOTIFY_URL,
    compute: process.env.COMPUTE_URL,
};


app.get("/health", (req, res) =>
    res.json({ status: "ok", service: "gateway", services: SERVICES })
);

async function proxyRequest(req, res, targetUrl) {
    try {
        const query = req.url.includes("?") ? "?" + req.url.split("?")[1] : "";
        const subPath = req.path === "/" ? "" : req.path;
        const url = `${targetUrl}${subPath}${query}`;

        const options = {
            method: req.method,
            headers: { "Content-Type": "application/json" },
        };
        if (["POST", "PUT", "PATCH"].includes(req.method)) {
            options.body = JSON.stringify(req.body);
        }

        const response = await fetch(url, options);
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        res.status(502).json({ error: "Service indisponible", detail: err.message });
    }
}


app.use("/api/employees", (req, res) => proxyRequest(req, res, `${SERVICES.users}/employees`));
app.use("/api/leaves", (req, res) => proxyRequest(req, res, `${SERVICES.tasks}/leaves`));
app.use("/api/notify", (req, res) => proxyRequest(req, res, `${SERVICES.notify}/notifications`));
app.use("/api/payroll", (req, res) => proxyRequest(req, res, `${SERVICES.compute}/payroll`));
app.use("/api/compute", (req, res) => proxyRequest(req, res, `${SERVICES.compute}/compute`));


app.listen(process.env.PORT, () =>
    console.log(`service-gateway sur port ${process.env.PORT}`)
);