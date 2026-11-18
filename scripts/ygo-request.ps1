$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

try {
    $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
    $allowedUrls = @(
        'https://api.ygo.ai/v2/project/content/getEnrichedHotel',
        'https://ygo-sales-demo.preview.ygo.ai/api/ask'
    )
    if ($request.url -notin $allowedUrls) {
        throw 'Unsupported endpoint'
    }
    $headers = @{}
    foreach ($property in $request.headers.PSObject.Properties) {
        $headers[$property.Name] = [string]$property.Value
    }
    $target = [Uri]$request.url
    $proxy = [System.Net.WebRequest]::DefaultWebProxy.GetProxy($target)
    $parameters = @{
        Uri = $target
        Method = 'Post'
        Headers = $headers
        Body = [System.Text.Encoding]::UTF8.GetBytes(($request.body | ConvertTo-Json -Depth 8 -Compress))
        ContentType = 'application/json'
        UseBasicParsing = $true
        TimeoutSec = [int]$request.timeoutSeconds
    }
    # Challenge-based Basic auth survives the Windows proxy's authentication handshake.
    if ($headers.Authorization -like 'Basic *') {
        $encoded = $headers.Authorization.Substring(6)
        $pair = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded)).Split(':', 2)
        if ($pair.Count -ne 2) { throw 'Invalid Basic credentials' }
        $parameters.Credential = [System.Management.Automation.PSCredential]::new(
            $pair[0], (ConvertTo-SecureString $pair[1] -AsPlainText -Force)
        )
        $headers.Remove('Authorization')
    }
    if ($proxy.AbsoluteUri -ne $target.AbsoluteUri) {
        $parameters.Proxy = $proxy
        $parameters.ProxyUseDefaultCredentials = $true
    }
    try {
        $response = Invoke-WebRequest @parameters
        # Windows PowerShell guesses Latin-1 for JSON without a charset; YGO sends UTF-8.
        $body = [System.Text.Encoding]::UTF8.GetString($response.RawContentStream.ToArray())
        $result = @{
            status = [int]$response.StatusCode
            body = $body
            retryAfter = [string]$response.Headers['Retry-After']
        }
    } catch [System.Net.WebException] {
        $response = $_.Exception.Response
        if ($null -eq $response) { throw }
        $reader = [System.IO.StreamReader]::new($response.GetResponseStream())
        try { $body = $reader.ReadToEnd() } finally { $reader.Dispose() }
        $result = @{
            status = [int]$response.StatusCode
            body = $body
            retryAfter = [string]$response.Headers['Retry-After']
        }
    }
    [Console]::Out.Write(($result | ConvertTo-Json -Compress -Depth 5))
} catch {
    [Console]::Error.WriteLine('YGO proxy transport failed; check network and proxy configuration.')
    exit 1
}
