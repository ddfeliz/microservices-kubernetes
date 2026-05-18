
import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend } from "k6/metrics";

const errorRate = new Rate("errors");
const computeLatency = new Trend("compute_latency", true);
const employeesLatency = new Trend("employees_latency", true);
const leavesLatency = new Trend("leaves_latency", true);
const notifyLatency = new Trend("notify_latency", true);
const payrollLatency = new Trend("payroll_latency", true);

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

    group("GET compute", () => {
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

    group("GET employees", () => {
        const t = Date.now();
        const r = http.get(`${GW}/api/employees?limit=20`);
        employeesLatency.add(Date.now() - t);
        errorRate.add(!check(r, {
            "employees 200": (r) => r.status === 200,
        }));
    });
    sleep(0.2);

    group("POST employee", () => {
        const payload = JSON.stringify({
            firstName: `Load`,
            lastName: `Test${counter}`,
            email: `load.test${counter}-${id}@k6.io`,
            phone: "06 00 00 00 00",
            position: "Testeur K6",
            department: "Engineering",
            contractType: "CDD",
            salary: 35000,
            skills: ["k6", "load-testing"],
            address: { street: "", city: "Paris", country: "France" },
        });
        const r = http.post(`${GW}/api/employees`, payload, JSON_HEADERS);
        errorRate.add(!check(r, {
            "create emp 201": (r) => r.status === 201,
        }));
    });
    sleep(0.2);

    group("GET emp stats", () => {
        const r = http.get(`${GW}/api/employees/stats`);
        errorRate.add(!check(r, { "emp stats 200": (r) => r.status === 200 }));
    });
    sleep(0.2);

    group("GET leaves", () => {
        const t = Date.now();
        const r = http.get(`${GW}/api/leaves?limit=20`);
        leavesLatency.add(Date.now() - t);
        errorRate.add(!check(r, { "leaves 200": (r) => r.status === 200 }));
    });
    sleep(0.2);

    group("POST leave", () => {
        const payload = JSON.stringify({
            employeeId: `EMP-K6-${counter}`,
            employeeName: `K6 User ${counter}`,
            department: "Engineering",
            type: "RTT",
            startDate: "2026-07-01",
            endDate: "2026-07-02",
            days: 1,
            reason: "Load test k6",
        });
        const r = http.post(`${GW}/api/leaves`, payload, JSON_HEADERS);
        errorRate.add(!check(r, {
            "create leave 201": (r) => r.status === 201,
        }));
    });
    sleep(0.2);

    group("GET leave stats", () => {
        const r = http.get(`${GW}/api/leaves/stats`);
        errorRate.add(!check(r, { "leave stats 200": (r) => r.status === 200 }));
    });
    sleep(0.2);

    group("GET notifications", () => {
        const t = Date.now();
        const r = http.get(`${GW}/api/notify?limit=20`);
        notifyLatency.add(Date.now() - t);
        errorRate.add(!check(r, { "notify 200": (r) => r.status === 200 }));
    });
    sleep(0.2);

    group("POST notification", () => {
        const payload = JSON.stringify({
            title: `Alerte charge #${counter}`,
            message: `Notification de test k6 - itération ${counter}`,
            type: "warning",
            category: "systeme",
            priority: "medium",
            employeeId: "all",
            employeeName: "Tous",
        });
        const r = http.post(`${GW}/api/notify`, payload, JSON_HEADERS);
        errorRate.add(!check(r, {
            "create notif 201": (r) => r.status === 201,
        }));
    });
    sleep(0.2);

    group("POST payroll", () => {
        const t = Date.now();
        const payload = JSON.stringify({
            name: `Employee K6 ${counter}`,
            salary: 45000 + Math.floor(Math.random() * 30000),
            department: ["Engineering", "HR", "Finance", "Marketing", "Sales"][counter % 5],
            contractType: "CDI",
            seniority: Math.floor(Math.random() * 10),
        });
        const r = http.post(`${GW}/api/payroll/calculate`, payload, JSON_HEADERS);
        payrollLatency.add(Date.now() - t);
        errorRate.add(!check(r, {
            "payroll 200": (r) => r.status === 200,
            "has netTotal": (r) => {
                try { return JSON.parse(r.body).netTotal > 0; } catch { return false; }
            },
        }));
    });
    sleep(0.2);

    if (counter % 5 === 0) {
        group("POST payroll batch", () => {
            const emps = [];
            for (let i = 0; i < 10; i++) {
                emps.push({
                    name: `Batch Employee ${i}`,
                    salary: 40000 + i * 5000,
                    department: "Engineering",
                    contractType: "CDI",
                });
            }
            const r = http.post(`${GW}/api/payroll/batch`, JSON.stringify({ employees: emps }), JSON_HEADERS);
            errorRate.add(!check(r, {
                "batch 200": (r) => r.status === 200,
            }));
        });
        sleep(0.3);
    }
}