const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Fibonacci récursif — volontairement lent pour consommer du CPU
function fibonacci(n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

// Tri à bulles sur grand tableau — O(n²) volontairement
function bubbleSort(arr) {
    const a = [...arr];
    for (let i = 0; i < a.length; i++)
        for (let j = 0; j < a.length - i - 1; j++)
            if (a[j] > a[j + 1]) [a[j], a[j + 1]] = [a[j + 1], a[j]];
    return a;
}

app.get("/health", (req, res) => res.json({ status: "ok", service: "compute" }));

// Route principale pour le benchmark
app.get("/compute", (req, res) => {
    const n = parseInt(req.query.n) || 38; // fibonacci(38) ≈ 1 sec CPU

    const start = Date.now();
    const fibResult = fibonacci(n);

    // Tri sur tableau aléatoire de 5000 éléments
    const arr = Array.from({ length: 5000 }, () => Math.random() * 10000);
    bubbleSort(arr);

    const duration = Date.now() - start;

    res.json({
        input: n,
        fibonacci: fibResult,
        sortedElements: 5000,
        durationMs: duration,
        pod: process.env.HOSTNAME || "local",  // utile pour voir quel pod répond
    });
});

app.listen(process.env.PORT, () =>
    console.log(`service-compute sur port ${process.env.PORT}`)
);