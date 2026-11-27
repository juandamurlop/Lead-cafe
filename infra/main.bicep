targetScope = 'subscription'

@description('Project slug used for naming Azure resources.')
param projectName string = 'loteclaro'

@description('Deployment environment (e.g. dev, prod).')
param environment string = 'dev'

@description('Azure region for the resource group and all resources.')
param location string = 'canadacentral'

@description('PostgreSQL administrator username.')
param pgAdminUser string = 'loteadmin'

@description('PostgreSQL Flexible Server SKU name.')
param pgSkuName string = 'Standard_D2ds_v4'

@description('PostgreSQL Flexible Server SKU tier.')
param pgSkuTier string = 'GeneralPurpose'

@secure()
@description('PostgreSQL administrator password.')
param pgAdminPassword string

@description('WhatsApp Cloud API webhook verify token.')
@secure()
param whatsappVerifyToken string = ''

@description('Meta App Secret used to validate X-Hub-Signature-256.')
@secure()
param metaAppSecret string = ''

@description('WhatsApp Cloud API permanent/system user access token.')
@secure()
param whatsappAccessToken string = ''

@description('WhatsApp Business Phone Number ID.')
param whatsappPhoneNumberId string = ''

@description('Microsoft Foundry audio transcription model name.')
param foundryModel string = 'gpt-4o-transcribe'

@description('Microsoft Foundry audio model version.')
param foundryModelVersion string = '2025-03-20'

@description('Microsoft Foundry model deployment SKU.')
param foundryModelSku string = 'GlobalStandard'

var rgName = 'rg-${projectName}-${environment}'

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: rgName
  location: location
  tags: {
    project: projectName
    environment: environment
  }
}

module core 'resources.bicep' = {
  name: '${projectName}-${environment}-core'
  scope: rg
  params: {
    projectName: projectName
    environment: environment
    location: location
    pgAdminUser: pgAdminUser
    pgAdminPassword: pgAdminPassword
    pgSkuName: pgSkuName
    pgSkuTier: pgSkuTier
    whatsappVerifyToken: whatsappVerifyToken
    metaAppSecret: metaAppSecret
    whatsappAccessToken: whatsappAccessToken
    whatsappPhoneNumberId: whatsappPhoneNumberId
    foundryModel: foundryModel
    foundryModelVersion: foundryModelVersion
    foundryModelSku: foundryModelSku
  }
}

output resourceGroupName string = rg.name
output functionAppName string = core.outputs.functionAppName
output functionAppHostName string = core.outputs.functionAppHostName
output postgresHost string = core.outputs.postgresHost
output storageAccountName string = core.outputs.storageAccountName
output foundryEndpoint string = core.outputs.foundryEndpoint
output dashboardUrl string = core.outputs.dashboardUrl
