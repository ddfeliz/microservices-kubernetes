import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend } from "k6/metrics";

const errorRate = new Rate("errors");
const computeLatency = new Trend("compute_latency", true);
const patientsLatency = new Trend("patients_latency", true);
const appointmentsLatency = new Trend("appointments_latency", true);
const alertsLatency = new Trend("alerts_latency", true);
const billingLatency = new Trend("billing_latency", true);

const GW = __ENV.GATEWAY_URL || "http://34.156.96.146";
const JSON_HEADERS = { headers: { "Content-Type": "application/json" } };

export const options = {
    stages: [
        { duration: "30s", target: 10 },
        { duration: "1m", target: 30 },
        { duration: "1m", target: 60 },
        { duration: "2m", target: 100 },
        { duration: "1m", target: 50 },
        { duration: "30s", target: 0 },
    ],
    thresholds: {
        http_req_duration: ["p(95)<5000"],
        errors: ["rate<0.15"],
    },
};

let counter = 0;

export default function () {
    const id = `${__VU}-${__ITER}`;
    counter++;

    group("GET medical compute", () => {
        const t = Date.now();
        const r = http.get(`${GW}/api/compute?n=38`);
        computeLatency.add(Date.now() - t);
        errorRate.add(!check(r, {
            "compute 200": (r) => r.status === 200,
            "has fibonacci": (r) => {
                try { return JSON.parse(r.body).fibonacci > 0; } catch { return false; }
            },
        }));
    });
    sleep(0.3);

    group("GET patients", () => {
        const t = Date.now();
        const r = http.get(`${GW}/api/employees?limit=20`);
        patientsLatency.add(Date.now() - t);
        errorRate.add(!check(r, {
            "patients 200": (r) => r.status === 200,
        }));
    });
    sleep(0.2);

    group("POST patient", () => {
        const payload = JSON.stringify({
            firstName: `Patient`,
            lastName: `Test${counter}`,
            email: `patient.test${counter}-${id}@k6.io`,
            phone: "06 00 00 00 00",
            position: "Médecin traitant",
            department: "Cardiologie",
            contractType: "Consultation externe",
            salary: 35000,
            skills: ["Hypertension", "Diabète"],
            address: { street: "", city: "Paris", country: "France" },
        });
        const r = http.post(`${GW}/api/employees`, payload, JSON_HEADERS);
        errorRate.add(!check(r, {
            "create patient 201": (r) => r.status === 201,
        }));
    });
    sleep(0.2);

    group("GET patient stats", () => {
        const r = http.get(`${GW}/api/employees/stats`);
        errorRate.add(!check(r, { "patient stats 200": (r) => r.status === 200 }));
    });
    sleep(0.2);

    group("GET appointments", () => {
        const t = Date.now();
        const r = http.get(`${GW}/api/leaves?limit=20`);
        appointmentsLatency.add(Date.now() - t);
        errorRate.add(!check(r, { "appointments 200": (r) => r.status === 200 }));
    });
    sleep(0.2);

    group("POST appointment", () => {
        const payload = JSON.stringify({
            employeeId: `PAT-K6-${counter}`,
            employeeName: `Patient K6 ${counter}`,
            department: "Cardiologie",
            type: "Consultation générale",
            startDate: "2026-07-01",
            endDate: "14:30",
            days: 1,
            reason: "Test de charge k6 - symptômes: fatigue",
        });
        const r = http.post(`${GW}/api/leaves`, payload, JSON_HEADERS);
        errorRate.add(!check(r, {
            "create appointment 201": (r) => r.status === 201,
        }));
    });
    sleep(0.2);

    group("GET appointment stats", () => {
        const r = http.get(`${GW}/api/leaves/stats`);
        errorRate.add(!check(r, { "appointment stats 200": (r) => r.status === 200 }));
    });
    sleep(0.2);

    group("GET medical alerts", () => {
        const t = Date.now();
        const r = http.get(`${GW}/api/notify?limit=20`);
        alertsLatency.add(Date.now() - t);
        errorRate.add(!check(r, { "alerts 200": (r) => r.status === 200 }));
    });
    sleep(0.2);

    group("POST medical alert", () => {
        const payload = JSON.stringify({
            title: `Alerte médicale #${counter}`,
            message: `Résultat d'analyse urgent - patient ${counter} - paramètres anormaux détectés`,
            type: "warning",
            category: "urgence",
            priority: "high",
            employeeId: "all",
            employeeName: "Tous les patients",
        });
        const r = http.post(`${GW}/api/notify`, payload, JSON_HEADERS);
        errorRate.add(!check(r, {
            "create alert 201": (r) => r.status === 201,
        }));
    });
    sleep(0.2);

    group("POST medical billing", () => {
        const t = Date.now();
        const payload = JSON.stringify({
            name: `Patient K6 ${counter}`,
            salary: 45000 + Math.floor(Math.random() * 30000),
            department: ["Cardiologie", "Pédiatrie", "Neurologie", "Dermatologie", "Urgences"][counter % 5],
            contractType: "Hospitalisation",
            seniority: Math.floor(Math.random() * 10),
        });
        const r = http.post(`${GW}/api/payroll/calculate`, payload, JSON_HEADERS);
        billingLatency.add(Date.now() - t);
        errorRate.add(!check(r, {
            "billing 200": (r) => r.status === 200,
            "has netTotal": (r) => {
                try { return JSON.parse(r.body).netTotal > 0; } catch { return false; }
            },
        }));
    });
    sleep(0.2);

    if (counter % 5 === 0) {
        group("POST batch billing", () => {
            const patients = [];
            for (let i = 0; i < 10; i++) {
                patients.push({
                    name: `Batch Patient ${i}`,
                    salary: 40000 + i * 5000,
                    department: "Cardiologie",
                    contractType: "Hospitalisation",
                });
            }
            const r = http.post(`${GW}/api/payroll/batch`, JSON.stringify({ employees: patients }), JSON_HEADERS);
            errorRate.add(!check(r, {
                "batch billing 200": (r) => r.status === 200,
            }));
        });
        sleep(0.3);
    }
}