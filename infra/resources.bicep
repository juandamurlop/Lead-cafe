targetScope = 'resourceGroup'

@description('Project slug used for naming Azure resources.')
param projectName string

@description('Deployment environment.')
param environment string

@description('Azure region.')
param location string

@description('PostgreSQL administrator username.')
param pgAdminUser string

@description('PostgreSQL Flexible Server SKU name.')
param pgSkuName string = 'Standard_B2s'

@description('PostgreSQL Flexible Server SKU tier.')
param pgSkuTier string = 'Burstable'

@secure()
@description('PostgreSQL administrator password.')
param pgAdminPassword string

@secure()
param whatsappVerifyToken string = ''

@secure()
param metaAppSecret string = ''

@secure()
param whatsappAccessToken string = ''

param whatsappPhoneNumberId string = ''
param foundryModel string = 'gpt-4o-transcribe'
param foundryModelVersion string = '2025-03-20'
param foundryModelSku string = 'GlobalStandard'

var uniqueSuffix = uniqueString(resourceGroup().id)
var storageName = toLower('st${take(projectName, 8)}${take(uniqueSuffix, 10)}')
var pgServerName = '${projectName}-${environment}-pg-${take(uniqueSuffix, 6)}'
var pgDatabaseName = 'lote_claro'
var foundryName = '${projectName}-${environment}-ai-${take(uniqueSuffix, 6)}'
var logAnalyticsName = '${projectName}-${environment}-law'
var appInsightsName = '${projectName}-${environment}-ai'
var planName = '${projectName}-${environment}-plan'
var functionAppName = '${projectName}-${environment}-func-${take(uniqueSuffix, 6)}'
var queueName = 'whatsapp-inbound'
var evidenceContainerName = 'compliance-evidence'
var deploymentContainerName = 'app-package'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
  }
}

resource queueService 'Microsoft.Storage/storageAccounts/queueServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource inboundQueue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-05-01' = {
  parent: queueService
  name: queueName
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource evidenceContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: evidenceContainerName
  properties: {
    publicAccess: 'None'
  }
}

resource deploymentContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: deploymentContainerName
  properties: {
    publicAccess: 'None'
  }
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

resource pgServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: pgServerName
  location: location
  sku: {
    name: pgSkuName
    tier: pgSkuTier
  }
  properties: {
    version: '16'
    administratorLogin: pgAdminUser
    administratorLoginPassword: pgAdminPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
  }
}

resource pgPostgisExtension 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2023-12-01-preview' = {
  parent: pgServer
  name: 'azure.extensions'
  properties: {
    value: 'POSTGIS'
    source: 'user-override'
  }
}

resource pgAllowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-12-01-preview' = {
  parent: pgServer
  name: 'AllowAllAzureServicesAndResourcesWithinAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource pgDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  parent: pgServer
  name: pgDatabaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource foundryAccount 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: foundryName
  location: location
  kind: 'AIServices'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: foundryName
    publicNetworkAccess: 'Enabled'
  }
}

resource foundryDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: foundryAccount
  name: foundryModel
  sku: {
    name: foundryModelSku
    capacity: 10
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: foundryModel
      version: foundryModelVersion
    }
  }
}

resource hostingPlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  kind: 'functionapp'
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
  properties: {
    reserved: true
  }
}

var storageConnectionString = 'DefaultEndpointsProtocol=https;AccountName=${storage.name};EndpointSuffix=${az.environment().suffixes.storage};AccountKey=${storage.listKeys().keys[0].value}'
var databaseUrl = 'postgresql://${pgAdminUser}:${uriComponent(pgAdminPassword)}@${pgServer.properties.fullyQualifiedDomainName}:5432/${pgDatabaseName}?sslmode=require'

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  properties: {
    serverFarmId: hostingPlan.id
    httpsOnly: true
    siteConfig: {
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: storageConnectionString
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'WHATSAPP_QUEUE_NAME'
          value: queueName
        }
        {
          name: 'EVIDENCE_CONTAINER_NAME'
          value: evidenceContainerName
        }
        {
          name: 'DATABASE_URL'
          value: databaseUrl
        }
        {
          name: 'WHATSAPP_VERIFY_TOKEN'
          value: whatsappVerifyToken
        }
        {
          name: 'META_APP_SECRET'
          value: metaAppSecret
        }
        {
          name: 'WHATSAPP_ACCESS_TOKEN'
          value: whatsappAccessToken
        }
        {
          name: 'WHATSAPP_PHONE_NUMBER_ID'
          value: whatsappPhoneNumberId
        }
        {
          name: 'FOUNDRY_ENDPOINT'
          value: foundryAccount.properties.endpoint
        }
        {
          name: 'FOUNDRY_API_KEY'
          value: foundryAccount.listKeys().key1
        }
        {
          name: 'FOUNDRY_MODEL'
          value: foundryDeployment.name
        }
      ]
    }
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}${deploymentContainerName}'
          authentication: {
            type: 'StorageAccountConnectionString'
            storageAccountConnectionStringName: 'AzureWebJobsStorage'
          }
        }
      }
      scaleAndConcurrency: {
        maximumInstanceCount: 40
        instanceMemoryMB: 2048
      }
      runtime: {
        name: 'python'
        version: '3.11'
      }
    }
  }
  dependsOn: [
    pgDatabase
    pgPostgisExtension
    inboundQueue
    evidenceContainer
    deploymentContainer
  ]
}

output functionAppName string = functionApp.name
output functionAppHostName string = functionApp.properties.defaultHostName
output postgresHost string = pgServer.properties.fullyQualifiedDomainName
output storageAccountName string = storage.name
output foundryEndpoint string = foundryAccount.properties.endpoint
