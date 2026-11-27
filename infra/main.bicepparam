using 'main.bicep'

param projectName = 'loteclaro'
param environment = 'dev'
param location = 'eastus2'
param pgAdminUser = 'loteadmin'
// Pass secrets via CLI flags or environment variables during `az deployment sub create`,
// e.g. --parameters pgAdminPassword='...' whatsappVerifyToken='...'
