targetScope = 'subscription'

@description('Project slug used for naming Azure resources.')
param projectName string = 'loteclaro'

@description('Deployment environment (e.g. dev, prod).')
param environment string = 'dev'

@description('Azure region for the resource group and all resources.')
param location string = 'eastus2'

@description('PostgreSQL administrator username.')
param pgAdminUser string = 'loteadmin'

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

@description('Microsoft Foundry endpoint URL.')
param foundryEndpoint string = ''

@secure()
@description('Microsoft Foundry API key.')
param foundryApiKey string = ''

@description('Microsoft Foundry audio/chat deployment name.')
param foundryModel string = 'gpt-4o-transcribe'

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
    whatsappVerifyToken: whatsappVerifyToken
    metaAppSecret: metaAppSecret
    whatsappAccessToken: whatsappAccessToken
    whatsappPhoneNumberId: whatsappPhoneNumberId
    foundryEndpoint: foundryEndpoint
    foundryApiKey: foundryApiKey
    foundryModel: foundryModel
  }
}

output resourceGroupName string = rg.name
output functionAppName string = core.outputs.functionAppName
output functionAppHostName string = core.outputs.functionAppHostName
output postgresHost string = core.outputs.postgresHost
output storageAccountName string = core.outputs.storageAccountName
