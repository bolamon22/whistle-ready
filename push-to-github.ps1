# Gameday Staff App - GitHub Setup Script
# Double-click or right-click > Run with PowerShell

Set-Location $PSScriptRoot

Write-Host "=== Gameday Staff App - GitHub Push ===" -ForegroundColor Cyan
Write-Host ""

# Check git is installed
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Git is not installed. Please install from https://git-scm.com" -ForegroundColor Red
    pause
    exit 1
}

# Configure git if needed
$gitName = git config --global user.name 2>$null
$gitEmail = git config --global user.email 2>$null

if (-not $gitName) {
    $gitName = Read-Host "Enter your name for git commits"
    git config --global user.name $gitName
}
if (-not $gitEmail) {
    $gitEmail = Read-Host "Enter your email for git commits"
    git config --global user.email $gitEmail
}

Write-Host "Git user: $gitName <$gitEmail>" -ForegroundColor Green

# Stage and commit
Write-Host ""
Write-Host "Staging files..." -ForegroundColor Yellow
git add -A

$status = git status --short
if ($status) {
    Write-Host "Committing initial version..." -ForegroundColor Yellow
    git commit -m "Initial commit"
    Write-Host "Committed!" -ForegroundColor Green
} else {
    Write-Host "Nothing new to commit." -ForegroundColor Gray
}

# GitHub repo URL
Write-Host ""
Write-Host "=== Connect to GitHub ===" -ForegroundColor Cyan
Write-Host "1. Go to https://github.com/new" -ForegroundColor White
Write-Host "2. Create a new PRIVATE repository named: gameday-staff" -ForegroundColor White
Write-Host "3. Do NOT initialize with README, .gitignore, or license" -ForegroundColor White
Write-Host "4. Copy the repository URL (e.g. https://github.com/YOUR_USERNAME/gameday-staff.git)" -ForegroundColor White
Write-Host ""
$repoUrl = Read-Host "Paste your GitHub repository URL here"

if (-not $repoUrl) {
    Write-Host "No URL entered. Exiting." -ForegroundColor Red
    pause
    exit 1
}

# Set branch to main and push
git branch -M main
git remote remove origin 2>$null
git remote add origin $repoUrl

Write-Host ""
Write-Host "Pushing to GitHub..." -ForegroundColor Yellow
git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "SUCCESS! Your app is now on GitHub at:" -ForegroundColor Green
    Write-Host $repoUrl -ForegroundColor Cyan
    Write-Host ""
    Write-Host "=== Next Step: Deploy to Vercel ===" -ForegroundColor Cyan
    Write-Host "1. Go to https://vercel.com and sign in (use 'Continue with GitHub')" -ForegroundColor White
    Write-Host "2. Click 'Add New Project'" -ForegroundColor White
    Write-Host "3. Import your 'gameday-staff' repository" -ForegroundColor White
    Write-Host "4. Vercel will auto-detect Next.js - just click Deploy!" -ForegroundColor White
    Write-Host ""
    Write-Host "IMPORTANT: Your app uses a SQLite database (.db file) which won't" -ForegroundColor Yellow
    Write-Host "work on Vercel. You'll need to switch to a hosted database like" -ForegroundColor Yellow
    Write-Host "Vercel Postgres or PlanetScale. Let Claude know if you need help with this." -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "Push failed. If asked to authenticate, use your GitHub username" -ForegroundColor Red
    Write-Host "and a Personal Access Token (not your password)." -ForegroundColor Red
    Write-Host "Get a token at: https://github.com/settings/tokens" -ForegroundColor Yellow
}

Write-Host ""
pause
