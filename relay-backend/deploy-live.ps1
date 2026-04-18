param(
  [string]$Region = "ap-south-1",
  [string]$FunctionName = "nexora-secure-relay",
  [string]$RoleName = "nexora-secure-relay-lambda-role",
  [string]$DispatchTable = "nexora-relay-dispatch",
  [string]$NonceTable = "nexora-relay-nonces",
  [string]$ClientKeyId = "web-client-1"
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptRoot
$stateFile = Join-Path $scriptRoot ".relay-live.json"
$trustPolicyFile = Join-Path $scriptRoot ".trust-policy.json"
$inlinePolicyFile = Join-Path $scriptRoot ".inline-policy.json"
$envFile = Join-Path $scriptRoot ".lambda-env.json"
$zipFile = Join-Path $scriptRoot "lambda.zip"
$relayConfigFile = Join-Path $projectRoot "relay.config.js"
$cloudfrontStatePath = Join-Path $projectRoot ".cloudfront-state.json"

function New-HexSecret {
  param([int]$Bytes = 32)
  $buffer = New-Object byte[] $Bytes
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($buffer)
  $rng.Dispose()
  return ($buffer | ForEach-Object { $_.ToString("x2") }) -join ""
}

function New-Password {
  param([int]$Length = 18)
  $chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%^*"
  $result = New-Object System.Text.StringBuilder
  for ($i = 0; $i -lt $Length; $i += 1) {
    $index = Get-Random -Minimum 0 -Maximum $chars.Length
    [void]$result.Append($chars[$index])
  }
  return $result.ToString()
}

if (-not (Test-Path $cloudfrontStatePath)) {
  throw "Missing .cloudfront-state.json. Deploy frontend first."
}
$cloudfrontState = Get-Content $cloudfrontStatePath -Raw | ConvertFrom-Json
$cloudfrontOrigin = [string]$cloudfrontState.cloudFrontDomain
if (-not $cloudfrontOrigin) {
  throw "CloudFront domain missing in .cloudfront-state.json"
}
$cloudfrontOrigin = $cloudfrontOrigin.TrimEnd("/")

if (Test-Path $stateFile) {
  $relayState = Get-Content $stateFile -Raw | ConvertFrom-Json
} else {
  $relayUsers = @{
    "citizen-app" = @{ password = New-Password; role = "citizen_app" }
    "ngo-console" = @{ password = New-Password; role = "ngo_dispatcher" }
    "police-console" = @{ password = New-Password; role = "police_dispatcher" }
    "gov-console" = @{ password = New-Password; role = "gov_control" }
    "admin" = @{ password = New-Password; role = "admin" }
  }
  $relayState = [ordered]@{
    createdAt = (Get-Date).ToString("s")
    region = $Region
    functionName = $FunctionName
    roleName = $RoleName
    dispatchTable = $DispatchTable
    nonceTable = $NonceTable
    clientKeyId = $ClientKeyId
    clientSigningSecret = New-HexSecret -Bytes 32
    jwtSecret = New-HexSecret -Bytes 48
    relayUsers = $relayUsers
    functionUrl = ""
    cloudFrontOrigin = $cloudfrontOrigin
  }
}

$identity = aws sts get-caller-identity --output json | ConvertFrom-Json
$accountId = [string]$identity.Account

function Ensure-DynamoTable {
  param(
    [string]$TableName,
    [string]$KeyName
  )
  $exists = $false
  try {
    aws dynamodb describe-table --table-name $TableName --region $Region --output json | Out-Null
    $exists = $true
  } catch {
    $exists = $false
  }

  if (-not $exists) {
    aws dynamodb create-table `
      --table-name $TableName `
      --attribute-definitions AttributeName=$KeyName,AttributeType=S `
      --key-schema AttributeName=$KeyName,KeyType=HASH `
      --billing-mode PAY_PER_REQUEST `
      --region $Region `
      --output json | Out-Null
  }

  aws dynamodb wait table-exists --table-name $TableName --region $Region
}

Ensure-DynamoTable -TableName $DispatchTable -KeyName "incidentId"
Ensure-DynamoTable -TableName $NonceTable -KeyName "nonceKey"

aws dynamodb update-time-to-live `
  --table-name $NonceTable `
  --time-to-live-specification "Enabled=true,AttributeName=expiresAt" `
  --region $Region `
  --output json | Out-Null

$trustPolicy = @'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "lambda.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
'@
$trustPolicy | Set-Content -Path $trustPolicyFile -Encoding UTF8

$roleArn = ""
try {
  $roleData = aws iam get-role --role-name $RoleName --output json | ConvertFrom-Json
  $roleArn = [string]$roleData.Role.Arn
} catch {
  $createdRole = aws iam create-role --role-name $RoleName --assume-role-policy-document "file://$trustPolicyFile" --output json | ConvertFrom-Json
  $roleArn = [string]$createdRole.Role.Arn
}

aws iam attach-role-policy --role-name $RoleName --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" | Out-Null

$inlinePolicy = @{
  Version = "2012-10-17"
  Statement = @(
    @{
      Effect = "Allow"
      Action = @("dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query")
      Resource = @(
        "arn:aws:dynamodb:${Region}:${accountId}:table/$DispatchTable",
        "arn:aws:dynamodb:${Region}:${accountId}:table/$NonceTable"
      )
    }
  )
}
$inlinePolicy | ConvertTo-Json -Depth 8 | Set-Content -Path $inlinePolicyFile -Encoding UTF8
aws iam put-role-policy --role-name $RoleName --policy-name "nexora-secure-relay-inline" --policy-document "file://$inlinePolicyFile" | Out-Null

Start-Sleep -Seconds 8

if (Test-Path $zipFile) {
  Remove-Item $zipFile -Force
}
Compress-Archive -Path (Join-Path $scriptRoot "lambda.js") -DestinationPath $zipFile -CompressionLevel Optimal -Force

$relayUsersJson = $relayState.relayUsers | ConvertTo-Json -Compress -Depth 8
$environment = @{
  Variables = @{
    DISPATCH_TABLE = $DispatchTable
    NONCE_TABLE = $NonceTable
    JWT_SECRET = [string]$relayState.jwtSecret
    TOKEN_TTL = "8h"
    REQUIRE_SIGNED_REQUESTS = "true"
    SIGNATURE_WINDOW_SECONDS = "300"
    NONCE_TTL_SECONDS = "600"
    ALLOWED_ORIGINS = $cloudfrontOrigin
    SIGNING_KEYS = "${ClientKeyId}:$($relayState.clientSigningSecret)"
    SIGNING_CLIENT_ROLES = "${ClientKeyId}:citizen_app"
    RELAY_USERS_JSON = $relayUsersJson
    GOV_RELAY_URL = ""
    GOV_RELAY_KEY_ID = ""
    GOV_RELAY_SIGNING_SECRET = ""
    NGO_RELAY_URL = ""
    NGO_RELAY_KEY_ID = ""
    NGO_RELAY_SIGNING_SECRET = ""
    POLICE_RELAY_URL = ""
    POLICE_RELAY_KEY_ID = ""
    POLICE_RELAY_SIGNING_SECRET = ""
  }
}
$environment | ConvertTo-Json -Compress -Depth 8 | Set-Content -Path $envFile -Encoding UTF8

$functionExists = $true
try {
  aws lambda get-function --function-name $FunctionName --region $Region --output json | Out-Null
} catch {
  $functionExists = $false
}

if (-not $functionExists) {
  aws lambda create-function `
    --function-name $FunctionName `
    --runtime nodejs20.x `
    --handler lambda.handler `
    --zip-file "fileb://$zipFile" `
    --timeout 20 `
    --memory-size 256 `
    --role $roleArn `
    --environment "file://$envFile" `
    --region $Region `
    --output json | Out-Null
} else {
  aws lambda update-function-code `
    --function-name $FunctionName `
    --zip-file "fileb://$zipFile" `
    --region $Region `
    --output json | Out-Null
  aws lambda wait function-updated-v2 --function-name $FunctionName --region $Region
  aws lambda update-function-configuration `
    --function-name $FunctionName `
    --timeout 20 `
    --memory-size 256 `
    --environment "file://$envFile" `
    --region $Region `
    --output json | Out-Null
}

aws lambda wait function-active-v2 --function-name $FunctionName --region $Region

$corsSpec = "AllowCredentials=false,AllowHeaders=authorization,content-type,x-nexora-key-id,x-nexora-timestamp,x-nexora-nonce,x-nexora-body-sha256,x-nexora-signature,x-nexora-alg,AllowMethods=GET,POST,OPTIONS,AllowOrigins=$cloudfrontOrigin,MaxAge=600"

$functionUrl = ""
try {
  $urlData = aws lambda get-function-url-config --function-name $FunctionName --region $Region --output json | ConvertFrom-Json
  $functionUrl = [string]$urlData.FunctionUrl
  aws lambda update-function-url-config `
    --function-name $FunctionName `
    --auth-type NONE `
    --cors $corsSpec `
    --region $Region `
    --output json | Out-Null
} catch {
  $createdUrl = aws lambda create-function-url-config `
    --function-name $FunctionName `
    --auth-type NONE `
    --cors $corsSpec `
    --region $Region `
    --output json | ConvertFrom-Json
  $functionUrl = [string]$createdUrl.FunctionUrl
}

try {
  aws lambda add-permission `
    --function-name $FunctionName `
    --statement-id "FunctionURLAllowPublicAccess" `
    --action "lambda:InvokeFunctionUrl" `
    --principal "*" `
    --function-url-auth-type NONE `
    --region $Region `
    --output json | Out-Null
} catch {
  # Ignore if statement already exists.
}

if (-not $functionUrl) {
  $urlData = aws lambda get-function-url-config --function-name $FunctionName --region $Region --output json | ConvertFrom-Json
  $functionUrl = [string]$urlData.FunctionUrl
}
$functionUrl = $functionUrl.TrimEnd("/")
$relayEndpoint = "$functionUrl/v1/relay/events"

$relayConfig = @"
/*
  Runtime relay config for live secure relay endpoint.
*/
window.NEXORA_RELAY_ENDPOINT = "$relayEndpoint";
window.NEXORA_RELAY_SECURITY = {
  keyId: "$ClientKeyId",
  signingSecret: "$($relayState.clientSigningSecret)",
  algorithm: "HMAC-SHA256"
};
"@
$relayConfig | Set-Content -Path $relayConfigFile -Encoding UTF8

$relayState.functionUrl = $functionUrl
$relayState.relayEndpoint = $relayEndpoint
$relayState.cloudFrontOrigin = $cloudfrontOrigin
$relayState.updatedAt = (Get-Date).ToString("s")
$relayState | ConvertTo-Json -Depth 10 | Set-Content -Path $stateFile -Encoding UTF8

Write-Host "Relay backend live deployment complete."
Write-Host "Region: $Region"
Write-Host "Function: $FunctionName"
Write-Host "Function URL: $functionUrl"
Write-Host "Relay endpoint: $relayEndpoint"
Write-Host "Client key id: $ClientKeyId"
Write-Host "State file: $stateFile"
