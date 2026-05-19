@echo off
REM ============================================================
REM  Apache Benchmark — Tests GET + POST par service
REM  Gateway : http://34.156.96.146
REM ============================================================
REM  Installation : choco install apache-httpd
REM  ab.exe sera dans C:\tools\Apache24\bin\ab.exe
REM  (ou ajouter au PATH)
REM ============================================================

set GW=http://34.156.96.146

echo.
echo ============================================
echo  PREPARATION : creation des fichiers JSON
echo ============================================

REM -- Payload : créer un employé
echo {"firstName":"AB","lastName":"Test","email":"ab.test%RANDOM%@test.io","phone":"0600000000","position":"Testeur AB","department":"Engineering","contractType":"CDD","salary":35000,"skills":["ab","test"],"address":{"street":"","city":"Paris","country":"France"}} > payload-employee.json

REM -- Payload : créer un congé
echo {"employeeId":"EMP-AB-1","employeeName":"AB User","department":"Engineering","type":"RTT","startDate":"2026-07-01","endDate":"2026-07-02","days":1,"reason":"Test AB"} > payload-leave.json

REM -- Payload : créer une notification
echo {"title":"Alerte AB","message":"Notification de test Apache Benchmark","type":"warning","category":"systeme","priority":"medium","employeeId":"all","employeeName":"Tous"} > payload-notif.json

REM -- Payload : calcul de paie
echo {"name":"AB Employee","salary":55000,"department":"Engineering","contractType":"CDI","seniority":3} > payload-payroll.json

REM -- Payload : batch paie (10 employés)
echo {"employees":[{"name":"E1","salary":40000,"department":"Engineering","contractType":"CDI"},{"name":"E2","salary":45000,"department":"HR","contractType":"CDI"},{"name":"E3","salary":50000,"department":"Finance","contractType":"CDI"},{"name":"E4","salary":55000,"department":"Marketing","contractType":"CDI"},{"name":"E5","salary":60000,"department":"Sales","contractType":"CDI"},{"name":"E6","salary":42000,"department":"Engineering","contractType":"CDD"},{"name":"E7","salary":48000,"department":"HR","contractType":"CDI"},{"name":"E8","salary":52000,"department":"Finance","contractType":"CDI"},{"name":"E9","salary":38000,"department":"Engineering","contractType":"Alternance"},{"name":"E10","salary":35000,"department":"Marketing","contractType":"Stage"}]} > payload-batch.json

echo.
echo ============================================
echo  TEST 1/10 : GET service-compute (Fib 38)
echo  500 requetes, 20 simultanees
echo ============================================
ab -n 500 -c 20 "%GW%/api/compute?n=38"

echo.
echo ============================================
echo  TEST 2/10 : GET service-users (liste)
echo  1000 requetes, 30 simultanees
echo ============================================
ab -n 1000 -c 30 "%GW%/api/employees?limit=20"

echo.
echo ============================================
echo  TEST 3/10 : POST service-users (creation)
echo  300 requetes, 15 simultanees
echo ============================================
ab -n 300 -c 15 -p payload-employee.json -T "application/json" "%GW%/api/employees"

echo.
echo ============================================
echo  TEST 4/10 : GET service-users stats
echo  500 requetes, 20 simultanees
echo ============================================
ab -n 500 -c 20 "%GW%/api/employees/stats"

echo.
echo ============================================
echo  TEST 5/10 : GET service-tasks (conges)
echo  1000 requetes, 30 simultanees
echo ============================================
ab -n 1000 -c 30 "%GW%/api/leaves?limit=20"

echo.
echo ============================================
echo  TEST 6/10 : POST service-tasks (creation conge)
echo  300 requetes, 15 simultanees
echo ============================================
ab -n 300 -c 15 -p payload-leave.json -T "application/json" "%GW%/api/leaves"

echo.
echo ============================================
echo  TEST 7/10 : GET service-notify
echo  1000 requetes, 30 simultanees
echo ============================================
ab -n 1000 -c 30 "%GW%/api/notify?limit=20"

echo.
echo ============================================
echo  TEST 8/10 : POST service-notify (creation)
echo  300 requetes, 15 simultanees
echo ============================================
ab -n 300 -c 15 -p payload-notif.json -T "application/json" "%GW%/api/notify"

echo.
echo ============================================
echo  TEST 9/10 : POST payroll/calculate (paie)
echo  500 requetes, 20 simultanees
echo ============================================
ab -n 500 -c 20 -p payload-payroll.json -T "application/json" "%GW%/api/payroll/calculate"

echo.
echo ============================================
echo  TEST 10/10 : POST payroll/batch (lourd)
echo  200 requetes, 10 simultanees
echo ============================================
ab -n 200 -c 10 -p payload-batch.json -T "application/json" "%GW%/api/payroll/batch"

echo.
echo ============================================
echo  NETTOYAGE des fichiers temporaires
echo ============================================
del payload-employee.json payload-leave.json payload-notif.json payload-payroll.json payload-batch.json 2>nul

echo.
echo ============================================
echo  TERMINE ! Verifier les HPA :
echo    kubectl get hpa -w
echo    kubectl get pods -w
echo ============================================
pause