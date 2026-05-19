
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const errorRate = new Rate("errors");
const usersLatency = new Trend("users_svc_latency", true);
const tasksLatency = new Trend("tasks_svc_latency", true);
const notifyLatency = new Trend("notify_svc_latency", true);
const computeLatency = new Trend("compute_svc_latency", true);

const GW = __ENV.GATEWAY_URL || "http://34.156.96.146";
const H = { headers: { "Content-Type": "application/json" } };

export const options = {
    scenarios: {

        hammer_users: {
            executor: "ramping-vus",
            exec: "smashUsers",
            startVUs: 0,
            stages: [
                { duration: "20s", target: 15 },
                { duration: "1m", target: 40 },
                { duration: "2m", target: 40 },
                { duration: "30s", target: 0 },
            ],
        },

        hammer_tasks: {
            executor: "ramping-vus",
            exec: "smashTasks",
            startVUs: 0,
            stages: [
                { duration: "20s", target: 15 },
                { duration: "1m", target: 40 },
                { duration: "2m", target: 40 },
                { duration: "30s", target: 0 },
            ],
        },

        hammer_notify: {
            executor: "ramping-vus",
            exec: "smashNotify",
            startVUs: 0,
            stages: [
                { duration: "20s", target: 15 },
                { duration: "1m", target: 40 },
                { duration: "2m", target: 40 },
                { duration: "30s", target: 0 },
            ],
        },

        hammer_compute: {
            executor: "ramping-vus",
            exec: "smashCompute",
            startVUs: 0,
            stages: [
                { duration: "20s", target: 10 },
                { duration: "1m", target: 30 },
                { duration: "2m", target: 30 },
                { duration: "30s", target: 0 },
            ],
        },
    },

    thresholds: {
        errors: ["rate<0.3"],
    },
};


export function smashUsers() {
    const id = `${__VU}-${__ITER}`;

    const emp = JSON.stringify({
        firstName: `Stress${__VU}`,
        lastName: `Test${__ITER}${Date.now()}`,
        email: `stress${__VU}-${__ITER}-${Date.now()}@k6.io`,
        phone: "06 00 00 00 00",
        position: "Ingénieur de test",
        department: ["Engineering", "HR", "Finance", "Marketing", "Sales", "Operations", "Legal"][__ITER % 7],
        contractType: ["CDI", "CDD", "Stage", "Alternance"][__ITER % 4],
        salary: 30000 + Math.floor(Math.random() * 50000),
        skills: ["k6", "stress", "testing", "performance", "scaling"],
        address: { street: "123 Rue du Test", city: "Paris", country: "France" },
    });
    let t = Date.now();
    let r = http.post(`${GW}/api/employees`, emp, H);
    usersLatency.add(Date.now() - t);
    errorRate.add(!check(r, { "create emp": (r) => r.status === 201 }));

    const emp2 = JSON.stringify({
        firstName: `Load${__VU}`,
        lastName: `Bot${__ITER}${Date.now()}`,
        email: `load${__VU}-${__ITER}-${Date.now()}@k6.io`,
        phone: "07 00 00 00 00",
        position: "Testeur HPA",
        department: ["Engineering", "HR", "Finance", "Marketing", "Sales"][__ITER % 5],
        contractType: "CDI",
        salary: 35000 + Math.floor(Math.random() * 40000),
        skills: ["node", "mongo", "docker", "kubernetes"],
        address: { street: "", city: "Lyon", country: "France" },
    });
    r = http.post(`${GW}/api/employees`, emp2, H);
    errorRate.add(!check(r, { "create emp2": (r) => r.status === 201 }));

    const searches = ["Stress", "Load", "Bot", "Sophie", "Engineer"];
    const q = searches[__ITER % searches.length];
    t = Date.now();
    r = http.get(`${GW}/api/employees?search=${q}&limit=50`);
    usersLatency.add(Date.now() - t);
    errorRate.add(!check(r, { "search emp": (r) => r.status === 200 }));

    t = Date.now();
    r = http.get(`${GW}/api/employees/stats`);
    usersLatency.add(Date.now() - t);
    errorRate.add(!check(r, { "emp stats": (r) => r.status === 200 }));

    r = http.get(`${GW}/api/employees?limit=50`);
    errorRate.add(!check(r, { "list emp": (r) => r.status === 200 }));

    r = http.get(`${GW}/api/employees?department=Engineering&limit=50`);
    errorRate.add(!check(r, { "dept filter": (r) => r.status === 200 }));

    r = http.get(`${GW}/api/employees/stats`);
    errorRate.add(!check(r, { "emp stats2": (r) => r.status === 200 }));

}


