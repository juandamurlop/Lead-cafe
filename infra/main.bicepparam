using 'main.bicep'

param projectName = 'loteclaro'
param environment = 'dev'
param location = 'canadacentral'
param pgAdminUser = 'loteadmin'
param pgAdminPassword = readEnvironmentVariable('PG_ADMIN_PASSWORD')
