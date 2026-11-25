# Windows PowerShell 5.1: TEST-only, read-only WSDL and bounded GetTaxPayer lookup.
# No portal credentials. Enter only the provider-issued TEST VKN at prompt.
param([switch]$WsdlOnly)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$services = @{
  InvoiceService = 'https://einvoiceservicetest.isnet.net.tr/InvoiceService/ServiceContract/InvoiceService.svc'
  AddressBookService = 'https://einvoiceservicetest.isnet.net.tr/AddressBookService/ServiceContract/AddressBookService.svc'
}
foreach($name in @('InvoiceService','AddressBookService')){
  try {
    $url = $services[$name] + '?singleWsdl'
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30 -MaximumRedirection 0
    [xml]$wsdl = $response.Content
    if($wsdl.DocumentElement.LocalName -ne 'definitions' -or $wsdl.DocumentElement.NamespaceURI -ne 'http://schemas.xmlsoap.org/wsdl/'){throw 'Response is not WSDL 1.1 XML'}
    $ops = @($wsdl.SelectNodes("//*[local-name()='portType']/*[local-name()='operation']") | ForEach-Object {$_.GetAttribute('name')} | Sort-Object -Unique)
    if(!$ops.Count){throw 'No operations in WSDL'}
    Write-Output ([pscustomobject]@{service=$name;stage='WSDL';ok=$true;operations=$ops} | ConvertTo-Json -Depth 4 -Compress)
  } catch {
    Write-Output ([pscustomobject]@{service=$name;stage='WSDL';ok=$false;errorType=$_.Exception.GetType().Name} | ConvertTo-Json -Compress)
    if($name -eq 'AddressBookService'){return}
  }
}
if($WsdlOnly){return}
$vkn = Read-Host 'IsNet tarafindan verilen TEST firma VKN (canli VKN girmeyin)'
if($vkn -notmatch '^\d{10}$'){throw 'TEST VKN must be ten digits'}
try {
  $proxy = New-WebServiceProxy -Uri ($services.AddressBookService+'?wsdl') -Namespace KYIsnetTest -Class KYAddressBookTest
  if(([uri]$proxy.Url).Scheme -ne 'https' -or ([uri]$proxy.Url).Host -ne 'einvoiceservicetest.isnet.net.tr'){throw 'Unexpected endpoint'}
  $proxy.Url = $services.AddressBookService
  $proxy.Timeout=30000
  $method = @($proxy.GetType().GetMethods() | Where-Object {$_.Name -ceq 'GetTaxPayer' -and $_.GetParameters().Count -eq 1})
  if($method.Count -ne 1){throw 'GetTaxPayer signature mismatch'}
  $req = [Activator]::CreateInstance($method[0].GetParameters()[0].ParameterType)
  if(!$req.PSObject.Properties['TaxPayerTaxCode']){throw 'TaxPayerTaxCode field missing'}
  $req.TaxPayerTaxCode = $vkn
  $answer = $method[0].Invoke($proxy,@($req))
  if(!$answer -or !$answer.PSObject.Properties['Result']){throw 'SOAP result missing'}
  $result = [string]$answer.Result
  Write-Output ([pscustomobject]@{service='AddressBookService';stage='GetTaxPayer';result=$result;accepted=($result -eq 'Success' -or $result -eq '0');note='Lookup only; no document sent'} | ConvertTo-Json -Compress)
} catch {
  Write-Output ([pscustomobject]@{service='AddressBookService';stage='GetTaxPayer';accepted=$false;errorType=$_.Exception.GetType().Name} | ConvertTo-Json -Compress)
}