export function smashTasks() {
    const types = ["Congé Payé", "RTT", "Maladie", "Maternité", "Paternité", "Sans Solde", "Exceptionnel"];

    const leave = JSON.stringify({
        employeeId: `EMP-STRESS-${__VU}`,
        employeeName: `Stress User ${__VU}`,
        department: ["Engineering", "HR", "Finance", "Marketing", "Sales"][__ITER % 5],
        type: types[__ITER % 7],
        startDate: "2026-08-01",
        endDate: "2026-08-15",
        days: 1 + (__ITER % 10),
        reason: `Test de charge k6 iteration ${__ITER} VU ${__VU}`,
    });
    let t = Date.now();
    let r = http.post(`${GW}/api/leaves`, leave, H);
    tasksLatency.add(Date.now() - t);
    const created = check(r, { "create leave": (r) => r.status === 201 });
    errorRate.add(!created);

    if (created && r.body) {
        try {
            const id = JSON.parse(r.body)._id;
            if (id) {
                r = http.patch(`${GW}/api/leaves/${id}/status`,
                    JSON.stringify({ status: "approved", approvedBy: "k6-bot" }), H);
                errorRate.add(!check(r, { "approve leave": (r) => r.status === 200 }));
            }
        } catch (e) { }
    }

    const leave2 = JSON.stringify({
        employeeId: `EMP-LOAD-${__VU}`,
        employeeName: `Load Bot ${__VU}`,
        department: "Engineering",
        type: types[(__ITER + 3) % 7],
        startDate: "2026-09-01",
        endDate: "2026-09-05",
        days: 3 + (__ITER % 5),
        reason: `Rafale k6 ${Date.now()}`,
    });
    r = http.post(`${GW}/api/leaves`, leave2, H);
    errorRate.add(!check(r, { "create leave2": (r) => r.status === 201 }));

    t = Date.now();
    r = http.get(`${GW}/api/leaves/stats`);
    tasksLatency.add(Date.now() - t);
    errorRate.add(!check(r, { "leave stats": (r) => r.status === 200 }));

    r = http.get(`${GW}/api/leaves?status=pending&limit=50`);
    errorRate.add(!check(r, { "list pending": (r) => r.status === 200 }));

    r = http.get(`${GW}/api/leaves?type=${encodeURIComponent(types[__ITER % 7])}&limit=50`);
    errorRate.add(!check(r, { "list by type": (r) => r.status === 200 }));

    r = http.get(`${GW}/api/leaves/stats`);
    errorRate.add(!check(r, { "leave stats2": (r) => r.status === 200 }));
}


