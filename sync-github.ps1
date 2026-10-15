# Script tự động đồng bộ mã nguồn lên GitHub (Auto Push)
param(
    [string]$Message = "Auto update: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
)

$env:PATH = "C:\Users\9-hath.PHARMA\mingit\cmd;" + $env:PATH
$repoDir = "D:\thanh-toan-pka"
Set-Location $repoDir

$status = git status --porcelain
if ($status) {
    Write-Host "-> Phát hiện thay đổi trong dự án, đang chuẩn bị commit..." -ForegroundColor Cyan
    git add -A
    git commit -m $Message
    Write-Host "-> Đang đẩy (push) lên GitHub qua SSH..." -ForegroundColor Cyan
    git push origin main
    Write-Host "-> Đã đẩy lên GitHub thành công!" -ForegroundColor Green
} else {
    Write-Host "-> Không có thay đổi nào cần đẩy lên GitHub." -ForegroundColor Yellow
}
