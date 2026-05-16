# ============================================
# SCRIPT DE DEMO — MERN Microservices sur GKE
# ============================================

$GATEWAY = "http://34.156.96.146"
$REGISTRY = "europe-west1-docker.pkg.dev/mern-grid-cluster/mern-repo"

function Print-Title($text) {
    Write-Host "`n========================================" -ForegroundColor Magenta
    Write-Host "  $text" -ForegroundColor Magenta
    Write-Host "========================================`n" -ForegroundColor Magenta
}

function Wait-Enter($msg) {
    Write-Host "`n>>> $msg" -ForegroundColor Yellow
    Read-Host "Appuie sur ENTREE pour continuer"
}

# ----------------------------------------
Print-Title "ETAPE 1 — Etat du cluster"
# ----------------------------------------
kubectl get nodes
kubectl get pods
Wait-Enter "Montrer les 6 pods Running"

# ----------------------------------------
Print-Title "ETAPE 2 — Health checks des services"
# ----------------------------------------
Write-Host "Gateway :" -ForegroundColor Cyan
curl "$GATEWAY/health"

Write-Host "`nCompute :" -ForegroundColor Cyan
curl "$GATEWAY/api/compute"

Wait-Enter "Tous les services repondent via le gateway"

# ----------------------------------------
Print-Title "ETAPE 3 — HPA au repos"
# ----------------------------------------
kubectl get hpa
kubectl top pods
Wait-Enter "CPU a 0% — 1 seul replica service-compute"

# ----------------------------------------
Print-Title "ETAPE 4 — BENCHMARK CPU (autoscaling)"
# ----------------------------------------
Write-Host "Lancement de 80 jobs paralleles..." -ForegroundColor Red

$jobs = @()
1..80 | ForEach-Object {
    $jobs += Start-Job -ScriptBlock {
        param($url)
        for ($i = 0; $i -lt 5; $i++) {
            Invoke-WebRequest -Uri "$url/api/compute?n=40" -UseBasicParsing | Out-Null
        }
    } -ArgumentList $GATEWAY
}

Write-Host "Jobs lances ! Surveillance du scaling..." -ForegroundColor Green
Start-Sleep 15
kubectl get hpa
kubectl get pods | Select-String "compute"

Start-Sleep 20
Write-Host "`n--- 35 secondes apres ---" -ForegroundColor Cyan
kubectl get hpa
kubectl get pods | Select-String "compute"
kubectl top pods | Select-String "compute"

# Attendre max 60 secondes puis tuer les jobs
$jobs | Wait-Job -Timeout 60 | Out-Null
Get-Job | Stop-Job
Get-Job | Remove-Job
Wait-Enter "HPA a scale de 1 a 5 pods automatiquement"

# ----------------------------------------
Print-Title "ETAPE 5 — SELF-HEALING"
# ----------------------------------------
$podName = (kubectl get pods --no-headers | Select-String "compute" | Select-Object -First 1).ToString().Split()[0]
Write-Host "Pod cible : $podName" -ForegroundColor Red
Write-Host "Suppression du pod..." -ForegroundColor Red

kubectl delete pod $podName

Write-Host "`nSurveillance de la reconstruction..." -ForegroundColor Cyan
kubectl get pods -w &
Start-Sleep 15
Wait-Enter "Pod reconstruit automatiquement en < 30 secondes"

# ----------------------------------------
Print-Title "ETAPE 6 — SCALE DOWN automatique"
# ----------------------------------------
Write-Host "Attente du scale down (2-3 min apres la charge)..." -ForegroundColor Cyan
Start-Sleep 30
kubectl get hpa
kubectl get pods | Select-String "compute"
Wait-Enter "HPA a reduit les replicas automatiquement"

# ----------------------------------------
Print-Title "FIN DE DEMO"
# ----------------------------------------
Write-Host "Architecture demontree :" -ForegroundColor Green
Write-Host "  OK  MERN Microservices sur GKE" -ForegroundColor Green
Write-Host "  OK  HPA Autoscaling (1 -> 5 pods)" -ForegroundColor Green
Write-Host "  OK  Self-healing Kubernetes" -ForegroundColor Green
Write-Host "  OK  Scale down automatique" -ForegroundColor Green
Write-Host "  OK  Frontend Next.js sur GKE" -ForegroundColor Green