export function smashNotify() {
    const cats = ["conge", "paie", "rh", "systeme", "anniversaire", "contrat"];
    const types = ["info", "success", "warning", "error"];
    const prios = ["low", "medium", "high", "urgent"];

    const notif = JSON.stringify({
        title: `Alerte stress ${__VU}-${__ITER}-${Date.now()}`,
        message: `Notification de charge. VU=${__VU}, iter=${__ITER}. ${Date.now()}. Lorem ipsum dolor sit amet consectetur.`,
        type: types[__ITER % 4],
        category: cats[__ITER % 6],
        priority: prios[__ITER % 4],
        employeeId: `EMP-${String((__VU % 10) + 1).padStart(4, "0")}`,
        employeeName: `User ${__VU}`,
    });
    let t = Date.now();
    let r = http.post(`${GW}/api/notify`, notif, H);
    notifyLatency.add(Date.now() - t);
    const created = check(r, { "create notif": (r) => r.status === 201 });
    errorRate.add(!created);

    if (created && r.body) {
        try {
            const id = JSON.parse(r.body)._id;
            if (id) {
                r = http.patch(`${GW}/api/notify/${id}/read`, "{}", H);
                errorRate.add(!check(r, { "mark read": (r) => r.status === 200 }));
            }
        } catch (e) { }
    }

    const notif2 = JSON.stringify({
        title: `Rafale ${Date.now()}`,
        message: `Burst notification VU ${__VU} iter ${__ITER}. Ceci est un message de test assez long pour forcer la sérialisation JSON.`,
        type: types[(__ITER + 2) % 4],
        category: cats[(__ITER + 3) % 6],
        priority: prios[(__ITER + 1) % 4],
        employeeId: "all",
        employeeName: "Tous",
    });
    r = http.post(`${GW}/api/notify`, notif2, H);
    errorRate.add(!check(r, { "create notif2": (r) => r.status === 201 }));

    const notif3 = JSON.stringify({
        title: `Batch ${__VU}-${__ITER}`,
        message: `Third notification in burst. Timestamp: ${Date.now()}. Extra payload for serialization pressure.`,
        type: "info",
        category: "systeme",
        priority: "medium",
        employeeId: "all",
        employeeName: "Tous",
    });
    r = http.post(`${GW}/api/notify`, notif3, H);
    errorRate.add(!check(r, { "create notif3": (r) => r.status === 201 }));

    t = Date.now();
    r = http.get(`${GW}/api/notify/stats`);
    notifyLatency.add(Date.now() - t);
    errorRate.add(!check(r, { "notify stats": (r) => r.status === 200 }));

    r = http.get(`${GW}/api/notify?category=${cats[__ITER % 6]}&limit=50`);
    errorRate.add(!check(r, { "list by cat": (r) => r.status === 200 }));

    r = http.get(`${GW}/api/notify?read=false&limit=50`);
    errorRate.add(!check(r, { "list unread": (r) => r.status === 200 }));

    r = http.get(`${GW}/api/notify/stats`);
    errorRate.add(!check(r, { "notify stats2": (r) => r.status === 200 }));

    if (__ITER % 10 === 0) {
        r = http.patch(`${GW}/api/notify/read-all`, "{}", H);
        errorRate.add(!check(r, { "mark all read": (r) => r.status === 200 }));
    }
}


export function smashCompute() {
    let t = Date.now();
    let r = http.get(`${GW}/api/compute?n=38`);
    computeLatency.add(Date.now() - t);
    errorRate.add(!check(r, { "fib38": (r) => r.status === 200 }));

    const pay = JSON.stringify({
        name: `Compute VU ${__VU}`,
        salary: 40000 + Math.floor(Math.random() * 40000),
        department: ["Engineering", "HR", "Finance", "Sales"][__ITER % 4],
        contractType: "CDI",
        seniority: __ITER % 15,
    });
    t = Date.now();
    r = http.post(`${GW}/api/payroll/calculate`, pay, H);
    computeLatency.add(Date.now() - t);
    errorRate.add(!check(r, { "payroll": (r) => r.status === 200 }));

    if (__ITER % 3 === 0) {
        const emps = [];
        for (let i = 0; i < 10; i++) {
            emps.push({
                name: `Batch ${i}`,
                salary: 35000 + i * 5000,
                department: "Engineering",
                contractType: "CDI",
            });
        }
        r = http.post(`${GW}/api/payroll/batch`, JSON.stringify({ employees: emps }), H);
        errorRate.add(!check(r, { "batch": (r) => r.status === 200 }));
    }

    const statsEmps = [];
    for (let i = 0; i < 8; i++) {
        statsEmps.push({
            name: `Stats ${i}`,
            salary: 30000 + i * 7000,
            department: ["Engineering", "HR", "Finance", "Marketing"][i % 4],
            contractType: "CDI",
        });
    }
    r = http.post(`${GW}/api/payroll/stats`, JSON.stringify({ employees: statsEmps }), H);
    errorRate.add(!check(r, { "payroll stats": (r) => r.status === 200 }));
}